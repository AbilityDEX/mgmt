# Quick Start: Complete Workflow Test Guide

## 10-Step Inspection Workflow Test

Run through these 10 steps exactly as written to verify the complete inspection execution engine:

### Prerequisites
- Supabase/PostgreSQL running at localhost:5432
- npm dependencies installed
- At least one machine and template in database

### Step 1: Start the Application
```bash
cd /workspaces/mgmt
npm run dev
```
Wait for: "ready - started server on 0.0.0.0:3000"

### Step 2: Open Browser Developer Tools
```
Press F12 or Cmd+Option+I
Go to Console tab
```

### Step 3: Navigate to Machine Page
```
URL: http://localhost:3000/inspection
```
Expected: See list of machines or "No machines found"

### Step 4: Select a Machine
Click on any machine card

**Verify in Console:**
```
[MACHINE PAGE] Loading machine details: { machineId: "xxx-xxx" }
```

### Step 5: Check Template Display
Look for one of these:
- ✅ Template cards with name and frequency displayed
- ❌ Message: "No inspection templates assigned"

If showing "No templates assigned":
- Issue: Database has no active assignments
- Fix: Create assignment in database

**Verify in Console:**
```
[MACHINE PAGE] API Response: { status: true, payload: {...} }
[MACHINE PAGE] Loaded: { templatesCount: 1 }
```

### Step 6: Click "Start Inspection" Button
Button should be enabled (not grayed out) if templates exist

**Verify in Console:**
```
[START INSPECTION] Starting with: { machineId: "xxx-xxx", templateId: "yyy-yyy" }
[START INSPECTION] Sending payload: { machine_id: "xxx-xxx", template_id: "yyy-yyy" }
```

### Step 7: Wait for Navigation
Page should navigate to `/inspection/executions/{inspectionId}`

**Verify in Console:**
```
[EXECUTION PAGE] Loading inspection: { inspectionId: "zzz-zzz" }
[INSPECTION GET] Loading inspection: { inspectionId: "zzz-zzz" }
[INSPECTION GET] Found inspection: { id: "zzz-zzz", machineId: "xxx-xxx" }
```

### Step 8: Verify Inspection Loads
Page should show:
- Inspection title with machine name
- List of inspection questions/items
- Input fields for each question type

Expected: 5-20 inspection items (depends on template)

### Step 9: Check for UUID Errors
**Look for these errors in console - they should NOT appear:**
```
❌ invalid input syntax for type uuid: "undefined"
❌ Inspection not found
❌ Failed to load inspection
```

**You SHOULD see:**
```
✅ [INSPECTION GET] Found inspection: {...}
✅ [EXECUTION PAGE] Loaded inspection: {...itemsCount: X}
```

### Step 10: Fill Out and Complete Inspection
- Answer at least 3 questions
- Scroll down and click "Complete Inspection"
- Verify success message appears

## Success Criteria Checklist

- [ ] Machine page loads without UUID errors
- [ ] Templates display on machine page (not "No templates")
- [ ] Template names and frequencies are visible
- [ ] "Start Inspection" button is enabled
- [ ] Clicking button navigates to inspection page
- [ ] Inspection page loads with items
- [ ] No "invalid input syntax for type uuid" errors
- [ ] Inspection can be completed
- [ ] Console shows logging for each step

## Debugging: If Something Fails

### Symptom: "No templates assigned"
1. Check database has templates:
```sql
SELECT id, name FROM checklist_templates LIMIT 5;
```
2. Check database has assignments:
```sql
SELECT * FROM machine_inspection_templates WHERE active = true LIMIT 5;
```
3. If missing: Create assignment via `/admin` page or manually

### Symptom: "uuid: undefined" Error
1. Check console for [INSPECTION GET] logs
2. Verify inspectionId is a valid UUID, not "undefined"
3. Check machine page log shows correct machineId
4. Try clearing browser cache and refreshing

### Symptom: Start Inspection Button Doesn't Work
1. Check console for [START INSPECTION] logs
2. Verify POST request in Network tab shows correct payload
3. Check API returned error message: `response.error`
4. Try starting with explicit template if multiple assigned

### Symptom: Inspection Page Shows No Items
1. Check API response in Network tab
2. Look for `inspection.items` array in response
3. Verify items were created: 
```sql
SELECT COUNT(*) FROM inspection_items WHERE inspection_id = 'xxx-xxx';
```

## Expected Console Output (Complete Workflow)

```
[MACHINE PAGE] Loading machine details: { machineId: "550e8400-e29b-41d4-a716-446655440000" }
[INSPECTION-EXECUTIONS GET] Request: { machineId: "550e8400-e29b-41d4-a716-446655440000" }
[INSPECTION-EXECUTIONS GET] Found assignments: { count: 1, data: [...] }
[MACHINE PAGE] API Response: { status: true, payload: { machine: {...}, assignedTemplates: [...], inspections: [...] } }
[MACHINE PAGE] Loaded: { machine: {...}, templatesCount: 1, templates: [...] }
[START INSPECTION] Starting with: { machineId: "550e8400-e29b-41d4-a716-446655440000", templateId: undefined }
[START INSPECTION] Sending payload: { machine_id: "550e8400-e29b-41d4-a716-446655440000" }
[INSPECTION POST] Starting inspection: { machineId: "550e8400-e29b-41d4-a716-446655440000", requestedTemplateId: "" }
[INSPECTION POST] Created inspection: { inspectionId: "660e8400-e29b-41d4-a716-446655440000" }
[START INSPECTION] Response: { status: true, result: { inspection: { id: "660e8400-e29b-41d4-a716-446655440000" } } }
[START INSPECTION] Navigating to: /inspection/executions/660e8400-e29b-41d4-a716-446655440000
[EXECUTION PAGE] Loading inspection: { inspectionId: "660e8400-e29b-41d4-a716-446655440000" }
[EXECUTION PAGE] Fetching from: /api/inspection-executions/660e8400-e29b-41d4-a716-446655440000
[INSPECTION GET] Loading inspection: { inspectionId: "660e8400-e29b-41d4-a716-446655440000" }
[INSPECTION GET] Found inspection: { id: "660e8400-e29b-41d4-a716-446655440000", machineId: "550e8400-e29b-41d4-a716-446655440000" }
[EXECUTION PAGE] Response: { status: true, payload: { inspection: { id: "...", items: [...] } } }
[EXECUTION PAGE] Loaded inspection: { id: "...", machine: "...", itemsCount: 8 }
```

## Verification Queries

After completing the workflow, run these SQL queries to verify data integrity:

```sql
-- 1. Verify inspection was created
SELECT id, machine_id, template_id, status, created_at 
FROM inspections 
ORDER BY created_at DESC LIMIT 1;

-- 2. Verify inspection items were snapshot
SELECT id, display_order, question, question_type, required
FROM inspection_items 
WHERE inspection_id = '{inspection_id_from_above}'
ORDER BY display_order;

-- 3. Verify items match template
SELECT COUNT(*) as template_item_count
FROM checklist_template_items 
WHERE template_id = '{template_id_from_inspection}';

SELECT COUNT(*) as inspection_item_count
FROM inspection_items 
WHERE inspection_id = '{inspection_id_from_above}';

-- Counts should be equal
```

## Contact & Support

If workflow fails at any step:
1. Check console logs (copy output)
2. Check `/tmp/dev-server.log` for server errors
3. Verify database is running: `lsof -i :5432`
4. Check Network tab in DevTools for API response details
