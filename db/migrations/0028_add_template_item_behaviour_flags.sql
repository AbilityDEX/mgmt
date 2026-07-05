-- Add behaviour configuration columns to checklist_template_items
-- These fields control comment/photo requirements and defaults for template items.
alter table if exists public.checklist_template_items
  add column if not exists fail_require_comment boolean not null default true,
  add column if not exists fail_allow_photos boolean not null default true,
  add column if not exists fail_require_photos boolean not null default false,
  add column if not exists pass_allow_photos boolean not null default false,
  add column if not exists photo_max_count integer not null default 10;

comment on column public.checklist_template_items.fail_require_comment is 'Require a comment when this item is marked FAIL (default TRUE)';
comment on column public.checklist_template_items.fail_allow_photos is 'Allow photo uploads when this item is marked FAIL (default TRUE)';
comment on column public.checklist_template_items.fail_require_photos is 'Require at least one photo when this item is marked FAIL (default FALSE)';
comment on column public.checklist_template_items.pass_allow_photos is 'Allow photo uploads when this item is marked PASS (default FALSE)';
comment on column public.checklist_template_items.photo_max_count is 'Maximum number of photos allowed for this item (default 10)';
