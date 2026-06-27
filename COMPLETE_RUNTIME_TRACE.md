# Complete Runtime Trace - Full UUID Debugging

## Overview

Added comprehensive logging at EVERY step of the inspection workflow to trace:
1. Route parameter extraction
2. UUID validation before any Supabase query
3. API request/response flow
4. Database operations

## Trace Points Added

### 1. Machine Details Page (`/app/inspection/[machineId]/page.tsx`)

#### TRACE 1: Route Parameter Extraction
```
[TRACE 1] Route parameters: { 
  params,
  machineId,
  typeOfMachineId,
  isUndefined,
  isEmpty,
  length
}
```
**Verifies:** Route parameter `[machineId]` is correctly received

#### TRACE 2: Validation Before API
```
[TRACE 2] Valid machineId, proceeding to load: { machineId }
// or
[TRACE 2] CRITICAL: Invalid machineId received: {JSON value}
```
**Verifies:** machineId is not undefined/empty before API call

#### TRACE 3: API URL Construction
```
[TRACE 3] Calling API with: { 
  url,
  machineId,
  encodedMachineId
}
```
**Verifies:** Correct machineId is being sent to API

#### TRACE 4: API Response
```
[TRACE 4] API Response: { 
  status,
  statusCode,
  hasMachine,
  machineId,
  machineName,
  templateCount,
  errorMessage
}
```
**Verifies:** API is returning machine data correctly

### 2. Machine Details API (`/app/api/inspection-executions/route.ts` GET)

#### API TRACE 1: Parameter Validation
```
[API TRACE 1] GET /inspection-executions: { 
  fullUrl,
  machineId,
  machineIdType,
  isNull,
  isUndefined,
  isEmpty
}
// or
[API TRACE 1] BLOCKED: Invalid machineId
```
**Verifies:** API received valid machine_id query parameter

#### API TRACE 2: Inspections Query
```
[API TRACE 2] Querying inspections table with machineId: { machineId }
[API TRACE 2] Inspections query result: { count }
```
**Verifies:** Inspection history loading

#### API TRACE 3: Machine Query
```
[API TRACE 3] Querying machines table with id: { machineId }
[API TRACE 3] Machine query result: { 
  found,
  machineData: { id, name, area }
}
```
**Verifies:** Machine details found and returned

#### API TRACE 4: Template Assignments Query
```
[API TRACE 4] Querying machine_inspection_templates with machineId: { machineId }
[API TRACE 4] Assignments query result: { 
  count,
  assignmentTemplateIds
}
```
**Verifies:** Template assignments loaded

#### API TRACE 5: Template Details Query
```
[API TRACE 5] Querying templates with ids: { templateIds }
[API TRACE 5] Templates query result: { count, templates }
// or
[API TRACE 5] No templates to fetch (no active assignments)
```
**Verifies:** Template names loaded from database

### 3. Start Inspection (`/app/inspection/[machineId]/page.tsx` startInspection function)

#### START TRACE 1: Button Click
```
[START INSPECTION] Starting with: { 
  machineId,
  templateId
}
[START INSPECTION] Sending payload: { 
  machine_id,
  template_id (optional)
}
```
**Verifies:** Machine and Template IDs are present before POST

### 4. Inspection Creation API (`/app/api/inspection-executions/route.ts` POST)

#### API POST TRACE 1: Body Validation
```
[API POST TRACE 1] POST /inspection-executions received: { 
  body,
  machineId,
  requestedTemplateId,
  machineIdValid
}
// or
[API POST TRACE 1] BLOCKED: Invalid machineId in POST body: { machineId }
```
**Verifies:** POST body contains valid machine_id

#### API POST TRACE 2: Machine Lookup
```
[API POST TRACE 2] Querying machine with id: { machineId }
[API POST TRACE 2] Machine found: { id, name }
// or
[API POST TRACE 2] Machine not found: { machineId }
```
**Verifies:** Machine exists before creating inspection

#### API POST TRACE 3: Template Assignments
```
[API POST TRACE 3] Querying template assignments for machine: { machineId }
[API POST TRACE 3] Assignments found: { 
  count,
  templateIds
}
```
**Verifies:** Machine has template assignments

#### API POST TRACE 4: Template Details
```
[API POST TRACE 4] Querying templates with ids: { templateIds }
[API POST TRACE 4] Templates found: { count }
```
**Verifies:** All templates found by ID

#### API POST TRACE 5: Template Selection
```
[API POST TRACE 5] Selected template: { 
  selectedTemplateId,
  requestedTemplateId
}
```
**Verifies:** Valid template selected for inspection

#### API POST TRACE 6: Template Items
```
[API POST TRACE 6] Querying template items for template: { selectedTemplateId }
[API POST TRACE 6] Template items found: { count }
```
**Verifies:** Template has inspection items

#### API POST TRACE 7: Create Inspection
```
[API POST TRACE 7] Creating inspection with: { 
  machineId,
  selectedTemplateId,
  templateName,
  operatorName,
  startedAt
}
[API POST TRACE 7] Inspection created: { 
  inspectionId,
  machineId,
  templateId
}
```
**Verifies:** Inspection record created successfully

#### API POST TRACE 8: Create Items Snapshot
```
[API POST TRACE 8] Creating inspection items snapshot: { 
  inspectionId,
  itemCount
}
[API POST TRACE 8] Inspection items created successfully: { 
  inspectionId,
  itemsCount
}
```
**Verifies:** Inspection items snapshot created

#### API POST TRACE COMPLETE
```
[API POST TRACE COMPLETE] Inspection workflow complete: { 
  inspectionId,
  machineId,
  templateId,
  itemsCount
}
```
**Verifies:** Entire workflow succeeded

### 5. Inspection Execution Page (`/app/inspection/executions/[inspectionId]/page.tsx`)

#### EXEC TRACE 1: Route Parameter & Validation
```
[EXEC TRACE 1] Execution page route parameters: { 
  params,
  inspectionId,
  typeOfInspectionId,
  isUndefined,
  isEmpty
}
// or
[EXEC TRACE 1] CRITICAL: Invalid inspectionId: {JSON value}
[EXEC TRACE 1] Valid inspectionId, proceeding to load: { inspectionId }
```
**Verifies:** inspectionId is valid before API call

#### EXEC TRACE 2: API Preparation
```
[EXEC TRACE 2] Calling API with: { 
  url,
  inspectionId,
  encodedInspectionId
}
```
**Verifies:** Correct inspectionId in API URL

#### EXEC TRACE 3: API Response
```
[EXEC TRACE 3] API Response: { 
  status,
  statusCode,
  hasInspection,
  inspectionId,
  itemsCount,
  errorMessage
}
```
**Verifies:** API returned inspection successfully

#### EXEC TRACE 4: Inspection Data
```
[EXEC TRACE 4] Inspection data loaded: { 
  id,
  machineId,
  machineName,
  templateId,
  itemsCount,
  items (first 3)
}
```
**Verifies:** All inspection details loaded

### 6. Inspection Detail API (`/app/api/inspection-executions/[inspectionId]/route.ts` GET)

#### DETAIL API TRACE 1: Route Parameter Validation
```
[DETAIL API TRACE 1] GET /inspection-executions/[inspectionId]: { 
  inspectionId,
  inspectionIdType,
  isUndefined,
  isEmpty
}
// or
[DETAIL API TRACE 1] BLOCKED: Invalid inspectionId: { inspectionId }
```
**Verifies:** Route parameter is valid UUID

#### DETAIL API TRACE 2: Inspection Query
```
[DETAIL API TRACE 2] Querying inspection with id: { inspectionId }
[DETAIL API TRACE 2] Inspection found: { 
  inspectionId,
  machineId,
  templateId
}
// or
[DETAIL API TRACE 2] Inspection not found: { inspectionId }
```
**Verifies:** Inspection record found in database

#### DETAIL API TRACE 3: Machine Query
```
[DETAIL API TRACE 3] Querying machine with id: { machineId }
[DETAIL API TRACE 3] Machine found: { 
  machineId,
  name
}
```
**Verifies:** Machine details found

#### DETAIL API TRACE 4: Inspection Items Query
```
[DETAIL API TRACE 4] Querying inspection items for inspection: { inspectionId }
[DETAIL API TRACE 4] Inspection items found: { count }
```
**Verifies:** Inspection items (questions) loaded

## How to Read the Logs

### Success Flow
A successful inspection workflow will show:

1. **TRACE 1** → Shows machineId extracted from URL
2. **TRACE 2** → Shows machineId validated
3. **TRACE 3** → Shows machineId being sent to API
4. **TRACE 4** → Shows machine details returned
5. **API TRACE 1** → Shows API received valid machineId
6. **API TRACE 2-5** → Shows machine, templates, and items loaded
7. **START TRACE 1** → Shows inspection start initiated
8. **API POST TRACE 1-8** → Shows inspection created with items
9. **EXEC TRACE 1-4** → Shows inspection execution page loaded with items
10. **DETAIL API TRACE 1-4** → Shows all inspection details returned

### Error Flow
If an error occurs, look for:

1. **"CRITICAL: Invalid machineId"** in TRACE 2 → machineId is undefined in route
2. **"BLOCKED: Invalid machineId"** in API TRACE 1 → API didn't receive machineId
3. **"Machine not found"** in API TRACE 3 → Invalid machine UUID or no record
4. **"Machine not found"** in API POST TRACE 2 → POST body has wrong machineId
5. **"CRITICAL: Invalid inspectionId"** in EXEC TRACE 1 → inspectionId is undefined in route
6. **"BLOCKED: Invalid inspectionId"** in DETAIL API TRACE 1 → API received invalid ID

## Running the Trace

### 1. Start Dev Server
```bash
cd /workspaces/mgmt
npm run dev
```

### 2. Open Browser Dev Tools
```
Press F12
Go to Console tab
```

### 3. Navigate to Inspection Page
```
URL: http://localhost:3000/inspection
```

### 4. Select a Machine
Click any machine card

### 5. Watch Console
Console should show trace logs from TRACE 1 through TRACE 4

### 6. Click "Start Inspection"
Console should show START TRACE 1 and API POST TRACE 1-8

### 7. Verify Inspection Page Loads
Console should show EXEC TRACE 1-4 and DETAIL API TRACE 1-4

## Common Issues

### Issue: "No templates assigned" but templates exist
Check:
- API TRACE 4 shows assignments found?
- API TRACE 5 shows templates found?
- Check database: `SELECT * FROM machine_inspection_templates WHERE active = true`

### Issue: Machine name shows as "Machine"
Check:
- TRACE 4 shows `hasMachine: false`?
- API TRACE 3 shows machine found?
- Check database: `SELECT * FROM machines WHERE id = '{machineId}'`

### Issue: Start Inspection fails
Check:
- API POST TRACE 1 shows machineId received?
- API POST TRACE 2 shows machine found?
- API POST TRACE 3 shows assignments found?
- API POST TRACE 6 shows items found?

### Issue: Inspection page shows UUID error
Check:
- EXEC TRACE 1 shows `isUndefined: false`?
- DETAIL API TRACE 1 shows valid inspectionId?
- DETAIL API TRACE 2 shows inspection found?

## Next Steps

1. **Start dev server and run workflow**
2. **Watch browser console for all TRACE logs**
3. **Identify which trace point fails**
4. **Use SQL to verify database state at that point**
5. **Fix the specific issue identified**

## Success Criteria

✅ All TRACE points show valid UUIDs
✅ No "CRITICAL" or "BLOCKED" messages
✅ Machine name displays correctly (not "Machine")
✅ Templates show with names (not "No templates")
✅ Start Inspection button creates inspection
✅ Inspection page loads with items
✅ No PostgreSQL UUID errors
