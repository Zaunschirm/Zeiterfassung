alter table public.time_off_requests
  drop constraint if exists time_off_requests_entry_type_check;

alter table public.time_off_requests
  add constraint time_off_requests_entry_type_check
  check (entry_type in ('urlaub', 'sonderurlaub', 'za'));

create table if not exists public.special_leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists special_leave_types_name_idx
  on public.special_leave_types (lower(name));

create index if not exists special_leave_types_active_sort_idx
  on public.special_leave_types (active, sort_order, name);

alter table public.special_leave_types enable row level security;

drop policy if exists "special_leave_types_select_all" on public.special_leave_types;
create policy "special_leave_types_select_all"
  on public.special_leave_types
  for select
  to anon, authenticated
  using (true);

drop policy if exists "special_leave_types_insert_all" on public.special_leave_types;
create policy "special_leave_types_insert_all"
  on public.special_leave_types
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "special_leave_types_update_all" on public.special_leave_types;
create policy "special_leave_types_update_all"
  on public.special_leave_types
  for update
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update on public.special_leave_types to anon, authenticated;

insert into public.special_leave_types (name, sort_order)
values
  ('Begräbnis', 10),
  ('Geburt', 20),
  ('Hochzeit', 30),
  ('Behördentermin', 40),
  ('Pflegefreistellung', 50),
  ('Sonstiger Sonderurlaub', 100)
on conflict do nothing;
