import { NextResponse } from 'next/server'
import { requireAuthContext, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'

const BUCKET = 'inspection-photos'

type RouteContext = { params: Promise<{ photoId: string }> }

export async function DELETE(request: Request, context: RouteContext) {
  const params = await context.params
  const auth = await requireAuthContext(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })

  const { photoId } = params
  if (!photoId) return NextResponse.json({ error: 'photoId required' }, { status: 400 })

  // Lookup photo row
  const { data: rows, error: qErr } = await supabaseAdmin.from('photo_uploads').select('id, storage_path, uploaded_by').eq('id', photoId).maybeSingle()
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  if (!rows) return NextResponse.json({ error: 'Photo not found' }, { status: 404 })

  const storagePath = (rows as any).storage_path as string | null
  const uploadedBy = (rows as any).uploaded_by as string | null

  // Authorization: allow if admin or owner
  if (!auth.isAdmin && auth.userId !== uploadedBy) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete storage object first
  try {
    if (storagePath) {
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath])
    }
  } catch (e) {
    // Log but continue to attempt DB delete
    console.log('[photo-delete] storage remove error', e)
  }

  const { error: delErr } = await supabaseAdmin.from('photo_uploads').delete().eq('id', photoId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ deleted: true })
}
