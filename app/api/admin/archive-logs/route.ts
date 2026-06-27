import { NextResponse } from 'next/server'
import { requireAdmin, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!supabaseAdmin) return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })

  const url = new URL(request.url)
  const inspectionId = url.searchParams.get('inspection_id')?.trim() ?? ''

  let query = supabaseAdmin
    .from('archive_delivery_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (inspectionId) {
    query = query.eq('inspection_id', inspectionId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ logs: data ?? [] })
}
