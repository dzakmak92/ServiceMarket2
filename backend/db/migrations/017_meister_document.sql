-- The Meisterprüfung, alongside the trade licence and the liability insurance.
--
-- It is a separate document from the Gewerbeschein and means something
-- different: the licence says the business may trade, the Meisterbrief says
-- the person is qualified to. In Germany it is what the Handwerksrolle turns
-- on for the regulated trades, and in Austria it is the Befähigungsnachweis
-- for a reglementiertes Gewerbe. Filing it under `licence_file_id` would have
-- meant a pro could upload one and appear to have the other.
--
-- Optional at the column level on purpose: which trades require it differs by
-- country and by trade, and that rule does not belong in a NOT NULL.

alter table pro_profiles
  add column if not exists meister_file_id text,
  add column if not exists meister_status text
    check (meister_status in ('missing', 'pending', 'verified', 'rejected'));

update pro_profiles set meister_status = 'missing' where meister_status is null;

alter table pro_profiles alter column meister_status set default 'missing';

comment on column pro_profiles.meister_file_id is
  'Meisterbrief / Befähigungsnachweis upload; separate from the trade licence.';
