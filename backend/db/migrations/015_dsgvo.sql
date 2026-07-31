-- Data-subject rights: consent trail, request register, deletion schedule.
--
-- Art. 15 gives a controller one month to answer an access request and Art. 17
-- the same for erasure. Both buttons currently 404, which means the clock
-- would already be running the first time anyone pressed one.
--
-- The hard part is not the export. It is that **erasure and retention are both
-- legal obligations and they contradict each other.** A tradesperson's issued
-- invoices must be kept seven years (§ 132 BAO in AT, § 147 AO in DE) and the
-- invoice copies ten (§ 14b UStG). Art. 17(3)(b) exempts exactly that, so
-- "delete my account" cannot mean "delete the invoices" — and an
-- implementation that silently keeps them while telling the user they are gone
-- is worse than one that refuses, because the user stops watching.
--
-- So deletion is scheduled, scoped, and disclosed: the row records what will
-- go, what is held back, and until when. The user is told the same.

-- ── Consent trail ─────────────────────────────────────────────────────
-- Append-only. A consent record that can be edited is not evidence of
-- anything: the entire point under Art. 7(1) is to be able to show what was
-- agreed, when, and against which version of the text.
create table if not exists consent_records (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  kind          text not null default 'consent'
                  check (kind in ('consent', 'marketing_change',
                                  'deletion_requested', 'deletion_cancelled',
                                  'policy_accepted')),
  cookies_analytics boolean not null default false,
  cookies_marketing boolean not null default false,
  marketing_emails  boolean not null default false,
  -- Which text was agreed to. Without it a consent record proves only that
  -- somebody clicked something once.
  policy_version text,
  -- Art. 7(1) wants the circumstances demonstrable. Kept minimal: the address
  -- and the client string, nothing that would itself need a justification.
  ip            inet,
  user_agent    text,
  detail        jsonb not null default '{}',
  recorded_at   timestamptz not null default now()
);
create index if not exists consent_records_user_idx
  on consent_records (user_id, recorded_at desc);

comment on table consent_records is
  'Append-only consent history. Never updated, never deleted except with the user.';

-- ── Data-subject request register ─────────────────────────────────────
-- Public: a data subject need not have an account to exercise their rights,
-- and most people asking about a directory listing do not have one.
create table if not exists data_rights_requests (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'data_rights'
                  check (kind in ('data_rights', 'removal')),
  request_type  text
                  check (request_type in ('access', 'rectification', 'erasure',
                                          'restriction', 'portability',
                                          'object', 'withdraw_consent')),
  name          text,
  email         citext not null,
  business_name text,
  details       text,
  status        text not null default 'open'
                  check (status in ('open', 'in_progress', 'answered', 'refused')),
  -- One month, per Art. 12(3). Stored rather than derived so a deadline
  -- cannot quietly move when the code changes.
  submitted_at  timestamptz not null default now(),
  due_at        timestamptz not null default (now() + interval '30 days'),
  answered_at   timestamptz,
  response_note text,
  ip            inet,
  user_agent    text
);
create index if not exists data_rights_open_idx
  on data_rights_requests (due_at) where status in ('open', 'in_progress');
create index if not exists data_rights_email_idx on data_rights_requests (email);

comment on table data_rights_requests is
  'Art. 12-22 requests with their statutory one-month deadline.';

-- ── Deletion schedule ─────────────────────────────────────────────────
-- A grace period, because erasure is irreversible and a misclick at eleven at
-- night should not be. `users.deleted_at` already exists and is what every
-- query filters on; these say when it becomes permanent and what survives.
alter table users add column if not exists deletion_requested_at timestamptz;
alter table users add column if not exists deletion_scheduled_for timestamptz;
alter table users add column if not exists deletion_retained jsonb;

comment on column users.deletion_retained is
  'What Art. 17(3)(b) requires be kept despite the erasure request, and until when. Shown to the user verbatim — a retention they were not told about is a retention they did not consent to being surprised by.';

create index if not exists users_deletion_due_idx on users (deletion_scheduled_for)
  where deletion_scheduled_for is not null;

alter table consent_records      enable row level security;
alter table data_rights_requests enable row level security;
