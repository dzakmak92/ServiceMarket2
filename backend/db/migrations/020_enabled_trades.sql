-- Which calculators (Gewerke) a pro may use, switched by the admin according
-- to the pro's trade licence (Gewerbeschein).
--
-- NULL means "never set": the seven catalogue trades without Folierung, which
-- is exactly what every pro had before this column existed. An array is the
-- full list of enabled trades; an empty array means none. Keys are the
-- catalogue trade keys plus 'folierung' (see backend/services/trades.py).
alter table pro_profiles
  add column if not exists enabled_trades text[];

comment on column pro_profiles.enabled_trades is
  'Calculators enabled by the admin (maler, fliesen, elektrik, sanitaer, garten, '
  'montage, reinigung, folierung). NULL = the seven catalogue trades, no folierung.';

-- Folierung was unlocked per email in the frontend until now; carry that over.
update pro_profiles p
   set enabled_trades = array['maler','fliesen','elektrik','sanitaer','garten','montage','reinigung','folierung']
  from users u
 where u.id = p.user_id
   and lower(u.email::text) = 'dzakmak92@gmail.com'
   and p.enabled_trades is null;
