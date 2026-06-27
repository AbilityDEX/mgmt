-- Add inspection archive and PDF generation tracking
-- Release 1: Archive and PDF enhancement

-- Enhance inspections with archive and PDF metadata
alter table public.inspections
  add column if not exists archive_status text not null default 'pending',
  add column if not exists pdf_url text,
  add column if not exists pdf_generated_at timestamp with time zone,
  add column if not exists archive_attempt_count integer not null default 0,
  add column if not exists archive_last_attempt timestamp with time zone,
  add column if not exists archive_next_retry timestamp with time zone,
  add column if not exists archive_error_message text;

-- Add constraints for archive status
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inspections_archive_status_check'
      and conrelid = 'public.inspections'::regclass
  ) then
    alter table public.inspections
      add constraint inspections_archive_status_check
      check (archive_status in ('pending', 'sent', 'failed', 'retry_scheduled'));
  end if;
end
$$;

-- Add comments
comment on column public.inspections.archive_status is 'Status of archive email: pending, sent, failed, or retry_scheduled';
comment on column public.inspections.pdf_url is 'URL or path to generated PDF for this inspection';
comment on column public.inspections.pdf_generated_at is 'Timestamp when PDF was generated';
comment on column public.inspections.archive_attempt_count is 'Number of archive attempts made';
comment on column public.inspections.archive_last_attempt is 'Timestamp of last archive attempt';
comment on column public.inspections.archive_next_retry is 'Scheduled time for next archive retry';
comment on column public.inspections.archive_error_message is 'Error message from most recent archive attempt';

-- Create email queue table for failed emails
create table if not exists public.email_queue (
  id uuid primary key default uuid_generate_v4(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  recipient_email text not null,
  recipient_type text not null default 'to',
  subject text,
  body text,
  template_id uuid,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_attempt_at timestamp with time zone,
  next_retry_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Add constraint for queue status
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_queue_status_check'
      and conrelid = 'public.email_queue'::regclass
  ) then
    alter table public.email_queue
      add constraint email_queue_status_check
      check (status in ('pending', 'sent', 'failed', 'abandoned'));
  end if;
end
$$;

-- Create indexes for email queue
create index if not exists idx_email_queue_status_next_retry
  on public.email_queue(status, next_retry_at) 
  where status in ('pending', 'failed');

create index if not exists idx_email_queue_inspection_id
  on public.email_queue(inspection_id);

-- Add comments
comment on table public.email_queue is 'Queue for emails that need to be sent, with retry logic';
comment on column public.email_queue.status is 'Status: pending, sent, failed, or abandoned';
comment on column public.email_queue.attempt_count is 'Number of send attempts';
comment on column public.email_queue.next_retry_at is 'When to retry this email';
