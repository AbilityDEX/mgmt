-- Enable Row Level Security on all tables
alter table public.profiles enable row level security;
alter table public.users enable row level security;
alter table public.work_areas enable row level security;
alter table public.machine_types enable row level security;
alter table public.machines enable row level security;
alter table public.inspections enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;

-- PROFILES table RLS policies
-- Service role (admin) can see and manage all profiles
-- Users can view their own profile
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Anyone can look up profiles for login'
  ) then
    create policy "Anyone can look up profiles for login"
      on public.profiles
      as permissive
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Service role can manage profiles'
  ) then
    create policy "Service role can manage profiles"
      on public.profiles
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can view own profile'
  ) then
    create policy "Users can view own profile"
      on public.profiles
      as permissive
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can update own profile'
  ) then
    create policy "Users can update own profile"
      on public.profiles
      as permissive
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

-- USERS table RLS policies (application-level mirror of profiles)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'Service role can manage users'
  ) then
    create policy "Service role can manage users"
      on public.users
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'Authenticated users can read all users'
  ) then
    create policy "Authenticated users can read all users"
      on public.users
      as permissive
      for select
      using (auth.role() = 'authenticated');
  end if;
end
$$;

-- WORK_AREAS table RLS policies - readable by all authenticated users
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'work_areas'
      and policyname = 'Authenticated users can read work areas'
  ) then
    create policy "Authenticated users can read work areas"
      on public.work_areas
      as permissive
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'work_areas'
      and policyname = 'Service role can manage work areas'
  ) then
    create policy "Service role can manage work areas"
      on public.work_areas
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end
$$;

-- MACHINE_TYPES table RLS policies - readable by all authenticated users
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'machine_types'
      and policyname = 'Authenticated users can read machine types'
  ) then
    create policy "Authenticated users can read machine types"
      on public.machine_types
      as permissive
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'machine_types'
      and policyname = 'Service role can manage machine types'
  ) then
    create policy "Service role can manage machine types"
      on public.machine_types
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end
$$;

-- MACHINES table RLS policies
-- Service role (admin) can see and manage all machines
-- Operators can see assigned machines + all machines if admin role
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'machines'
      and policyname = 'Service role can manage machines'
  ) then
    create policy "Service role can manage machines"
      on public.machines
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'machines'
      and policyname = 'Operators can read assigned machines'
  ) then
    create policy "Operators can read assigned machines"
      on public.machines
      as permissive
      for select
      using (
        assigned_user = (
          select username from public.profiles where user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'machines'
      and policyname = 'Admins can read all machines'
  ) then
    create policy "Admins can read all machines"
      on public.machines
      as permissive
      for select
      using (
        exists (
          select 1 from public.profiles
          where user_id = auth.uid()
          and (role = 'admin' or role = 'super_admin')
        )
      );
  end if;
end
$$;

-- INSPECTIONS table RLS policies
-- Service role can see and manage all
-- Users can see inspections they performed
-- Admins can see all
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inspections'
      and policyname = 'Service role can manage inspections'
  ) then
    create policy "Service role can manage inspections"
      on public.inspections
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inspections'
      and policyname = 'Users can view inspections they performed'
  ) then
    create policy "Users can view inspections they performed"
      on public.inspections
      as permissive
      for select
      using (auth.uid() = operator_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inspections'
      and policyname = 'Admins can view all inspections'
  ) then
    create policy "Admins can view all inspections"
      on public.inspections
      as permissive
      for select
      using (
        exists (
          select 1 from public.profiles
          where user_id = auth.uid()
          and (role = 'admin' or role = 'super_admin')
        )
      );
  end if;
end
$$;

-- REPORTS table RLS policies
-- Service role can manage all
-- Admins can view all
-- Users can view reports for their inspections
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
      and policyname = 'Service role can manage reports'
  ) then
    create policy "Service role can manage reports"
      on public.reports
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
      and policyname = 'Admins can view all reports'
  ) then
    create policy "Admins can view all reports"
      on public.reports
      as permissive
      for select
      using (
        exists (
          select 1 from public.profiles
          where user_id = auth.uid()
          and (role = 'admin' or role = 'super_admin')
        )
      );
  end if;
end
$$;

-- NOTIFICATIONS table RLS policies
-- Service role can manage all
-- Users can view their own notifications
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'Service role can manage notifications'
  ) then
    create policy "Service role can manage notifications"
      on public.notifications
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'Users can view own notifications'
  ) then
    create policy "Users can view own notifications"
      on public.notifications
      as permissive
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'Users can update own notifications'
  ) then
    create policy "Users can update own notifications"
      on public.notifications
      as permissive
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
