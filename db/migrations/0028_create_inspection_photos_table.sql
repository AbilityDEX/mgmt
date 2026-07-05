-- Create inspection_photos table to store metadata for inspection images
create table if not exists public.inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null,
  inspection_item_id uuid not null,
  machine_id uuid not null,
  storage_path text not null,
  original_filename text,
  uploaded_by uuid not null,
  uploaded_at timestamptz not null default now(),
  file_size bigint,
  mime_type text,
  active boolean not null default true
);

create index if not exists idx_inspection_photos_inspection_id on public.inspection_photos (inspection_id);
create index if not exists idx_inspection_photos_item_id on public.inspection_photos (inspection_item_id);
create index if not exists idx_inspection_photos_machine_id on public.inspection_photos (machine_id);

comment on table public.inspection_photos is 'Metadata records for inspection photos stored in Supabase Storage';
comment on column public.inspection_photos.storage_path is 'Path within Supabase Storage bucket';
comment on column public.inspection_photos.uploaded_by is 'profiles.user_id of uploader';
