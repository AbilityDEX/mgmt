import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAuthContext, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { canAccessInspection } from '@/lib/services/inspectionAccess'

const BUCKET = 'inspection-photos'
const MAX_BYTES = 10 * 1024 * 1024 // 10MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(request: Request) {
  const auth = await requireAuthContext(request)
  if ('error' in auth) {
    console.log('[upload] auth failure', { error: auth.error, status: auth.status })
    return NextResponse.json({ stage: 'authentication', error: auth.error, details: null }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    console.log('[upload] missing supabase admin client')
    return NextResponse.json({ stage: 'server_config', error: serverConfigErrorMessage, details: null }, { status: 500 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch (err) {
    console.log('[upload] invalid form data', { err })
    return NextResponse.json({ stage: 'parse_form', error: 'Invalid form data', details: String(err) }, { status: 400 })
  }

  const inspectionId = (form.get('inspectionId') as string) ?? ''
  const inspectionItemId = (form.get('inspectionItemId') as string) ?? ''
  const caption = (form.get('caption') as string) ?? null

  if (!inspectionId) {
    console.log('[upload] missing inspectionId')
    return NextResponse.json({ stage: 'validation', error: 'inspectionId is required', details: null }, { status: 400 })
  }

  if (!inspectionItemId) {
    console.log('[upload] missing inspectionItemId')
    return NextResponse.json({ stage: 'validation', error: 'inspectionItemId is required', details: null }, { status: 400 })
  }

  // Authorization: user must be able to access the inspection
  try {
    const access = await canAccessInspection(auth, inspectionId)
    console.log('[upload] access check', { access })
    if (!access.allowed && !auth.isAdmin) {
      console.log('[upload] forbidden access', { allowed: access.allowed })
      return NextResponse.json({ stage: 'authorization', error: 'Forbidden', details: null }, { status: 403 })
    }

    const machineId = access.machineId
    if (!machineId) {
      console.log('[upload] inspection not found for id', { inspectionId })
      return NextResponse.json({ stage: 'authorization', error: 'Inspection not found', details: null }, { status: 404 })
    }

    // Validate inspection item exists and belongs to the inspection
    const { data: itemRow, error: itemError } = await supabaseAdmin
      .from('inspection_items')
      .select('id, inspection_id')
      .eq('id', inspectionItemId)
      .eq('inspection_id', inspectionId)
      .maybeSingle()

    if (itemError) {
      console.log('[upload] item lookup error', { itemError })
      return NextResponse.json({ stage: 'db_lookup', error: itemError.message, details: JSON.stringify(itemError) }, { status: 500 })
    }

    if (!itemRow) {
      console.log('[upload] inspection item not found', { inspectionItemId })
      return NextResponse.json({ stage: 'db_lookup', error: 'Inspection item not found', details: null }, { status: 404 })
    }

    // Accept file input named `file` (multipart/form-data)
    const maybeFile = form.get('file') as any
    let mimeType: string | null = null
    let buffer: Buffer | null = null

    if (maybeFile && typeof maybeFile.arrayBuffer === 'function') {
      const arrayBuffer = await maybeFile.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
      mimeType = maybeFile.type || null
    } else {
      // Fallback: support a DataURL field named `dataUrl`
      const dataUrl = (form.get('dataUrl') as string) ?? ''
      if (!dataUrl) {
        console.log('[upload] no file provided (dataUrl)')
        return NextResponse.json({ stage: 'file', error: 'No file provided', details: null }, { status: 400 })
      }

      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl)
      if (!match) {
        console.log('[upload] invalid data url')
        return NextResponse.json({ stage: 'file', error: 'Invalid data URL', details: null }, { status: 400 })
      }
      mimeType = match[1]
      const b = Buffer.from(match[2], 'base64')
      buffer = b
    }

    if (!buffer || !mimeType) {
      console.log('[upload] invalid file upload', { bufferExists: !!buffer, mimeType })
      return NextResponse.json({ stage: 'file', error: 'Invalid file upload', details: null }, { status: 400 })
    }

    if (!ALLOWED.has(mimeType)) {
      console.log('[upload] unsupported mime type', { mimeType })
      return NextResponse.json({ stage: 'file', error: 'Unsupported file type', details: mimeType }, { status: 415 })
    }

    if (buffer.byteLength > MAX_BYTES) {
      console.log('[upload] file too large', { size: buffer.byteLength })
      return NextResponse.json({ stage: 'file', error: 'File too large', details: { size: buffer.byteLength } }, { status: 413 })
    }

    // Build storage path: machine-id/inspection-id/inspection-item-id/uuid.ext
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
    const filename = `${randomUUID()}.${ext}`
    const storagePath = `${machineId}/${inspectionId}/${inspectionItemId}/${filename}`

    // Log file details
    console.log('[upload] proceeding', { userId: auth.userId, inspectionId, inspectionItemId, filename, size: buffer.byteLength, mimeType, machineId })

    // Check bucket exists
    let bucketExists = false
    try {
      const bucketRes = await supabaseAdmin.storage.getBucket(BUCKET)
      bucketExists = !!(bucketRes && (bucketRes as any).data)
      console.log('[upload] bucket check', { bucketRes })
    } catch (e) {
      console.log('[upload] bucket check error', { e })
    }

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType })

    console.log('[upload] storage upload result', { uploadData, uploadError })
    if (uploadError) {
      return NextResponse.json({ stage: 'storage_upload', error: uploadError.message, details: JSON.stringify(uploadError), bucketExists }, { status: 500 })
    }

    // Insert metadata row
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('photo_uploads')
      .insert([
        {
          inspection_item_id: inspectionItemId,
          storage_path: storagePath,
          caption: caption ?? null,
          uploaded_by: auth.userId,
        },
      ])
      .select('id, uploaded_at')
      .maybeSingle()

    if (insertError) {
      console.log('[upload] insert error', { insertError })
      // Attempt to cleanup the uploaded object
      try {
        await supabaseAdmin.storage.from(BUCKET).remove([storagePath])
      } catch (e) {
        console.log('[upload] cleanup error', { e })
      }
      return NextResponse.json({ stage: 'db_insert', error: insertError.message, details: JSON.stringify(insertError) }, { status: 500 })
    }

    console.log('[upload] db insert result', { inserted })

    // Create a short-lived signed URL to return
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60)

    if (signedError || !signed) {
      console.log('[upload] signed url error', { signedError })
      return NextResponse.json({ stage: 'signed_url', error: signedError?.message ?? 'Failed to create access URL', details: JSON.stringify(signedError) }, { status: 500 })
    }

    const responseBody = {
      photo: {
        id: (inserted as any)?.id ?? null,
        url: signed.signedUrl,
        uploadedAt: (inserted as any)?.uploaded_at ?? new Date().toISOString(),
        caption: caption ?? null,
      },
    }
    console.log('[upload] success', { userId: auth.userId, inspectionId, inspectionItemId, storagePath, responseBody })
    return NextResponse.json(responseBody)
  } catch (err) {
    console.log('[upload] unexpected error', { err })
    return NextResponse.json({ stage: 'unexpected', error: err instanceof Error ? err.message : 'Upload failed', details: String(err) }, { status: 500 })
  }
}
