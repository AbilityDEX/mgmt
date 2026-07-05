import { NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/admin'
import { getRetentionSettings, updateRetentionSettings } from '@/lib/services/retention'

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const settings = await getRetentionSettings()
    // compute some simple stats for the admin UI
    if (!supabaseAdmin) {
      return NextResponse.json({ settings, stats: { archivedCount: 0, pendingCount: 0 } })
    }

    const { data: archivedRows } = await supabaseAdmin.from('inspections').select('id', { count: 'exact' }).eq('archive_status', 'archived')
    const { data: pendingRows } = await supabaseAdmin.from('inspections').select('id', { count: 'exact' }).neq('archive_status', 'archived')

    return NextResponse.json({ settings, stats: { archivedCount: archivedRows?.length ?? 0, pendingCount: pendingRows?.length ?? 0 } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load settings.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json()) as {
    retentionDays?: number
    useCustom?: boolean
    customDays?: number | null
    maxDeliveryRetries?: number
  }

  try {
    const settings = await updateRetentionSettings(body)
    return NextResponse.json({ settings })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update settings.' }, { status: 500 })
  }
}
