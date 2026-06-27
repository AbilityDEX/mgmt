-- Create users table (application-level mirror of profiles for backward compatibility)
-- Note: profiles table is the source of truth for auth/roles. This table is an application mirror.
create table if not exists public.users (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'operator',
  work_area text,
  phone text,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.users is 'Application-level user mirror table. Source of truth is profiles table. Kept for backward compatibility.';
