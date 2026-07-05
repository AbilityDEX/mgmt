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
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch (err) {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const inspectionId = (form.get('inspectionId') as string) ?? ''
  const inspectionItemId = (form.get('inspectionItemId') as string) ?? ''
  const caption = (form.get('caption') as string) ?? null

  if (!inspectionId) {
    return NextResponse.json({ error: 'inspectionId is required' }, { status: 400 })
  }

  if (!inspectionItemId) {
    return NextResponse.json({ error: 'inspectionItemId is required' }, { status: 400 })
  }

  // Authorization: user must be able to access the inspection
  try {
    const access = await canAccessInspection(auth, inspectionId)
    if (!access.allowed && !auth.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const machineId = access.machineId
    if (!machineId) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
    }

    // Validate inspection item exists and belongs to the inspection
    const { data: itemRow, error: itemError } = await supabaseAdmin
      .from('inspection_items')
      .select('id, inspection_id')
      .eq('id', inspectionItemId)
      .eq('inspection_id', inspectionId)
      .maybeSingle()

    if (itemError) {
      return NextResponse.json({ error: itemError.message }, { status: 500 })
    }

    if (!itemRow) {
      return NextResponse.json({ error: 'Inspection item not found' }, { status: 404 })
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
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }

      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl)
      if (!match) {
        return NextResponse.json({ error: 'Invalid data URL' }, { status: 400 })
      }
      mimeType = match[1]
      const b = Buffer.from(match[2], 'base64')
      buffer = b
    }

    if (!buffer || !mimeType) {
      return NextResponse.json({ error: 'Invalid file upload' }, { status: 400 })
    }

    if (!ALLOWED.has(mimeType)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 })
    }

    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 })
    }

    // Build storage path: machine-id/inspection-id/inspection-item-id/uuid.ext
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
    const filename = `${randomUUID()}.${ext}`
    const storagePath = `${machineId}/${inspectionId}/${inspectionItemId}/${filename}`

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
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
      // Attempt to cleanup the uploaded object
      try {
        await supabaseAdmin.storage.from(BUCKET).remove([storagePath])
      } catch (e) {
        // ignore cleanup errors
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Create a short-lived signed URL to return
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60)

    if (signedError || !signed) {
      return NextResponse.json({ error: signedError?.message ?? 'Failed to create access URL' }, { status: 500 })
    }

    return NextResponse.json({
      photo: {
        id: (inserted as any)?.id ?? null,
        url: signed.signedUrl,
        uploadedAt: (inserted as any)?.uploaded_at ?? new Date().toISOString(),
        caption: caption ?? null,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 })
  }
}
