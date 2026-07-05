import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
try {
  const envText = fs.readFileSync('.env.local', 'utf8')
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq)
    const val = trimmed.slice(eq + 1)
    process.env[key] = val.replace(/^\"|\"$/g, '')
  }
} catch (e) {}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !anonKey || !serviceKey) {
  console.error('Missing env vars')
  process.exit(2)
}

const admin = createClient(supabaseUrl, serviceKey)
const anon = createClient(supabaseUrl, anonKey)

async function run() {
  try {
    const { data: inspections } = await admin.from('inspections').select('id').eq('status', 'In Progress').limit(1)
    if (!inspections || inspections.length === 0) {
      console.error('No inspections In Progress found')
      process.exit(1)
    }
    const inspectionId = inspections[0].id
    console.log('found inspection', inspectionId)

    const { data: items } = await admin.from('inspection_items').select('id').eq('inspection_id', inspectionId).limit(1)
    if (!items || items.length === 0) {
      console.error('No items for inspection', inspectionId)
      process.exit(1)
    }
    const itemId = items[0].id
    console.log('found item', itemId)

    // create admin user for testing
    const email = `test-admin-${Date.now()}@example.com`
    const password = 'Testpass123!'
    const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    const userId = created.user?.id
    await admin.from('profiles').insert([{ user_id: userId, username: `testadmin${Date.now()}`, role: 'admin', email }])
    console.log('created admin user', userId)

    // sign in
    const { data: signData } = await anon.auth.signInWithPassword({ email, password })
    const token = signData.session?.access_token
    if (!token) {
      console.error('failed to sign in')
      process.exit(1)
    }

    // perform upload via fetch
    const fileBuffer = fs.readFileSync('/etc/hosts')
    const formData = new FormData()
    const blob = new Blob([fileBuffer])
    formData.append('file', blob, 'hosts.txt')
    formData.append('inspectionId', inspectionId)
    formData.append('inspectionItemId', itemId)

    const resp = await fetch('http://localhost:3000/api/inspection-photos/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

    console.log('response status', resp.status)
    console.log('response body', await resp.text())
  } catch (e) {
    console.error('unexpected', e)
    process.exit(1)
  }
}

run()
