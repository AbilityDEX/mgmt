import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).reduce((acc, line) => {
  if (!line || line.trim().startsWith('#')) return acc
  const idx = line.indexOf('=')
  if (idx === -1) return acc
  acc[line.slice(0, idx)] = line.slice(idx + 1)
  return acc
}, {})

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const email = process.argv[2]
const password = process.argv[3]

if (!supabaseUrl || !anonKey) {
  console.error('Missing env')
  process.exit(2)
}
if (!email || !password) {
  console.error('Usage: node scripts/signin-supabase.js <email> <password>')
  process.exit(2)
}

const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function main() {
  const result = await client.auth.signInWithPassword({ email, password })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
