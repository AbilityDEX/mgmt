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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE env vars')
  process.exit(2)
}

const admin = createClient(supabaseUrl, serviceKey)
const BUCKET = 'inspection-photos'

async function run() {
  try {
    const { data: archives } = await admin.from('inspection_archives').select('id, inspection_id, pdf_base64, generated_at').order('generated_at', { ascending: false }).limit(1)
    if (!archives || archives.length === 0) {
      console.error('No archives found to verify')
      process.exit(1)
    }
    const arc = archives[0]
    console.log('Verifying archive', arc.id, 'for inspection', arc.inspection_id)
    const pdfBuf = Buffer.from(arc.pdf_base64, 'base64')

    const { data: photos } = await admin.from('photo_uploads').select('id, storage_path, inspection_item_id').like('storage_path', `%${arc.inspection_id}%`).order('uploaded_at', { ascending: true })
    if (!photos || photos.length === 0) {
      console.log('No photos found for inspection', arc.inspection_id)
      process.exit(0)
    }

    let embedded = 0
    for (const ph of photos) {
      try {
        const { data: dl, error: dlErr } = await admin.storage.from(BUCKET).download(ph.storage_path)
        if (dlErr) {
          console.error('Failed to download', ph.id, dlErr.message)
          continue
        }
        const imgBuf = Buffer.from(await dl.arrayBuffer())
        if (pdfBuf.indexOf(imgBuf) !== -1) {
          embedded += 1
          console.log('Found exact image bytes for', ph.id)
          continue
        }
        const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47])
        const jpgMagic = Buffer.from([0xff, 0xd8, 0xff])
        if (imgBuf.indexOf(pngMagic) !== -1 && pdfBuf.indexOf(pngMagic) !== -1) {
          embedded += 1
          console.log('Found PNG magic for', ph.id)
        } else if (imgBuf.indexOf(jpgMagic) !== -1 && pdfBuf.indexOf(jpgMagic) !== -1) {
          embedded += 1
          console.log('Found JPG magic for', ph.id)
        } else {
          console.error('Photo not found in PDF for', ph.id)
        }
      } catch (e) {
        console.error('Error verifying', ph.id, e && e.message ? e.message : e)
      }
    }

    console.log(`Embedded photos ${embedded} of ${photos.length}`)
    if (embedded !== photos.length) process.exit(2)
    console.log('All photos appear embedded in PDF')
    process.exit(0)
  } catch (e) {
    console.error('Verification failed', e && e.message ? e.message : e)
    process.exit(1)
  }
}

run()
