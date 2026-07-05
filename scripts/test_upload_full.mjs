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
    // 1) create confirmed user
    const email = `test-admin-${Date.now()}@example.com`
    const password = 'Testpass123!'
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError) {
      console.error('createUser error', createError)
      process.exit(1)
    }
    const userId = created.user?.id
    console.log('created user id', userId)

    // 2) insert profile with admin role
    const { error: profileError } = await admin.from('profiles').insert([
      { user_id: userId, username: `testadmin${Date.now()}`, role: 'admin', email },
    ])
    if (profileError) {
      console.error('profile insert error', profileError)
      process.exit(1)
    }
    console.log('profile inserted')

    // 3) sign in to get token
    const { data: signData, error: signError } = await anon.auth.signInWithPassword({ email, password })
    if (signError) {
      console.error('signIn error', signError)
      process.exit(1)
    }
    const token = signData.session?.access_token
    console.log('token length', token ? token.length : 0)

    // 4) perform upload to local endpoint
    const fileBuffer = fs.readFileSync('/etc/hosts')
    const formData = new FormData()
    const blob = new Blob([fileBuffer])
    formData.append('file', blob, 'hosts.txt')
    // Use a dummy inspection/item id; since user is admin, authorization should pass
    formData.append('inspectionId', '00000000-0000-0000-0000-000000000000')
    formData.append('inspectionItemId', '00000000-0000-0000-0000-000000000000')

    const resp = await fetch('http://localhost:3000/api/inspection-photos/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

    const text = await resp.text()
    console.log('response status', resp.status)
    console.log('response body', text)
  } catch (e) {
    console.error('unexpected', e)
    process.exit(1)
  }
}

run()
