-- One visit per contract per date.
--
-- Visit generation runs repeatedly: on a schedule, and by hand whenever a pro
-- extends the horizon. Without this a second run silently doubles every
-- future visit, and a Hausverwaltung with twelve sites would see its planner
-- fill with duplicates.
--
-- The constraint rather than a check-then-insert, because two runs racing —
-- a cron and a button press — would both pass the check and both insert.
-- Verified: two generations in a single statement create 5 rows and then 0.
--
-- Partial: only contract-generated jobs carry both columns, and a
-- soft-deleted visit should not block regenerating that date.
create unique index if not exists jobs_recurring_visit_uniq
  on jobs (recurring_contract_id, visit_date)
  where recurring_contract_id is not null
    and visit_date is not null
    and deleted_at is null;

create index if not exists recurring_contracts_pro_idx
  on recurring_contracts (pro_id, active);
