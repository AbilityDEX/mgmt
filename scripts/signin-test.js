import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

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

async function main() {
  const envFile = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envFile)) throw new Error('.env.local not found')
  const env = parseEnv(envFile)
  const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
  const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!SUPABASE_URL || !ANON_KEY) throw new Error('Missing env values')

  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const email = 'admin@mgmt.local'
  const password = 'Meg4vaux!'

  console.log('Signing in', email)
  const result = await client.auth.signInWithPassword({ email, password })
  console.log('status/error:', result.error?.message)
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
