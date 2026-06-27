# Runtime Trace Verification Checklist

Use this checklist to verify the runtime debugging implementation is working correctly.

## Pre-Testing Setup

- [ ] Database (Supabase/PostgreSQL) is running at localhost:5432
- [ ] Have at least 1 machine in database
- [ ] Have at least 1 inspection template in database
- [ ] Have 1+ template assigned to a machine with `active=true`
- [ ] All files compile without errors (verified ✓)

## Test Step 1: Start Dev Server

**Command:**
```bash
cd /workspaces/mgmt
npm run dev
```

**Verify:**
- [ ] Terminal shows: `ready - started server on 0.0.0.0:3000`
- [ ] No compilation errors
- [ ] Server is ready to accept requests

## Test Step 2: Open Browser and Navigation

**URL:** `http://localhost:3000/inspection`

**Open Developer Console:**
- [ ] Press F12
- [ ] Go to "Console" tab
- [ ] Console is open and visible

**Verify Machine List:**
- [ ] Page loads machine list
- [ ] At least one machine visible
- [ ] Each machine has a card/link

## Test Step 3: Click on a Machine

**Action:** Click on any machine card

**Verify Console Shows TRACE 1:**
```
[TRACE 1] Route parameters: { 
  params: {...}, 
  machineId: "xxx-xxx", 
  typeOfMachineId: "string", 
  isUndefined: false, 
  isEmpty: false, 
  length: 36
}
```

**Checklist:**
- [ ] Console shows `[TRACE 1]` message
- [ ] `machineId` is present (36 char UUID)
- [ ] `typeOfMachineId` is `"string"`
- [ ] `isUndefined` is `false`
- [ ] `isEmpty` is `false`

**If TRACE 1 fails:**
- [ ] Check if `typeOfMachineId` is `undefined` → Route parameter extraction failed
- [ ] Check if `isUndefined: true` → machineId is literally string "undefined"
- [ ] Machine details page should show error message

## Test Step 4: Verify TRACE 2 (Pre-API Validation)

**Verify Console Shows TRACE 2:**
```
[TRACE 2] Valid machineId, proceeding to load: { 
  machineId: "xxx-xxx" 
}
```

**Checklist:**
- [ ] Console shows `[TRACE 2]` message (not CRITICAL error)
- [ ] Message says "proceeding to load" (not showing error)
- [ ] machineId is visible

**If TRACE 2 shows CRITICAL error:**
- [ ] Message: `[TRACE 2] CRITICAL: Invalid machineId received`
- [ ] Machine page should display: "Machine ID is missing or invalid"
- [ ] Check Route 1 to see what invalid value was

## Test Step 5: Verify TRACE 3 (API Call)

**Verify Console Shows TRACE 3:**
```
[TRACE 3] Calling API with: { 
  url: "/api/inspection-executions?machine_id=xxx-xxx", 
  machineId: "xxx-xxx", 
  encodedMachineId: "xxx-xxx" 
}
```

**Checklist:**
- [ ] Console shows `[TRACE 3]` message
- [ ] URL contains `?machine_id=xxx-xxx`
- [ ] machineId appears in log

## Test Step 6: Verify TRACE 4 (API Response)

**Verify Console Shows TRACE 4:**
```
[TRACE 4] API Response: { 
  status: true, 
  statusCode: 200, 
  hasMachine: true, 
  machineId: "xxx-xxx", 
  machineName: "Lathe Machine", 
  templateCount: 1, 
  errorMessage: undefined 
}
```

**Checklist:**
- [ ] Console shows `[TRACE 4]` message
- [ ] `status: true` (not false)
- [ ] `statusCode: 200` (not 400, 404, 500)
- [ ] `hasMachine: true` (not false)
- [ ] `machineName` is actual machine name (not "Machine" or empty)
- [ ] `templateCount > 0` (templates exist)
- [ ] `errorMessage: undefined` (no error)

**Machine Page Verification:**
- [ ] Machine name displays correctly (matches `machineName`)
- [ ] Templates display with names (matches `templateCount`)
- [ ] "Start Inspection" button is enabled

**If TRACE 4 shows problems:**
- [ ] `hasMachine: false` → Machine not found in database
- [ ] `templateCount: 0` → No active templates assigned
- [ ] `errorMessage` present → API returned error

## Test Step 7: Verify API Traces (Server-side)

**Check Server Console/Logs:**

Should see:
```
[API TRACE 1] GET /inspection-executions: { fullUrl: "...", machineId: "xxx-xxx" }
[API TRACE 1] Request: { machineId: "xxx-xxx" }
[API TRACE 2] Querying inspections table with machineId: { machineId: "xxx-xxx" }
[API TRACE 2] Inspections query result: { count: X }
[API TRACE 3] Querying machines table with id: { machineId: "xxx-xxx" }
[API TRACE 3] Machine query result: { found: true, machineData: { id, name, area } }
[API TRACE 4] Querying machine_inspection_templates with machineId: { machineId: "xxx-xxx" }
[API TRACE 4] Assignments query result: { count: 1, assignmentTemplateIds: [...] }
[API TRACE 5] Querying templates with ids: { templateIds: [...] }
[API TRACE 5] Templates query result: { count: 1, templates: [...] }
```

**Checklist:**
- [ ] All API TRACE messages appear
- [ ] machineId appears in each query log
- [ ] No BLOCKED messages
- [ ] All queries return results (count > 0 or found: true)

## Test Step 8: Click "Start Inspection"

**Verify Console Shows START TRACE:**
```
[START INSPECTION] Starting with: { 
  machineId: "xxx-xxx", 
  templateId: "yyy-yyy" 
}
[START INSPECTION] Sending payload: { 
  machine_id: "xxx-xxx", 
  template_id: "yyy-yyy" 
}
```

**Checklist:**
- [ ] Console shows `[START INSPECTION]` messages
- [ ] `machineId` is present (36 char UUID)
- [ ] `templateId` is present (if single template)
- [ ] Both appear in payload

## Test Step 9: Verify POST API Traces

**Check Server Console:**

Should see:
```
[API POST TRACE 1] POST /inspection-executions received: { body, machineId: "xxx-xxx", requestedTemplateId: "yyy-yyy", machineIdValid: true }
[API POST TRACE 2] Querying machine with id: { machineId: "xxx-xxx" }
[API POST TRACE 2] Machine found: { id: "xxx-xxx", name: "Lathe Machine" }
[API POST TRACE 3] Querying template assignments for machine: { machineId: "xxx-xxx" }
[API POST TRACE 3] Assignments found: { count: 1, templateIds: ["yyy-yyy"] }
[API POST TRACE 4] Querying templates with ids: { templateIds: ["yyy-yyy"] }
[API POST TRACE 4] Templates found: { count: 1 }
[API POST TRACE 5] Selected template: { selectedTemplateId: "yyy-yyy", requestedTemplateId: "yyy-yyy" }
[API POST TRACE 6] Querying template items for template: { selectedTemplateId: "yyy-yyy" }
[API POST TRACE 6] Template items found: { count: 5 }
[API POST TRACE 7] Creating inspection with: { machineId, selectedTemplateId, templateName, operatorName, startedAt }
[API POST TRACE 7] Inspection created: { inspectionId: "zzz-zzz", machineId: "xxx-xxx", templateId: "yyy-yyy" }
[API POST TRACE 8] Creating inspection items snapshot: { inspectionId: "zzz-zzz", itemCount: 5 }
[API POST TRACE 8] Inspection items created successfully: { inspectionId: "zzz-zzz", itemsCount: 5 }
[API POST TRACE COMPLETE] Inspection workflow complete: { inspectionId: "zzz-zzz", machineId: "xxx-xxx", templateId: "yyy-yyy", itemsCount: 5 }
```

**Checklist:**
- [ ] All POST TRACE messages appear (TRACE 1-8 + COMPLETE)
- [ ] No BLOCKED messages
- [ ] machineId appears in TRACE 1
- [ ] templateId appears in TRACE 5
- [ ] inspectionId appears in TRACE 7
- [ ] itemsCount > 0 in TRACE 8

## Test Step 10: Verify Browser Navigation

**Verify Browser Console:**
```
[START INSPECTION] Response: { status: true, result: { inspection: { id: "zzz-zzz" } } }
[START INSPECTION] Navigating to: /inspection/executions/zzz-zzz
```

**Checklist:**
- [ ] Response status is `true`
- [ ] inspectionId is present
- [ ] Browser navigates to `/inspection/executions/zzz-zzz`
- [ ] URL bar shows new inspection URL

## Test Step 11: Verify Execution Page Loads

**Verify Browser Console Shows EXEC TRACE:**
```
[EXEC TRACE 1] Execution page route parameters: { 
  inspectionId: "zzz-zzz", 
  typeOfInspectionId: "string", 
  isUndefined: false, 
  isEmpty: false 
}
[EXEC TRACE 1] Valid inspectionId, proceeding to load: { inspectionId: "zzz-zzz" }
[EXEC TRACE 2] Calling API with: { 
  url: "/api/inspection-executions/zzz-zzz", 
  inspectionId: "zzz-zzz" 
}
```

**Checklist:**
- [ ] Console shows `[EXEC TRACE 1]` and `[EXEC TRACE 2]` messages
- [ ] `inspectionId` is present and valid
- [ ] `isUndefined: false`
- [ ] API URL includes inspectionId

## Test Step 12: Verify Detail API Traces

**Check Server Console:**
```
[DETAIL API TRACE 1] GET /inspection-executions/[inspectionId]: { inspectionId: "zzz-zzz", inspectionIdType: "string", isUndefined: false, isEmpty: false }
[DETAIL API TRACE 2] Querying inspection with id: { inspectionId: "zzz-zzz" }
[DETAIL API TRACE 2] Inspection found: { inspectionId: "zzz-zzz", machineId: "xxx-xxx", templateId: "yyy-yyy" }
[DETAIL API TRACE 3] Querying machine with id: { machineId: "xxx-xxx" }
[DETAIL API TRACE 3] Machine found: { machineId: "xxx-xxx", name: "Lathe Machine" }
[DETAIL API TRACE 4] Querying inspection items for inspection: { inspectionId: "zzz-zzz" }
[DETAIL API TRACE 4] Inspection items found: { count: 5 }
```

**Checklist:**
- [ ] All DETAIL API TRACE messages appear (1-4)
- [ ] No BLOCKED messages
- [ ] inspectionId valid in TRACE 1
- [ ] Inspection found in TRACE 2
- [ ] Items found in TRACE 4

## Test Step 13: Verify Browser Console Response

**Verify Browser Console Shows EXEC TRACE 3 & 4:**
```
[EXEC TRACE 3] API Response: { 
  status: true, 
  statusCode: 200, 
  hasInspection: true, 
  inspectionId: "zzz-zzz", 
  itemsCount: 5 
}
[EXEC TRACE 4] Inspection data loaded: { 
  id: "zzz-zzz", 
  machineId: "xxx-xxx", 
  machineName: "Lathe Machine", 
  templateId: "yyy-yyy", 
  itemsCount: 5, 
  items: [...] 
}
```

**Checklist:**
- [ ] Console shows `[EXEC TRACE 3]` and `[EXEC TRACE 4]`
- [ ] `status: true`
- [ ] `hasInspection: true`
- [ ] `itemsCount > 0`

## Test Step 14: Verify Page Displays

**Page Verification:**
- [ ] Machine name displays in header
- [ ] Inspection questions display (5+ items)
- [ ] Each question has input fields
- [ ] "Complete Inspection" button visible

## Final Results Checklist

### ✅ Success Criteria

- [ ] TRACE 1: Route parameter extracted correctly
- [ ] TRACE 2: Pre-API validation passed
- [ ] TRACE 3: API called with correct machineId
- [ ] TRACE 4: API response returned machine and templates
- [ ] API TRACE 1-5: All GET queries succeeded
- [ ] START TRACE 1: Correct IDs logged
- [ ] API POST TRACE 1-8: All POST queries succeeded
- [ ] EXEC TRACE 1-4: Inspection page loaded correctly
- [ ] DETAIL API TRACE 1-4: All detail queries succeeded
- [ ] Machine name displays (not "Machine")
- [ ] Templates display with names
- [ ] Inspection questions display
- [ ] No "undefined" UUID in any console log
- [ ] No PostgreSQL errors in server logs
- [ ] No error messages in browser

### ❌ Failure Points

If any of these appear, the workflow has a problem:

- [ ] `[TRACE 2] CRITICAL: Invalid machineId` → Route parameter issue
- [ ] `[API TRACE 1] BLOCKED: Invalid machineId` → API parameter issue
- [ ] `Machine not found` → Database record issue
- [ ] `No inspection templates assigned` → Assignment issue
- [ ] `[EXEC TRACE 1] CRITICAL: Invalid inspectionId` → Route parameter issue
- [ ] `[DETAIL API TRACE 1] BLOCKED: Invalid inspectionId` → API parameter issue
- [ ] Any message containing `"undefined"` → UUID validation failed
- [ ] Any message containing `invalid input syntax for type uuid` → Undefined reached Supabase

## Database Verification Queries

After testing, run these to verify data integrity:

```sql
-- Verify test machine and templates
SELECT m.id, m.name, ct.name as template_name
FROM machines m
LEFT JOIN machine_inspection_templates mit ON m.id = mit.machine_id AND mit.active = true
LEFT JOIN checklist_templates ct ON mit.template_id = ct.id
WHERE m.id = '{machineId}'
LIMIT 1;

-- Verify inspection was created
SELECT id, machine_id, template_id, status FROM inspections
WHERE machine_id = '{machineId}'
ORDER BY created_at DESC LIMIT 1;

-- Verify inspection items were created
SELECT COUNT(*) as item_count FROM inspection_items
WHERE inspection_id = '{inspectionId}';

-- Verify counts match
SELECT 
  (SELECT COUNT(*) FROM checklist_template_items 
   WHERE template_id = '{templateId}') as template_items,
  (SELECT COUNT(*) FROM inspection_items 
   WHERE inspection_id = '{inspectionId}') as inspection_items;
```

Counts should match for template_items and inspection_items.

## Report Results

After completing all tests, document:

- [ ] Which TRACE points appeared in console
- [ ] Which TRACE points were missing
- [ ] Any error messages shown
- [ ] Screenshot of console output (if taking one)
- [ ] Database query results

This will identify exactly where the UUID issue occurs.
