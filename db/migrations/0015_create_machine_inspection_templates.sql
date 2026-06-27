-- Allow machines to be assigned multiple inspection templates
create table if not exists public.machine_inspection_templates (
  id uuid primary key default uuid_generate_v4(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  inspection_frequency text not null,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  constraint machine_inspection_templates_machine_template_unique unique (machine_id, template_id),
  constraint machine_inspection_templates_frequency_check
    check (inspection_frequency in ('Daily', 'Weekly', 'Monthly', 'Quarterly', 'Six Monthly', 'Annually', 'Custom'))
);

create index if not exists idx_machine_inspection_templates_machine_id
  on public.machine_inspection_templates(machine_id);

create index if not exists idx_machine_inspection_templates_template_id
  on public.machine_inspection_templates(template_id);

create index if not exists idx_machine_inspection_templates_active
  on public.machine_inspection_templates(active);

-- Migrate existing one-template-per-machine assignments into the new join table.
insert into public.machine_inspection_templates (machine_id, template_id, inspection_frequency, active)
select m.id, m.template_id, 'Monthly', true
from public.machines m
where m.template_id is not null
on conflict (machine_id, template_id) do nothing;

alter table public.machine_inspection_templates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'machine_inspection_templates'
      and policyname = 'Service role can manage machine inspection templates'
  ) then
    create policy "Service role can manage machine inspection templates"
      on public.machine_inspection_templates
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'machine_inspection_templates'
      and policyname = 'Authenticated users can read machine inspection templates'
  ) then
    create policy "Authenticated users can read machine inspection templates"
      on public.machine_inspection_templates
      as permissive
      for select
      using (auth.role() = 'authenticated');
  end if;
end
$$;

comment on table public.machine_inspection_templates is 'Join table linking machines to multiple inspection templates with schedule metadata';
comment on column public.machine_inspection_templates.inspection_frequency is 'Inspection cadence for this machine-template assignment';
