import fs from 'fs'
import path from 'path'
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
    process.env[key] = val.replace(/^"|"$/g, '')
  }
} catch (e) {
  // ignore
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE env vars')
  process.exit(2)
}

const admin = createClient(supabaseUrl, serviceKey)

async function run() {
  const latest = await admin.from('inspection_archives').select('pdf_base64, file_name, inspection_id').order('generated_at', { ascending: false }).limit(1).maybeSingle()
  if (!latest.data || !latest.data.pdf_base64) {
    console.error('No latest PDF found to test')
    process.exit(1)
  }

  const pdfBuffer = Buffer.from(latest.data.pdf_base64, 'base64')

  try {
    // runtime require as used in systemHealth; ESM context doesn't have `require`,
    // so use dynamic import of the file URL as a fallback for this test script.
    let pdfParseModule
    try {
      // Try to use require if available
      // eslint-disable-next-line no-eval
      const runtimeRequire = eval('require')
      const pdfCjsPath = path.join(process.cwd(), 'node_modules', 'pdf-parse', 'dist', 'pdf-parse', 'cjs', 'index.cjs')
      pdfParseModule = runtimeRequire(pdfCjsPath)
    } catch (e) {
      // Fallback: import the ESM index (node-compatible) dynamically
      pdfParseModule = await import('pdf-parse/dist/pdf-parse/esm/index.js')
    }
    const { PDFParse } = pdfParseModule
    const parser = new PDFParse({ data: pdfBuffer })
    const parsed = await parser.getText()
    console.log('Parsed text length:', parsed.text.length)
    console.log('Sample:', parsed.text.slice(0, 300))
  } catch (err) {
    console.error('PDF parse failed:', err)
    process.exit(1)
  }
}

run().catch((e) => { console.error(e); process.exit(1) })
