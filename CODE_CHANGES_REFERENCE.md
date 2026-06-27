# Code Changes Reference: `checklist_templates.active` Fix

## File: `/app/api/machine-inspection-templates/route.ts`

### Change #1: Template Selector Query (Lines 50-62)

```diff
  // Get active templates for machine creation/edit selector
  if (availableOnly) {
    const { data, error } = await supabaseAdmin
      .from('checklist_templates')
      .select('id, name, description')
-     .eq('active', true)
      .order('name', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ templates: data ?? [] })
  }
```

**Why**: Remove filter on non-existent column

**Endpoint**: `GET /api/machine-inspection-templates?available_only=true`

**Impact**: Template dropdown now loads all templates for machine forms

---

### Change #2: Available Templates Query (Lines 135-146)

```diff
  const assignedTemplateIds = assignments.map((assignment) => assignment.templateId)

  let availableTemplatesQuery = supabaseAdmin
    .from('checklist_templates')
    .select('id, name')
-   .eq('active', true)
    .order('name', { ascending: true })

  if (assignedTemplateIds.length > 0) {
    availableTemplatesQuery = availableTemplatesQuery.not('id', 'in', `(${assignedTemplateIds.map((id) => `'${id}'`).join(',')})`)
  }
```

**Why**: Remove filter on non-existent column

**Endpoint**: `GET /api/machine-inspection-templates?machine_id=<id>` (fetch available templates for machine)

**Impact**: When editing machine, now shows all unassigned templates as options

---

## Summary

- **Lines Changed**: 2
- **Changes Type**: Removed invalid filters
- **Filters Removed**: `.eq('active', true)` (2x)
- **Files Modified**: 1
- **Database Migrations Needed**: None
- **Breaking Changes**: None
- **Backward Compatible**: Yes ✅

---

## Verification Commands

### Before Fix (Would Fail)
```javascript
// This would throw Supabase error: column "active" doesn't exist
supabaseAdmin
  .from('checklist_templates')
  .select('id, name, description')
  .eq('active', true)  // ❌ Column doesn't exist
  .order('name', { ascending: true })
```

### After Fix (Works)
```javascript
// Now correctly queries without non-existent column filter
supabaseAdmin
  .from('checklist_templates')
  .select('id, name, description')
  .order('name', { ascending: true })  // ✅ Valid query
```

---

## Why This Works

1. **`checklist_templates` Table Schema**:
   - Has: `id, name, description, created_at, updated_at`
   - Does NOT have: `active`
   - Source: Migration 0012_create_inspection_templates.sql

2. **`machine_inspection_templates` Table Schema**:
   - Has: `id, machine_id, template_id, inspection_frequency, active, created_at`
   - HAS: `active` ✅
   - Used to track whether a machine-template assignment is active

3. **Design Intent**:
   - Show ALL templates in selector dropdowns
   - Use the join table's `active` flag to track assignment status
   - Templates don't need their own active flag

---

## Related Code (Not Changed - Verified Correct)

### Machine Inspection Templates - Active Assignment Status ✅
```typescript
// Line 74 - Correctly filtering on JOIN table active status
.from('machine_inspection_templates')
.eq('active', true)  // ✅ This table HAS active column
```

### Inspection Templates - Active Assignment Count ✅
```typescript
// Line 118 - Correctly counting active assignments
.from('machine_inspection_templates')
.eq('active', true)  // ✅ This table HAS active column
```

### Delete Prevention - Active Assignments ✅
```typescript
// Line 372 - Correctly checking for active assignments before delete
.from('machine_inspection_templates')
.eq('active', true)  // ✅ This table HAS active column
```

---

## Testing Workflow

### Quick Test: Template Selector
```bash
# Should return all templates (no error)
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/machine-inspection-templates?available_only=true"
```

### Full Workflow Test
1. Create machine without template → ✅ Works
2. Create machine with template → ✅ Works
3. Edit machine, add template → ✅ Works
4. Edit machine, change template → ✅ Works
5. Edit machine, remove template → ✅ Works
6. Refresh page, data persists → ✅ Works
7. Template appears on machine card → ✅ Works
8. Template count shows on list → ✅ Works

---

## Rollback (If Needed)

If you need to revert:

1. Add back `.eq('active', true)` on line 55
2. Add back `.eq('active', true)` on line 141

**Note**: This will re-introduce the error unless you:
- Create `active` column on `checklist_templates` with migration
- Backfill existing templates with `active = true`
- Update TypeScript types

Current fix is the correct long-term solution.
