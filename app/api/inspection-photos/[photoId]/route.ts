import { NextResponse } from 'next/server'
import { supabaseAdmin, requireAuth, requireAuthContext } from '@/lib/admin'

export async function DELETE(request: Request, context: any) {
  const auth = await requireAuthContext(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const paramsObj = context?.params instanceof Promise ? await context.params : context?.params
  const photoId = paramsObj?.photoId
  if (!photoId) return NextResponse.json({ error: 'Missing photo id' }, { status: 400 })
  const { data: existing, error: selectErr } = await supabaseAdmin.from('inspection_photos').select('*').eq('id', photoId).maybeSingle()
  if (selectErr) return NextResponse.json({ error: selectErr.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only uploader or admin can delete
  if (existing.uploaded_by !== auth.userId && !auth.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Soft delete metadata; don't remove storage by default
  const { error } = await supabaseAdmin.from('inspection_photos').update({ active: false }).eq('id', photoId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
