-- ═══════════════════════════════════════════════════════════════════════
-- 001 · Foundation: extensions, enums, identity, customers
--
-- Phase 2 of the marketplace → one-sided migration. Every table carries
-- `legacy_id` so the MongoDB import can resolve old ObjectId references;
-- it is dropped once the import is verified.
--
-- Money is numeric(12,2) everywhere. Never float — 0.1 + 0.2 must not
-- drift on an invoice line.
--
-- RLS is enabled on every tenant table with no permissive policy. The
-- FastAPI backend connects as service_role (which bypasses RLS), so this
-- is deliberate defence-in-depth: if anon/authenticated keys ever reach a
-- browser, they see nothing until policies are written on purpose.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists citext with schema extensions;
create extension if not exists moddatetime with schema extensions;

-- ── Enums ──────────────────────────────────────────────────────────────
create type user_role as enum ('tradesperson', 'admin');

create type customer_type as enum ('private', 'business');

-- The spine discriminator. `simple` keeps the Montage/emergency loop under
-- two minutes by hiding the whole project surface; `project` is the full PM
-- toolkit; `recurring` spawns visits from a service contract (Garten).
create type job_mode as enum ('simple', 'project', 'recurring');

create type job_status as enum (
  'lead',        -- captured, not yet quoted
  'quoted',
  'accepted',
  'scheduled',
  'in_progress',
  'completed',   -- work done, Abnahme may be pending
  'invoiced',
  'closed',
  'cancelled'
);

-- Mirrors the P0 doc's quote state machine exactly.
create type quote_status as enum (
  'draft', 'sent', 'viewed', 'negotiating',
  'accepted', 'rejected', 'expired', 'superseded'
);

-- §35a EStG: private customers may deduct labour (not material) from their
-- German tax return when the invoice splits the two and payment is by bank
-- transfer. The split has to exist per line or it cannot be surfaced.
create type line_kind as enum ('labor', 'material', 'travel', 'other');

-- Per-position tax treatment. A single invoice can legitimately mix these
-- (the doc's "mixed cart" case), which is why this lives on the line and
-- not on the invoice.
create type tax_treatment as enum (
  'standard',           -- AT 20 / DE 19
  'reduced',            -- AT 10 or 13 / DE 7
  'zero',
  'kleinunternehmer',   -- §6(1)27 UStG AT · §19 UStG DE
  'reverse_charge_13b', -- §13b UStG — Bauleistung to another Bauleister
  'intra_eu',           -- reverse charge, EU B2B with valid UID
  'export'              -- third country
);

create type invoice_type as enum (
  'standard',
  'abschlag',   -- progress invoice, §632a BGB
  'schluss',    -- final invoice; nets prior Abschläge
  'storno',     -- full credit note
  'correction'
);

create type invoice_status as enum ('draft', 'issued', 'delivered', 'cancelled');

create type payment_state as enum (
  'unpaid', 'partial', 'paid', 'overdue', 'written_off'
);

create type payment_method as enum (
  'transfer', 'card', 'sepa', 'sofort', 'cash', 'other'
);

-- ── Shared trigger helpers ─────────────────────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── users ──────────────────────────────────────────────────────────────
-- Custom JWT auth is retained from the Mongo build (it works, and Turnstile
-- is wired into it). Supabase Auth is a later swap, not a Phase 2 concern.
create table users (
  id              uuid primary key default gen_random_uuid(),
  legacy_id       text unique,
  email           citext not null unique,
  password_hash   text not null,
  name            text not null default '',
  given_name      text,
  family_name     text,
  role            user_role not null default 'tradesperson',
  country         text not null default 'AT' check (country ~ '^[A-Z]{2}$'),
  lang            text not null default 'de' check (lang in ('de','en','tr','es')),
  phone           text,
  address         text,
  postal_code     text,
  city            text,
  onboarding_complete boolean not null default false,
  is_email_verified   boolean not null default false,
  banned          boolean not null default false,

  -- Notification preferences (marketplace-specific ones are gone)
  notif_email             boolean not null default true,
  notif_email_marketing   boolean not null default false,
  notif_new_message       boolean not null default true,
  notif_job_status        boolean not null default true,
  notif_payment_receipt   boolean not null default true,

  -- GDPR consent trail
  policy_version_accepted text,
  policy_accepted_at      timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index users_role_idx on users (role) where deleted_at is null;
create trigger users_updated before update on users
  for each row execute function set_updated_at();

-- ── pro_profiles ───────────────────────────────────────────────────────
create table pro_profiles (
  id              uuid primary key default gen_random_uuid(),
  legacy_id       text unique,
  user_id         uuid not null unique references users(id) on delete cascade,

  business_name   text not null default '',
  contact_person  text,
  tagline         text,
  description     text,
  hourly_rate     numeric(10,2),
  years_experience int,
  service_categories text[] not null default '{}',
  service_areas      text[] not null default '{}',
  languages_spoken   text[] not null default '{}',

  -- Invoice identity. country drives which rule set applies (§4.5 of the
  -- migration plan: pick one launch country, configure the other).
  invoice_country text not null default 'AT' check (invoice_country ~ '^[A-Z]{2}$'),
  vat_id          text,          -- UID (AT) / USt-IdNr (DE)
  tax_number      text,          -- Steuernummer
  is_kleinunternehmer boolean not null default false,
  invoice_footer  text,
  invoice_template text not null default 'classic',

  business_address     text,
  business_postal_code text,
  business_city        text,
  business_country     text default 'AT',

  -- SEPA / EPC-QR ("GiroCode") payload source
  bank_account_holder text,
  bank_iban           text,
  bank_bic            text,
  bank_name           text,

  logo_file_id       text,
  logo_content_type  text,

  -- Verification badges
  licence_file_id   text,
  licence_status    text not null default 'missing',
  insurance_file_id text,
  insurance_status  text not null default 'missing',
  is_verified       boolean not null default false,
  is_licensed       boolean not null default false,
  is_insured        boolean not null default false,

  -- Subscription. Explorer is kept from the marketplace build: monthly-
  -- cancelable with no 12-month lock-in is the doc's competitive wedge.
  plan_tier          text not null default 'standard',
  plan_expires_at    timestamptz,
  explorer_started_at timestamptz,
  explorer_ends_at    timestamptz,
  stripe_customer_id  text,

  -- Geo-fencing for the service area
  service_center_lat numeric(9,6),
  service_center_lng numeric(9,6),
  service_radius_km  int,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger pro_profiles_updated before update on pro_profiles
  for each row execute function set_updated_at();

comment on column pro_profiles.is_kleinunternehmer is
  'Suppresses VAT on issued invoices and prints the §6(1)27 UStG (AT) / §19 UStG (DE) note.';

-- ── customers ──────────────────────────────────────────────────────────
-- The single biggest structural gap in the marketplace build: a customer was
-- either a platform account or an unstructured blob on a PM project. Here
-- they are first-class and owned by the pro. No customer ever logs in — the
-- share-token portal is their entire surface.
create table customers (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  pro_id        uuid not null references pro_profiles(id) on delete cascade,

  type          customer_type not null default 'private',
  name          text not null,
  company_name  text,
  contact_person text,
  email         citext,
  phone         text,

  address       text,
  postal_code   text,
  city          text,
  country       text not null default 'AT' check (country ~ '^[A-Z]{2}$'),
  lat           numeric(9,6),
  lng           numeric(9,6),

  -- Required to decide §13b reverse charge and intra-EU treatment. A
  -- business customer without a validated UID is NOT eligible.
  vat_id            text,
  vat_id_validated_at timestamptz,
  is_bauleister     boolean not null default false,

  notes         text,
  tags          text[] not null default '{}',

  -- Denormalised rollups, maintained by trigger in migration 004.
  jobs_count      int not null default 0,
  lifetime_value  numeric(12,2) not null default 0,
  last_job_at     timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index customers_pro_idx on customers (pro_id) where deleted_at is null;
create index customers_name_trgm on customers using gin (name extensions.gin_trgm_ops);
create index customers_email_idx on customers (pro_id, email) where email is not null;
create trigger customers_updated before update on customers
  for each row execute function set_updated_at();

comment on column customers.is_bauleister is
  'Customer is themselves a construction contractor, so §13b reverse charge '
  'applies to Bauleistungen invoiced to them.';

-- ── RLS: deny-by-default on every tenant table ─────────────────────────
alter table users        enable row level security;
alter table pro_profiles enable row level security;
alter table customers    enable row level security;
