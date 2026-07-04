-- Add explicit scheduling fields to inspection_schedules
ALTER TABLE inspection_schedules
  ADD COLUMN IF NOT EXISTS unlock_time text NULL,
  ADD COLUMN IF NOT EXISTS deadline_time text NULL,
  ADD COLUMN IF NOT EXISTS reminder_offset_minutes integer NULL;

-- Backfill existing schedules to use machine.inspection_deadline as unlock_time for compatibility
UPDATE inspection_schedules s
SET unlock_time = m.inspection_deadline
FROM machine_inspection_templates mit
JOIN machines m ON mit.machine_id = m.id
WHERE s.machine_template_id = mit.id
  AND s.unlock_time IS NULL
  AND m.inspection_deadline IS NOT NULL;

-- Add index for lookup by machine_template_id
CREATE INDEX IF NOT EXISTS idx_inspection_schedules_machine_template_id ON inspection_schedules(machine_template_id);
