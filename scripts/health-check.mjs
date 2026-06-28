import { createClient } from '@supabase/supabase-js'

const base = 'http://localhost:3000'

const ensure = await fetch(base + '/api/admin/ensure-super-admin')
const ensureJson = await ensure.json()
if (!ensure.ok) {
  console.error('ensure-super-admin failed', ensure.status, ensureJson)
  process.exit(1)
}

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
const healthRes = await fetch(base + '/api/admin/system-health', {
  headers: { Authorization: `Bearer ${token}` },
})
const health = await healthRes.json()
if (!healthRes.ok) {
  console.error('system-health failed', healthRes.status, health)
  process.exit(1)
}

const release = Array.isArray(health.releaseValidation) ? health.releaseValidation : []
const scheduler = Array.isArray(health.schedulerValidation) ? health.schedulerValidation : []
const inspectionLocked = release.find((r) => r.stage === 'Inspection Locked')
const midnightStage = release.find((r) => r.stage === 'Midnight Transition')
const midnightAll = scheduler.every((r) => r.checks?.midnightTransition === true)

const summary = {
  readiness: health.readiness,
  pdfValidation: health.pdfValidation,
  emailValidation: health.emailValidation,
  inspectionLocked,
  midnightStage,
  midnightTransitionAllFrequencies: midnightAll,
  failedInspectionStarts: health.cards?.inspectionEngine?.metrics?.failedInspectionStarts,
  duplicateInspectionAttemptsBlocked: health.cards?.inspectionEngine?.metrics?.duplicateInspectionAttemptsBlocked,
}

console.log(JSON.stringify(summary, null, 2))
