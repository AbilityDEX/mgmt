#!/bin/bash
# Quick test runner for inspection workflow

set -e

cd /workspaces/mgmt

echo "======================================"
echo "Inspection Workflow Quick Test"
echo "======================================"
echo ""

# 1. Check if database is accessible
echo "1️⃣  Checking database connection..."
if ! psql -h localhost -U postgres -d postgres -c "SELECT 1" >/dev/null 2>&1; then
    echo "❌ Database not accessible at localhost:5432"
    echo "   Please ensure Supabase/PostgreSQL is running"
    exit 1
fi
echo "✅ Database connection OK"
echo ""

# 2. Check if test data exists
echo "2️⃣  Checking for test data..."
MACHINE_COUNT=$(psql -h localhost -U postgres -d postgres -t -c "SELECT COUNT(*) FROM machines;" 2>/dev/null || echo "0")
TEMPLATE_COUNT=$(psql -h localhost -U postgres -d postgres -t -c "SELECT COUNT(*) FROM checklist_templates;" 2>/dev/null || echo "0")
ASSIGNMENT_COUNT=$(psql -h localhost -U postgres -d postgres -t -c "SELECT COUNT(*) FROM machine_inspection_templates WHERE active=true;" 2>/dev/null || echo "0")

echo "  Machines: $MACHINE_COUNT"
echo "  Templates: $TEMPLATE_COUNT"
echo "  Active Assignments: $ASSIGNMENT_COUNT"

if [ "$ASSIGNMENT_COUNT" -eq 0 ]; then
    echo "❌ No active template assignments found"
    echo "   Run: npm run db:push to apply migrations"
    echo "   Or create test data manually via admin interface"
    exit 1
fi
echo "✅ Test data available"
echo ""

# 3. Check TypeScript compilation
echo "3️⃣  Checking TypeScript compilation..."
if ! npm run build 2>&1 | grep -q "successfully"; then
    echo "⚠️  Build warnings detected (check output above)"
else
    echo "✅ TypeScript compilation OK"
fi
echo ""

# 4. Instructions for manual testing
echo "4️⃣  Next steps for manual testing:"
echo ""
echo "   a) Start dev server:"
echo "      npm run dev"
echo ""
echo "   b) Open browser:"
echo "      http://localhost:3000/inspection"
echo ""
echo "   c) Select a machine"
echo ""
echo "   d) Verify templates display (should NOT show 'No templates assigned')"
echo ""
echo "   e) Click 'Start Inspection'"
echo ""
echo "   f) Verify inspection page loads with questions"
echo ""
echo "   g) Check browser console for logs (press F12)"
echo ""
echo "   Expected console logs:"
echo "      [MACHINE PAGE] Loading machine details: {...}"
echo "      [INSPECTION-EXECUTIONS GET] Request: {...}"
echo "      [START INSPECTION] Starting with: {...}"
echo "      [INSPECTION GET] Loading inspection: {...}"
echo ""
echo "   ❌ Should NOT see:"
echo "      invalid input syntax for type uuid: \"undefined\""
echo "      Inspection not found"
echo "      uuid: undefined"
echo ""
echo "======================================"
echo "Test environment ready!"
echo "======================================"
