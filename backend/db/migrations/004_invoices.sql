-- ═══════════════════════════════════════════════════════════════════════
-- 004 · Invoices: the compliance core
--
-- Encodes the gaps the Mongo build carried:
--   · Leistungszeitpunkt is mandatory on an issued invoice (§11/§14 UStG)
--   · VAT lives on the LINE, so one invoice can mix 20% / 10% / §13b
--   · line_kind splits labour from material for §35a EStG
--   · numbering is gap-free because it is transactional
--   · immutability is enforced by the database, not by route absence
-- ═══════════════════════════════════════════════════════════════════════

create table change_orders (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  job_id        uuid not null references jobs(id) on delete cascade,
  co_number     text,
  title         text not null,
  description   text,
  net_amount    numeric(12,2) not null default 0,
  vat_rate      numeric(5,2) not null default 20,
  kind          line_kind not null default 'labor',
  status        text not null default 'draft'
                  check (status in ('draft','sent','approved','rejected','invoiced')),
  sent_at       timestamptz,
  decided_at    timestamptz,
  approved_by   text,
  signature_ref text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index change_orders_job_idx on change_orders (job_id, status);
create trigger change_orders_updated before update on change_orders
  for each row execute function set_updated_at();

create table invoices (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  pro_id        uuid not null references pro_profiles(id) on delete cascade,
  job_id        uuid references jobs(id) on delete set null,
  customer_id   uuid references customers(id) on delete restrict,
  invoice_number text,
  type          invoice_type not null default 'standard',
  status        invoice_status not null default 'draft',
  -- Counterparty details frozen as they stood at issue.
  pro_snapshot      jsonb,
  customer_snapshot jsonb,
  issue_date    date,
  service_date_start date,
  service_date_end   date,
  due_date      date,
  payment_terms_days int not null default 14,
  currency      char(3) not null default 'EUR',
  net_total     numeric(12,2) not null default 0,
  vat_total     numeric(12,2) not null default 0,
  gross_total   numeric(12,2) not null default 0,
  labor_net     numeric(12,2) not null default 0,
  material_net  numeric(12,2) not null default 0,
  prior_payments_net   numeric(12,2) not null default 0,
  prior_payments_gross numeric(12,2) not null default 0,
  is_kleinunternehmer boolean not null default false,
  has_reverse_charge  boolean not null default false,
  invoice_country     text not null default 'AT',
  payment_state payment_state not null default 'unpaid',
  paid_total    numeric(12,2) not null default 0,
  outstanding   numeric(12,2) generated always as (gross_total - paid_total) stored,
  storno_of_id        uuid references invoices(id) on delete restrict,
  cancelled_by_storno_id uuid references invoices(id) on delete restrict,
  corrects_id         uuid references invoices(id) on delete restrict,
  storno_reason       text,
  note          text,
  pdf_ref       text,
  delivered_at  timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (pro_id, invoice_number),
  constraint invoices_issued_has_number_ck check (status = 'draft' or invoice_number is not null),
  constraint invoices_issued_has_dates_ck  check (status = 'draft' or (issue_date is not null and service_date_start is not null))
);
create index invoices_pro_status_idx on invoices (pro_id, status, issue_date desc);
create index invoices_job_idx        on invoices (job_id);
create index invoices_unpaid_idx     on invoices (pro_id, due_date)
  where status <> 'draft' and payment_state in ('unpaid','partial','overdue');
create trigger invoices_updated before update on invoices
  for each row execute function set_updated_at();

create table invoice_lines (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  position      int not null default 0,
  kind          line_kind not null default 'labor',
  description   text not null,
  qty           numeric(12,3) not null default 1,
  unit          text not null default 'pcs',
  unit_price    numeric(12,2) not null default 0,
  discount_pct  numeric(5,2) not null default 0,
  tax_treatment tax_treatment not null default 'standard',
  vat_rate      numeric(5,2) not null default 20,
  net_amount    numeric(12,2) generated always as (
                  round(qty * unit_price * (1 - discount_pct / 100), 2)
                ) stored,
  vat_amount    numeric(12,2) generated always as (
                  round(round(qty * unit_price * (1 - discount_pct / 100), 2) * vat_rate / 100, 2)
                ) stored,
  source_quote_line_id  uuid references quote_lines(id) on delete set null,
  source_change_order_id uuid references change_orders(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index invoice_lines_invoice_idx on invoice_lines (invoice_id, position);

create table invoice_payments (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  invoice_id    uuid not null references invoices(id) on delete cascade,
  amount        numeric(12,2) not null check (amount <> 0),
  method        payment_method not null default 'transfer',
  paid_on       date not null default current_date,
  reference     text,
  note          text,
  beleg_ref     text,
  psp_session_id text,
  created_at    timestamptz not null default now()
);
create index invoice_payments_invoice_idx on invoice_payments (invoice_id, paid_on);

-- Deliberately NOT a Postgres sequence: nextval() is non-transactional, so a
-- rolled-back insert would burn a number and leave a gap. GoBD and RKSV both
-- require a gap-free series. An UPDATE on a counter row rolls back with its
-- transaction, so a number is consumed only if the invoice is really written.
-- This is the bug the Mongo build had, incrementing the counter in one call
-- and inserting the document in another.
create or replace function next_invoice_number(p_pro uuid, p_year int)
returns text language plpgsql as $$
declare n bigint;
begin
  insert into number_counters (pro_id, kind, year, value)
  values (p_pro, 'invoice', p_year, 1)
  on conflict (pro_id, kind, year)
    do update set value = number_counters.value + 1
  returning value into n;
  return 'RG-' || p_year || '-' || lpad(n::text, 4, '0');
end $$;

create or replace function invoices_assign_number() returns trigger
language plpgsql as $$
begin
  if new.status <> 'draft' and new.invoice_number is null then
    new.invoice_number := next_invoice_number(
      new.pro_id, extract(year from coalesce(new.issue_date, current_date))::int);
  end if;
  return new;
end $$;

create trigger invoices_number before insert or update on invoices
  for each row execute function invoices_assign_number();

-- Once issued, an invoice may only be corrected by a documented Storno or
-- correction invoice, never edited in place.
create or replace function invoices_enforce_immutability() returns trigger
language plpgsql as $$
declare
  mutable text[] := array[
    'status','delivered_at','cancelled_at','payment_state','paid_total',
    'outstanding','pdf_ref','cancelled_by_storno_id','storno_reason','updated_at'
  ];
  old_frozen jsonb;
  new_frozen jsonb;
  k text;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception
        'Invoice % has been issued and cannot be deleted. Issue a Storno instead.',
        old.invoice_number using errcode = 'restrict_violation';
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  old_frozen := to_jsonb(old);
  new_frozen := to_jsonb(new);
  foreach k in array mutable loop
    old_frozen := old_frozen - k;
    new_frozen := new_frozen - k;
  end loop;

  if old_frozen <> new_frozen then
    raise exception
      'Invoice % is issued and immutable (GoBD/RKSV). Correct it with a Storno or correction invoice.',
      old.invoice_number using errcode = 'restrict_violation';
  end if;

  if new.status = 'draft' then
    raise exception 'Invoice % cannot be returned to draft once issued.',
      old.invoice_number using errcode = 'restrict_violation';
  end if;

  return new;
end $$;

create trigger invoices_immutable
  before update or delete on invoices
  for each row execute function invoices_enforce_immutability();

create or replace function invoice_lines_enforce_immutability() returns trigger
language plpgsql as $$
declare parent_status invoice_status;
begin
  select status into parent_status from invoices
   where id = coalesce(new.invoice_id, old.invoice_id);
  if parent_status is not null and parent_status <> 'draft' then
    raise exception 'Cannot modify lines of an issued invoice (GoBD/RKSV).'
      using errcode = 'restrict_violation';
  end if;
  return coalesce(new, old);
end $$;

create trigger invoice_lines_immutable
  before insert or update or delete on invoice_lines
  for each row execute function invoice_lines_enforce_immutability();

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
         payment_state = case
           when total <= 0 and due is not null and due < current_date then 'overdue'
           when total <= 0 then 'unpaid'
           when total >= gross then 'paid'
           else 'partial' end
   where id = inv;
  return null;
end $$;

create trigger invoice_payments_recalc
  after insert or update or delete on invoice_payments
  for each row execute function recalc_invoice_payments();

alter table change_orders    enable row level security;
alter table invoices         enable row level security;
alter table invoice_lines    enable row level security;
alter table invoice_payments enable row level security;
