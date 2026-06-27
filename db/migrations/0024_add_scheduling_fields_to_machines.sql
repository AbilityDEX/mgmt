-- Add scheduling configuration fields to machines table
-- Release 1: Inspection scheduling enhancements

-- Add missing scheduling columns
alter table public.machines
  add column if not exists reminder_days_before_due integer not null default 7,
  add column if not exists grace_period integer not null default 3,
  add column if not exists auto_generate_inspection boolean not null default true;

-- Add constraints
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'machines_reminder_days_check'
      and conrelid = 'public.machines'::regclass
  ) then
    alter table public.machines
      add constraint machines_reminder_days_check
      check (reminder_days_before_due >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'machines_grace_period_check'
      and conrelid = 'public.machines'::regclass
  ) then
    alter table public.machines
      add constraint machines_grace_period_check
      check (grace_period >= 0);
  end if;
end
$$;

-- Add comments
comment on column public.machines.reminder_days_before_due is 'Number of days before due date to send reminder (default 7)';
comment on column public.machines.grace_period is 'Grace period in days after due date before marking as overdue (default 3)';
comment on column public.machines.auto_generate_inspection is 'Whether to automatically generate next inspection on completion (default true)';

-- Extend machine_inspection_templates for custom intervals
alter table public.machine_inspection_templates
  add column if not exists interval_value integer not null default 1,
  add column if not exists custom_interval_unit text;

-- Add constraint for custom interval unit
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'machine_inspection_templates_interval_unit_check'
      and conrelid = 'public.machine_inspection_templates'::regclass
  ) then
    alter table public.machine_inspection_templates
      add constraint machine_inspection_templates_interval_unit_check
      check (custom_interval_unit is null or custom_interval_unit in ('Days', 'Weeks', 'Months'));
  end if;
end
$$;

-- Add comments
comment on column public.machine_inspection_templates.interval_value is 'Interval value when frequency is Custom';
comment on column public.machine_inspection_templates.custom_interval_unit is 'Unit for custom interval: Days, Weeks, or Months';
