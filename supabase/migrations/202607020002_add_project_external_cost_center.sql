alter table public.projects
  add column if not exists external_cost_center text;
