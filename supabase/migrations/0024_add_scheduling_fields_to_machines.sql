-- Add scheduling fields to machines without touching existing data.

alter table public.machines
  add column if not exists inspection_frequency text,
  add column if not exists reminder_days_before_due integer,
  add column if not exists grace_period integer,
  add column if not exists auto_generate_inspection boolean,
  add column if not exists custom_interval_value integer,
  add column if not exists custom_interval_unit text;

comment on column public.machines.inspection_frequency is 'Scheduling cadence for the machine';
comment on column public.machines.reminder_days_before_due is 'Days before due date to send a reminder';
comment on column public.machines.grace_period is 'Days after due date before the machine is considered overdue';
comment on column public.machines.auto_generate_inspection is 'Whether inspections should be generated automatically';
comment on column public.machines.custom_interval_value is 'Interval value used when the inspection frequency is custom';
comment on column public.machines.custom_interval_unit is 'Interval unit used when the inspection frequency is custom';

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'update_machines_updated_at'
      and tgrelid = 'public.machines'::regclass
  ) then
    create trigger update_machines_updated_at
      before update on public.machines
      for each row
      execute function public.update_updated_at_column();
  end if;
end
$$;