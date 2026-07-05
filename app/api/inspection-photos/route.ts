import { NextResponse } from 'next/server'
import { supabaseAdmin, requireAuth } from '@/lib/admin'

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  const admin = supabaseAdmin

  const body = await request.json()
  const { inspection_id, inspection_item_id, machine_id, storage_path, original_filename, file_size, mime_type } = body

  if (!inspection_id || !inspection_item_id || !machine_id || !storage_path) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data, error } = await admin!.from('inspection_photos').insert([
    {
      inspection_id,
      inspection_item_id,
      machine_id,
      storage_path,
      original_filename: original_filename ?? null,
      file_size: file_size ?? null,
      mime_type: mime_type ?? null,
      uploaded_by: auth.userId,
    },
  ]).select('*').maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ photo: data })
}

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const url = new URL(request.url)
  const inspection_id = url.searchParams.get('inspection_id')
  const inspection_item_id = url.searchParams.get('inspection_item_id')

  const admin = supabaseAdmin
  let query = admin!.from('inspection_photos').select('*')
  if (inspection_item_id) query = query.eq('inspection_item_id', inspection_item_id)
  else if (inspection_id) query = query.eq('inspection_id', inspection_id)

  const { data, error } = await query.order('uploaded_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Generate signed URLs for each photo (10 minutes)
  const bucket = 'inspection-photos'
  const photos = await Promise.all((data ?? []).map(async (row: any) => {
    let url = null
    try {
      const { data: signed, error: urlErr } = await admin!.storage.from(bucket).createSignedUrl(row.storage_path, 600)
      if (!urlErr && signed?.signedUrl) url = signed.signedUrl
    } catch (e) {
      // ignore
    }
    return { ...row, url }
  }))

  return NextResponse.json({ photos })
}
