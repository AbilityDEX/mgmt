# Routing Fixes - Verification Guide

## What Was Fixed

### 🔴 CRITICAL BUG (Found & Fixed)
**Machine Details Page Using Wrong Parameter Pattern**
- File: `/app/inspection/[machineId]/page.tsx`
- Problem: Client component receiving `params` as prop (broke routing completely)
- Solution: Changed to use `useParams()` hook
- Impact: Fixes machine name, templates, and all routing

### 🟡 MINOR ISSUES (Found & Fixed)  
- Back button text displaying `\u2190` instead of `←`
- Navigation logging added for better debugging

---

## Quick Start Testing

### Step 1: Compile Check
```bash
cd /workspaces/mgmt
npm run build
# Should complete without errors ✓
```

### Step 2: Start Dev Server
```bash
npm run dev
# Watch for: "ready - started server on 0.0.0.0:3000"
```

### Step 3: Test in Browser
1. Open: `http://localhost:3000/inspection`
2. Open DevTools: Press `F12` → Click "Console" tab
3. **Keep console open throughout testing**

---

## Test Workflow: Machine → Inspection → Execution

### ✅ TEST 1: Machine List Page
**Expected:** See list of machines

**Verify:**
- [ ] Page loads with machine cards
- [ ] Each card shows machine name and area
- [ ] "Inspect" button visible on each card
- [ ] Back button shows `←` (arrow, not `\u2190`)

**Console Check:**
- [ ] Should be empty (no route params yet)

---

### ✅ TEST 2: Click First Machine → Machine Details Page
**URL:** Changes to `http://localhost:3000/inspection/{machineId}`

**Expected:** Machine details page displays

**Console Output (Watch For):**
```
[TRACE 1] Route parameters: { 
  machineId: "{36-char-uuid}", 
  typeOfMachineId: "string", 
  isUndefined: false, 
  isEmpty: false, 
  length: 36 
}
[TRACE 2] Valid machineId, proceeding to load: { machineId: "{uuid}" }
[TRACE 3] Calling API with: { url: "/api/inspection-executions?machine_id={uuid}", ... }
```

**Server Console (If Visible):**
```
[API TRACE 1] GET /inspection-executions: { machineId: "{uuid}", machineIdType: "string", ... }
[API TRACE 3] Machine query result: { found: true, machineData: { id: "{uuid}", name: "Machine Name", area: "Area A" } }
```

**Page Verification:**
- [ ] Machine name displays (NOT just "Machine")
- [ ] Area displays correctly
- [ ] "Start Inspection" button is enabled
- [ ] At least one template shows with name (NOT "No inspection templates assigned")
- [ ] Back button shows `←`
- [ ] No error messages visible

**Critical Check:**
- [ ] ❌ Machine says "Machine"? → FIX FAILED
- [ ] ❌ Shows "No inspection templates assigned"? → FIX FAILED
- [ ] ❌ Shows "Machine ID is missing or invalid"? → FIX FAILED
- [ ] ❌ UUID in TRACE 1 is "undefined"? → FIX FAILED

---

### ✅ TEST 3: Verify Template Display

**Page Check:**
1. Machine name displays: ✓ `{Machine Name}` (not "Machine")
2. Area displays: ✓ `Area: {Area Name}`
3. Inspection section shows:
   - [ ] Template name
   - [ ] Inspection frequency
   - No error message

**Example Expected:**
```
Inspections [Start Inspection button]

Template: "Monthly Safety Check"
Frequency: Monthly

Template: "Daily Visual Inspection"  
Frequency: Daily
```

---

### ✅ TEST 4: Click "Start Inspection"

**Console Output (Watch For):**
```
[START INSPECTION] Starting with: { machineId: "{uuid}", templateId: "{uuid}" }
[START INSPECTION] Sending payload: { machine_id: "{uuid}", template_id: "{uuid}" }
```

**Server Console:**
```
[API POST TRACE 1] POST /inspection-executions received: { machineId: "{uuid}", requestedTemplateId: "{uuid}", machineIdValid: true }
[API POST TRACE 2] Machine found: { id: "{uuid}", name: "Machine Name" }
[API POST TRACE 7] Inspection created: { inspectionId: "{new-uuid}", machineId: "{uuid}", templateId: "{uuid}" }
```

**Browser Behavior:**
- [ ] Page redirects to inspection execution page
- [ ] URL changes to: `http://localhost:3000/inspection/executions/{inspectionId}`
- [ ] No error message

**If Navigation Fails:**
- [ ] Check console for [START INSPECTION] logs
- [ ] Check server console for [API POST TRACE] logs
- [ ] Report the EXACT error message

---

### ✅ TEST 5: Inspection Execution Page

**URL:** `http://localhost:3000/inspection/executions/{inspectionId}`

**Console Output (Watch For):**
```
[EXEC TRACE 1] Execution page route parameters: { 
  inspectionId: "{uuid}", 
  typeOfInspectionId: "string", 
  isUndefined: false 
}
[EXEC TRACE 2] Calling API with: { url: "/api/inspection-executions/{uuid}", ... }
[EXEC TRACE 3] API Response: { status: true, statusCode: 200, hasInspection: true, itemsCount: 5 }
```

**Page Verification:**
- [ ] Machine name displays in header
- [ ] "Inspection Execution" label visible
- [ ] Inspection questions display
- [ ] Each question has input field
- [ ] "Complete Inspection" button visible
- [ ] No error messages

**If Page Blank or Shows Error:**
- [ ] Check console for [EXEC TRACE] logs
- [ ] Check server console for [DETAIL API TRACE] logs
- [ ] Report exact error

---

### ✅ TEST 6: Back Button Navigation

**From:** Inspection Execution Page  
**Action:** Click Back button (← Back)

**Expected:**
- [ ] Returns to Machine Details page
- [ ] URL: `http://localhost:3000/inspection/{machineId}`
- [ ] Machine name displays again
- [ ] Back button shows `←` (not `\u2190`)

**Critical Check:**
- [ ] ❌ Opens another inspection page? → BUG
- [ ] ❌ Goes to wrong URL? → BUG
- [ ] ❌ Button text shows `\u2190`? → MINOR BUG
- [ ] ✅ Returns to machine page correctly? → PASS

---

### ✅ TEST 7: Back Button Again

**From:** Machine Details Page  
**Action:** Click Back button again

**Expected:**
- [ ] Returns to Machine List page
- [ ] URL: `http://localhost:3000/inspection`
- [ ] List of machines displays

---

### ✅ TEST 8: Test Different Machine

**Action:** Click a different machine

**Expected:**
- [ ] Same workflow as TEST 2-3
- [ ] Different machine name displays
- [ ] Different templates display
- [ ] All [TRACE] logs show different UUID

---

### ✅ TEST 9: Test Multiple Inspection Templates (If Available)

**Prerequisites:** Machine with multiple templates assigned

**Action:**
1. Go to machine details
2. Verify multiple templates show
3. Click "Start Inspection"
4. Template selection modal should appear (if multiple)
5. Select different template
6. Verify inspection created with correct template

---

## Pass/Fail Criteria

### ✅ PASS IF ALL TRUE:
- [ ] Machine name displays (not "Machine")
- [ ] Templates display with names
- [ ] No "Machine ID is missing or invalid" error
- [ ] Start Inspection creates inspection successfully
- [ ] Redirects to inspection execution page
- [ ] Inspection page displays questions
- [ ] Back button navigates to previous page correctly
- [ ] Back button shows → (not \u2190)
- [ ] All [TRACE] logs show valid UUIDs (36 chars, not "undefined")
- [ ] No error messages in console

### ❌ FAIL IF ANY:
- [ ] Machine page shows "Machine" instead of actual name
- [ ] Shows "No inspection templates assigned"
- [ ] Shows "Machine ID is missing or invalid" error
- [ ] Start Inspection button doesn't work
- [ ] Inspection page doesn't load
- [ ] Back button broken or goes wrong place
- [ ] [TRACE] logs show "undefined" UUID
- [ ] Any error messages in console or server logs

---

## Console Log Reference

### Machine Details Page - Success Logs
```
✓ [TRACE 1] Route parameters: { machineId: "550e8400-e29b-41d4-a716-446655440000", typeOfMachineId: "string", isUndefined: false, isEmpty: false, length: 36 }
✓ [TRACE 2] Valid machineId, proceeding to load: { machineId: "550e8400-e29b-41d4-a716-446655440000" }
✓ [TRACE 3] Calling API with: { url: "/api/inspection-executions?machine_id=550e8400-e29b-41d4-a716-446655440000", machineId: "550e8400-e29b-41d4-a716-446655440000", encodedMachineId: "550e8400-e29b-41d4-a716-446655440000" }
✓ [TRACE 4] API Response: { status: true, statusCode: 200, hasMachine: true, machineId: "550e8400-e29b-41d4-a716-446655440000", machineName: "Lathe Machine A", templateCount: 2, errorMessage: undefined }
```

### Machine Details Page - Failure Logs
```
✗ [TRACE 1] Route parameters: { machineId: "undefined", typeOfMachineId: "string", isUndefined: true, isEmpty: false, length: undefined }
✗ [TRACE 2] CRITICAL: Invalid machineId received: "undefined"
✗ Machine page shows: "Machine ID is missing or invalid. Unable to load machine."
```

### Start Inspection - Success Logs
```
✓ [START INSPECTION] Starting with: { machineId: "550e8400-e29b-41d4-a716-446655440000", templateId: "660e8400-e29b-41d4-a716-446655440001" }
✓ [START INSPECTION] Sending payload: { machine_id: "550e8400-e29b-41d4-a716-446655440000", template_id: "660e8400-e29b-41d4-a716-446655440001" }
✓ [START INSPECTION] Response: { status: true, result: { inspection: { id: "770e8400-e29b-41d4-a716-446655440002" } } }
✓ [START INSPECTION] Navigating to: /inspection/executions/770e8400-e29b-41d4-a716-446655440002
```

### Inspection Execution Page - Success Logs
```
✓ [EXEC TRACE 1] Execution page route parameters: { inspectionId: "770e8400-e29b-41d4-a716-446655440002", typeOfInspectionId: "string", isUndefined: false, isEmpty: false }
✓ [EXEC TRACE 1] Valid inspectionId, proceeding to load: { inspectionId: "770e8400-e29b-41d4-a716-446655440002" }
✓ [EXEC TRACE 2] Calling API with: { url: "/api/inspection-executions/770e8400-e29b-41d4-a716-446655440002", inspectionId: "770e8400-e29b-41d4-a716-446655440002", encodedInspectionId: "770e8400-e29b-41d4-a716-446655440002" }
✓ [EXEC TRACE 3] API Response: { status: true, statusCode: 200, hasInspection: true, inspectionId: "770e8400-e29b-41d4-a716-446655440002", itemsCount: 8, errorMessage: undefined }
```

---

## Troubleshooting

### Problem: "Machine ID is missing or invalid"
**Diagnosis:**
- Check TRACE 1 log: Is machineId "undefined"?
- If yes: useParams() not working
- Fix: Review machine details page code

**Action:** Check console for exact TRACE 1 output

---

### Problem: Machine name shows "Machine" (not actual name)
**Diagnosis:**
- Check TRACE 4 log: Does it show hasMachine: true?
- Check TRACE 4 log: What is machineName value?
- If undefined: API returning null for machine

**Action:** Check server [API TRACE 3] logs

---

### Problem: Templates show "No inspection templates assigned"
**Diagnosis:**
- Check TRACE 4 log: What is templateCount?
- If 0: Machine has no active templates
- Fix: Add templates to machine in admin UI

**Action:** Check database or admin interface

---

### Problem: Start Inspection doesn't work
**Diagnosis:**
- Check console: Do [START INSPECTION] logs appear?
- If not: Button click not firing
- If yes: Check server [API POST TRACE] logs

**Action:** Share exact console logs

---

### Problem: Back button text shows `\u2190`
**Status:** Should be fixed to `←`
**Diagnosis:** Minor display issue, cosmetic only
**Action:** Verify back button shows arrow character

---

## Report Template

If testing fails, provide:
```
## Test Result: FAIL

### Issue:
[Describe what went wrong]

### Step That Failed:
[Which test step - 1-9]

### Expected Behavior:
[What should have happened]

### Actual Behavior:
[What actually happened]

### Console Logs:
[Copy [TRACE] logs from console]

### Server Logs:
[Copy [API TRACE] logs if visible]

### Screenshots:
[If helpful]
```

---

## Success Checklist

Print this and check off each item:

- [ ] npm run dev starts without errors
- [ ] /inspection page loads
- [ ] Can click machine and see machine page
- [ ] Machine name displays (not "Machine")
- [ ] Templates display (not "No templates assigned")
- [ ] No error messages
- [ ] [TRACE 1-4] logs show valid UUIDs
- [ ] Start Inspection works
- [ ] Redirects to inspection page
- [ ] Inspection page displays questions
- [ ] Back button works
- [ ] Back button shows → (not \u2190)
- [ ] Can return to machine list
- [ ] No undefined UUIDs in any logs

**Result:** ✅ PASS or ❌ FAIL

---

**Ready to test?** Start with Step 1 above.  
**Found an issue?** Check the troubleshooting section or use the Report Template.
