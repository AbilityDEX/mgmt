-- Inspection scheduling foundation
create table if not exists public.inspection_schedules (
  id uuid primary key default uuid_generate_v4(),
  machine_template_id uuid not null references public.machine_inspection_templates(id) on delete cascade,
  frequency text not null,
  interval_value integer not null default 1,
  custom_cron text,
  next_due timestamp with time zone not null,
  last_generated timestamp with time zone,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inspection_schedules_frequency_check'
      and conrelid = 'public.inspection_schedules'::regclass
  ) then
    alter table public.inspection_schedules
      add constraint inspection_schedules_frequency_check
      check (frequency in ('Daily', 'Weekly', 'Monthly', 'Quarterly', 'Six Monthly', 'Annually', 'Custom'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'inspection_schedules_interval_value_check'
      and conrelid = 'public.inspection_schedules'::regclass
  ) then
    alter table public.inspection_schedules
      add constraint inspection_schedules_interval_value_check
      check (interval_value >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'inspection_schedules_machine_template_unique'
      and conrelid = 'public.inspection_schedules'::regclass
  ) then
    alter table public.inspection_schedules
      add constraint inspection_schedules_machine_template_unique unique (machine_template_id);
  end if;
end
$$;

insert into public.inspection_schedules (
  machine_template_id,
  frequency,
  interval_value,
  custom_cron,
  next_due,
  active
)
select
  mit.id,
  mit.inspection_frequency,
  1,
  null,
  case mit.inspection_frequency
    when 'Daily' then now() + interval '1 day'
    when 'Weekly' then now() + interval '7 days'
    when 'Monthly' then now() + interval '1 month'
    when 'Quarterly' then now() + interval '3 months'
    when 'Six Monthly' then now() + interval '6 months'
    when 'Annually' then now() + interval '1 year'
    else now() + interval '1 day'
  end,
  true
from public.machine_inspection_templates mit
where mit.active = true
  and not exists (
    select 1
    from public.inspection_schedules s
    where s.machine_template_id = mit.id
  );

create index if not exists idx_inspection_schedules_active_next_due
  on public.inspection_schedules(active, next_due);

create index if not exists idx_inspection_schedules_machine_template_id
  on public.inspection_schedules(machine_template_id);

alter table public.inspection_schedules enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inspection_schedules'
      and policyname = 'Service role can manage inspection schedules'
  ) then
    create policy "Service role can manage inspection schedules"
      on public.inspection_schedules
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inspection_schedules'
      and policyname = 'Authenticated users can read inspection schedules'
  ) then
    create policy "Authenticated users can read inspection schedules"
      on public.inspection_schedules
      as permissive
      for select
      using (auth.role() = 'authenticated');
  end if;

  if exists (
    select 1 from pg_proc
    where proname = 'update_updated_at_column'
      and pronamespace = 'public'::regnamespace
  ) then
    if not exists (
      select 1 from pg_trigger
      where tgname = 'update_inspection_schedules_updated_at'
        and tgrelid = 'public.inspection_schedules'::regclass
    ) then
      create trigger update_inspection_schedules_updated_at
        before update on public.inspection_schedules
        for each row
        execute function public.update_updated_at_column();
    end if;
  end if;
end
$$;

-- Add scheduling metadata on inspections for idempotency and overdue indicators.
alter table public.inspections
  add column if not exists schedule_id uuid references public.inspection_schedules(id) on delete set null,
  add column if not exists generation_key text,
  add column if not exists due_at timestamp with time zone,
  add column if not exists is_overdue boolean not null default false,
  add column if not exists completion_source text;

create unique index if not exists idx_inspections_generation_key_unique
  on public.inspections(generation_key)
  where generation_key is not null;

create index if not exists idx_inspections_schedule_status
  on public.inspections(schedule_id, status, started_at);

create index if not exists idx_inspections_due_at
  on public.inspections(due_at);

create index if not exists idx_inspections_is_overdue
  on public.inspections(is_overdue);

-- Backfill a best-effort due_at for legacy records.
update public.inspections
set due_at = coalesce(due_at, started_at, created_at)
where due_at is null;

comment on table public.inspection_schedules is 'Recurring inspection schedule definitions per machine-template assignment';
comment on column public.inspection_schedules.machine_template_id is 'Machine/template assignment this schedule controls';
comment on column public.inspections.generation_key is 'Idempotency key for scheduler-generated inspections';
comment on column public.inspections.due_at is 'Scheduled due datetime for this inspection snapshot';
comment on column public.inspections.is_overdue is 'True when inspection due_at has passed and status is still In Progress';
