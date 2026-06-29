import { NextResponse } from 'next/server'
import { requireAuthContext, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { activeDefectStatuses, DefectStatus } from '@/lib/services/defects'

export async function GET(request: Request) {
  const auth = await requireAuthContext(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const { data: defectsData, error: defectsError } = await supabaseAdmin
    .from('defects')
    .select('id, machine_id, severity, status, resolved_at')

  if (defectsError) {
    return NextResponse.json({ error: defectsError.message }, { status: 500 })
  }

  let defects = defectsData ?? []

  if (!auth.isAdmin) {
    const { data: machineRows } = await supabaseAdmin
      .from('machines')
      .select('id')
      .eq('assigned_user', auth.username ?? '')

    const allowedMachineIds = new Set((machineRows ?? []).map((row) => row.id as string))
    defects = defects.filter((defect) => allowedMachineIds.has(defect.machine_id as string))
  }

  const openDefects = defects.filter((defect) =>
    activeDefectStatuses.includes(defect.status as DefectStatus)
  )

  const criticalDefects = openDefects.filter((defect) => defect.severity === 'Critical')

  const recentlyClosed = defects.filter((defect) => {
    if (defect.status !== 'Closed' || !defect.resolved_at) return false
    const resolvedAt = new Date(defect.resolved_at)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    return resolvedAt >= sevenDaysAgo
  })

  const machinesWithActiveDefects = new Set(openDefects.map((defect) => defect.machine_id as string))

  return NextResponse.json({
    widgets: {
      openDefects: openDefects.length,
      criticalDefects: criticalDefects.length,
      recentlyClosed: recentlyClosed.length,
      machinesWithActiveDefects: machinesWithActiveDefects.size,
    },
  })
}
