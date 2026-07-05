import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

// Load env
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
  console.error('Missing SUPABASE env vars')
  process.exit(2)
}

const admin = createClient(supabaseUrl, serviceKey)
const anon = createClient(supabaseUrl, anonKey)

async function run() {
  try {
    // find a photo_uploads row
    const { data: photos } = await admin.from('photo_uploads').select('id, inspection_item_id').limit(1)
    if (!photos || photos.length === 0) {
      console.error('No photo_uploads rows present')
      process.exit(1)
    }
    const photo = photos[0]
    const { data: item } = await admin.from('inspection_items').select('inspection_id').eq('id', photo.inspection_item_id).maybeSingle()
    const inspectionId = item?.inspection_id
    if (!inspectionId) {
      console.error('No inspection found for photo')
      process.exit(1)
    }
    console.log('Found inspection with photos:', inspectionId)

    // Create admin user to call completion
    const email = `e2e-admin-${Date.now()}@example.com`
    const password = 'Testpass123!'
    const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    const userId = created?.user?.id
    await admin.from('profiles').insert([{ user_id: userId, username: `e2e${Date.now()}`, role: 'admin', email }])
    const { data: sign } = await anon.auth.signInWithPassword({ email, password })
    const token = sign.session?.access_token
    if (!token) throw new Error('Sign-in failed')

    // Mark required items passed
    const { data: requiredItems } = await admin.from('inspection_items').select('id').eq('inspection_id', inspectionId).eq('required', true)
    if (requiredItems && requiredItems.length > 0) {
      const ids = requiredItems.map(r => r.id)
      const { error: updErr } = await admin.from('inspection_items').update({ answer: 'pass', completed: true }).in('id', ids)
      if (updErr) throw updErr
      console.log('Marked required items passed')
    }

    // Call complete endpoint
    const resp = await fetch(`http://127.0.0.1:3000/api/inspection-executions/${inspectionId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'complete' })
    })
    const text = await resp.text()
    console.log('Complete response', resp.status, text)
    process.exit(0)
  } catch (e) {
    console.error('Trigger failed', e && e.message ? e.message : e)
    process.exit(1)
  }
}

run()
