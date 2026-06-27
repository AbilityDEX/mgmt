# Audit Report: `checklist_templates.active` Column

**Status**: ✅ **FIXED** - All problematic references removed

**Date**: 2026-06-26

---

## Issue Summary

The application was querying `checklist_templates.active`, but this column **does not exist** in the production database.

**Root Cause**: Database schema (migration 0012) never defined an `active` column on `checklist_templates` table.

**Impact**: Template selector endpoints were failing when querying with this non-existent filter.

---

## Database Schema Analysis

### `checklist_templates` Table (Current - Without Active Column)
```sql
create table if not exists public.checklist_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
```

**Columns:** `id, name, description, created_at, updated_at`
**Active Column**: ❌ Does NOT exist

### `machine_inspection_templates` Table (Join Table - WITH Active Column)
```sql
create table if not exists public.machine_inspection_templates (
  id uuid primary key default uuid_generate_v4(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  inspection_frequency text not null,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  unique(machine_id, template_id)
);
```

**Columns:** `id, machine_id, template_id, inspection_frequency, active, created_at`
**Active Column**: ✅ **EXISTS** - Tracks whether a machine-template assignment is active

---

## Design Decision

**Is `active` column needed on `checklist_templates`?** ❌ **NO**

**Rationale:**
1. Templates represent reusable inspection checklists
2. Templates are either:
   - **In use**: Currently assigned to one or more machines (via `machine_inspection_templates`)
   - **Unused**: Available for new assignments or deletion
3. There is NO concept of "archiving" or "soft-deleting" templates
   - DELETE endpoint hard-deletes templates (migration 0011 sets up cascading deletes)
   - No RLS policy prevents access to archived templates
   - No soft-delete pattern used elsewhere in codebase

4. The `active` flag on `machine_inspection_templates` is sufficient:
   - Tracks whether a specific assignment is currently active
   - Allows future support for inactive assignments without deletion

---

## Codebase Audit Results

### Problematic References Found: 2

| File | Line | Query | Issue | Fix |
|------|------|-------|-------|-----|
| `/app/api/machine-inspection-templates/route.ts` | 55 | `checklist_templates.eq('active', true)` | Filtering non-existent column | ✅ Removed |
| `/app/api/machine-inspection-templates/route.ts` | 141 | `checklist_templates.eq('active', true)` | Filtering non-existent column | ✅ Removed |

### Verified References (Correct): 6

| File | Line | Query | Table | Status |
|------|------|-------|-------|--------|
| `/app/api/machine-inspection-templates/route.ts` | 74 | `machine_inspection_templates.eq('active', true)` | `machine_inspection_templates` | ✅ Correct |
| `/app/api/inspection-templates/route.ts` | 118 | `machine_inspection_templates.eq('active', true)` | `machine_inspection_templates` | ✅ Correct |
| `/app/api/inspection-templates/route.ts` | 372 | `machine_inspection_templates.eq('active', true)` | `machine_inspection_templates` | ✅ Correct |
| `/app/api/defects/[defectId]/route.ts` | 77 | `profiles.eq('active', true)` | `profiles` | ✅ Correct |
| `/app/api/inspection-executions/route.ts` | 55 | `machine_inspection_templates.eq('active', true)` | `machine_inspection_templates` | ✅ Correct |
| `/app/api/inspection-executions/route.ts` | 195 | `machine_inspection_templates.eq('active', true)` | `machine_inspection_templates` | ✅ Correct |

---

## Changes Made

### ✅ Fixed `/app/api/machine-inspection-templates/route.ts`

**Change 1 - Line 55** (Template Selector Query):
```typescript
// BEFORE (❌ Broken - Column Doesn't Exist)
const { data, error } = await supabaseAdmin
  .from('checklist_templates')
  .select('id, name, description')
  .eq('active', true)  // ❌ This column doesn't exist!
  .order('name', { ascending: true })

// AFTER (✅ Fixed - Removed Invalid Filter)
const { data, error } = await supabaseAdmin
  .from('checklist_templates')
  .select('id, name, description')
  .order('name', { ascending: true })
```

**Change 2 - Line 141** (Available Templates Query):
```typescript
// BEFORE (❌ Broken - Column Doesn't Exist)
let availableTemplatesQuery = supabaseAdmin
  .from('checklist_templates')
  .select('id, name')
  .eq('active', true)  // ❌ This column doesn't exist!
  .order('name', { ascending: true })

// AFTER (✅ Fixed - Removed Invalid Filter)
let availableTemplatesQuery = supabaseAdmin
  .from('checklist_templates')
  .select('id, name')
  .order('name', { ascending: true })
```

---

## Impact Analysis

### What Changed
- **Behavior**: Templates are no longer filtered by a non-existent column
- **Result**: All templates are now available for assignment to machines
- **Rationale**: All templates are either in use or can be deleted; no "inactive" state needed

### What Stayed The Same
- `machine_inspection_templates.active` filters remain unchanged (correct behavior)
- Template deletion logic remains unchanged (prevents deletion if machines assigned)
- Machine-template assignment creation remains unchanged (sets `active=true`)
- No database migrations needed (no schema changes)
- No type definition changes needed

---

## Verification Checklist

### ✅ Pre-Verification
- [x] Schema audit completed - `checklist_templates` has no `active` column
- [x] Codebase search completed - Found 2 problematic queries
- [x] All other references verified - Correct tables queried
- [x] Design confirmed - `active` on join table is sufficient

### ✅ Fixes Applied
- [x] Removed `.eq('active', true)` from line 55
- [x] Removed `.eq('active', true)` from line 141
- [x] TypeScript validation passed (no errors)
- [x] No new migrations needed

### ⏳ Post-Fix Testing (See Below)
- [ ] Template dropdown loads all templates
- [ ] Machine creation works without template
- [ ] Machine creation works with template
- [ ] Machine editing works - can add template
- [ ] Machine editing works - can change template
- [ ] Machine editing works - can remove template
- [ ] Machine list loads after refresh
- [ ] Template assignment persists after refresh
- [ ] No Supabase errors in console
- [ ] No browser console errors

---

## Testing Status

All fixes deployed. Ready for end-to-end testing.
