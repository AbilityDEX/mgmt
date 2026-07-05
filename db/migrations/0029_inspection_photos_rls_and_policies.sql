-- Enable RLS and policies for inspection_photos
alter table public.inspection_photos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inspection_photos' and policyname = 'Service role can manage inspection_photos'
  ) then
    create policy "Service role can manage inspection_photos"
      on public.inspection_photos
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inspection_photos' and policyname = 'Users can insert own photo records'
  ) then
    create policy "Users can insert own photo records"
      on public.inspection_photos
      as permissive
      for insert
      using (auth.role() = 'authenticated')
      with check (auth.uid() = uploaded_by);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inspection_photos' and policyname = 'Users can select photos for inspections they started or uploaded'
  ) then
    create policy "Users can select photos for inspections they started or uploaded"
      on public.inspection_photos
      as permissive
      for select
      using (
        uploaded_by = auth.uid()
        or exists (select 1 from public.inspections i where i.id = inspection_id and i.started_by = auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inspection_photos' and policyname = 'Users can delete own photos'
  ) then
    create policy "Users can delete own photos"
      on public.inspection_photos
      as permissive
      for delete
      using (uploaded_by = auth.uid());
  end if;
end
$$;
