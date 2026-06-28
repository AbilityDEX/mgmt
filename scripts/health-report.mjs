import { createClient } from '@supabase/supabase-js'

const base = 'http://localhost:3000'
await fetch(base + '/api/admin/ensure-super-admin')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data, error } = await supabase.auth.signInWithPassword({ email: 'admin@mgmt.local', password: 'Meg4vaux!' })
if (error || !data.session?.access_token) throw new Error(error?.message || 'No session')
const token = data.session.access_token
const res = await fetch(base + '/api/admin/system-health', { headers: { Authorization: `Bearer ${token}` } })
const json = await res.json()
console.log(JSON.stringify({
  readiness: json.readiness,
  fullReport: json.fullReport,
  releaseValidation: json.releaseValidation,
  schedulerValidation: json.schedulerValidation,
}, null, 2))
