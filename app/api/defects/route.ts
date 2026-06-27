import { NextResponse } from 'next/server'
import { requireAuth, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { activeDefectStatuses, DefectSeverity, DefectStatus } from '@/lib/services/defects'

const allowedStatuses: DefectStatus[] = ['Open', 'In Progress', 'Awaiting Parts', 'Resolved', 'Closed']
const allowedSeverities: DefectSeverity[] = ['Low', 'Medium', 'High', 'Critical']

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const url = new URL(request.url)
  const search = url.searchParams.get('search')?.trim() ?? ''
  const status = url.searchParams.get('status')?.trim() ?? ''
  const severity = url.searchParams.get('severity')?.trim() ?? ''
  const machineId = url.searchParams.get('machine_id')?.trim() ?? ''
  const openOnly = url.searchParams.get('open_only') === 'true'

  let query = supabaseAdmin
    .from('defects')
    .select('id, machine_id, inspection_id, inspection_item_id, title, description, severity, status, assigned_to, created_by, created_at, updated_at, resolved_at, resolved_by, resolution_notes')
    .order('created_at', { ascending: false })

  if (machineId) {
    query = query.eq('machine_id', machineId)
  }

  if (status && allowedStatuses.includes(status as DefectStatus)) {
    query = query.eq('status', status)
  }

  if (severity && allowedSeverities.includes(severity as DefectSeverity)) {
    query = query.eq('severity', severity)
  }

  if (openOnly) {
    query = query.in('status', activeDefectStatuses)
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
  }

  const { data: defectsData, error: defectsError } = await query

  if (defectsError) {
    return NextResponse.json({ error: defectsError.message }, { status: 500 })
  }

  const defects = defectsData ?? []
  const machineIds = Array.from(new Set(defects.map((defect) => defect.machine_id as string)))
  const userIds = Array.from(
    new Set(
      defects
        .flatMap((defect) => [
          defect.assigned_to as string | null,
          defect.created_by as string | null,
          defect.resolved_by as string | null,
        ])
        .filter((value): value is string => Boolean(value))
    )
  )

  const machineById = new Map<string, { name: string; area: string; assetId: string | null }>()
  if (machineIds.length > 0) {
    const { data: machinesData } = await supabaseAdmin
      .from('machines')
      .select('id, name, area, code')
      .in('id', machineIds)

    for (const machine of machinesData ?? []) {
      machineById.set(machine.id, {
        name: machine.name,
        area: machine.area ?? '',
        assetId: machine.code ?? null,
      })
    }
  }

  const profileByUserId = new Map<string, { fullName: string }>()
  if (userIds.length > 0) {
    const { data: profilesData } = await supabaseAdmin
      .from('profiles')
      .select('user_id, full_name, username')
      .in('user_id', userIds)

    for (const profile of profilesData ?? []) {
      profileByUserId.set(profile.user_id, {
        fullName: profile.full_name || profile.username || 'Unknown User',
      })
    }
  }

  const { data: allMachinesData } = await supabaseAdmin
    .from('machines')
    .select('id, name')
    .order('name', { ascending: true })

  return NextResponse.json({
    filters: {
      statuses: allowedStatuses,
      severities: allowedSeverities,
      machines: (allMachinesData ?? []).map((machine) => ({
        id: machine.id as string,
        name: machine.name as string,
      })),
    },
    defects: defects.map((defect) => {
      const machine = machineById.get(defect.machine_id as string)
      const assigned = (defect.assigned_to as string | null)
        ? profileByUserId.get(defect.assigned_to as string)
        : null

      return {
        id: defect.id as string,
        machineId: defect.machine_id as string,
        machineName: machine?.name || 'Unknown Machine',
        inspectionId: defect.inspection_id as string,
        inspectionItemId: defect.inspection_item_id as string,
        title: defect.title as string,
        description: (defect.description as string | null) ?? null,
        severity: defect.severity as DefectSeverity,
        status: defect.status as DefectStatus,
        assignedTo: (defect.assigned_to as string | null) ?? null,
        assignedToName: assigned?.fullName ?? 'Unassigned',
        createdBy: defect.created_by as string,
        createdAt: defect.created_at as string,
        updatedAt: defect.updated_at as string,
        resolvedAt: (defect.resolved_at as string | null) ?? null,
      }
    }),
  })
}
