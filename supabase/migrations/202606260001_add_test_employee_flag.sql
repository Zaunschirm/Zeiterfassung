alter table public.employees
  add column if not exists is_test_employee boolean not null default false;

update public.employees
set is_test_employee = true,
    show_in_daily_check = false,
    include_in_za_account = false
where lower(coalesce(code, '')) in ('test', 'testma', 'test_ma', 'testadmin', 'test_admin')
   or lower(coalesce(name, '')) like 'test %'
   or lower(coalesce(name, '')) like '% test %'
   or lower(coalesce(name, '')) in ('test ma', 'test admin', 'codex test ma', 'codex test admin');

