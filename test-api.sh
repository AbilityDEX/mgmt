#!/bin/bash

# Test the API endpoints directly
echo "Testing API endpoints..."

# 1. Start the dev server in background
echo "Starting dev server..."
cd /workspaces/mgmt

# Kill any existing processes on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Start dev server
npm run dev > /tmp/dev-server.log 2>&1 &
DEV_PID=$!

# Wait for server to start
echo "Waiting for server to start..."
for i in {1..30}; do
    if curl -s http://localhost:3000/api/health >/dev/null 2>&1; then
        echo "Server started successfully"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "Server failed to start"
        kill $DEV_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

echo ""
echo "Running API tests..."

# Get a machine ID from the database
MACHINE_ID=$(PGPASSWORD="postgres" psql -h localhost -U postgres -d postgres -t -c "SELECT id::text FROM machines ORDER BY created_at DESC LIMIT 1;" 2>/dev/null)

if [ -z "$MACHINE_ID" ]; then
    echo "ERROR: Could not get machine ID"
    kill $DEV_PID
    exit 1
fi

echo "Using machine: $MACHINE_ID"

# Test 1: GET templates for machine
echo ""
echo "Test 1: GET /api/inspection-executions?machine_id=$MACHINE_ID"
curl -s "http://localhost:3000/api/inspection-executions?machine_id=$MACHINE_ID" \
    -H "Authorization: Bearer test-token" | jq '.' > /tmp/test1-result.json

echo "Result:"
cat /tmp/test1-result.json

TEMPLATE_COUNT=$(jq '.assignedTemplates | length' /tmp/test1-result.json 2>/dev/null || echo "0")
echo "Templates found: $TEMPLATE_COUNT"

if [ "$TEMPLATE_COUNT" -gt "0" ]; then
    TEMPLATE_ID=$(jq -r '.assignedTemplates[0].templateId' /tmp/test1-result.json)
    echo "Using template: $TEMPLATE_ID"
    
    # Test 2: POST to start inspection
    echo ""
    echo "Test 2: POST /api/inspection-executions"
    PAYLOAD="{\"machine_id\": \"$MACHINE_ID\", \"template_id\": \"$TEMPLATE_ID\"}"
    echo "Payload: $PAYLOAD"
    
    curl -s -X POST "http://localhost:3000/api/inspection-executions" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer test-token" \
        -d "$PAYLOAD" | jq '.' > /tmp/test2-result.json
    
    echo "Result:"
    cat /tmp/test2-result.json
    
    INSPECTION_ID=$(jq -r '.inspection.id' /tmp/test2-result.json 2>/dev/null)
    
    if [ ! -z "$INSPECTION_ID" ] && [ "$INSPECTION_ID" != "null" ]; then
        echo "Created inspection: $INSPECTION_ID"
        
        # Test 3: GET inspection details
        echo ""
        echo "Test 3: GET /api/inspection-executions/$INSPECTION_ID"
        curl -s "http://localhost:3000/api/inspection-executions/$INSPECTION_ID" \
            -H "Authorization: Bearer test-token" | jq '.' > /tmp/test3-result.json
        
        echo "Result:"
        cat /tmp/test3-result.json
        
        ITEMS_COUNT=$(jq '.inspection.items | length' /tmp/test3-result.json 2>/dev/null || echo "0")
        echo "Items in inspection: $ITEMS_COUNT"
        
        if [ "$ITEMS_COUNT" -gt "0" ]; then
            echo "✓ Inspection workflow working!"
        else
            echo "✗ No items in inspection"
        fi
    else
        echo "✗ Failed to create inspection"
        echo "Response:"
        jq '.error' /tmp/test2-result.json
    fi
else
    echo "No templates assigned to machine"
fi

echo ""
echo "Cleaning up..."
kill $DEV_PID 2>/dev/null || true

echo "Tests complete"
