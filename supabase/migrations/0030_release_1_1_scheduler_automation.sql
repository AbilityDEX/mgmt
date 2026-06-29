-- Release 1.1 scheduler automation and idempotency hardening.

create extension if not exists "uuid-ossp";

create table if not exists public.scheduler_leases (
  name text primary key,
  owner text not null,
  locked_until timestamp with time zone not null,
  updated_at timestamp with time zone not null default now()
);

create or replace function public.try_acquire_scheduler_lock(
  p_name text,
  p_owner text,
  p_lease_seconds integer default 55
)
returns boolean as $$
declare
  acquired_rows integer;
begin
  insert into public.scheduler_leases (name, owner, locked_until, updated_at)
  values (
    p_name,
    p_owner,
    now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 55), 1)),
    now()
  )
  on conflict (name) do update
    set owner = excluded.owner,
        locked_until = excluded.locked_until,
        updated_at = now()
    where public.scheduler_leases.locked_until <= now()
       or public.scheduler_leases.owner = excluded.owner;

  get diagnostics acquired_rows = row_count;
  return acquired_rows > 0;
end;
$$ language plpgsql security definer;

create or replace function public.release_scheduler_lock(
  p_name text,
  p_owner text
)
returns boolean as $$
declare
  released_rows integer;
begin
  update public.scheduler_leases
  set locked_until = now(),
      updated_at = now()
  where name = p_name
    and owner = p_owner;

  get diagnostics released_rows = row_count;
  return released_rows > 0;
end;
$$ language plpgsql security definer;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'inspections_status_check'
      and conrelid = 'public.inspections'::regclass
  ) then
    alter table public.inspections drop constraint inspections_status_check;
  end if;

  alter table public.inspections
    add constraint inspections_status_check
    check (status in ('Draft', 'In Progress', 'Completed', 'Cancelled'));
end
$$;

create unique index if not exists idx_inspection_items_template_snapshot_unique
  on public.inspection_items(inspection_id, original_template_item_id)
  where original_template_item_id is not null;

alter table public.inspection_email_history
  add column if not exists event_key text;

create unique index if not exists idx_inspection_email_history_event_key
  on public.inspection_email_history(event_key)
  where event_key is not null;

alter table public.archive_jobs
  add column if not exists job_key text;

create unique index if not exists idx_archive_jobs_job_key
  on public.archive_jobs(job_key)
  where job_key is not null;

alter table public.archive_delivery_logs
  add column if not exists log_key text;

create unique index if not exists idx_archive_delivery_logs_log_key
  on public.archive_delivery_logs(log_key)
  where log_key is not null;

alter table public.inspection_engine_events
  add column if not exists event_key text;

create unique index if not exists idx_inspection_engine_events_event_key
  on public.inspection_engine_events(event_key)
  where event_key is not null;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'email_queue'
  ) then
    alter table public.email_queue
      add column if not exists queue_key text;

    create unique index if not exists idx_email_queue_queue_key
      on public.email_queue(queue_key)
      where queue_key is not null;
  end if;
end
$$;

comment on table public.scheduler_leases is 'Distributed lease records for autonomous scheduler execution';
comment on column public.inspection_email_history.event_key is 'Stable idempotency key for reminder and notification history entries';
comment on column public.archive_jobs.job_key is 'Stable idempotency key for archive job lifecycle records';
comment on column public.archive_delivery_logs.log_key is 'Stable idempotency key for archive delivery log records';
comment on column public.inspection_engine_events.event_key is 'Stable idempotency key for inspection engine transition events';