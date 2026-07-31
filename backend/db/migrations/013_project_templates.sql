-- Project templates — the task list, materials and milestones of a job kind,
-- reusable on the next one.
--
-- Distinct from `quote_templates`, which is a Leistungsverzeichnis: positions
-- and prices for a customer-facing document. This is the internal plan — what
-- has to be done, in what order, and what to buy. A bathroom refit needs both
-- and they are not the same list.
--
-- The frontend has called /api/pm/templates since the project board shipped;
-- the endpoint only ever existed in the MongoDB module, which is not mounted
-- on Vercel, so it has been a 404 in production. This is the table it needed.

create table if not exists project_templates (
  id          uuid primary key default gen_random_uuid(),
  -- Null means built-in and shared by every business, matching the pattern
  -- quote_templates already uses.
  pro_id      uuid references pro_profiles(id) on delete cascade,
  name        text not null,
  category    text,
  is_builtin  boolean not null default false,
  -- Stored as documents rather than child tables on purpose: a template is
  -- copied wholesale and never edited position by position, so rows would buy
  -- nothing but joins. quote_template_lines is a child table precisely because
  -- those *are* edited individually.
  tasks       jsonb not null default '[]',
  materials   jsonb not null default '[]',
  milestones  jsonb not null default '[]',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint project_templates_owner_ck check (is_builtin or pro_id is not null)
);
create index if not exists project_templates_pro_idx
  on project_templates (pro_id, created_at desc);
create index if not exists project_templates_builtin_idx
  on project_templates (is_builtin, sort_order) where is_builtin;

create trigger project_templates_updated before update on project_templates
  for each row execute function set_updated_at();

alter table project_templates enable row level security;

comment on table project_templates is
  'Reusable project plans: tasks, materials, milestones. The internal counterpart to quote_templates.';
