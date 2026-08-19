create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  employee_name text,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  push_enabled boolean not null default true,
  device_name text,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_employee_idx
  on public.push_subscriptions (employee_id);

alter table public.push_subscriptions enable row level security;
