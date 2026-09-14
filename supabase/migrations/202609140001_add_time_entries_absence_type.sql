alter table public.time_entries
  add column if not exists absence_type text;

create index if not exists time_entries_absence_type_idx
  on public.time_entries (absence_type)
  where absence_type is not null;
