-- Create machines table
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
  status text not null default 'Not Started', -- 'Not Started', 'In Progress', 'Completed', 'Overdue'
  notes text,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.machines is 'Equipment/machines requiring regular inspections';
comment on column public.machines.status is 'Current status: Not Started (awaiting inspection), In Progress (under inspection), Completed (inspection done), Overdue (past deadline)';
comment on column public.machines.assigned_user is 'Username of operator assigned to this machine, or NULL if not assigned';
comment on column public.machines.inspection_deadline is 'Daily deadline time in HH:MM format (e.g., 09:00)';
