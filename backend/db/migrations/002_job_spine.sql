-- ═══════════════════════════════════════════════════════════════════════
-- 002 · The Job spine
--
-- One `jobs` table replaces the marketplace `jobs` collection AND
-- `pm_projects`. The P0 doc is blunt about why: "Get this right and every
-- trade template is just a different default configuration of the same
-- object. Get it wrong and no amount of features saves it."
--
-- `mode` is what lets one table serve a 90-second Montage callout and a
-- six-week bathroom renovation:
--   simple    → customer + quote + invoice. No tasks/Kanban/Gantt surface.
--   project   → the full PM toolkit.
--   recurring → visits generated from a contract (Garten maintenance,
--               Winterdienst).
-- ═══════════════════════════════════════════════════════════════════════

-- ── recurring_contracts ────────────────────────────────────────────────
-- The doc calls the recurring engine "the highest-LTV scenario in all five
-- trades" and warns against treating it as a P1 add-on. The schema lands in
-- Phase 2 even though the engine itself is built in Phase 7.
create table recurring_contracts (
  id            uuid primary key default gen_random_uuid(),
  pro_id        uuid not null references pro_profiles(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete restrict,

  title         text not null,
  cadence       text not null check (cadence in
                  ('weekly','fortnightly','monthly','quarterly','seasonal','on_demand')),
  -- on_demand covers weather-triggered Winterdienst, which has no calendar.
  weekday       int check (weekday between 0 and 6),
  price_per_visit numeric(12,2),
  billing        text not null default 'per_visit'
                   check (billing in ('per_visit','monthly','quarterly')),
  checklist     jsonb not null default '[]',

  starts_on     date not null,
  ends_on       date,
  active        boolean not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index recurring_contracts_pro_idx on recurring_contracts (pro_id) where active;
create trigger recurring_contracts_updated before update on recurring_contracts
  for each row execute function set_updated_at();

-- ── jobs ───────────────────────────────────────────────────────────────
create table jobs (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  legacy_source text check (legacy_source in ('job','pm_project')),

  pro_id        uuid not null references pro_profiles(id) on delete cascade,
  customer_id   uuid references customers(id) on delete restrict,

  mode          job_mode not null default 'simple',
  status        job_status not null default 'lead',
  job_number    text,

  title         text not null,
  description   text not null default '',
  category      text,

  -- Where the work happens. Deliberately separate from the customer's
  -- billing address: a Hausverwaltung bills centrally but the job is at one
  -- of twelve sites.
  site_address     text,
  site_postal_code text,
  site_city        text,
  site_country     text default 'AT',
  site_lat         numeric(9,6),
  site_lng         numeric(9,6),
  site_access_note text,

  -- Lead provenance. This is what "riding MyHammer" means operationally:
  -- we never integrate or scrape, we record where the pro got it so win
  -- rate per channel becomes measurable.
  source        text not null default 'manual'
                  check (source in ('manual','myhammer','phone','whatsapp',
                                    'email','walk_in','referral','repeat','web')),
  source_ref    text,
  lead_captured_at timestamptz,

  urgency       text not null default 'normal'
                  check (urgency in ('emergency','urgent','normal','scheduled')),

  scheduled_start timestamptz,
  scheduled_end   timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,

  -- Digital Abnahme. Before/after photos plus a signed sign-off are the
  -- tradesperson's shield in a §634 defect claim.
  abnahme_at            timestamptz,
  abnahme_signed_by     text,
  abnahme_signature_ref text,
  abnahme_note          text,

  contract_amount numeric(12,2),

  -- Customer-facing portal token. The customer has no account; this link is
  -- their entire surface (quote, status, Nachtrag approval, invoice, pay).
  share_token   text unique,
  sub_token     text unique,

  recurring_contract_id uuid references recurring_contracts(id) on delete set null,
  visit_date            date,

  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  unique (pro_id, job_number),
  -- A recurring visit must belong to a contract, and only a recurring job may.
  constraint jobs_recurring_contract_ck check (
    (mode = 'recurring') or (recurring_contract_id is null)
  )
);
create index jobs_pro_status_idx  on jobs (pro_id, status) where deleted_at is null;
create index jobs_customer_idx    on jobs (customer_id) where deleted_at is null;
create index jobs_scheduled_idx   on jobs (pro_id, scheduled_start) where deleted_at is null;
create index jobs_contract_idx    on jobs (recurring_contract_id) where recurring_contract_id is not null;
create trigger jobs_updated before update on jobs
  for each row execute function set_updated_at();

comment on table jobs is
  'The single spine. Quotes, Nachtraege, tasks, materials, payments, invoices '
  'and documents all hang off this row.';

-- ── job_number allocation (per pro, per year) ──────────────────────────
-- Job numbers are a convenience, not a legal artefact, so gaps are harmless
-- here. Invoice numbering (migration 004) is a different matter entirely.
create table number_counters (
  pro_id  uuid not null references pro_profiles(id) on delete cascade,
  kind    text not null,
  year    int  not null,
  value   bigint not null default 0,
  primary key (pro_id, kind, year)
);

create or replace function next_job_number(p_pro uuid) returns text
language plpgsql as $$
declare
  y int := extract(year from now())::int;
  n bigint;
begin
  insert into number_counters (pro_id, kind, year, value)
  values (p_pro, 'job', y, 1)
  on conflict (pro_id, kind, year)
    do update set value = number_counters.value + 1
  returning value into n;
  return 'A-' || y || '-' || lpad(n::text, 4, '0');
end $$;

create or replace function jobs_assign_number() returns trigger
language plpgsql as $$
begin
  if new.job_number is null then
    new.job_number := next_job_number(new.pro_id);
  end if;
  return new;
end $$;

create trigger jobs_number before insert on jobs
  for each row execute function jobs_assign_number();

-- ── job_tasks (project mode) ───────────────────────────────────────────
create table job_tasks (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  job_id      uuid not null references jobs(id) on delete cascade,
  title       text not null,
  description text,
  column_key  text not null default 'todo' check (column_key in ('todo','doing','done')),
  sort_order  int not null default 0,
  assignee    text,
  due_date    date,
  depends_on  uuid references job_tasks(id) on delete set null,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index job_tasks_job_idx on job_tasks (job_id, column_key, sort_order);
create trigger job_tasks_updated before update on job_tasks
  for each row execute function set_updated_at();

-- ── job_materials ──────────────────────────────────────────────────────
create table job_materials (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  job_id        uuid not null references jobs(id) on delete cascade,
  name          text not null,
  brand         text,
  barcode       text,
  qty           numeric(12,3) not null default 1,
  unit          text not null default 'pcs',
  planned_cost  numeric(12,2) not null default 0,
  actual_cost   numeric(12,2),
  supplier      text,
  ordered_at    timestamptz,
  expected_at   date,
  received_at   timestamptz,
  photos        text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index job_materials_job_idx on job_materials (job_id);
create trigger job_materials_updated before update on job_materials
  for each row execute function set_updated_at();

comment on column job_materials.expected_at is
  'Lead time drives the customer-facing order-status timeline — the feature '
  'that kills the weekly "where are my tiles?" call in the Boden/Fliesen trade.';

-- ── job_diary ──────────────────────────────────────────────────────────
create table job_diary (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  job_id      uuid not null references jobs(id) on delete cascade,
  entry_date  date not null default current_date,
  text        text not null default '',
  hours       numeric(6,2),
  weather     text,
  author      text,
  photos      text[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index job_diary_job_idx on job_diary (job_id, entry_date desc);

-- ── job_time_logs ──────────────────────────────────────────────────────
-- Montage needs a customer-visible time log: it pre-empts the "too expensive
-- for 40 minutes" dispute before it starts.
create table job_time_logs (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  job_id        uuid not null references jobs(id) on delete cascade,
  started_at    timestamptz not null,
  stopped_at    timestamptz,
  seconds       int generated always as (
                  case when stopped_at is null then null
                  else extract(epoch from (stopped_at - started_at))::int end
                ) stored,
  note          text,
  billable      boolean not null default true,
  customer_visible boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint job_time_logs_order_ck check (stopped_at is null or stopped_at >= started_at)
);
create index job_time_logs_job_idx on job_time_logs (job_id, started_at desc);
-- At most one running timer per job.
create unique index job_time_logs_one_running on job_time_logs (job_id)
  where stopped_at is null;

-- ── job_documents ──────────────────────────────────────────────────────
create table job_documents (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  job_id      uuid not null references jobs(id) on delete cascade,
  kind        text not null default 'photo'
                check (kind in ('photo_before','photo_after','photo','receipt',
                                'plan','signature','abnahme','other')),
  storage_ref text not null,
  filename    text,
  content_type text,
  size_bytes  bigint,
  caption     text,
  taken_at    timestamptz,
  customer_visible boolean not null default false,
  created_at  timestamptz not null default now()
);
create index job_documents_job_idx on job_documents (job_id, kind);

comment on table job_documents is
  'Before/after photos plus the signed Abnahme are the dispute shield: a later '
  '§634 defect claim stops being he-said-she-said.';

alter table recurring_contracts enable row level security;
alter table jobs             enable row level security;
alter table job_tasks        enable row level security;
alter table job_materials    enable row level security;
alter table job_diary        enable row level security;
alter table job_time_logs    enable row level security;
alter table job_documents    enable row level security;
alter table number_counters  enable row level security;
