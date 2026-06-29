-- Release 1.1: Daily maintenance log for scheduler idempotency.
-- Tracks single execution per day per maintenance job.

create table if not exists public.daily_maintenance_log (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  maintenance_date date not null,
  started_at timestamp with time zone not null,
  completed_at timestamp with time zone,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  owner text not null,
  duration_ms integer,
  error_message text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Ensure only one successful completion per job per day using partial unique index
-- (PostgreSQL requires partial uniqueness to be implemented via index, not constraint)
create unique index if not exists idx_daily_maintenance_log_one_completed
  on public.daily_maintenance_log (job_name, maintenance_date)
  where status = 'completed';

-- Index for efficient lookups
create index if not exists idx_daily_maintenance_log_job_date 
  on public.daily_maintenance_log (job_name, maintenance_date desc);

create index if not exists idx_daily_maintenance_log_date_status 
  on public.daily_maintenance_log (maintenance_date, status);

-- Function to get last maintenance completion for a job
-- Returns the most recent completed maintenance record, or NULL if none exists
-- Query is STABLE - safe to optimize and cache within a transaction
create or replace function public.get_last_maintenance_completion(
  p_job_name text,
  p_maintenance_date date
)
returns public.daily_maintenance_log as $$
  select * from public.daily_maintenance_log
  where job_name = p_job_name
    and maintenance_date = p_maintenance_date
    and status = 'completed'
  order by completed_at desc
  limit 1;
$$ language sql security definer stable;

-- Function to record maintenance run start
-- Returns the UUID of the maintenance log entry
-- Idempotent: Safe to call multiple times (will create new log entries)
create or replace function public.start_maintenance_run(
  p_job_name text,
  p_maintenance_date date,
  p_owner text
)
returns uuid as $$
declare
  v_log_id uuid;
begin
  insert into public.daily_maintenance_log (
    job_name,
    maintenance_date,
    started_at,
    owner,
    status
  ) values (
    p_job_name,
    p_maintenance_date,
    now(),
    p_owner,
    'running'
  )
  returning id into v_log_id;
  
  return v_log_id;
exception when others then
  raise notice 'Failed to start maintenance run: %', sqlerrm;
  return null;
end;
$$ language plpgsql security definer volatile;

-- Function to mark maintenance run as completed
-- Returns TRUE if successful, FALSE if log_id not found or already completed
-- Idempotent: Safe to call multiple times (only first succeeds)
-- Uses CHECK to ensure we only update from 'running' status
create or replace function public.complete_maintenance_run(
  p_log_id uuid
)
returns boolean as $$
declare
  v_started_at timestamp with time zone;
  v_updated_rows integer;
begin
  -- Verify the log entry exists and is in 'running' status
  select started_at into v_started_at
  from public.daily_maintenance_log
  where id = p_log_id
    and status = 'running';
  
  if v_started_at is null then
    return false;
  end if;

  -- Update with calculated duration (status check ensures idempotency)
  update public.daily_maintenance_log
  set status = 'completed',
      completed_at = now(),
      duration_ms = floor(extract(epoch from (now() - v_started_at)) * 1000)::integer,
      updated_at = now()
  where id = p_log_id
    and status = 'running';

  get diagnostics v_updated_rows = row_count;
  return v_updated_rows > 0;
exception when others then
  raise notice 'Failed to complete maintenance run: %', sqlerrm;
  return false;
end;
$$ language plpgsql security definer volatile;

-- Function to mark maintenance run as failed
-- Returns TRUE if successful, FALSE if log_id not found or already completed/failed
-- Idempotent: Safe to call multiple times (only first succeeds)
-- Uses CHECK to ensure we only update from 'running' status
create or replace function public.fail_maintenance_run(
  p_log_id uuid,
  p_error_message text
)
returns boolean as $$
declare
  v_started_at timestamp with time zone;
  v_updated_rows integer;
begin
  -- Verify the log entry exists and is in 'running' status
  select started_at into v_started_at
  from public.daily_maintenance_log
  where id = p_log_id
    and status = 'running';
  
  if v_started_at is null then
    return false;
  end if;

  -- Update with error details and calculated duration (status check ensures idempotency)
  update public.daily_maintenance_log
  set status = 'failed',
      completed_at = now(),
      duration_ms = floor(extract(epoch from (now() - v_started_at)) * 1000)::integer,
      error_message = substring(p_error_message from 1 for 1000),
      updated_at = now()
  where id = p_log_id
    and status = 'running';

  get diagnostics v_updated_rows = row_count;
  return v_updated_rows > 0;
exception when others then
  raise notice 'Failed to record maintenance failure: %', sqlerrm;
  return false;
end;
$$ language plpgsql security definer volatile;

comment on table public.daily_maintenance_log is 'Tracks daily maintenance runs to enforce idempotency. One successful completion per job per day.';
comment on column public.daily_maintenance_log.job_name is 'Name of the maintenance job (e.g., "daily-inspection-maintenance")';
comment on column public.daily_maintenance_log.maintenance_date is 'The day being maintained, in London time';
comment on column public.daily_maintenance_log.started_at is 'When the run started';
comment on column public.daily_maintenance_log.completed_at is 'When the run completed or failed';
comment on column public.daily_maintenance_log.status is 'running | completed | failed';
comment on column public.daily_maintenance_log.owner is 'Identifier of the process/instance running this job';
comment on column public.daily_maintenance_log.duration_ms is 'Total execution time in milliseconds';
comment on column public.daily_maintenance_log.error_message is 'Error message if status = failed';
