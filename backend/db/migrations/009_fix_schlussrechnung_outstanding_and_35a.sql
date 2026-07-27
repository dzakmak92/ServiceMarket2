-- ═══════════════════════════════════════════════════════════════════════
-- 009 · Two defects found by running the full lifecycle end to end
--
-- BUG 1 — a fully paid Schlussrechnung reported as `partial`, forever.
--
-- `outstanding` was gross_total - paid_total, and the payment rollup compared
-- paid_total against gross_total. Neither accounted for prior Abschläge. On a
-- Schlussrechnung the customer only owes the balance, so paying it in full
-- still left the invoice looking part-paid — and the dunning ladder would then
-- chase a customer who had already paid everything. Wrongly dunning a paying
-- customer is worse than not dunning at all.
--
-- BUG 2 — §35a understated the deductible amount.
--
-- labor_net counted only kind='labor', so the Anfahrtspauschale fell out.
-- Under §35a EStG the deductible base is Arbeits-, Maschinen- UND Fahrtkosten;
-- only material is excluded. Every invoice with a call-out charge understated
-- what the customer could claim.
--
-- NOTE for a database that already holds issued invoices: travel_net defaults
-- to 0 and cannot be backfilled without suspending the immutability trigger,
-- which is deliberate. Historic invoices keep the figures they were issued
-- with; only new ones carry the corrected split.
-- ═══════════════════════════════════════════════════════════════════════

alter table invoices add column travel_net numeric(12,2) not null default 0;

comment on column invoices.labor_net is
  'Net labour. The §35a deductible base is labor_net + travel_net — material is not deductible.';
comment on column invoices.travel_net is
  'Net travel/Anfahrt. Deductible under §35a alongside labour.';

alter table invoices drop column outstanding;
alter table invoices add column outstanding numeric(12,2)
  generated always as (gross_total - prior_payments_gross - paid_total) stored;

create index invoices_unpaid_idx2 on invoices (pro_id, due_date)
  where status <> 'draft' and payment_state in ('unpaid','partial','overdue');

create or replace function recalc_invoice_payments() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  inv uuid := coalesce(new.invoice_id, old.invoice_id);
  total numeric(12,2);
  due_amount numeric(12,2);
  due_date_v date;
begin
  select coalesce(sum(amount), 0) into total
    from invoice_payments where invoice_id = inv;

  -- What is actually owed on THIS invoice, after prior progress payments.
  select gross_total - prior_payments_gross, due_date
    into due_amount, due_date_v
    from invoices where id = inv;

  update invoices
     set paid_total = total,
         payment_state = (case
           when total <= 0 and due_date_v is not null and due_date_v < current_date then 'overdue'
           when total <= 0 then 'unpaid'
           when total >= due_amount then 'paid'
           else 'partial' end)::payment_state
   where id = inv;
  return null;
end $$;
