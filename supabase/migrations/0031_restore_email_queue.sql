-- Standalone restore script for public.email_queue.
-- Mirrors the original table creation and later queue-key/RLS hardening.

create extension if not exists "uuid-ossp";

create table if not exists public.email_queue (
  id uuid primary key default uuid_generate_v4(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  recipient_email text not null,
  recipient_type text not null default 'to',
  subject text,
  body text,
  template_id uuid,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_attempt_at timestamp with time zone,
  next_retry_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.email_queue
  add column if not exists queue_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_queue_inspection_id_fkey'
      and conrelid = 'public.email_queue'::regclass
  ) then
    alter table public.email_queue
      add constraint email_queue_inspection_id_fkey
      foreign key (inspection_id) references public.inspections(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_queue_status_check'
      and conrelid = 'public.email_queue'::regclass
  ) then
    alter table public.email_queue
      add constraint email_queue_status_check
      check (status in ('pending', 'sent', 'failed', 'abandoned'));
  end if;
end
$$;

create index if not exists idx_email_queue_status_next_retry
  on public.email_queue(status, next_retry_at)
  where status in ('pending', 'failed');

create index if not exists idx_email_queue_inspection_id
  on public.email_queue(inspection_id);

create index if not exists idx_email_queue_created_at
  on public.email_queue(created_at desc);

create index if not exists idx_email_queue_status_created
  on public.email_queue(status, created_at desc);

create unique index if not exists idx_email_queue_queue_key
  on public.email_queue(queue_key)
  where queue_key is not null;

alter table public.email_queue enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'email_queue'
      and policyname = 'Service role can manage email queue'
  ) then
    create policy "Service role can manage email queue"
      on public.email_queue
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'email_queue'
      and policyname = 'Authenticated users can view their inspection emails'
  ) then
    create policy "Authenticated users can view their inspection emails"
      on public.email_queue
      as permissive
      for select
      using (
        exists (
          select 1
          from public.inspections i
          where i.id = email_queue.inspection_id
            and (
              i.operator_id = auth.uid()
              or exists (
                select 1
                from public.profiles p
                where p.user_id = auth.uid()
                  and p.role in ('Admin', 'admin', 'super_admin')
              )
            )
        )
      );
  end if;
end
$$;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on table public.email_queue to postgres, anon, authenticated, service_role;

comment on table public.email_queue is 'Queue for emails that need to be sent, with retry logic';
comment on column public.email_queue.status is 'Status: pending, sent, failed, or abandoned';
comment on column public.email_queue.attempt_count is 'Number of send attempts';
comment on column public.email_queue.next_retry_at is 'When to retry this email';