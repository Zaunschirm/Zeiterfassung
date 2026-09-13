create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_employee_id text not null,
  sender_employee_id text,
  sender_name text,
  title text not null default 'Nachricht',
  body text not null,
  target text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_recipient_unread_idx
  on public.app_notifications (recipient_employee_id, read_at, created_at desc);

alter table public.app_notifications enable row level security;

revoke all on public.app_notifications from anon, authenticated;
