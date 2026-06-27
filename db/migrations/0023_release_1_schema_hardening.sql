-- Release 1 schema hardening upgrade (idempotent)
-- Repairs partial installations by ensuring all required compatibility objects exist.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- email_recipients compatibility table
-- ---------------------------------------------------------------------------

create table if not exists public.email_recipients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null,
  recipient_type text not null,
  enabled boolean not null default true,
  delivery_scope text not null default 'all_inspections',
  department_filter text,
  machine_filter uuid,
  source_recipient_id uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.email_recipients
  add column if not exists id uuid default uuid_generate_v4(),
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists recipient_type text,
  add column if not exists enabled boolean not null default true,
  add column if not exists delivery_scope text not null default 'all_inspections',
  add column if not exists department_filter text,
  add column if not exists machine_filter uuid,
  add column if not exists source_recipient_id uuid,
  add column if not exists created_at timestamp with time zone not null default now(),
  add column if not exists updated_at timestamp with time zone not null default now();

update public.email_recipients
set
  name = coalesce(name, 'Recipient'),
  email = coalesce(email, 'unknown@example.com'),
  recipient_type = coalesce(recipient_type, 'to'),
  delivery_scope = coalesce(delivery_scope, 'all_inspections')
where name is null
   or email is null
   or recipient_type is null
   or delivery_scope is null;

alter table public.email_recipients
  alter column name set not null,
  alter column email set not null,
  alter column recipient_type set not null,
  alter column delivery_scope set not null;

-- ---------------------------------------------------------------------------
-- inspection_email_history compatibility table
-- ---------------------------------------------------------------------------

create table if not exists public.inspection_email_history (
  id uuid primary key default uuid_generate_v4(),
  inspection_id uuid not null,
  template_id uuid,
  archive_id uuid,
  recipient_email text not null,
  recipient_type text not null default 'to',
  subject text,
  status text not null default 'queued',
  error_message text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.inspection_email_history
  add column if not exists id uuid default uuid_generate_v4(),
  add column if not exists inspection_id uuid,
  add column if not exists template_id uuid,
  add column if not exists archive_id uuid,
  add column if not exists recipient_email text,
  add column if not exists recipient_type text not null default 'to',
  add column if not exists subject text,
  add column if not exists status text not null default 'queued',
  add column if not exists error_message text,
  add column if not exists sent_at timestamp with time zone,
  add column if not exists created_at timestamp with time zone not null default now(),
  add column if not exists updated_at timestamp with time zone not null default now();

update public.inspection_email_history
set
  recipient_email = coalesce(recipient_email, 'unknown@example.com'),
  recipient_type = coalesce(recipient_type, 'to'),
  status = coalesce(status, 'queued')
where recipient_email is null
   or recipient_type is null
   or status is null;

alter table public.inspection_email_history
  alter column recipient_email set not null,
  alter column recipient_type set not null,
  alter column status set not null;

-- ---------------------------------------------------------------------------
-- archive_jobs compatibility table
-- ---------------------------------------------------------------------------

create table if not exists public.archive_jobs (
  id uuid primary key default uuid_generate_v4(),
  inspection_id uuid,
  archive_id uuid,
  archive_delivery_log_id uuid,
  status text not null default 'pending',
  archive_status text not null default 'pending',
  archive_last_error text,
  archive_timestamp timestamp with time zone,
  archive_reference text,
  retry_count integer not null default 0,
  next_retry_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.archive_jobs
  add column if not exists id uuid default uuid_generate_v4(),
  add column if not exists inspection_id uuid,
  add column if not exists archive_id uuid,
  add column if not exists archive_delivery_log_id uuid,
  add column if not exists status text not null default 'pending',
  add column if not exists archive_status text not null default 'pending',
  add column if not exists archive_last_error text,
  add column if not exists archive_timestamp timestamp with time zone,
  add column if not exists archive_reference text,
  add column if not exists retry_count integer not null default 0,
  add column if not exists next_retry_at timestamp with time zone,
  add column if not exists created_at timestamp with time zone not null default now(),
  add column if not exists updated_at timestamp with time zone not null default now();

update public.archive_jobs
set
  status = coalesce(status, 'pending'),
  archive_status = coalesce(archive_status, 'pending'),
  retry_count = coalesce(retry_count, 0)
where status is null
   or archive_status is null
   or retry_count is null;

alter table public.archive_jobs
  alter column status set not null,
  alter column archive_status set not null,
  alter column retry_count set not null;

-- ---------------------------------------------------------------------------
-- inspection_drafts table required by draft inspection APIs
-- ---------------------------------------------------------------------------

create table if not exists public.inspection_drafts (
  id uuid primary key default uuid_generate_v4(),
  inspection_id uuid not null,
  user_id uuid not null,
  draft_data jsonb not null default '{}'::jsonb,
  current_question_index integer not null default 0,
  scroll_position integer not null default 0,
  progress_percent numeric(5, 2) not null default 0,
  auto_saved_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (inspection_id, user_id)
);

alter table public.inspection_drafts
  add column if not exists id uuid default uuid_generate_v4(),
  add column if not exists inspection_id uuid,
  add column if not exists user_id uuid,
  add column if not exists draft_data jsonb not null default '{}'::jsonb,
  add column if not exists current_question_index integer not null default 0,
  add column if not exists scroll_position integer not null default 0,
  add column if not exists progress_percent numeric(5, 2) not null default 0,
  add column if not exists auto_saved_at timestamp with time zone not null default now(),
  add column if not exists created_at timestamp with time zone not null default now(),
  add column if not exists updated_at timestamp with time zone not null default now();

update public.inspection_drafts
set
  current_question_index = coalesce(current_question_index, 0),
  scroll_position = coalesce(scroll_position, 0),
  progress_percent = coalesce(progress_percent, 0),
  auto_saved_at = coalesce(auto_saved_at, now())
where current_question_index is null
   or scroll_position is null
   or progress_percent is null
   or auto_saved_at is null;

alter table public.inspection_drafts
  alter column inspection_id set not null,
  alter column user_id set not null;

-- ---------------------------------------------------------------------------
-- Repair missed columns in existing Release 1 tables
-- ---------------------------------------------------------------------------

alter table public.inspection_archives
  add column if not exists inspection_id uuid,
  add column if not exists archive_reference text,
  add column if not exists generated_by uuid,
  add column if not exists generated_at timestamp with time zone not null default now();

alter table public.archive_delivery_logs
  add column if not exists inspection_id uuid,
  add column if not exists archive_id uuid,
  add column if not exists status text,
  add column if not exists archived boolean not null default false,
  add column if not exists pdf_generated boolean not null default false,
  add column if not exists email_sent boolean not null default false,
  add column if not exists recipient_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists retry_count integer not null default 0,
  add column if not exists failure_reason text,
  add column if not exists archive_status text,
  add column if not exists archive_last_error text,
  add column if not exists archive_timestamp timestamp with time zone,
  add column if not exists archive_reference text,
  add column if not exists created_at timestamp with time zone not null default now();

update public.archive_delivery_logs
set
  status = coalesce(status, 'skipped'),
  retry_count = coalesce(retry_count, 0),
  archive_status = coalesce(archive_status, status, 'skipped')
where status is null
   or retry_count is null
   or archive_status is null;

alter table public.archive_delivery_logs
  alter column status set not null;

-- ---------------------------------------------------------------------------
-- Constraints and foreign keys
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_recipients_type_check'
      and conrelid = 'public.email_recipients'::regclass
  ) then
    alter table public.email_recipients
      add constraint email_recipients_type_check
      check (recipient_type in ('to', 'cc', 'bcc'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'email_recipients_scope_check'
      and conrelid = 'public.email_recipients'::regclass
  ) then
    alter table public.email_recipients
      add constraint email_recipients_scope_check
      check (delivery_scope in ('all_inspections', 'passed_inspections', 'failed_inspections', 'failed_only', 'defects_only'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inspection_email_history_status_check'
      and conrelid = 'public.inspection_email_history'::regclass
  ) then
    alter table public.inspection_email_history
      add constraint inspection_email_history_status_check
      check (status in ('queued', 'sent', 'failed', 'skipped'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inspection_email_history_recipient_type_check'
      and conrelid = 'public.inspection_email_history'::regclass
  ) then
    alter table public.inspection_email_history
      add constraint inspection_email_history_recipient_type_check
      check (recipient_type in ('to', 'cc', 'bcc'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'archive_jobs_status_check'
      and conrelid = 'public.archive_jobs'::regclass
  ) then
    alter table public.archive_jobs
      add constraint archive_jobs_status_check
      check (status in ('pending', 'running', 'completed', 'failed', 'retrying', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'archive_jobs_archive_status_check'
      and conrelid = 'public.archive_jobs'::regclass
  ) then
    alter table public.archive_jobs
      add constraint archive_jobs_archive_status_check
      check (archive_status in ('pending', 'archived', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'email_recipients_machine_filter_fkey'
      and conrelid = 'public.email_recipients'::regclass
  ) then
    alter table public.email_recipients
      add constraint email_recipients_machine_filter_fkey
      foreign key (machine_filter) references public.machines(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'email_recipients_source_recipient_id_fkey'
      and conrelid = 'public.email_recipients'::regclass
  ) then
    alter table public.email_recipients
      add constraint email_recipients_source_recipient_id_fkey
      foreign key (source_recipient_id) references public.email_distribution_recipients(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inspection_email_history_inspection_id_fkey'
      and conrelid = 'public.inspection_email_history'::regclass
  ) then
    alter table public.inspection_email_history
      add constraint inspection_email_history_inspection_id_fkey
      foreign key (inspection_id) references public.inspections(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inspection_email_history_template_id_fkey'
      and conrelid = 'public.inspection_email_history'::regclass
  ) then
    alter table public.inspection_email_history
      add constraint inspection_email_history_template_id_fkey
      foreign key (template_id) references public.email_templates(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inspection_email_history_archive_id_fkey'
      and conrelid = 'public.inspection_email_history'::regclass
  ) then
    alter table public.inspection_email_history
      add constraint inspection_email_history_archive_id_fkey
      foreign key (archive_id) references public.inspection_archives(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'archive_jobs_inspection_id_fkey'
      and conrelid = 'public.archive_jobs'::regclass
  ) then
    alter table public.archive_jobs
      add constraint archive_jobs_inspection_id_fkey
      foreign key (inspection_id) references public.inspections(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'archive_jobs_archive_id_fkey'
      and conrelid = 'public.archive_jobs'::regclass
  ) then
    alter table public.archive_jobs
      add constraint archive_jobs_archive_id_fkey
      foreign key (archive_id) references public.inspection_archives(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'archive_jobs_archive_delivery_log_id_fkey'
      and conrelid = 'public.archive_jobs'::regclass
  ) then
    alter table public.archive_jobs
      add constraint archive_jobs_archive_delivery_log_id_fkey
      foreign key (archive_delivery_log_id) references public.archive_delivery_logs(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inspection_drafts_inspection_id_fkey'
      and conrelid = 'public.inspection_drafts'::regclass
  ) then
    alter table public.inspection_drafts
      add constraint inspection_drafts_inspection_id_fkey
      foreign key (inspection_id) references public.inspections(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inspection_drafts_user_id_fkey'
      and conrelid = 'public.inspection_drafts'::regclass
  ) then
    alter table public.inspection_drafts
      add constraint inspection_drafts_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inspection_archives_inspection_id_fkey'
      and conrelid = 'public.inspection_archives'::regclass
  ) then
    alter table public.inspection_archives
      add constraint inspection_archives_inspection_id_fkey
      foreign key (inspection_id) references public.inspections(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'archive_delivery_logs_inspection_id_fkey'
      and conrelid = 'public.archive_delivery_logs'::regclass
  ) then
    alter table public.archive_delivery_logs
      add constraint archive_delivery_logs_inspection_id_fkey
      foreign key (inspection_id) references public.inspections(id) on delete cascade;
  end if;
end
$$;

create unique index if not exists idx_inspection_archives_inspection_id
  on public.inspection_archives(inspection_id)
  where inspection_id is not null;

create index if not exists idx_inspection_drafts_user_id
  on public.inspection_drafts(user_id);
create index if not exists idx_inspection_drafts_inspection_id
  on public.inspection_drafts(inspection_id);
create index if not exists idx_inspection_drafts_updated_at
  on public.inspection_drafts(updated_at);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_email_recipients_enabled
  on public.email_recipients(enabled, recipient_type);
create index if not exists idx_email_recipients_delivery_scope
  on public.email_recipients(delivery_scope);
create index if not exists idx_email_recipients_machine_filter
  on public.email_recipients(machine_filter);
create index if not exists idx_email_recipients_source_recipient
  on public.email_recipients(source_recipient_id);

create index if not exists idx_inspection_email_history_inspection
  on public.inspection_email_history(inspection_id, created_at desc);
create index if not exists idx_inspection_email_history_status
  on public.inspection_email_history(status, sent_at);
create index if not exists idx_inspection_email_history_recipient
  on public.inspection_email_history(recipient_email);

create index if not exists idx_archive_jobs_status
  on public.archive_jobs(status, archive_status, retry_count);
create index if not exists idx_archive_jobs_inspection
  on public.archive_jobs(inspection_id, created_at desc);
create index if not exists idx_archive_jobs_next_retry_at
  on public.archive_jobs(next_retry_at);
create index if not exists idx_archive_jobs_archive_timestamp
  on public.archive_jobs(archive_timestamp);
create index if not exists idx_archive_jobs_archive_reference
  on public.archive_jobs(archive_reference);

-- ---------------------------------------------------------------------------
-- Trigger function and triggers
-- ---------------------------------------------------------------------------

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'update_email_recipients_updated_at'
      and tgrelid = 'public.email_recipients'::regclass
  ) then
    create trigger update_email_recipients_updated_at
      before update on public.email_recipients
      for each row execute function public.update_updated_at_column();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'update_inspection_email_history_updated_at'
      and tgrelid = 'public.inspection_email_history'::regclass
  ) then
    create trigger update_inspection_email_history_updated_at
      before update on public.inspection_email_history
      for each row execute function public.update_updated_at_column();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'update_archive_jobs_updated_at'
      and tgrelid = 'public.archive_jobs'::regclass
  ) then
    create trigger update_archive_jobs_updated_at
      before update on public.archive_jobs
      for each row execute function public.update_updated_at_column();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'update_inspection_drafts_updated_at'
      and tgrelid = 'public.inspection_drafts'::regclass
  ) then
    create trigger update_inspection_drafts_updated_at
      before update on public.inspection_drafts
      for each row execute function public.update_updated_at_column();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Row level security and policies
-- ---------------------------------------------------------------------------

alter table public.email_recipients enable row level security;
alter table public.inspection_email_history enable row level security;
alter table public.archive_jobs enable row level security;
alter table public.inspection_drafts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'email_recipients'
      and policyname = 'Service role can manage email recipients'
  ) then
    create policy "Service role can manage email recipients"
      on public.email_recipients
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'email_recipients'
      and policyname = 'Authenticated users can read email recipients'
  ) then
    create policy "Authenticated users can read email recipients"
      on public.email_recipients
      as permissive
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inspection_email_history'
      and policyname = 'Service role can manage inspection email history'
  ) then
    create policy "Service role can manage inspection email history"
      on public.inspection_email_history
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inspection_email_history'
      and policyname = 'Authenticated users can read inspection email history'
  ) then
    create policy "Authenticated users can read inspection email history"
      on public.inspection_email_history
      as permissive
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'archive_jobs'
      and policyname = 'Service role can manage archive jobs'
  ) then
    create policy "Service role can manage archive jobs"
      on public.archive_jobs
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'archive_jobs'
      and policyname = 'Authenticated users can read archive jobs'
  ) then
    create policy "Authenticated users can read archive jobs"
      on public.archive_jobs
      as permissive
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inspection_drafts'
      and policyname = 'Service role can manage inspection drafts'
  ) then
    create policy "Service role can manage inspection drafts"
      on public.inspection_drafts
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inspection_drafts'
      and policyname = 'Authenticated users can manage own drafts'
  ) then
    create policy "Authenticated users can manage own drafts"
      on public.inspection_drafts
      as permissive
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
