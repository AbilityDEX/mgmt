-- Create indexes for better query performance

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
