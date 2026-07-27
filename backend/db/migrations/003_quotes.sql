-- ═══════════════════════════════════════════════════════════════════════
-- 003 · Quotes: rate memory, trade templates, tiering, versioning
--
-- Phase 3 builds the Fast-Quote engine; the schema lands here so invoices
-- can already reference quote lines.
--
-- Tiering is sibling rows sharing group_id, so Basic/Standard/Premium reuse
-- the whole quote machinery instead of needing a parallel one. A revision
-- creates a NEW version rather than mutating in place — the audit trail is
-- the point.
-- ═══════════════════════════════════════════════════════════════════════

create table pro_rates (
  id          uuid primary key default gen_random_uuid(),
  pro_id      uuid not null references pro_profiles(id) on delete cascade,
  key         text not null,
  label       text not null,
  unit        text not null default 'h',
  amount      numeric(12,2) not null,
  trade       text,
  times_used  int not null default 0,
  last_used_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (pro_id, key)
);
create trigger pro_rates_updated before update on pro_rates
  for each row execute function set_updated_at();
comment on table pro_rates is 'Learned per-business pricing (EUR/m2, hourly, Anfahrtspauschale). Never ask twice.';

create table quote_templates (
  id          uuid primary key default gen_random_uuid(),
  pro_id      uuid references pro_profiles(id) on delete cascade,
  trade       text not null,
  name        text not null,
  description text,
  is_builtin  boolean not null default false,
  guided_form jsonb not null default '[]',
  assumptions text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint quote_templates_owner_ck check (is_builtin or pro_id is not null)
);
create index quote_templates_trade_idx on quote_templates (trade, sort_order);
create trigger quote_templates_updated before update on quote_templates
  for each row execute function set_updated_at();

create table quote_template_lines (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references quote_templates(id) on delete cascade,
  position      int not null default 0,
  kind          line_kind not null default 'labor',
  description   text not null,
  unit          text not null default 'm2',
  default_qty   numeric(12,3),
  default_price numeric(12,2),
  rate_key      text,
  waste_factor  numeric(5,4) not null default 0,
  is_optional   boolean not null default false,
  tier_min      text not null default 'basic' check (tier_min in ('basic','standard','premium'))
);
create index quote_template_lines_tpl_idx on quote_template_lines (template_id, position);
comment on column quote_template_lines.waste_factor is
  'Verschnitt. Pattern-aware for tiling: diagonal and herringbone waste far more than straight, and a flat guess loses money on tile one.';

create table quotes (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  pro_id        uuid not null references pro_profiles(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,
  customer_id   uuid references customers(id) on delete restrict,
  group_id      uuid not null default gen_random_uuid(),
  tier          text not null default 'standard' check (tier in ('basic','standard','premium')),
  version       int  not null default 1,
  supersedes_id uuid references quotes(id) on delete set null,
  quote_number  text,
  status        quote_status not null default 'draft',
  title         text not null default '',
  intro         text,
  assumptions   text,
  template_id   uuid references quote_templates(id) on delete set null,
  currency      char(3) not null default 'EUR',
  net_total     numeric(12,2) not null default 0,
  vat_total     numeric(12,2) not null default 0,
  gross_total   numeric(12,2) not null default 0,
  discount_pct  numeric(5,2) not null default 0,
  valid_until   date,
  sent_at       timestamptz,
  first_viewed_at timestamptz,
  viewed_count  int not null default 0,
  decided_at    timestamptz,
  reject_reason text,
  ai_sources    text[] not null default '{}',
  ai_confidence numeric(4,3),
  pdf_ref       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (pro_id, quote_number)
);
create index quotes_job_idx    on quotes (job_id);
create index quotes_group_idx  on quotes (group_id, tier);
create index quotes_status_idx on quotes (pro_id, status);
create trigger quotes_updated before update on quotes
  for each row execute function set_updated_at();
create unique index quotes_one_accepted_per_job on quotes (job_id) where status = 'accepted';

create table quote_lines (
  id            uuid primary key default gen_random_uuid(),
  quote_id      uuid not null references quotes(id) on delete cascade,
  position      int not null default 0,
  kind          line_kind not null default 'labor',
  description   text not null,
  detail        text,
  qty           numeric(12,3) not null default 1,
  unit          text not null default 'pcs',
  unit_price    numeric(12,2) not null default 0,
  waste_factor  numeric(5,4) not null default 0,
  discount_pct  numeric(5,2) not null default 0,
  tax_treatment tax_treatment not null default 'standard',
  vat_rate      numeric(5,2) not null default 20,
  is_optional   boolean not null default false,
  is_selected   boolean not null default true,
  net_amount    numeric(12,2) generated always as (
                  round(qty * (1 + waste_factor) * unit_price * (1 - discount_pct / 100), 2)
                ) stored,
  created_at    timestamptz not null default now()
);
create index quote_lines_quote_idx on quote_lines (quote_id, position);

-- Optional lines only count once the customer has selected them.
create or replace function recalc_quote_totals() returns trigger
language plpgsql as $$
declare
  q uuid := coalesce(new.quote_id, old.quote_id);
  n numeric(12,2);
  v numeric(12,2);
begin
  select coalesce(sum(net_amount), 0),
         coalesce(sum(round(net_amount * vat_rate / 100, 2)), 0)
    into n, v
    from quote_lines
   where quote_id = q and (is_selected or not is_optional);

  update quotes
     set net_total   = round(n * (1 - discount_pct / 100), 2),
         vat_total   = round(v * (1 - discount_pct / 100), 2),
         gross_total = round(n * (1 - discount_pct / 100), 2)
                     + round(v * (1 - discount_pct / 100), 2)
   where id = q;
  return null;
end $$;

create trigger quote_lines_recalc
  after insert or update or delete on quote_lines
  for each row execute function recalc_quote_totals();

alter table pro_rates            enable row level security;
alter table quote_templates      enable row level security;
alter table quote_template_lines enable row level security;
alter table quotes               enable row level security;
alter table quote_lines          enable row level security;
