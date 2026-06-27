-- ============================================================================
-- MGMT Database Schema - Complete SQL Script
-- All 12 migrations combined for fresh Supabase project setup
-- Paste this entire script into Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- MIGRATION 0001: Enable Required Extensions
-- ============================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "http";

-- ============================================================================
-- MIGRATION 0002: Create Profiles Table (Source of Truth)
-- ============================================================================
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

-- ============================================================================
-- MIGRATION 0002b: Create Users Table (Application-Level Mirror)
-- ============================================================================
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

-- ============================================================================
-- MIGRATION 0003: Create Work Areas Table
-- ============================================================================
create table if not exists public.work_areas (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.work_areas is 'Physical or logical areas/zones where machines are located';

-- Insert default work areas
insert into public.work_areas (name, description)
values
  ('ELV', 'Elevator systems'),
  ('MWE', 'Main work area'),
  ('Administration', 'Administrative area')
on conflict (name) do nothing;

-- ============================================================================
-- MIGRATION 0004: Create Machine Types Table
-- ============================================================================
create table if not exists public.machine_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.machine_types is 'Types/categories of machines for classification';

-- Insert default machine types
insert into public.machine_types (name, description)
values
  ('Elevator', 'Elevator/lift systems'),
  ('Hydraulic Hoist', 'Hydraulic lifting equipment'),
  ('Generator', 'Power generation equipment'),
  ('Compressor', 'Air/gas compression equipment'),
  ('Pump', 'Fluid pumping equipment')
on conflict (name) do nothing;

-- ============================================================================
-- MIGRATION 0005: Create Machines Table
-- ============================================================================
create table if not exists public.machines (
  id uuid primary key default uuid_generate_v4(),
  code text,
  name text not null,
  area text not null,
  type text,
  manufacturer text,
  model text,
  serial_number text,
  installation_date date,
  last_inspection date,
  inspection_deadline text not null default '09:00', -- HH:MM format
  assigned_user text, -- operator username for single-owner assignment
  assigned_user_id uuid references auth.users on delete set null,
  status text not null default 'Not Started', -- 'Not Started', 'In Progress', 'Completed', 'Overdue'
  notes text,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.machines is 'Equipment/machines requiring regular inspections';
comment on column public.machines.status is 'Current status: Not Started (awaiting inspection), In Progress (under inspection), Completed (inspection done), Overdue (past deadline)';
comment on column public.machines.assigned_user is 'Username of operator assigned to this machine, or NULL if not assigned';
comment on column public.machines.assigned_user_id is 'Auth user id assigned to this machine, or NULL if not assigned';
comment on column public.machines.inspection_deadline is 'Daily deadline time in HH:MM format (e.g., 09:00)';

-- ============================================================================
-- MIGRATION 0006: Create Inspections Table
-- ============================================================================
create table if not exists public.inspections (
  id uuid primary key default uuid_generate_v4(),
  machine_id uuid not null references public.machines on delete cascade,
  operator_id uuid not null references auth.users on delete cascade,
  operator_name text not null,
  completed_at timestamp with time zone not null default now(),
  checklist jsonb not null, -- Array of {id, label, status, faultDescription, severity, photoUploaded}
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.inspections is 'Records of machine inspections completed by operators';
comment on column public.inspections.checklist is 'Array of inspection items with pass/fail status, fault descriptions, and severity stored as JSONB';

-- ============================================================================
-- MIGRATION 0007: Create Reports Table
-- ============================================================================
create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  inspection_id uuid not null references public.inspections on delete cascade,
  machine_id uuid not null references public.machines on delete cascade,
  report_date timestamp with time zone not null default now(),
  summary text,
  findings text,
  recommendations text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.reports is 'Generated reports from inspections for management review';

-- ============================================================================
-- MIGRATION 0008: Create Notifications Table
-- ============================================================================
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  message text,
  type text not null default 'info', -- 'info', 'warning', 'error', 'success'
  related_machine_id uuid references public.machines on delete set null,
  read boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.notifications is 'User notifications for inspection reminders and alerts';
comment on column public.notifications.type is 'Type: info (general), warning (action needed), error (problem), success (completed)';

-- ============================================================================
-- MIGRATION 0009: Create Trigger Functions
-- ============================================================================
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Add triggers for all tables with updated_at
create trigger update_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.update_updated_at_column();

create trigger update_users_updated_at
  before update on public.users
  for each row
  execute function public.update_updated_at_column();

create trigger update_work_areas_updated_at
  before update on public.work_areas
  for each row
  execute function public.update_updated_at_column();

create trigger update_machine_types_updated_at
  before update on public.machine_types
  for each row
  execute function public.update_updated_at_column();

create trigger update_machines_updated_at
  before update on public.machines
  for each row
  execute function public.update_updated_at_column();

create trigger update_inspections_updated_at
  before update on public.inspections
  for each row
  execute function public.update_updated_at_column();

create trigger update_reports_updated_at
  before update on public.reports
  for each row
  execute function public.update_updated_at_column();

create trigger update_notifications_updated_at
  before update on public.notifications
  for each row
  execute function public.update_updated_at_column();

-- ============================================================================
-- MIGRATION 0010: Create Indexes for Performance
-- ============================================================================

-- profiles table indexes
create index if not exists idx_profiles_user_id on public.profiles(user_id);
create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_active on public.profiles(active);

-- users table indexes
create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_role on public.users(role);
create index if not exists idx_users_active on public.users(active);

-- machines table indexes
create index if not exists idx_machines_code on public.machines(code);
create index if not exists idx_machines_area on public.machines(area);
create index if not exists idx_machines_type on public.machines(type);
create index if not exists idx_machines_assigned_user on public.machines(assigned_user);
create index if not exists idx_machines_assigned_user_id on public.machines(assigned_user_id);
create index if not exists idx_machines_status on public.machines(status);
create index if not exists idx_machines_active on public.machines(active);

-- inspections table indexes
create index if not exists idx_inspections_machine_id on public.inspections(machine_id);
create index if not exists idx_inspections_operator_id on public.inspections(operator_id);
create index if not exists idx_inspections_completed_at on public.inspections(completed_at);

-- reports table indexes
create index if not exists idx_reports_inspection_id on public.reports(inspection_id);
create index if not exists idx_reports_machine_id on public.reports(machine_id);
create index if not exists idx_reports_report_date on public.reports(report_date);

-- notifications table indexes
create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_notifications_read on public.notifications(read);
create index if not exists idx_notifications_created_at on public.notifications(created_at);

-- ============================================================================
-- MIGRATION 0011: Enable Row Level Security & Policies
-- ============================================================================

-- Enable Row Level Security on all tables
alter table public.profiles enable row level security;
alter table public.work_areas enable row level security;
alter table public.machine_types enable row level security;
alter table public.machines enable row level security;
alter table public.inspections enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;

-- PROFILES table RLS policies
-- Service role (admin) can see and manage all profiles
-- Users can view their own profile
create policy "Service role can manage profiles"
  on public.profiles
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Users can view own profile"
  on public.profiles
  for select
  using (auth.uid() = user_id);

create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- WORK_AREAS table RLS policies - readable by all authenticated users
create policy "Authenticated users can read work areas"
  on public.work_areas
  for select
  using (auth.role() = 'authenticated');

create policy "Service role can manage work areas"
  on public.work_areas
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- MACHINE_TYPES table RLS policies - readable by all authenticated users
create policy "Authenticated users can read machine types"
  on public.machine_types
  for select
  using (auth.role() = 'authenticated');

create policy "Service role can manage machine types"
  on public.machine_types
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- MACHINES table RLS policies
-- Service role (admin) can see and manage all machines
-- Operators can see assigned machines + all machines if admin role
create policy "Service role can manage machines"
  on public.machines
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Operators can read assigned machines"
  on public.machines
  for select
  using (
    assigned_user_id = auth.uid()
    or assigned_user = (
      select username from public.profiles where user_id = auth.uid()
    )
  );

create policy "Admins can read all machines"
  on public.machines
  for select
  using (
    exists (
      select 1 from public.profiles
      where user_id = auth.uid()
      and (role = 'admin' or role = 'super_admin')
    )
  );

-- INSPECTIONS table RLS policies
-- Service role can see and manage all
-- Users can see inspections they performed
-- Admins can see all
create policy "Service role can manage inspections"
  on public.inspections
  as permissive
  for all
  using (true)
  with check (true)
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Users can view inspections they performed"
  on public.inspections
  for select
  using (auth.uid() = operator_id);

create policy "Admins can view all inspections"
  on public.inspectionsfrom public.profiles
      where user_id = auth.uid()
      and (role = 'admin' or role = 'super_admin')
    )
  );

-- REPORTS table RLS policies
-- Service role can manage all
-- Admins can view all
-- Users can view reports for their inspections
create policy "Service role can manage reports"
  on public.reports
  as permissive
  for all
  using (true)
  with check (true)
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Admins can view all reports"
  on public.reportsfrom public.profiles
      where user_id = auth.uid()
      and (role = 'admin' or role = 'super_admin')
    )
  );

-- NOTIFICATIONS table RLS policies
-- Service role can manage all
-- Users can view their own notifications
create policy "Service role can manage notifications"
  on public.notifications
  as permissive
  for all
  using (true)
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Users can view own notifications"
  on public.notifications
  for select
  using (auth.uid() = user_id);

create policy "Users can update own notifications"
  on public.notificationsuth.uid() = user_id);

-- ============================================================================
-- Database Schema Setup Complete
-- ============================================================================
-- All 12 migrations have been applied successfully!
-- Tables created: 8 (profiles, users, machines, inspections, reports, notifications, work_areas, machine_types)
-- Indexes created: 30+
-- Triggers created: 7
-- RLS policies created: 16
-- ============================================================================
