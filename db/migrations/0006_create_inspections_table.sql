-- Create inspections table
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
