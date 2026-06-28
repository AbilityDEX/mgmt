import { createClient } from '@supabase/supabase-js'

const base = 'http://localhost:3000'

await fetch(base + '/api/admin/ensure-super-admin')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !anon) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(url, anon, { auth: { persistSession: false } })
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'admin@mgmt.local',
  password: 'Meg4vaux!',
})
if (error || !data.session?.access_token) {
  console.error('signIn failed', error?.message)
  process.exit(1)
}

const token = data.session.access_token
const res = await fetch(base + '/api/admin/system-health/test-email', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
})
const json = await res.json()
console.log(JSON.stringify({ status: res.status, ok: res.ok, json }, null, 2))
