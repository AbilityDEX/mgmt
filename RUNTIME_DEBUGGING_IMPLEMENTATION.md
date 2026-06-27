# Runtime Debugging - Complete Implementation Summary

## What Was Done

Performed a **complete runtime trace** of the inspection workflow by adding comprehensive console logging at every UUID validation point. This identifies exactly WHERE and WHY undefined UUIDs appear.

## Critical Changes

### 1. Machine Details Page (`/app/inspection/[machineId]/page.tsx`)

**Added:**
- TRACE 1: Route parameter extraction logging
- TRACE 2: UUID validation before API call
- TRACE 3: API URL and parameters logging
- TRACE 4: API response logging

**Prevents:** machineId undefined from being passed to API

**Key validation:**
```typescript
if (!params.machineId || params.machineId === 'undefined' || params.machineId === '') {
  // CRITICAL error shown to user
  setError('Machine ID is missing or invalid. Unable to load machine.')
  return // Does NOT call API
}
```

### 2. Machine Details API (`/app/api/inspection-executions/route.ts` - GET)

**Added:**
- API TRACE 1: Query parameter validation
- API TRACE 2: Inspections query logging
- API TRACE 3: Machine query logging (with result verification)
- API TRACE 4: Template assignments logging
- API TRACE 5: Template details logging

**Prevents:** undefined machineId from reaching Supabase

**Key validation:**
```typescript
if (!machineId || machineId === 'undefined' || machineId === '') {
  console.error('[API TRACE 1] BLOCKED: Invalid machineId')
  return NextResponse.json({ error: `Invalid machine_id parameter. Received: ${JSON.stringify(machineId)}` }, { status: 400 })
}
// Only proceeds if machineId is valid
```

### 3. Start Inspection Button (`/app/inspection/[machineId]/page.tsx`)

**Added:**
- START TRACE 1: Payload logging before POST

**Prevents:** Silent failures when clicking start button

**Logging:**
```typescript
console.log('[START INSPECTION] Sending payload:', payload)
// Shows exact values being POSTed
```

### 4. Inspection Creation API (`/app/api/inspection-executions/route.ts` - POST)

**Added:**
- API POST TRACE 1: Body validation (with "BLOCKED" error if invalid)
- API POST TRACE 2: Machine verification
- API POST TRACE 3: Template assignments check
- API POST TRACE 4: Template details fetch
- API POST TRACE 5: Template selection
- API POST TRACE 6: Template items fetch
- API POST TRACE 7: Inspection creation
- API POST TRACE 8: Inspection items snapshot creation
- API POST TRACE COMPLETE: Workflow completion confirmation

**Prevents:**
- undefined machineId in POST body
- Machine not found errors
- Template assignment missing
- Items not created
- Silent database failures

**Key validation:**
```typescript
if (!machineId || machineId === 'undefined') {
  console.error('[API POST TRACE 1] BLOCKED: Invalid machineId in POST body:', { machineId })
  return NextResponse.json({ error: `Invalid machine_id: ${JSON.stringify(machineId)}` }, { status: 400 })
}
```

### 5. Inspection Execution Page (`/app/inspection/executions/[inspectionId]/page.tsx`)

**Added:**
- EXEC TRACE 1: Route parameter validation (with early error page)
- EXEC TRACE 2: API URL preparation
- EXEC TRACE 3: API response logging
- EXEC TRACE 4: Inspection data loading confirmation

**Prevents:** 
- Undefined inspectionId from reaching API
- Blank pages when inspection doesn't load

**Early validation:**
```typescript
if (!inspectionId || inspectionId === 'undefined') {
  return (
    <main>
      <div>Invalid inspection ID. Please start an inspection from the machine page.</div>
    </main>
  )
  // User sees error before any API call
}
```

### 6. Inspection Details API (`/app/api/inspection-executions/[inspectionId]/route.ts` - GET)

**Added:**
- DETAIL API TRACE 1: Route parameter validation
- DETAIL API TRACE 2: Inspection query logging
- DETAIL API TRACE 3: Machine query logging
- DETAIL API TRACE 4: Inspection items query logging

**Prevents:** undefined inspectionId from reaching Supabase

**Key validation:**
```typescript
if (!inspectionId || inspectionId === 'undefined' || inspectionId === '') {
  console.error('[DETAIL API TRACE 1] BLOCKED: Invalid inspectionId:', { inspectionId })
  return NextResponse.json({ error: `Invalid inspection ID: ${JSON.stringify(inspectionId)}` }, { status: 400 })
}
```

## Validation Strategy

### Before-Query Validation Pattern
Every Supabase query is preceded by:
1. **Console log** showing the value about to be queried
2. **Null/undefined check** preventing invalid values
3. **Error return** if validation fails
4. **Result log** after query succeeds

**Example:**
```typescript
// BEFORE
console.log('[TRACE X] Querying [table] with:', { [id] })

if (!id || id === 'undefined') {
  console.error('[TRACE X] BLOCKED: Invalid [id]')
  return NextResponse.json({ error: '...' }, { status: 400 })
}

// QUERY
const { data, error } = await supabaseAdmin
  .from('[table]')
  .select('...')
  .eq('[id]', id)  // ← Already validated

// AFTER
if (error) {
  console.error('[TRACE X] Error:', { error: error.message })
  return ...
}
console.log('[TRACE X] Result:', { found: !!data })
```

## UUID Flow Verification

The tracing shows exact UUID flow:

```
1. Machine List Page
   ↓ Clicking machine with id "xxx-xxx"
   ↓
2. Machine Details Page [machineId]
   [TRACE 1] Extracts params.machineId = "xxx-xxx"
   [TRACE 2] Validates: not undefined ✓
   [TRACE 3] Calls API: ?machine_id=xxx-xxx
   ↓
3. Machine Details API GET
   [API TRACE 1] Receives: machineId = "xxx-xxx"
   [API TRACE 1] Validates: not undefined ✓
   [API TRACE 3] Queries: machines.id = "xxx-xxx"
   [API TRACE 3] Result: Found machine ✓
   ↓
4. User Clicks "Start Inspection"
   [START TRACE 1] Logs: machine_id = "xxx-xxx"
   [START TRACE 1] Logs: template_id = "yyy-yyy"
   ↓
5. Inspection Creation API POST
   [API POST TRACE 1] Receives: machine_id = "xxx-xxx"
   [API POST TRACE 1] Validates: not undefined ✓
   [API POST TRACE 2] Queries: machines.id = "xxx-xxx"
   [API POST TRACE 7] Creates: inspection with machineId = "xxx-xxx"
   [API POST TRACE 7] Result: inspectionId = "zzz-zzz"
   [API POST TRACE COMPLETE] Success ✓
   ↓
6. Navigate to Inspection Page /executions/zzz-zzz
   [EXEC TRACE 1] Extracts: params.inspectionId = "zzz-zzz"
   [EXEC TRACE 1] Validates: not undefined ✓
   [EXEC TRACE 2] Calls API: /api/inspection-executions/zzz-zzz
   ↓
7. Inspection Details API GET
   [DETAIL API TRACE 1] Receives: inspectionId = "zzz-zzz"
   [DETAIL API TRACE 1] Validates: not undefined ✓
   [DETAIL API TRACE 2] Queries: inspections.id = "zzz-zzz"
   [DETAIL API TRACE 2] Result: Found inspection ✓
   [DETAIL API TRACE 4] Queries: inspection_items
   [DETAIL API TRACE 4] Result: Found items ✓
   ↓
8. Inspection Page Shows All Questions ✓
```

## Console Output Reference

### Success Flow Console
```
[TRACE 1] Route parameters: { machineId: "xxx-xxx", ... }
[TRACE 2] Valid machineId, proceeding to load: { machineId: "xxx-xxx" }
[TRACE 3] Calling API with: { url: "...", machineId: "xxx-xxx" }
[API TRACE 1] GET /inspection-executions: { machineId: "xxx-xxx" }
[API TRACE 2] Querying inspections table with machineId: { machineId: "xxx-xxx" }
[API TRACE 2] Inspections query result: { count: 3 }
[API TRACE 3] Querying machines table with id: { machineId: "xxx-xxx" }
[API TRACE 3] Machine query result: { found: true, machineData: { id: "xxx-xxx", name: "Lathe Machine" } }
[API TRACE 4] Querying machine_inspection_templates with machineId: { machineId: "xxx-xxx" }
[API TRACE 4] Assignments query result: { count: 1, assignmentTemplateIds: ["yyy-yyy"] }
[TRACE 4] API Response: { status: true, hasMachine: true, machineName: "Lathe Machine", templateCount: 1 }
```

### Error Flow Console (Example: undefined machineId)
```
[TRACE 1] Route parameters: { machineId: "undefined", typeOfMachineId: "string", isUndefined: true }
[TRACE 2] CRITICAL: Invalid machineId received: "undefined"
// Error displayed: "Machine ID is missing or invalid. Unable to load machine."
```

## Testing Instructions

See `RUNTIME_DEBUGGING_START_HERE.md` for complete testing guide.

Quick test:
```bash
1. npm run dev
2. Open http://localhost:3000/inspection
3. Press F12 (Developer Tools)
4. Click on a machine
5. Check Console tab for [TRACE 1], [TRACE 2], [TRACE 3], [TRACE 4] logs
6. Verify no "CRITICAL" or "BLOCKED" messages appear
7. Click "Start Inspection"
8. Check for [API POST TRACE] logs
9. Verify inspection page loads with questions
```

## Files Modified

1. `/app/inspection/[machineId]/page.tsx` - Added 4 trace points
2. `/app/api/inspection-executions/route.ts` - Added 13 trace points (5 GET + 8 POST)
3. `/app/inspection/executions/[inspectionId]/page.tsx` - Added 4 trace points
4. `/app/api/inspection-executions/[inspectionId]/route.ts` - Added 4 trace points

**Total: 25 trace points across 4 files**

## Compilation Status

✅ All TypeScript files compile without errors
✅ All validations are type-safe
✅ All console logs are properly formatted

## Expected Results

### Before Using This Debug Build
- Machine page shows "Machine" (not actual name)
- "No inspection templates assigned" (despite assignments)
- UUID error: `invalid input syntax for type uuid: "undefined"`
- Start button fails silently

### After Using This Debug Build
- Console shows exact flow of UUIDs
- If UUID is undefined, it's caught before Supabase query
- If record doesn't exist, query still executes but returns null (which is logged)
- Error messages are specific about what went wrong
- Can trace exact point where problem occurs

## Debugging Philosophy

**Instead of:**
- Guessing where undefined comes from
- Silent failures that crash Supabase
- Blank pages with no error

**Now:**
- Console shows exact UUID at each step
- Validation rejects undefined before database
- Specific error messages identify the problem
- Clear trace of data flow through the system

**Result:** Find UUID bug in minutes, not hours
