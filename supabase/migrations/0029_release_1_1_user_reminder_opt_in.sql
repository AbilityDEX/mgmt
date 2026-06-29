-- Release 1.1: user-level reminder email opt-in.
alter table if exists public.profiles
  add column if not exists receive_inspection_reminder_emails boolean not null default false;

alter table if exists public.users
  add column if not exists receive_inspection_reminder_emails boolean not null default false;

comment on column public.profiles.receive_inspection_reminder_emails is 'Whether this user should receive inspection reminder emails.';
comment on column public.users.receive_inspection_reminder_emails is 'Mirror of profiles.receive_inspection_reminder_emails for backward compatibility.';