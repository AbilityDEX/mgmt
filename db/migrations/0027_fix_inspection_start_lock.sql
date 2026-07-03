-- Fix: Use start of London day for inspection start lock
-- Prevents schedule.next_due (which contains the deadline time) from blocking
-- inspection start until the start of the scheduled day.

create or replace function public.validate_inspection_start_lock()
returns trigger as $$
declare
  v_next_due timestamptz;
  v_existing_in_progress uuid;
  v_local_midnight timestamptz;
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

  if v_next_due is not null then
    -- Compute the start of the day in Europe/London for the due date.
    -- Steps: convert timestamptz to local timestamp in Europe/London, take the date,
    -- then convert that date at midnight back to timestamptz in Europe/London.
    v_local_midnight := ((v_next_due AT TIME ZONE 'Europe/London')::date)::timestamp AT TIME ZONE 'Europe/London';

    if now() < v_local_midnight then
      raise exception 'LOCKED_UNTIL:%', v_local_midnight using errcode = 'P0001';
    end if;
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
