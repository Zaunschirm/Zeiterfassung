alter table public.regie_reports
  add column if not exists pdf_path text,
  add column if not exists pdf_saved_at timestamptz,
  add column if not exists pdf_saved_by text;

create index if not exists regie_reports_pdf_saved_idx
  on public.regie_reports (pdf_saved_at desc)
  where pdf_path is not null;
