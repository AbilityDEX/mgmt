-- Add missing question types and storage columns for complete inspection execution

-- Extend question_type constraint to include missing types
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'inspection_items_question_type_check'
      and conrelid = 'public.inspection_items'::regclass
  ) then
    alter table public.inspection_items drop constraint inspection_items_question_type_check;
  end if;
  
  alter table public.inspection_items
    add constraint inspection_items_question_type_check
    check (question_type in (
      'pass_fail', 'yes_no', 'text', 'number', 'decimal', 'long_notes',
      'multiple_choice', 'dropdown', 'photo', 'signature'
    ));
end
$$;

-- Add storage columns for photos, signatures, validation, and autosave
alter table public.inspection_items
  add column if not exists photos jsonb, -- Array of {url, timestamp, caption}
  add column if not exists signature_data text, -- Base64 encoded signature
  add column if not exists signature_timestamp timestamp with time zone,
  add column if not exists help_text text,
  add column if not exists placeholder_text text,
  add column if not exists default_value text,
  add column if not exists validation_rules jsonb, -- {min, max, pattern, etc}
  add column if not exists options jsonb, -- For multiple_choice, dropdown
  add column if not exists expected_answer text, -- For testing/validation
  add column if not exists photo_required boolean not null default false,
  add column if not exists signature_required boolean not null default false,
  add column if not exists autosaved_at timestamp with time zone;

-- Add draft and autosave tracking to inspections table
alter table public.inspections
  add column if not exists draft_state jsonb, -- {currentQuestion, scrollPosition, lastAutosave}
  add column if not exists autosave_enabled boolean not null default true,
  add column if not exists last_autosaved_at timestamp with time zone;

-- Create inspection_drafts table for managing incomplete inspections
create table if not exists public.inspection_drafts (
  id uuid primary key default uuid_generate_v4(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  current_question_index integer not null default 0,
  scroll_position integer not null default 0,
  progress_percent integer not null default 0,
  last_saved_at timestamp with time zone not null default now(),
  autosave_enabled boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique(inspection_id, user_id)
);

-- Update template items to include all new field types
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'checklist_template_items_question_type_check'
      and conrelid = 'public.checklist_template_items'::regclass
  ) then
    alter table public.checklist_template_items drop constraint checklist_template_items_question_type_check;
  end if;
  
  alter table public.checklist_template_items
    add constraint checklist_template_items_question_type_check
    check (question_type in (
      'pass_fail', 'yes_no', 'text', 'number', 'decimal', 'long_notes',
      'multiple_choice', 'dropdown', 'photo', 'signature'
    ));
end
$$;

-- Extend template items with additional fields for complete question definition
alter table public.checklist_template_items
  add column if not exists help_text text,
  add column if not exists placeholder_text text,
  add column if not exists default_value text,
  add column if not exists validation_rules jsonb, -- {min, max, pattern, step, etc}
  add column if not exists options jsonb, -- For multiple_choice, dropdown [{label, value}]
  add column if not exists expected_answer text,
  add column if not exists photo_required boolean not null default false,
  add column if not exists signature_required boolean not null default false;

-- Add indexes for draft recovery and autosave queries
create index if not exists idx_inspection_drafts_user_id on public.inspection_drafts(user_id);
create index if not exists idx_inspection_drafts_inspection_id on public.inspection_drafts(inspection_id);
create index if not exists idx_inspection_drafts_updated_at on public.inspection_drafts(updated_at);
create index if not exists idx_inspections_status_started_at on public.inspections(status, started_at);
create index if not exists idx_inspection_items_completed on public.inspection_items(inspection_id, completed);

-- Create photo_uploads table for managing photo metadata
create table if not exists public.photo_uploads (
  id uuid primary key default uuid_generate_v4(),
  inspection_item_id uuid not null references public.inspection_items(id) on delete cascade,
  storage_path text not null,
  caption text,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamp with time zone not null default now()
);

create index if not exists idx_photo_uploads_item_id on public.photo_uploads(inspection_item_id);

-- Enable RLS on new tables
alter table public.inspection_drafts enable row level security;
alter table public.photo_uploads enable row level security;

-- Policies for inspection_drafts
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inspection_drafts'
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
    where schemaname = 'public'
      and tablename = 'inspection_drafts'
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

-- Policies for photo_uploads
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'photo_uploads'
      and policyname = 'Service role can manage photo uploads'
  ) then
    create policy "Service role can manage photo uploads"
      on public.photo_uploads
      as permissive
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'photo_uploads'
      and policyname = 'Authenticated users can read related photos'
  ) then
    create policy "Authenticated users can read related photos"
      on public.photo_uploads
      as permissive
      for select
      using (auth.role() = 'authenticated');
  end if;
end
$$;

-- Update trigger timestamps
drop trigger if exists update_inspection_drafts_updated_at on public.inspection_drafts;
create trigger update_inspection_drafts_updated_at
  before update on public.inspection_drafts
  for each row
  execute function public.update_updated_at_column();

-- Add comments for documentation
comment on table public.inspection_drafts is 'Tracks draft state for incomplete inspections for autosave and recovery';
comment on table public.photo_uploads is 'Metadata for photos uploaded during inspections';
comment on column public.inspection_items.photos is 'Array of photo uploads: [{id, url, timestamp, caption}]';
comment on column public.inspection_items.signature_data is 'Base64 encoded signature image';
comment on column public.inspection_items.validation_rules is 'Validation constraints: {min, max, pattern, step, allowDecimals}';
comment on column public.inspection_items.options is 'Choices for multiple_choice/dropdown: [{label, value}]';
comment on column public.inspections.draft_state is 'Autosave state: {currentQuestionIndex, scrollPosition, lastAutosaveTime}';
