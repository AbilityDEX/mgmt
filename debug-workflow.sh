#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Starting Comprehensive Workflow Debug ===${NC}"
echo ""

# 1. Check database connection and data
echo -e "${YELLOW}1. Checking database state...${NC}"

# First, let's get a machine ID and template ID from the database
MACHINE_ID=$(PGPASSWORD="postgres" psql -h localhost -U postgres -d postgres -t -c "SELECT id FROM machines LIMIT 1;" 2>/dev/null)

if [ -z "$MACHINE_ID" ]; then
    echo -e "${RED}ERROR: Could not fetch machine from database${NC}"
    echo "Make sure Supabase/PostgreSQL is running at localhost:5432"
    exit 1
fi

echo -e "${GREEN}✓ Found machine: ${MACHINE_ID}${NC}"

# Get a template ID
TEMPLATE_ID=$(PGPASSWORD="postgres" psql -h localhost -U postgres -d postgres -t -c "SELECT id FROM checklist_templates LIMIT 1;" 2>/dev/null)

if [ -z "$TEMPLATE_ID" ]; then
    echo -e "${RED}ERROR: Could not fetch template from database${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Found template: ${TEMPLATE_ID}${NC}"

# Check if machine has active template assignment
ASSIGNMENT=$(PGPASSWORD="postgres" psql -h localhost -U postgres -d postgres -t -c "SELECT id FROM machine_inspection_templates WHERE machine_id='$MACHINE_ID' AND active=true LIMIT 1;" 2>/dev/null)

if [ -z "$ASSIGNMENT" ]; then
    echo -e "${YELLOW}! No active assignment found, creating one...${NC}"
    # Create assignment
    PGPASSWORD="postgres" psql -h localhost -U postgres -d postgres -c "INSERT INTO machine_inspection_templates (machine_id, template_id, inspection_frequency, active) VALUES ('$MACHINE_ID', '$TEMPLATE_ID', 'Weekly', true) ON CONFLICT DO NOTHING;" 2>/dev/null
    echo -e "${GREEN}✓ Created assignment${NC}"
else
    echo -e "${GREEN}✓ Found active assignment${NC}"
fi

# Count template items
ITEM_COUNT=$(PGPASSWORD="postgres" psql -h localhost -U postgres -d postgres -t -c "SELECT COUNT(*) FROM checklist_template_items WHERE template_id='$TEMPLATE_ID';" 2>/dev/null)
echo -e "${GREEN}✓ Template has $ITEM_COUNT items${NC}"

echo ""
echo -e "${YELLOW}2. Testing API endpoints...${NC}"
echo ""

# Test the inspection-executions GET endpoint
echo -e "${BLUE}Testing GET /api/inspection-executions?machine_id=${MACHINE_ID}${NC}"
API_RESPONSE=$(curl -s "http://localhost:3000/api/inspection-executions?machine_id=${MACHINE_ID}" \
  -H "Authorization: Bearer test-token")

echo "Response:"
echo "$API_RESPONSE" | jq '.' 2>/dev/null || echo "$API_RESPONSE"

# Extract assigned templates count
TEMPLATES_COUNT=$(echo "$API_RESPONSE" | jq '.assignedTemplates | length' 2>/dev/null || echo "ERROR")
echo -e "${BLUE}Templates count: $TEMPLATES_COUNT${NC}"

if [ "$TEMPLATES_COUNT" == "0" ] || [ "$TEMPLATES_COUNT" == "ERROR" ]; then
    echo -e "${RED}ERROR: No templates returned or parsing failed${NC}"
else
    echo -e "${GREEN}✓ Got $TEMPLATES_COUNT template(s)${NC}"
fi

echo ""
echo -e "${YELLOW}3. Testing POST to start inspection...${NC}"

# Build the payload
PAYLOAD="{\"machine_id\": \"$MACHINE_ID\", \"template_id\": \"$TEMPLATE_ID\"}"
echo -e "${BLUE}Payload: $PAYLOAD${NC}"

START_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/inspection-executions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d "$PAYLOAD")

echo "Response:"
echo "$START_RESPONSE" | jq '.' 2>/dev/null || echo "$START_RESPONSE"

# Extract inspection ID
INSPECTION_ID=$(echo "$START_RESPONSE" | jq -r '.inspection.id' 2>/dev/null)

if [ -z "$INSPECTION_ID" ] || [ "$INSPECTION_ID" == "null" ]; then
    echo -e "${RED}ERROR: Could not start inspection${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Started inspection: $INSPECTION_ID${NC}"

echo ""
echo -e "${YELLOW}4. Testing GET inspection details...${NC}"
echo -e "${BLUE}Testing GET /api/inspection-executions/${INSPECTION_ID}${NC}"

DETAIL_RESPONSE=$(curl -s "http://localhost:3000/api/inspection-executions/${INSPECTION_ID}" \
  -H "Authorization: Bearer test-token")

echo "Response:"
echo "$DETAIL_RESPONSE" | jq '.' 2>/dev/null || echo "$DETAIL_RESPONSE"

# Check if items were created
ITEMS_COUNT=$(echo "$DETAIL_RESPONSE" | jq '.inspection.items | length' 2>/dev/null || echo "0")
echo -e "${BLUE}Items in inspection: $ITEMS_COUNT${NC}"

if [ "$ITEMS_COUNT" -gt "0" ]; then
    echo -e "${GREEN}✓ Inspection has items${NC}"
else
    echo -e "${RED}ERROR: No items in inspection${NC}"
fi

echo ""
echo -e "${GREEN}=== Workflow debug complete ===${NC}"
