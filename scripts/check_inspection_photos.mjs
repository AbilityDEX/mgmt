import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Lightweight .env.local parser (no external deps)
try {
  const envText = fs.readFileSync('.env.local', 'utf8')
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq)
    const val = trimmed.slice(eq + 1)
    // Remove surrounding quotes if present
    process.env[key] = val.replace(/^\"|\"$/g, '')
  }
} catch (err) {
  // ignore, rely on existing env
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE env vars')
  process.exit(2)
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

async function run() {
  try {
    const bucketName = 'inspection-photos'
    const bucketRes = await supabaseAdmin.storage.getBucket(bucketName)
    console.log('getBucket result:')
    console.log(JSON.stringify(bucketRes, null, 2))

    console.log('\nList buckets:')
    const listRes = await supabaseAdmin.storage.listBuckets()
    console.log(JSON.stringify(listRes, null, 2))

    // Try to get public access settings
    if (bucketRes && bucketRes.data) {
      console.log('\nBucket found:', bucketName)
    } else {
      console.log('\nBucket not found')
    }

    // Check photo_uploads table exists and is queryable
    try {
      const { data: photoRows, error: photoError } = await supabaseAdmin
        .from('photo_uploads')
        .select('id')
        .limit(1)

      console.log('\nphoto_uploads query result:')
      console.log(JSON.stringify({ data: photoRows, error: photoError }, null, 2))
    } catch (err) {
      console.error('Error querying photo_uploads:', err)
    }
  } catch (err) {
    console.error('Error checking storage:', err)
    process.exit(1)
  }
}

run()
