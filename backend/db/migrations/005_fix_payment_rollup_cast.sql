-- ═══════════════════════════════════════════════════════════════════════
-- 005 · Fix: payment rollup enum cast
--
-- The CASE arms in recalc_invoice_payments() are text literals while the
-- column is the payment_state enum. Postgres will not coerce implicitly, so
-- every invoice_payments insert errored. Caught by the 004 test suite.
-- ═══════════════════════════════════════════════════════════════════════
create or replace function recalc_invoice_payments() returns trigger
language plpgsql as $$
declare
  inv uuid := coalesce(new.invoice_id, old.invoice_id);
  total numeric(12,2);
  gross numeric(12,2);
  due   date;
begin
  select coalesce(sum(amount), 0) into total from invoice_payments where invoice_id = inv;
  select gross_total, due_date into gross, due from invoices where id = inv;

  update invoices
     set paid_total = total,
         payment_state = (case
           when total <= 0 and due is not null and due < current_date then 'overdue'
           when total <= 0 then 'unpaid'
           when total >= gross then 'paid'
           else 'partial' end)::payment_state
   where id = inv;
  return null;
end $$;
