-- Seed test data for inspection workflow testing
-- This script creates test machines, templates, and assignments

-- 1. Create a test work area
INSERT INTO public.work_areas (id, name, department_id, description)
SELECT 
  gen_random_uuid(),
  'Test Assembly Line',
  NULL,
  'Test area for inspection workflow validation'
WHERE NOT EXISTS (SELECT 1 FROM public.work_areas WHERE name = 'Test Assembly Line');

-- Get the area ID for use in machine creation
DO $$
DECLARE
  area_id UUID;
  machine_id UUID;
  template_id UUID;
BEGIN
  -- Get or create area
  SELECT id INTO area_id FROM public.work_areas WHERE name = 'Test Assembly Line' LIMIT 1;
  
  IF area_id IS NULL THEN
    area_id := gen_random_uuid();
    INSERT INTO public.work_areas (id, name, description) 
    VALUES (area_id, 'Test Assembly Line', 'Test area');
  END IF;

  -- 2. Create a test machine if it doesn't exist
  INSERT INTO public.machines (id, name, area_id, status)
  SELECT 
    gen_random_uuid(),
    'Test Machine #1',
    area_id,
    'Operational'
  WHERE NOT EXISTS (SELECT 1 FROM public.machines WHERE name = 'Test Machine #1')
  RETURNING id INTO machine_id;

  -- If insert didn't create one, fetch the existing one
  IF machine_id IS NULL THEN
    SELECT id INTO machine_id FROM public.machines WHERE name = 'Test Machine #1' LIMIT 1;
  END IF;

  -- 3. Create a test inspection template if it doesn't exist
  INSERT INTO public.checklist_templates (id, name, description, category)
  SELECT 
    gen_random_uuid(),
    'Daily Safety Check',
    'Standard daily safety inspection checklist',
    'Safety'
  WHERE NOT EXISTS (SELECT 1 FROM public.checklist_templates WHERE name = 'Daily Safety Check')
  RETURNING id INTO template_id;

  -- If insert didn't create one, fetch the existing one
  IF template_id IS NULL THEN
    SELECT id INTO template_id FROM public.checklist_templates WHERE name = 'Daily Safety Check' LIMIT 1;
  END IF;

  -- 4. Create template items if they don't exist
  INSERT INTO public.checklist_template_items (id, template_id, display_order, question, question_type, required)
  SELECT 
    gen_random_uuid(),
    template_id,
    1,
    'Are all emergency exits clearly marked and accessible?',
    'yesno',
    true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.checklist_template_items 
    WHERE template_id = template_id AND display_order = 1
  );

  INSERT INTO public.checklist_template_items (id, template_id, display_order, question, question_type, required)
  SELECT 
    gen_random_uuid(),
    template_id,
    2,
    'Is the machine functioning normally?',
    'yesno',
    true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.checklist_template_items 
    WHERE template_id = template_id AND display_order = 2
  );

  INSERT INTO public.checklist_template_items (id, template_id, display_order, question, question_type, required)
  SELECT 
    gen_random_uuid(),
    template_id,
    3,
    'Rate the overall condition of the machine',
    'rating',
    false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.checklist_template_items 
    WHERE template_id = template_id AND display_order = 3
  );

  INSERT INTO public.checklist_template_items (id, template_id, display_order, question, question_type, required)
  SELECT 
    gen_random_uuid(),
    template_id,
    4,
    'Any defects or issues observed?',
    'text',
    false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.checklist_template_items 
    WHERE template_id = template_id AND display_order = 4
  );

  INSERT INTO public.checklist_template_items (id, template_id, display_order, question, question_type, required)
  SELECT 
    gen_random_uuid(),
    template_id,
    5,
    'What is the pass/fail status?',
    'passfall',
    true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.checklist_template_items 
    WHERE template_id = template_id AND display_order = 5
  );

  -- 5. Create machine-template assignment if it doesn't exist
  INSERT INTO public.machine_inspection_templates (id, machine_id, template_id, inspection_frequency, active)
  SELECT 
    gen_random_uuid(),
    machine_id,
    template_id,
    'Daily',
    true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.machine_inspection_templates 
    WHERE machine_id = machine_id AND template_id = template_id
  );

  -- 6. Create a second test machine without templates (for testing "no templates" case)
  INSERT INTO public.machines (id, name, area_id, status)
  SELECT 
    gen_random_uuid(),
    'Test Machine #2',
    area_id,
    'Operational'
  WHERE NOT EXISTS (SELECT 1 FROM public.machines WHERE name = 'Test Machine #2');

  RAISE NOTICE 'Test data created successfully!';
  RAISE NOTICE 'Created test machine: %', machine_id;
  RAISE NOTICE 'Created test template: %', template_id;
END $$;

-- Verify test data was created
SELECT 
  'Machines' as table_name,
  COUNT(*) as count
FROM public.machines
WHERE name LIKE 'Test Machine%'
UNION ALL
SELECT 
  'Templates',
  COUNT(*)
FROM public.checklist_templates
WHERE name = 'Daily Safety Check'
UNION ALL
SELECT 
  'Template Items',
  COUNT(*)
FROM public.checklist_template_items
WHERE template_id = (SELECT id FROM public.checklist_templates WHERE name = 'Daily Safety Check' LIMIT 1)
UNION ALL
SELECT 
  'Machine-Template Assignments',
  COUNT(*)
FROM public.machine_inspection_templates
WHERE machine_id IN (SELECT id FROM public.machines WHERE name LIKE 'Test Machine%')
  AND active = true;
