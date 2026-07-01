alter table public.regie_reports
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text;

create index if not exists regie_reports_archived_idx
  on public.regie_reports (is_archived, report_date desc);
