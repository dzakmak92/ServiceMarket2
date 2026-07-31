-- The other half of the feedback loop: what this business actually charges.
--
-- `pro_rates` has existed since the quotes migration, its comment reads
-- "Learned per-business pricing … Never ask twice", and three things read it:
-- the quote template resolver, the estimator, and the settings screen. Nothing
-- has ever written a row. It was a promise with no mechanism.
--
-- 012 closed the *time* half — predicted hours against measured hours from
-- job_time_logs. This closes the *price* half. Together they answer the two
-- questions a generic catalogue cannot: how fast does this business work, and
-- what does it charge for the work.
--
-- Three changes.
--
-- 1. quote_lines learns a `rate_key`. The estimator already produces one for
--    every position (trade.operation) and it was being dropped on the way into
--    the table, so the link from a line back to the thing it prices was cut at
--    exactly the point it became useful — the accepted quote.
--
-- 2. pro_rates learns `is_manual`. A rate the pro typed is an instruction, not
--    an observation; without the flag the next accepted quote would silently
--    overwrite it with the median and the pro would have no way to tell.
--
-- 3. pro_rate_samples records each accepted price rather than overwriting.
--    Overwriting is the obvious implementation and it is wrong: a pro who
--    discounts once to win a job would have that discount become their
--    standard rate, and the next quote would start from it. A median over
--    accepted quotes moves with the business and shrugs off one bad week.

alter table quote_lines add column if not exists rate_key text;
create index if not exists quote_lines_rate_key_idx on quote_lines (rate_key)
  where rate_key is not null;

comment on column quote_lines.rate_key is
  'Joins this position to pro_rates. Written by the estimator as trade.operation.';

create table if not exists pro_rate_samples (
  id          uuid primary key default gen_random_uuid(),
  pro_id      uuid not null references pro_profiles(id) on delete cascade,
  key         text not null,
  -- What was charged per unit on a quote the customer accepted. Not what was
  -- offered: an unaccepted price is an opinion, an accepted one is a fact.
  amount      numeric(12,2) not null check (amount > 0),
  unit        text,
  quote_id    uuid references quotes(id) on delete cascade,
  observed_at timestamptz not null default now(),
  -- One sample per line per quote. Accepting the same quote twice is a no-op
  -- upstream, but a retry or a double-click must not count as two data points.
  unique (quote_id, key)
);
create index if not exists pro_rate_samples_pro_idx on pro_rate_samples (pro_id, key);

comment on table pro_rate_samples is
  'Accepted per-unit prices. pro_rates.amount is the median of these.';

alter table pro_rate_samples enable row level security;

alter table pro_rates add column if not exists is_manual boolean not null default false;

comment on column pro_rates.is_manual is
  'Set by the pro by hand. Learning never overwrites it: a typed figure is an instruction, not an observation.';
