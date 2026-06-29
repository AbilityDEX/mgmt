import fs from 'fs'
import path from 'path'

function parseEnv(file) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const out = {}
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx)
    const val = line.slice(idx + 1)
    out[key] = val
  }
  return out
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json }
}

async function main() {
  const env = parseEnv(path.resolve(process.cwd(), '.env.local'))
  const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
  const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!SUPABASE_URL || !ANON_KEY) throw new Error('Missing env vars')

  // Sign in admin
  const supabaseMod = await import('@supabase/supabase-js')
  const { createClient } = supabaseMod
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const adminEmail = 'admin@mgmt.local'
  const adminPass = 'Meg4vaux!'
  console.log('Signing in as admin...')
  const sign = await client.auth.signInWithPassword({ email: adminEmail, password: adminPass })
  if (sign.error || !sign.data.session) throw new Error('Sign in failed: ' + JSON.stringify(sign.error))
  const token = sign.data.session.access_token
  console.log('Got token (len)', token.length)

  const base = 'http://127.0.0.1:3000'
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // 1. Create Template
  console.log('\nTEST 1: Create Template')
  const tpl = await fetchJSON(base + '/api/inspection-templates', {
    method: 'POST', headers, body: JSON.stringify({ name: 'RT Template', items: [{ question: 'Q1' }, { question: 'Q2' }] }),
  })
  console.log('status', tpl.status)
  if (tpl.status !== 200) throw new Error('Create Template failed: ' + JSON.stringify(tpl.body))
  const templateId = tpl.body.template.id
  console.log('templateId', templateId)

  // 2. Create Machine
  console.log('\nTEST 2: Create Machine')
  const mc = await fetchJSON(base + '/api/machines', {
    method: 'POST', headers, body: JSON.stringify({ name: 'RT Machine', area: 'QA', assigned_user: null, inspection_deadline: '09:30', template_id: null, inspection_frequency: 'Daily', reminder_days_before_due: 0, auto_generate_inspection: false }),
  })
  console.log('status', mc.status)
  if (mc.status !== 200) throw new Error('Create Machine failed: ' + JSON.stringify(mc.body))
  const machineId = mc.body.machine.id
  console.log('machineId', machineId)

  // 3. Edit Machine
  console.log('\nTEST 3: Edit Machine')
  const edit = await fetchJSON(base + '/api/machines', { method: 'PATCH', headers, body: JSON.stringify({ id: machineId, name: 'RT Machine Updated', area: 'QA-Updated' }) })
  console.log('status', edit.status)
  if (edit.status !== 200) throw new Error('Edit Machine failed: ' + JSON.stringify(edit.body))

  // 4. Assign Template
  console.log('\nTEST 4: Assign Template')
  const assign = await fetchJSON(base + '/api/machines', { method: 'PATCH', headers, body: JSON.stringify({ id: machineId, template_id: templateId, inspection_frequency: 'Daily' }) })
  console.log('status', assign.status)
  if (assign.status !== 200) throw new Error('Assign Template failed: ' + JSON.stringify(assign.body))

  // 5. Generate / Start Inspection (manual start)
  console.log('\nTEST 5: Start Inspection (manual)')
  const start = await fetchJSON(base + '/api/inspection-executions', { method: 'POST', headers, body: JSON.stringify({ machine_id: machineId, template_id: templateId }) })
  console.log('status', start.status)
  if (start.status !== 200) throw new Error('Start Inspection failed: ' + JSON.stringify(start.body))
  const inspectionId = start.body.inspection.id
  console.log('inspectionId', inspectionId)

  // 6. Verify inspection items (GET /api/inspection-executions/:id)
  console.log('\nTEST 6: Get Inspection Detail')
  const detail = await fetchJSON(base + `/api/inspection-executions/${inspectionId}`, { method: 'GET', headers })
  console.log('status', detail.status)
  if (detail.status !== 200) throw new Error('Get inspection failed: ' + JSON.stringify(detail.body))
  const items = detail.body.inspection.items
  console.log('items count', items.length)

  // 7. Save Draft (autosave)
  console.log('\nTEST 7: Autosave Draft')
  const autosave = await fetchJSON(base + `/api/inspection-executions/autosave/${inspectionId}`, { method: 'POST', headers, body: JSON.stringify({ currentQuestionIndex: 1, scrollPosition: 100 }) })
  console.log('status', autosave.status, 'body', autosave.body)
  if (autosave.status !== 200) throw new Error('Autosave failed: ' + JSON.stringify(autosave.body))

  // 8. Resume Draft (GET drafts)
  console.log('\nTEST 8: Resume Draft Listing')
  const drafts = await fetchJSON(base + '/api/inspection-executions/drafts', { method: 'GET', headers })
  console.log('status', drafts.status)
  if (drafts.status !== 200) throw new Error('Drafts failed: ' + JSON.stringify(drafts.body))

  // 9. Update an item (answer)
  console.log('\nTEST 9: Update Inspection Item (answer)')
  const itemId = items[0].id
  const itemUpdate = await fetchJSON(base + `/api/inspection-executions/${inspectionId}`, { method: 'PATCH', headers, body: JSON.stringify({ type: 'item', item_id: itemId, answer: 'pass', comments: 'ok' }) })
  console.log('status', itemUpdate.status)
  if (itemUpdate.status !== 200) throw new Error('Item update failed: ' + JSON.stringify(itemUpdate.body))

  // 10. Complete Inspection
  console.log('\nTEST 10: Complete Inspection')
  const complete = await fetchJSON(base + `/api/inspection-executions/${inspectionId}`, { method: 'PATCH', headers, body: JSON.stringify({ type: 'complete' }) })
  console.log('status', complete.status)
  if (complete.status !== 200) throw new Error('Complete failed: ' + JSON.stringify(complete.body))
  console.log('completion result', complete.body)

  // 11. Archive / Email queue: check inspections list for archive status or emails queued via inspections endpoint
  console.log('\nTEST 11: Check Inspections List')
  const inspectionsList = await fetchJSON(base + '/api/inspections', { method: 'GET', headers })
  console.log('status', inspectionsList.status)
  if (inspectionsList.status !== 200) throw new Error('Inspections list failed: ' + JSON.stringify(inspectionsList.body))

  // 12. Reminder Queue - trigger reminders by calling queueDailyReminderEmails via schedule overview endpoint (call /api/schedules)
  console.log('\nTEST 12: Schedules Overview (trigger reminder logic)')
  const schedules = await fetchJSON(base + '/api/schedules', { method: 'GET', headers })
  console.log('status', schedules.status)
  if (schedules.status !== 200) throw new Error('Schedules failed: ' + JSON.stringify(schedules.body))

  // 13. Scheduler: create assignment already triggers scheduler; verify that GET /api/inspection-executions lists generated inspections for machine
  console.log('\nTEST 13: Verify scheduler generation (list for machine)')
  const listForMachine = await fetchJSON(base + `/api/inspection-executions?machine_id=${machineId}`, { method: 'GET', headers })
  console.log('status', listForMachine.status)
  if (listForMachine.status !== 200) throw new Error('List for machine failed: ' + JSON.stringify(listForMachine.body))

  // 14. Daily Maintenance: call an endpoint that triggers maintenance (GET inspection-executions triggers userActivityFallback)
  console.log('\nTEST 14: Trigger maintenance via inspection list')
  const maintenanceTrigger = await fetchJSON(base + `/api/inspection-executions?machine_id=${machineId}`, { method: 'GET', headers })
  console.log('status', maintenanceTrigger.status)
  if (maintenanceTrigger.status !== 200) throw new Error('Maintenance trigger failed: ' + JSON.stringify(maintenanceTrigger.body))

  console.log('\nAll HTTP checks passed')
}

main().catch((e) => { console.error('FAILED:', e); process.exit(2) })
