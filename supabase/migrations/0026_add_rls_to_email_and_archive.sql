-- Add RLS policies for email_queue and archive/PDF tracking
-- Release 1: Email and archive system hardening

-- Enable RLS on email_queue
alter table public.email_queue enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'email_queue'
      and policyname = 'Service role can manage email queue'
  ) then
    create policy "Service role can manage email queue"
      on public.email_queue
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'email_queue'
      and policyname = 'Authenticated users can view their inspection emails'
  ) then
    create policy "Authenticated users can view their inspection emails"
      on public.email_queue
      as permissive
      for select
      using (
        exists (
          select 1 from public.inspections i
          where i.id = email_queue.inspection_id
            and (
              i.operator_id = auth.uid()
              or exists (
                select 1 from public.profiles p
                where p.user_id = auth.uid()
                  and p.role in ('Admin', 'admin', 'super_admin')
              )
            )
        )
      );
  end if;
end
$$;

-- Create indexes for performance
create index if not exists idx_email_queue_created_at
  on public.email_queue(created_at desc);

create index if not exists idx_email_queue_status_created
  on public.email_queue(status, created_at desc);

-- Create trigger to clean up abandoned emails after 30 days
create or replace function cleanup_abandoned_emails()
returns void as $$
begin
  delete from public.email_queue
  where status = 'abandoned'
    and created_at < now() - interval '30 days';
end;
$$ language plpgsql;
