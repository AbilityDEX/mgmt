-- Add SMTP configuration storage to company settings.
-- Idempotent migration: safe to run multiple times.

alter table if exists public.company_settings
  add column if not exists smtp_config jsonb,
  add column if not exists smtp_updated_at timestamptz;

comment on column public.company_settings.smtp_config is 'Encrypted SMTP configuration payload (password encrypted at application layer)';
comment on column public.company_settings.smtp_updated_at is 'Timestamp when SMTP config was last updated';
