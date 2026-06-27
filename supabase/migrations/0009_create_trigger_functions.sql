-- Create trigger function for updated_at column
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Add triggers for all tables with updated_at
drop trigger if exists update_profiles_updated_at on public.profiles;
create trigger update_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_users_updated_at on public.users;
create trigger update_users_updated_at
  before update on public.users
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_work_areas_updated_at on public.work_areas;
create trigger update_work_areas_updated_at
  before update on public.work_areas
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_machine_types_updated_at on public.machine_types;
create trigger update_machine_types_updated_at
  before update on public.machine_types
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_machines_updated_at on public.machines;
create trigger update_machines_updated_at
  before update on public.machines
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_inspections_updated_at on public.inspections;
create trigger update_inspections_updated_at
  before update on public.inspections
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_reports_updated_at on public.reports;
create trigger update_reports_updated_at
  before update on public.reports
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_notifications_updated_at on public.notifications;
create trigger update_notifications_updated_at
  before update on public.notifications
  for each row
  execute function public.update_updated_at_column();
