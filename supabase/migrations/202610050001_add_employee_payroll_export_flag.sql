alter table public.employees
  add column if not exists include_in_payroll_export boolean not null default true;

comment on column public.employees.include_in_payroll_export
  is 'Controls whether an employee is included in payroll/Lohnverrechnung exports. Praktikanten can stay active in the app but be excluded here.';
