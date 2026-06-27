-- Create reports table
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
