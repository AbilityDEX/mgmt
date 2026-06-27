-- Add snapshot-based inspection execution schema on top of existing inspections table.
-- Keep legacy columns for backward compatibility.

-- Extend inspections table for snapshot execution lifecycle.
alter table public.inspections
  add column if not exists template_id uuid references public.checklist_templates(id) on delete set null,
  add column if not exists template_name text,
  add column if not exists template_version integer not null default 1,
  add column if not exists status text not null default 'Completed',
  add column if not exists started_by uuid references auth.users(id) on delete set null,
  add column if not exists started_at timestamp with time zone;

-- Allow inspections to be started before completion.
alter table public.inspections
  alter column completed_at drop not null;

-- Backfill new columns for existing inspection records.
update public.inspections
set
  started_by = coalesce(started_by, operator_id),
  started_at = coalesce(started_at, created_at),
  status = coalesce(status, 'Completed')
where started_by is null or started_at is null or status is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inspections_status_check'
      and conrelid = 'public.inspections'::regclass
  ) then
    alter table public.inspections
      add constraint inspections_status_check
      check (status in ('In Progress', 'Completed', 'Cancelled'));
  end if;
end
$$;

-- Snapshot rows copied from templates at inspection start.
create table if not exists public.inspection_items (
  id uuid primary key default uuid_generate_v4(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  original_template_item_id uuid,
  display_order integer not null,
  question text not null,
  question_type text not null default 'pass_fail',
  required boolean not null default true,
  answer text,
  comments text,
  completed boolean not null default false,
  created_at timestamp with time zone not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inspection_items_question_type_check'
      and conrelid = 'public.inspection_items'::regclass
  ) then
    alter table public.inspection_items
      add constraint inspection_items_question_type_check
      check (question_type in ('pass_fail', 'yes_no', 'text', 'number', 'photo', 'signature'));
  end if;
end
$$;

create index if not exists idx_inspections_status on public.inspections(status);
create index if not exists idx_inspections_started_at on public.inspections(started_at);
create index if not exists idx_inspection_items_inspection_id on public.inspection_items(inspection_id);
create index if not exists idx_inspection_items_display_order on public.inspection_items(inspection_id, display_order);

alter table public.inspection_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inspection_items'
      and policyname = 'Service role can manage inspection items'
  ) then
    create policy "Service role can manage inspection items"
      on public.inspection_items
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inspection_items'
      and policyname = 'Authenticated users can read inspection items'
  ) then
    create policy "Authenticated users can read inspection items"
      on public.inspection_items
      as permissive
      for select
      using (auth.role() = 'authenticated');
  end if;
end
$$;

comment on table public.inspection_items is 'Snapshot of inspection questions copied at inspection start';
comment on column public.inspections.template_name is 'Template name snapshot captured when the inspection starts';
comment on column public.inspections.template_version is 'Template version snapshot captured when the inspection starts';
