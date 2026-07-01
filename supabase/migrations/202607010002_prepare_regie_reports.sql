alter table public.regie_reports
  add column if not exists assigned_employee_ids jsonb not null default '[]'::jsonb,
  add column if not exists prepared_at timestamptz,
  add column if not exists prepared_by text;

alter table public.regie_reports drop constraint if exists regie_reports_status_check;
alter table public.regie_reports
  add constraint regie_reports_status_check
  check (status in ('draft', 'prepared', 'signed'));

create index if not exists regie_reports_status_date_idx
  on public.regie_reports (status, report_date desc);
