-- Ensure inspection template items support only allowed question types
-- This keeps current behavior (default pass_fail) while preparing for future item types.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inspection_template_items_question_type_check'
      and conrelid = 'public.checklist_template_items'::regclass
  ) then
    alter table public.checklist_template_items
      add constraint inspection_template_items_question_type_check
      check (question_type in ('pass_fail', 'yes_no', 'text', 'number', 'photo', 'signature'));
  end if;
end
$$;
