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
} catch (e) {
  // ignore
}

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
  const email = `test-upload-${Date.now()}@example.com`
  const password = 'Testpass123!'
  try {
    // Create confirmed user via admin
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError) {
      console.error('createUser error', createError)
      process.exit(1)
    }
    console.log('created user id', created.user?.id)

    // Sign in via anon client to get access token
    const { data: signData, error: signError } = await anon.auth.signInWithPassword({ email, password })
    if (signError) {
      console.error('signIn error', signError)
      process.exit(1)
    }

    const token = signData.session?.access_token
    if (!token) {
      console.error('no token returned')
      process.exit(1)
    }

    console.log(token)
  } catch (e) {
    console.error('unexpected', e)
    process.exit(1)
  }
}

run()
