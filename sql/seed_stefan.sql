
create extension if not exists "pgcrypto";
create table if not exists employees (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  display_name text,
  role text check (role in ('admin','user')) default 'user',
  pin_salt text not null,
  pin_hash text not null,
  disabled boolean not null default false,
  created_at timestamp default now()
);
insert into employees (code, display_name, role, pin_salt, pin_hash, disabled)
values ('stefan', 'Stefan Zaunschirm', 'admin', 'DG3h4BhT185NRk8svucSoA==', 'fKP0RmJvs7fiTfIGpQDtXYIlJ63RSDPM3FOZdb9HpG5DMykw1yJTEpCNRAqjWW45fL0HqY8HlPCMuMFAlIIIcQ==', false)
on conflict (code) do update set pin_salt=excluded.pin_salt, pin_hash=excluded.pin_hash, role=excluded.role, display_name=excluded.display_name;
