-- Defect management table and policies
create table if not exists public.defects (
  id uuid primary key default uuid_generate_v4(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  inspection_item_id uuid not null references public.inspection_items(id) on delete cascade,
  title text not null,
  description text,
  severity text not null default 'Medium',
  status text not null default 'Open',
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  resolved_at timestamp with time zone,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_notes text
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'defects_severity_check'
      and conrelid = 'public.defects'::regclass
  ) then
    alter table public.defects
      add constraint defects_severity_check
      check (severity in ('Low', 'Medium', 'High', 'Critical'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'defects_status_check'
      and conrelid = 'public.defects'::regclass
  ) then
    alter table public.defects
      add constraint defects_status_check
      check (status in ('Open', 'In Progress', 'Awaiting Parts', 'Resolved', 'Closed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'defects_unique_inspection_item'
      and conrelid = 'public.defects'::regclass
  ) then
    alter table public.defects
      add constraint defects_unique_inspection_item unique (inspection_item_id);
  end if;
end
$$;

create index if not exists idx_defects_machine_id on public.defects(machine_id);
create index if not exists idx_defects_inspection_id on public.defects(inspection_id);
create index if not exists idx_defects_status on public.defects(status);
create index if not exists idx_defects_severity on public.defects(severity);
create index if not exists idx_defects_created_at on public.defects(created_at);
create index if not exists idx_defects_assigned_to on public.defects(assigned_to);

alter table public.defects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'defects'
      and policyname = 'Service role can manage defects'
  ) then
    create policy "Service role can manage defects"
      on public.defects
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'defects'
      and policyname = 'Authenticated users can read defects'
  ) then
    create policy "Authenticated users can read defects"
      on public.defects
      as permissive
      for select
      using (auth.role() = 'authenticated');
  end if;
end
$$;

do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'update_updated_at_column'
      and pronamespace = 'public'::regnamespace
  ) then
    if not exists (
      select 1 from pg_trigger
      where tgname = 'update_defects_updated_at'
        and tgrelid = 'public.defects'::regclass
    ) then
      create trigger update_defects_updated_at
        before update on public.defects
        for each row
        execute function public.update_updated_at_column();
    end if;
  end if;
end
$$;

comment on table public.defects is 'Defects raised from failed inspection items';
comment on column public.defects.inspection_item_id is 'Inspection snapshot item that produced this defect';
comment on column public.defects.resolution_notes is 'Final notes captured when resolving or closing defect';
