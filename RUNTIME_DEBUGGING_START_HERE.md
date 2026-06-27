# Quick Start: Runtime Debugging Session

## What Was Changed

Added comprehensive console logging at EVERY step of the inspection workflow. Every UUID is logged BEFORE and AFTER being used in database queries.

## Critical Validation Points

✅ **Route parameters logged** - Verify machineId and inspectionId extracted correctly
✅ **UUID validation before queries** - Reject undefined/empty IDs before Supabase
✅ **Query parameters logged** - See exact values being sent to database
✅ **Query results logged** - Confirm data returned from database
✅ **Error messages specific** - Identify exactly where undefined appears

## How to Run

### 1. Ensure Database is Running
```bash
# Check Supabase/PostgreSQL is accessible
psql -h localhost -U postgres -d postgres -c "SELECT 1;"
```

### 2. Start Dev Server
```bash
cd /workspaces/mgmt
npm run dev
```

Wait for: `ready - started server on 0.0.0.0:3000`

### 3. Open Browser
```
http://localhost:3000/inspection
```

### 4. Open Developer Console
```
Press F12
Click "Console" tab
```

### 5. Select a Machine
Click any machine from the list

### 6. Watch Console Output
You should see:
```
[TRACE 1] Route parameters: { params, machineId, ... }
[TRACE 2] Valid machineId, proceeding to load: { machineId: "xxx-xxx" }
[TRACE 3] Calling API with: { url, machineId: "xxx-xxx", ... }
[API TRACE 1] GET /inspection-executions: { fullUrl, machineId: "xxx-xxx", ... }
[API TRACE 2] Querying inspections table with machineId: { machineId: "xxx-xxx" }
[API TRACE 3] Querying machines table with id: { machineId: "xxx-xxx" }
[API TRACE 3] Machine query result: { found: true, machineData: { id, name, area } }
[API TRACE 4] Querying machine_inspection_templates with machineId: { machineId: "xxx-xxx" }
[TRACE 4] API Response: { status: true, hasMachine: true, machineName: "...", templateCount: 1 }
```

**✓ Expected Result:** Machine name displays, templates show

**✗ Problem Result:**
```
[TRACE 2] CRITICAL: Invalid machineId received: "undefined"
// or
[API TRACE 3] Machine query result: { found: false }
// or
[TRACE 4] API Response: { status: false, errorMessage: "..." }
```

### 7. Click "Start Inspection"
Console should show:
```
[START INSPECTION] Starting with: { machineId: "xxx-xxx", templateId: "yyy-yyy" }
[START INSPECTION] Sending payload: { machine_id: "xxx-xxx", template_id: "yyy-yyy" }
[API POST TRACE 1] POST /inspection-executions received: { body, machineId: "xxx-xxx", ... }
[API POST TRACE 2] Querying machine with id: { machineId: "xxx-xxx" }
[API POST TRACE 2] Machine found: { id, name }
[API POST TRACE 3] Querying template assignments for machine: { machineId: "xxx-xxx" }
[API POST TRACE 4] Querying templates with ids: { templateIds: ["zzz-zzz"] }
[API POST TRACE 6] Querying template items for template: { selectedTemplateId: "zzz-zzz" }
[API POST TRACE 6] Template items found: { count: 5 }
[API POST TRACE 7] Creating inspection with: { machineId: "xxx-xxx", selectedTemplateId: "zzz-zzz", ... }
[API POST TRACE 7] Inspection created: { inspectionId: "aaa-aaa", machineId: "xxx-xxx", templateId: "zzz-zzz" }
[API POST TRACE 8] Creating inspection items snapshot: { inspectionId: "aaa-aaa", itemCount: 5 }
[API POST TRACE 8] Inspection items created successfully: { inspectionId: "aaa-aaa", itemsCount: 5 }
[API POST TRACE COMPLETE] Inspection workflow complete: { inspectionId: "aaa-aaa", ... }
[START INSPECTION] Response: { status: true, result: { inspection: { id: "aaa-aaa" } } }
[START INSPECTION] Navigating to: /inspection/executions/aaa-aaa
```

**✓ Expected Result:** Page navigates to inspection, console shows creation successful

**✗ Problem Result:**
```
[API POST TRACE 1] BLOCKED: Invalid machineId in POST body: "undefined"
// or
[API POST TRACE 2] Machine not found: { machineId: "xxx-xxx" }
// or
[API POST TRACE 3] No template assignments found
// or
[API POST TRACE 6] No template items found
```

### 8. Verify Inspection Page Loads
Console should show:
```
[EXEC TRACE 1] Execution page route parameters: { inspectionId: "aaa-aaa", typeOfInspectionId: "string", isUndefined: false, ... }
[EXEC TRACE 1] Valid inspectionId, proceeding to load: { inspectionId: "aaa-aaa" }
[EXEC TRACE 2] Calling API with: { url: "/api/inspection-executions/aaa-aaa", inspectionId: "aaa-aaa", ... }
[DETAIL API TRACE 1] GET /inspection-executions/[inspectionId]: { inspectionId: "aaa-aaa", ... }
[DETAIL API TRACE 2] Querying inspection with id: { inspectionId: "aaa-aaa" }
[DETAIL API TRACE 2] Inspection found: { inspectionId: "aaa-aaa", machineId: "xxx-xxx", templateId: "zzz-zzz" }
[DETAIL API TRACE 3] Querying machine with id: { machineId: "xxx-xxx" }
[DETAIL API TRACE 3] Machine found: { machineId: "xxx-xxx", name: "..." }
[DETAIL API TRACE 4] Querying inspection items for inspection: { inspectionId: "aaa-aaa" }
[DETAIL API TRACE 4] Inspection items found: { count: 5 }
[EXEC TRACE 3] API Response: { status: true, statusCode: 200, hasInspection: true, inspectionId: "aaa-aaa", itemsCount: 5 }
[EXEC TRACE 4] Inspection data loaded: { id: "aaa-aaa", machineId: "xxx-xxx", itemsCount: 5, items: [...] }
```

**✓ Expected Result:** Inspection page displays with questions

**✗ Problem Result:**
```
[EXEC TRACE 1] CRITICAL: Invalid inspectionId: "undefined"
// or
[DETAIL API TRACE 2] Inspection not found: { inspectionId: "aaa-aaa" }
// or
[EXEC TRACE 3] API Response: { status: false, errorMessage: "..." }
```

## Troubleshooting

### Machine page shows "Machine" instead of actual name

**Check console for:**
```
[TRACE 4] API Response: { hasMachine: false }
```

**Fix:**
1. Check database: `SELECT id, name FROM machines LIMIT 5;`
2. Verify machine exists
3. Check API TRACE 3: `Machine query result: { found: false }`
4. Check database: `SELECT * FROM machines WHERE id = '{machineId}'`

### "No inspection templates assigned" but templates exist

**Check console for:**
```
[API TRACE 4] Assignments query result: { count: 0 }
```

**Fix:**
1. Check database: `SELECT * FROM machine_inspection_templates WHERE active = true LIMIT 5;`
2. Verify assignments exist for machine
3. Verify `active = true`

### Start Inspection button fails

**Check console for error message:**
- Contains "BLOCKED" = Invalid machineId or templateId
- Contains "not found" = Record doesn't exist in database
- Contains other error = Check specific error message

### Inspection page shows undefined UUID error

**Check console for:**
```
[EXEC TRACE 1] CRITICAL: Invalid inspectionId: "undefined"
```

**Fix:**
1. Verify inspection was created (check API POST TRACE COMPLETE)
2. Verify inspectionId in response
3. Check database: `SELECT id FROM inspections ORDER BY created_at DESC LIMIT 1;`

## Key Validation Points to Check

| Step | Expected Value | What to Check |
|------|---|---|
| TRACE 1 | `machineId` is a valid UUID (36 chars) | `typeOfMachineId: "string"` and `isUndefined: false` |
| TRACE 2 | Process continues | Should NOT see "CRITICAL" message |
| API TRACE 3 | `found: true` | Machine exists in database |
| API TRACE 4 | `count > 0` | Machine has active template assignments |
| START TRACE 1 | Both IDs present | `machineId` and `templateId` defined |
| API POST TRACE 7 | `inspectionId` returned | Inspection record created |
| EXEC TRACE 1 | `isUndefined: false` | Route parameter valid |
| DETAIL API TRACE 2 | `inspectionId` found | Inspection exists in database |
| DETAIL API TRACE 4 | `count > 0` | Inspection has items |

## Database Queries to Verify

```sql
-- Check machines exist
SELECT id, name FROM machines LIMIT 5;

-- Check templates exist
SELECT id, name FROM checklist_templates LIMIT 5;

-- Check assignments exist
SELECT mit.machine_id, mit.template_id, ct.name, mit.active
FROM machine_inspection_templates mit
JOIN checklist_templates ct ON mit.template_id = ct.id
WHERE mit.active = true
LIMIT 5;

-- Check template items
SELECT id, display_order, question FROM checklist_template_items
WHERE template_id = '{template_id}'
ORDER BY display_order;

-- Check inspection created
SELECT id, machine_id, template_id, status FROM inspections
ORDER BY created_at DESC LIMIT 1;

-- Check inspection items created
SELECT COUNT(*) FROM inspection_items
WHERE inspection_id = '{inspection_id}';
```

## File Changes Summary

### Added Logging To:

1. **Machine Details Page** (`/app/inspection/[machineId]/page.tsx`)
   - TRACE 1: Route parameter extraction and validation
   - TRACE 2: Validate machineId before API
   - TRACE 3: Log API URL being called
   - TRACE 4: Log API response details

2. **Machine Details API** (`/app/api/inspection-executions/route.ts` GET)
   - API TRACE 1: Validate query parameter
   - API TRACE 2-5: Log each database query

3. **Start Inspection Flow** (`/app/inspection/[machineId]/page.tsx`)
   - START TRACE 1: Log button click and parameters

4. **Inspection Creation API** (`/app/api/inspection-executions/route.ts` POST)
   - API POST TRACE 1-8: Log entire inspection creation workflow

5. **Inspection Execution Page** (`/app/inspection/executions/[inspectionId]/page.tsx`)
   - EXEC TRACE 1-4: Route parameter validation and data loading

6. **Inspection Details API** (`/app/api/inspection-executions/[inspectionId]/route.ts` GET)
   - DETAIL API TRACE 1-4: Log entire details fetch workflow

## Next Steps

1. **Run dev server**
2. **Navigate through complete workflow**
3. **Check browser console for all TRACE logs**
4. **Identify which TRACE point fails**
5. **Use database queries to verify data exists**
6. **Report which step fails and why**

All UUIDs are now logged BEFORE every database query. If you see "undefined", you'll know exactly where it happened!
