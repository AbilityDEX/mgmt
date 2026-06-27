-- Create reusable inspection templates
create table if not exists public.checklist_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.checklist_template_items (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  display_order integer not null default 0,
  question text not null,
  question_type text not null default 'pass_fail',
  required boolean not null default true,
  created_at timestamp with time zone not null default now()
);

alter table public.machines
  add column if not exists template_id uuid references public.checklist_templates(id) on delete set null;

drop trigger if exists update_inspection_templates_updated_at on public.checklist_templates;
create trigger update_inspection_templates_updated_at
  before update on public.checklist_templates
  for each row
  execute function public.update_updated_at_column();

comment on table public.checklist_templates is 'Reusable inspection templates that can be assigned to machines';
comment on table public.checklist_template_items is 'Ordered checklist items belonging to inspection templates';
comment on column public.checklist_template_items.question_type is 'Question input type, default pass_fail';
comment on column public.machines.template_id is 'Optional inspection template assigned to this machine';
