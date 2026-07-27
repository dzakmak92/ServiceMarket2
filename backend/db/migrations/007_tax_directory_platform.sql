-- ═══════════════════════════════════════════════════════════════════════
-- 007 · Tax, directory, platform
--
-- Completes the schema so the Mongo import has a target for everything and
-- the remaining route ports have somewhere to write.
-- ═══════════════════════════════════════════════════════════════════════

-- Feeds the EÜR / Einnahmen-Ausgaben-Rechnung and the input-VAT side of the
-- USt-VA. Populated by the vision OCR pipeline, which keeps its confidence
-- score so a low-confidence parse is flagged rather than trusted.
create table expenses (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  pro_id        uuid not null references pro_profiles(id) on delete cascade,
  job_id        uuid references jobs(id) on delete set null,
  expense_date  date not null default current_date,
  vendor        text,
  category      text not null default 'Sonstige',
  description   text,
  net_amount    numeric(12,2) not null default 0,
  vat_rate      numeric(5,2) not null default 20,
  vat_amount    numeric(12,2) not null default 0,
  gross_amount  numeric(12,2) not null default 0,
  currency      char(3) not null default 'EUR',
  payment_method payment_method,
  -- Input VAT is only reclaimable against a valid supplier invoice; a
  -- Kassabon without a UID above the small-amount threshold is not one.
  vat_deductible boolean not null default true,
  storage_ref   text,
  filename      text,
  ocr_confidence numeric(4,3),
  ocr_raw       jsonb,
  needs_review  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index expenses_pro_date_idx on expenses (pro_id, expense_date desc);
create index expenses_job_idx on expenses (job_id) where job_id is not null;
create trigger expenses_updated before update on expenses
  for each row execute function set_updated_at();

create table accountant_shares (
  id          uuid primary key default gen_random_uuid(),
  pro_id      uuid not null references pro_profiles(id) on delete cascade,
  token       text not null unique,
  label       text,
  year        int,
  expires_at  timestamptz,
  revoked_at  timestamptz,
  last_seen_at timestamptz,
  created_at  timestamptz not null default now()
);
create index accountant_shares_pro_idx on accountant_shares (pro_id) where revoked_at is null;

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  user_id     uuid not null references users(id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  link_to     text,
  job_id      uuid references jobs(id) on delete cascade,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_unread_idx on notifications (user_id) where not is_read;

create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on push_subscriptions (user_id);

-- GoBD expects changes to bookkeeping-relevant records to be traceable.
-- Append-only: no update or delete path is provided.
create table audit_log (
  id          bigserial primary key,
  pro_id      uuid references pro_profiles(id) on delete set null,
  user_id     uuid references users(id) on delete set null,
  entity      text not null,
  entity_id   uuid,
  action      text not null,
  detail      jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log (entity, entity_id, created_at desc);
create index audit_log_pro_idx on audit_log (pro_id, created_at desc);

-- 8,660 geocoded Austrian businesses, hand-imported and not regenerable.
-- No longer a homeowner-facing map: this is the prospect list the one-sided
-- product sells into, plus the source for the onboarding claim step.
create table business_directory (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  osm_id        text unique,
  name          text not null,
  "group"       text,
  segment       text,
  category      text,
  address       text,
  postal_code   text,
  city          text,
  country       text default 'AT',
  lat           numeric(9,6),
  lng           numeric(9,6),
  phone         text,
  email         citext,
  website       text,
  claimed_by    uuid references pro_profiles(id) on delete set null,
  claimed_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index business_directory_geo_idx on business_directory (lat, lng);
create index business_directory_city_idx on business_directory (city);
create index business_directory_segment_idx on business_directory (segment);
create index business_directory_name_trgm on business_directory
  using gin (name extensions.gin_trgm_ops);
create trigger business_directory_updated before update on business_directory
  for each row execute function set_updated_at();

create table business_claims (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references business_directory(id) on delete cascade,
  pro_id        uuid not null references pro_profiles(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  message       text,
  contact_phone text,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (business_id, pro_id)
);

create table payment_transactions (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  user_id       uuid references users(id) on delete set null,
  pro_id        uuid references pro_profiles(id) on delete set null,
  invoice_id    uuid references invoices(id) on delete set null,
  session_id    text unique,
  kind          text not null,
  amount        numeric(12,2) not null,
  currency      char(3) not null default 'EUR',
  status        text not null default 'pending',
  metadata      jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index payment_transactions_user_idx on payment_transactions (user_id, created_at desc);
create trigger payment_transactions_updated before update on payment_transactions
  for each row execute function set_updated_at();

create table feedback (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  user_id     uuid references users(id) on delete set null,
  kind        text not null default 'feedback',
  subject     text,
  message     text not null,
  status      text not null default 'open',
  job_id      uuid references jobs(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index feedback_status_idx on feedback (status, created_at desc);

create table platform_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table expenses             enable row level security;
alter table accountant_shares    enable row level security;
alter table notifications        enable row level security;
alter table push_subscriptions   enable row level security;
alter table audit_log            enable row level security;
alter table business_directory   enable row level security;
alter table business_claims      enable row level security;
alter table payment_transactions enable row level security;
alter table feedback             enable row level security;
alter table platform_settings    enable row level security;
