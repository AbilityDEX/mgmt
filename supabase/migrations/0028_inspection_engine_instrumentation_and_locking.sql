-- Release 1 stabilization: inspection engine instrumentation + DB-level start lock enforcement.
-- Idempotent and backwards compatible.

create table if not exists public.inspection_engine_events (
  id uuid primary key default uuid_generate_v4(),
  event_type text not null,
  inspection_id uuid references public.inspections(id) on delete set null,
  machine_id uuid references public.machines(id) on delete set null,
  schedule_id uuid references public.inspection_schedules(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_inspection_engine_events_type_created
  on public.inspection_engine_events(event_type, created_at desc);

create index if not exists idx_inspection_engine_events_machine_created
  on public.inspection_engine_events(machine_id, created_at desc);

comment on table public.inspection_engine_events is 'Runtime instrumentation for inspection engine starts, denials, duplicates, completions and cancellations';
comment on column public.inspection_engine_events.event_type is 'Event type: failed_start|duplicate_start_blocked|start_success|completion_success|cancelled|lock_denial';

create or replace function public.validate_inspection_start_lock()
returns trigger as $$
declare
  v_next_due timestamptz;
  v_existing_in_progress uuid;
begin
  if new.status <> 'In Progress' then
    return new;
  end if;

  if new.schedule_id is null then
    return new;
  end if;

  select s.next_due into v_next_due
  from public.inspection_schedules s
  where s.id = new.schedule_id
  limit 1;

  if v_next_due is not null and now() < v_next_due then
    raise exception 'LOCKED_UNTIL:%', v_next_due using errcode = 'P0001';
  end if;

  select i.id into v_existing_in_progress
  from public.inspections i
  where i.schedule_id = new.schedule_id
    and i.status = 'In Progress'
    and i.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  limit 1;

  if v_existing_in_progress is not null then
    raise exception 'DUPLICATE_IN_PROGRESS:%', v_existing_in_progress using errcode = 'P0001';
  end if;

  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'validate_inspection_start_lock_trigger'
      and tgrelid = 'public.inspections'::regclass
  ) then
    create trigger validate_inspection_start_lock_trigger
      before insert or update on public.inspections
      for each row
      execute function public.validate_inspection_start_lock();
  end if;
end
$$;
