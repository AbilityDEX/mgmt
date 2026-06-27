-- Create profiles table (source of truth for user data)
create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references auth.users on delete cascade,
  username text not null unique,
  email text not null,
  full_name text,
  phone text,
  role text not null default 'operator', -- 'super_admin', 'admin', 'operator', etc.
  work_area text,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Add comment for table
comment on table public.profiles is 'User profiles linked to auth.users. Profiles table is source of truth.';
comment on column public.profiles.role is 'Role: super_admin (built-in admin), admin (admin user), operator (standard user)';
comment on column public.profiles.active is 'Whether the user account is enabled/disabled';
