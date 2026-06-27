-- Create work_areas table for machine grouping
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
