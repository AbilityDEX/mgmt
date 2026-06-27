-- Create notifications table
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  message text,
  type text not null default 'info', -- 'info', 'warning', 'error', 'success'
  related_machine_id uuid references public.machines on delete set null,
  read boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.notifications is 'User notifications for inspection reminders and alerts';
comment on column public.notifications.type is 'Type: info (general), warning (action needed), error (problem), success (completed)';
