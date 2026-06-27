-- Enable Row Level Security for inspection template tables
alter table public.checklist_templates enable row level security;
alter table public.checklist_template_items enable row level security;

-- Service role can manage inspection templates
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'checklist_templates'
      and policyname = 'Service role can manage inspection templates'
  ) then
    create policy "Service role can manage inspection templates"
      on public.checklist_templates
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'checklist_template_items'
      and policyname = 'Service role can manage inspection template items'
  ) then
    create policy "Service role can manage inspection template items"
      on public.checklist_template_items
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'checklist_templates'
      and policyname = 'Authenticated users can read inspection templates'
  ) then
    create policy "Authenticated users can read inspection templates"
      on public.checklist_templates
      as permissive
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'checklist_template_items'
      and policyname = 'Authenticated users can read inspection template items'
  ) then
    create policy "Authenticated users can read inspection template items"
      on public.checklist_template_items
      as permissive
      for select
      using (auth.role() = 'authenticated');
  end if;
end
$$;

-- Indexes
create index if not exists idx_inspection_template_items_template_id
  on public.checklist_template_items(template_id);

create index if not exists idx_inspection_template_items_display_order
  on public.checklist_template_items(template_id, display_order);

create index if not exists idx_machines_template_id
  on public.machines(template_id);
