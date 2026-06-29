import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

function readEnv() {
  const text = fs.readFileSync('.env.local', 'utf8')
  const lines = text.split(/\r?\n/)
  const env = {}
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i === -1) continue
    env[line.slice(0, i)] = line.slice(i + 1)
  }
  return env
}

async function main() {
  const env = readEnv()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) throw new Error('missing env')

  const adminEmail = 'admin@mgmt.local'
  const adminPass = 'Meg4vaux!'

  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const sign = await client.auth.signInWithPassword({ email: adminEmail, password: adminPass })
  if (sign.error || !sign.data.session) {
    console.error('sign-in failed', sign.error)
    process.exit(2)
  }
  const token = sign.data.session.access_token

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // list machines
  const listRes = await fetch('http://127.0.0.1:3000/api/machines', { headers })
  const listBody = await listRes.text()
  console.log('LIST_STATUS', listRes.status)
  try { console.log(JSON.parse(listBody)) } catch { console.log(listBody) }

  let machines = []
  try { machines = JSON.parse(listBody).machines ?? [] } catch {}
  let machine = machines.find(m => m.name === 'CI Machine' || m.name === 'CI Machine Updated')

  if (!machine) {
    console.log('Creating CI Machine via API')
    const createRes = await fetch('http://127.0.0.1:3000/api/machines', { method: 'POST', headers, body: JSON.stringify({ name: 'CI Machine', area: 'QA', assigned_user: null, inspection_deadline: '09:30', template_id: null, inspection_frequency: 'Daily', reminder_days_before_due: 0, auto_generate_inspection: false }) })
    const createBody = await createRes.text()
    console.log('CREATE_STATUS', createRes.status)
    try { console.log(JSON.parse(createBody)) } catch { console.log(createBody) }
    if (createRes.status !== 200) process.exit(3)
    const created = JSON.parse(createBody).machine
    machine = created
  }

  console.log('Patching machine id', machine.id)
  const patchRes = await fetch('http://127.0.0.1:3000/api/machines', { method: 'PATCH', headers, body: JSON.stringify({ id: machine.id, name: 'CI Machine Updated', area: 'QA-Updated' }) })
  const patchBody = await patchRes.text()
  console.log('PATCH_STATUS', patchRes.status)
  try { console.log(JSON.parse(patchBody)) } catch { console.log(patchBody) }
  process.exit(patchRes.status === 200 ? 0 : 4)
}

main().catch(e => { console.error(e); process.exit(1) })
