-- Close the loop: catalogue estimate → real job → measured hours → calibration.
--
-- The estimation catalogue is a generic model. It lands 272 of 272 job/country
-- pairs inside published DE/AT market bands, which makes it a defensible cold
-- start and nothing more: it describes the trade, not the business. A fast
-- tiler beats it, a meticulous one does not, and neither learns anything by
-- being told the trade average again.
--
-- What cannot be copied is a year of one business's actuals. These two tables
-- are what turns the first into the second.
--
--   job_estimates   what the catalogue predicted, frozen at the moment it was
--                   used. Without the snapshot there is nothing to compare
--                   against later: the catalogue moves, the pro's rates move,
--                   and "what did we say in March" becomes unanswerable.
--
--   pro_calibration what the comparison learned, per business and per scope.
--
-- The estimate is stored even when no quote is created. A pro who calculates a
-- job, sees the number and walks away has told us something; discarding it
-- would mean only learning from work that was won.

create table if not exists job_estimates (
  id            uuid primary key default gen_random_uuid(),
  pro_id        uuid not null references pro_profiles(id) on delete cascade,
  -- Both nullable: an estimate can precede the job it belongs to, and most
  -- estimates never become a quote at all.
  job_id        uuid references jobs(id) on delete set null,
  quote_id      uuid references quotes(id) on delete set null,

  catalogue_version text not null,
  job_key       text not null,
  trade         text not null,
  country       text not null default 'AT',
  tier          text not null default 'standard',
  -- The answers are kept verbatim. When a coefficient turns out to be wrong,
  -- the question that should have caught it is usually in here.
  answers       jsonb not null default '{}',

  qty           numeric(12,3) not null default 1,
  unit          text not null default 'pcs',
  hours_low     numeric(10,2) not null,
  hours_high    numeric(10,2) not null,
  labour_low    numeric(12,2) not null default 0,
  labour_high   numeric(12,2) not null default 0,
  total_low     numeric(12,2) not null default 0,
  total_high    numeric(12,2) not null default 0,
  hourly_low    numeric(10,2) not null default 0,
  hourly_high   numeric(10,2) not null default 0,
  -- Per-operation shares, so total measured hours can be attributed back.
  lines         jsonb not null default '[]',
  -- Whether this estimate already had a calibration applied when it was made.
  -- Comparing a calibrated estimate against actuals and then feeding the
  -- result back in would compound the correction on every job.
  calibration_applied numeric(6,3),

  created_at    timestamptz not null default now()
);
create index if not exists job_estimates_pro_idx on job_estimates (pro_id, created_at desc);
create index if not exists job_estimates_job_idx on job_estimates (job_id) where job_id is not null;
create index if not exists job_estimates_key_idx on job_estimates (pro_id, job_key);

comment on table job_estimates is
  'What the catalogue predicted, frozen at the moment of use. The left-hand side of the feedback loop.';

-- One learned correction per business per scope.
--
-- Scope is 'trade:<trade>' or 'job:<job_key>'. Both exist because they answer
-- different questions: a painter who is 20 % faster than the catalogue is
-- probably 20 % faster at everything, and that generalises from few samples;
-- being slow specifically on Fassade is a different fact and needs its own.
-- The estimator prefers the narrower scope once it has enough evidence.
create table if not exists pro_calibration (
  id            uuid primary key default gen_random_uuid(),
  pro_id        uuid not null references pro_profiles(id) on delete cascade,
  scope         text not null,
  -- Median measured hours ÷ predicted mid hours. Above 1 means the work takes
  -- this business longer than the catalogue says.
  hours_factor  numeric(6,3) not null default 1.0,
  -- The realised euro per hour: quoted labour ÷ measured hours. This is the
  -- number almost no small business computes for itself, and it is usually
  -- well below the rate they believe they charge.
  realised_hourly numeric(10,2),
  samples       int not null default 0,
  -- Kept so the UI can show the spread rather than a single confident number.
  factor_low    numeric(6,3),
  factor_high   numeric(6,3),
  computed_at   timestamptz not null default now(),
  unique (pro_id, scope)
);
create index if not exists pro_calibration_pro_idx on pro_calibration (pro_id);

comment on table pro_calibration is
  'What the comparison learned, per business. The right-hand side of the feedback loop.';

alter table job_estimates   enable row level security;
alter table pro_calibration enable row level security;
