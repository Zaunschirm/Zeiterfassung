alter table public.regie_reports
  add column if not exists photo_paths jsonb not null default '[]'::jsonb;
