-- Add optional description field to template items and inspection snapshot items
alter table public.checklist_template_items
  add column if not exists description text;

alter table public.inspection_items
  add column if not exists description text;

comment on column public.checklist_template_items.description is 'Optional helper text describing what the inspector should check for this item';
comment on column public.inspection_items.description is 'Snapshot of checklist_template_items.description captured when the inspection starts';
