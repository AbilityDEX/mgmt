import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { createArchivePDF } from '../lib/services/pdf.js'

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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE env vars')
  process.exit(2)
}
const admin = createClient(supabaseUrl, serviceKey)
const BUCKET = 'inspection-photos'

async function run() {
  try {
    // find a recent photo_uploads row
    const { data: photos } = await admin.from('photo_uploads').select('id, storage_path, inspection_item_id, uploaded_at').order('uploaded_at', { ascending: false }).limit(1)
    if (!photos || photos.length === 0) {
      console.error('No photos found')
      process.exit(1)
    }
    const ph = photos[0]
    console.log('Testing photo', ph.id, ph.storage_path)

    // create signed url
    const { data: signed, error: sErr } = await admin.storage.from(BUCKET).createSignedUrl(ph.storage_path, 60 * 60)
    if (sErr) throw sErr
    console.log('Signed URL:', signed.signedUrl)

    // download original bytes
    const { data: dl, error: dlErr } = await admin.storage.from(BUCKET).download(ph.storage_path)
    if (dlErr) throw dlErr
    const imgBuf = Buffer.from(await dl.arrayBuffer())
    console.log('Original image bytes', imgBuf.length)

    // create PDF
    const input = {
      company: { companyName: 'Test Co' },
      reportTitle: 'Test PDF',
      machineName: 'Machine',
      assetId: null,
      department: null,
      templateName: 'Template',
      inspector: 'E2E',
      startedAt: null,
      completedAt: new Date().toISOString(),
      result: 'PASS',
      reference: 'test-ref',
      items: [
        {
          displayOrder: 1,
          question: 'Photo Test',
          answer: 'N/A',
          comments: null,
          photos: [{ id: ph.id, url: signed.signedUrl, uploadedAt: ph.uploaded_at, caption: null }],
          signatureData: null,
        },
      ],
      defects: [],
    }

    const pdfBuf = await createArchivePDF(input)
    console.log('PDF bytes', pdfBuf.length)

    // check for exact bytes
    if (pdfBuf.indexOf(imgBuf) !== -1) {
      console.log('Exact image bytes present in PDF')
      process.exit(0)
    }
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const jpgMagic = Buffer.from([0xff, 0xd8, 0xff])
    if (imgBuf.indexOf(pngMagic) !== -1 && pdfBuf.indexOf(pngMagic) !== -1) {
      console.log('PNG magic found in PDF')
      process.exit(0)
    }
    if (imgBuf.indexOf(jpgMagic) !== -1 && pdfBuf.indexOf(jpgMagic) !== -1) {
      console.log('JPG magic found in PDF')
      process.exit(0)
    }
    console.error('Image does not appear embedded in PDF')
    // write pdf to disk for manual inspection
    fs.writeFileSync('debug.pdf', pdfBuf)
    fs.writeFileSync('debug.png', imgBuf)
    process.exit(2)
  } catch (e) {
    console.error('test failed', e && e.message ? e.message : e)
    process.exit(1)
  }
}

run()
