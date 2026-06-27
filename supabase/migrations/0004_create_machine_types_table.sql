-- Create machine_types table
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
