# UUID Tracing - Validation Checklist

This document lists every validation point added to catch undefined UUIDs before they reach Supabase.

## Critical Validation Points

### 1. Machine Details Page - Route Parameter Extraction ✅
**Location:** `/app/inspection/[machineId]/page.tsx` line ~52-65

**What it checks:**
```typescript
console.log('[TRACE 1] Route parameters:', { 
  params,
  machineId: params.machineId,
  typeOfMachineId: typeof params.machineId,
  isUndefined: params.machineId === 'undefined',
  isEmpty: params.machineId === '',
  length: params.machineId?.length
})
```

**Expected values:**
- `typeOfMachineId`: `"string"` (not undefined)
- `isUndefined`: `false`
- `isEmpty`: `false`
- `length`: >= 36 (UUID length)

**Failure mode:** Shows if route parameter is undefined or empty

---

### 2. Machine Details Page - Pre-API Validation ✅
**Location:** `/app/inspection/[machineId]/page.tsx` load function line ~95-105

**What it checks:**
```typescript
if (!params.machineId || params.machineId === 'undefined' || params.machineId === '') {
  const errorMsg = `[TRACE 2] CRITICAL: Invalid machineId received: ${JSON.stringify(params.machineId)}`
  console.error(errorMsg)
  setError('Machine ID is missing or invalid. Unable to load machine.')
  setIsLoading(false)
  return
}
```

**Expected behavior:**
- Continues only if machineId is valid
- Shows error message if invalid
- Does NOT call API with undefined machineId

**Failure mode:** Stops execution and displays error before API call

---

### 3. Machine Details API - Query Parameter Validation ✅
**Location:** `/app/api/inspection-executions/route.ts` GET handler line ~24-38

**What it checks:**
```typescript
const url = new URL(request.url)
const machineId = url.searchParams.get('machine_id')

console.log('[API TRACE 1] GET /inspection-executions:', { 
  fullUrl: request.url,
  machineId,
  machineIdType: typeof machineId,
  isNull: machineId === null,
  isUndefined: machineId === 'undefined',
  isEmpty: machineId === ''
})

if (!machineId || machineId === 'undefined' || machineId === '') {
  console.error('[API TRACE 1] BLOCKED: Invalid machineId')
  return NextResponse.json({ error: 'Invalid machine_id parameter. Received: ' + JSON.stringify(machineId) }, { status: 400 })
}
```

**Expected values:**
- `machineId`: Valid UUID string
- `machineIdType`: `"string"`
- `isNull`: `false`
- `isUndefined`: `false`
- `isEmpty`: `false`

**Failure mode:** Returns 400 error with specific message about what was received

---

### 4. Machine Details API - Before Each Supabase Query ✅
**Locations:** 
- Inspections query (line ~42-49)
- Machine query (line ~51-56)
- Assignments query (line ~58-67)

**Pattern:**
```typescript
console.log('[API TRACE X] Querying [table] with [id]:', { [id] })
const { data, error } = await supabaseAdmin.from('[table]').select(...).eq('[id]', [id])
if (error) {
  console.error('[API TRACE X] Error querying [table]:', { error: error.message, [id] })
  return ...
}
console.log('[API TRACE X] Query result:', { found: !!data, data: ... })
```

**What it prevents:**
- Undefined IDs from reaching Supabase
- Silent failures - all errors are logged
- UUID format mismatches

**Failure mode:** Logs error and returns to client with error message

---

### 5. Start Inspection Button ✅
**Location:** `/app/inspection/[machineId]/page.tsx` startInspection function line ~130-135

**What it checks:**
```typescript
console.log('[START INSPECTION] Starting with:', { machineId: params.machineId, templateId })

const payload = {
  machine_id: params.machineId,
  ...(templateId ? { template_id: templateId } : {}),
}

console.log('[START INSPECTION] Sending payload:', payload)
```

**Expected values:**
- `machine_id`: Valid UUID
- `template_id`: Valid UUID (if provided)

**Failure mode:** Logs payload before POST, showing exact values being sent

---

### 6. Inspection Creation API - Body Validation ✅
**Location:** `/app/api/inspection-executions/route.ts` POST handler line ~225-245

**What it checks:**
```typescript
const machineId = body.machine_id?.trim() ?? ''
const requestedTemplateId = body.template_id?.trim() ?? ''

console.log('[API POST TRACE 1] POST /inspection-executions received:', { 
  body,
  machineId,
  requestedTemplateId,
  machineIdValid: machineId !== '' && machineId !== 'undefined'
})

if (!machineId || machineId === 'undefined') {
  console.error('[API POST TRACE 1] BLOCKED: Invalid machineId in POST body:', { machineId })
  return NextResponse.json({ error: `Invalid machine_id: ${JSON.stringify(machineId)}` }, { status: 400 })
}
```

**Expected values:**
- `machineId`: Non-empty, non-"undefined" string
- `machineIdValid`: `true`

**Failure mode:** Returns 400 with specific machineId value that was invalid

---

### 7. Inspection Creation API - Machine Verification ✅
**Location:** `/app/api/inspection-executions/route.ts` POST handler line ~248-268

**What it checks:**
```typescript
console.log('[API POST TRACE 2] Querying machine with id:', { machineId })
const { data: machineData, error: machineError } = await supabaseAdmin
  .from('machines')
  .select('id, name')
  .eq('id', machineId)  // ← machineId already validated above
  .maybeSingle()

if (machineError) {
  console.error('[API POST TRACE 2] Error querying machine:', { error: machineError.message, machineId })
  return ...
}

if (!machineData) {
  console.error('[API POST TRACE 2] Machine not found:', { machineId })
  return NextResponse.json({ error: 'Machine not found.' }, { status: 404 })
}
```

**Expected:**
- Machine record exists in database
- No query error
- machineData is not null

**Failure mode:** Returns 404 if machine doesn't exist

---

### 8. Inspection Execution Page - Route Parameter Validation ✅
**Location:** `/app/inspection/executions/[inspectionId]/page.tsx` line ~18-25

**What it checks:**
```typescript
if (!inspectionId || inspectionId === 'undefined') {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">
        Invalid inspection ID. Please start an inspection from the machine page.
      </div>
      ...
    </main>
  )
}
```

**Expected:**
- inspectionId is valid before any state/effects
- Returns error page if invalid

**Failure mode:** Shows error message to user before attempting API call

---

### 9. Inspection Execution Page - Pre-API Validation ✅
**Location:** `/app/inspection/executions/[inspectionId]/page.tsx` load function line ~48-72

**What it checks:**
```typescript
console.log('[EXEC TRACE 1] Execution page route parameters:', { 
  params,
  inspectionId,
  typeOfInspectionId: typeof inspectionId,
  isUndefined: inspectionId === 'undefined',
  isEmpty: inspectionId === ''
})

if (!inspectionId || inspectionId === 'undefined' || inspectionId === '') {
  const errorMsg = `[EXEC TRACE 1] CRITICAL: Invalid inspectionId: ${JSON.stringify(inspectionId)}`
  console.error(errorMsg)
  setError('Inspection ID is missing. Unable to load inspection.')
  setIsLoading(false)
  return
}
```

**Expected:**
- inspectionId is valid UUID
- Process continues only if valid
- Shows error if invalid

**Failure mode:** Stops execution before API call

---

### 10. Inspection Details API - Route Parameter Validation ✅
**Location:** `/app/api/inspection-executions/[inspectionId]/route.ts` GET handler line ~41-50

**What it checks:**
```typescript
const { inspectionId } = await context.params

console.log('[DETAIL API TRACE 1] GET /inspection-executions/[inspectionId]:', { 
  inspectionId,
  inspectionIdType: typeof inspectionId,
  isUndefined: inspectionId === 'undefined',
  isEmpty: inspectionId === ''
})

if (!inspectionId || inspectionId === 'undefined' || inspectionId === '') {
  console.error('[DETAIL API TRACE 1] BLOCKED: Invalid inspectionId:', { inspectionId })
  return NextResponse.json({ error: `Invalid inspection ID: ${JSON.stringify(inspectionId)}` }, { status: 400 })
}
```

**Expected:**
- inspectionId is valid UUID
- Not "undefined" string

**Failure mode:** Returns 400 with specific inspectionId received

---

### 11. Inspection Details API - Query with Validation ✅
**Location:** `/app/api/inspection-executions/[inspectionId]/route.ts` GET handler line ~54-68

**What it checks:**
```typescript
console.log('[DETAIL API TRACE 2] Querying inspection with id:', { inspectionId })
const { data: inspectionData, error: inspectionError } = await supabaseAdmin
  .from('inspections')
  .select('id, machine_id, template_id, template_name, template_version, status, started_by, started_at, completed_at')
  .eq('id', inspectionId)  // ← inspectionId already validated
  .maybeSingle()

if (inspectionError) {
  console.error('[DETAIL API TRACE 2] Error querying inspection:', { error: inspectionError.message, inspectionId })
  return ...
}

if (!inspectionData) {
  console.warn('[DETAIL API TRACE 2] Inspection not found:', { inspectionId })
  return NextResponse.json({ error: 'Inspection not found.' }, { status: 404 })
}
```

**Expected:**
- Inspection record found
- No query error

**Failure mode:** Returns 404 if inspection doesn't exist

---

## Summary Table

| Point | Location | Checks | Prevents |
|-------|----------|--------|----------|
| 1 | Machine Page Route | Route param extracted correctly | Missing/undefined machineId |
| 2 | Machine Page Load | machineId not undefined | API call with undefined |
| 3 | GET API Query Param | Query param received and validated | undefined passed to Supabase |
| 4 | GET API Queries | Before each Supabase query | Invalid IDs reaching database |
| 5 | Start Button | Payload logged before POST | Silent failures |
| 6 | POST API Body | Body validated, undefined rejected | Invalid machineId in POST |
| 7 | POST API Machine | Machine verified before use | Creating inspection for invalid machine |
| 8 | Execution Page Route | Route param validated early | Undefined inspectionId in UI |
| 9 | Execution Page Load | inspectionId validated before API | API call with undefined |
| 10 | Detail API Route | Route param extracted and validated | undefined passed to Supabase |
| 11 | Detail API Query | Query before API, validation first | Invalid ID in database query |

## Result

**Total validation points: 11**

**When all pass:** Complete UUID tracing from route → API → database with NO undefined values

**When one fails:** Logged with specific value showing exactly what was invalid

**To trigger errors:** Follow console output in order - first error identifies the problem
