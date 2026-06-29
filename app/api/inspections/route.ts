import { NextResponse } from 'next/server'
import { requireAdmin, requireAuthContext, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { canAccessMachine } from '@/lib/services/inspectionAccess'
import { archiveInspectionAndSendEmail } from '@/lib/services/archivePipeline'
import { userActivityFallback } from '@/lib/services/userActivityFallback'

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  // Ensure daily maintenance has completed
  await userActivityFallback.triggerMaintenanceFallbackIfNeeded(supabaseAdmin, false)

  const url = new URL(request.url)
  const failedOnly = url.searchParams.get('failed') === 'true'

  const { data, error } = await supabaseAdmin
    .from('inspections')
    .select('id, machine_id, template_name, status, started_at, completed_at, started_by, operator_name')
    .eq('status', 'Completed')
    .order('completed_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const inspections = data ?? []
  const machineIds = Array.from(new Set(inspections.map((row) => row.machine_id as string).filter(Boolean)))
  const startedByIds = Array.from(new Set(inspections.map((row) => row.started_by as string | null).filter(Boolean)))
  const inspectionIds = inspections.map((row) => row.id as string)

  const machineById = new Map<string, { name: string; registrationNumber: string | null }>()
  if (machineIds.length > 0) {
    const { data: machinesData } = await supabaseAdmin
      .from('machines')
      .select('id, name, code')
      .in('id', machineIds)

    for (const machine of machinesData ?? []) {
      machineById.set(machine.id as string, {
        name: (machine.name as string) || 'Unknown Machine',
        registrationNumber: (machine.code as string | null) ?? null,
      })
    }
  }

  const fullNameByUserId = new Map<string, string>()
  if (startedByIds.length > 0) {
    const { data: profilesData } = await supabaseAdmin
      .from('profiles')
      .select('user_id, full_name, username')
      .in('user_id', startedByIds)

    for (const profile of profilesData ?? []) {
      fullNameByUserId.set(
        profile.user_id as string,
        (profile.full_name as string | null) || (profile.username as string | null) || 'Unknown User'
      )
    }
  }

  const passCountByInspectionId = new Map<string, number>()
  const failCountByInspectionId = new Map<string, number>()
  const incompleteCountByInspectionId = new Map<string, number>()

  if (inspectionIds.length > 0) {
    const { data: itemsData } = await supabaseAdmin
      .from('inspection_items')
      .select('inspection_id, answer')
      .in('inspection_id', inspectionIds)

    for (const item of itemsData ?? []) {
      const inspectionId = item.inspection_id as string
      const answer = (item.answer as string | null) ?? null

      if (answer === 'pass') {
        passCountByInspectionId.set(inspectionId, (passCountByInspectionId.get(inspectionId) ?? 0) + 1)
      } else if (answer === 'fail') {
        failCountByInspectionId.set(inspectionId, (failCountByInspectionId.get(inspectionId) ?? 0) + 1)
      } else {
        incompleteCountByInspectionId.set(
          inspectionId,
          (incompleteCountByInspectionId.get(inspectionId) ?? 0) + 1
        )
      }
    }
  }

  const result = inspections
    .map((row) => {
      const machineId = row.machine_id as string
      const passCount = passCountByInspectionId.get(row.id as string) ?? 0
      const failCount = failCountByInspectionId.get(row.id as string) ?? 0
      const incompleteCount = incompleteCountByInspectionId.get(row.id as string) ?? 0
      const overallResult = failCount > 0 ? 'FAIL' : incompleteCount > 0 ? 'INCOMPLETE' : 'PASS'

      return {
        id: row.id as string,
        machineId,
        machineName: machineById.get(machineId)?.name ?? 'Unknown Machine',
        registrationNumber: machineById.get(machineId)?.registrationNumber ?? null,
        templateName: (row.template_name as string | null) ?? 'Legacy Inspection',
        startedAt: (row.started_at as string | null) ?? null,
        completedAt: (row.completed_at as string | null) ?? null,
        completedBy:
          (row.started_by as string | null)
            ? fullNameByUserId.get(row.started_by as string) ?? (row.operator_name as string | null) ?? 'Unknown User'
            : (row.operator_name as string | null) ?? 'Unknown User',
        overallResult,
        passCount,
        failCount,
        incompleteCount,
      }
    })
    .filter((row) => (failedOnly ? row.overallResult === 'FAIL' : true))

  return NextResponse.json({ inspections: result })
}

export async function POST(request: Request) {
  const auth = await requireAuthContext(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const body = (await request.json()) as {
    machine_id: string
    operator_name: string
    checklist: unknown[]
  }

  if (!body.machine_id || !body.operator_name || !Array.isArray(body.checklist)) {
    return NextResponse.json(
      { error: 'machine_id, operator_name, and checklist are required' },
      { status: 400 }
    )
  }

  if (!auth.isAdmin) {
    const access = await canAccessMachine(auth, body.machine_id)
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason === 'not_found' ? 'Machine not found.' : 'Forbidden' }, { status: access.reason === 'not_found' ? 404 : 403 })
    }
  }

  const { data, error } = await supabaseAdmin
    .from('inspections')
    .insert([
      {
        machine_id: body.machine_id,
        operator_id: auth.userId,
        operator_name: body.operator_name,
        completed_at: new Date().toISOString(),
        status: 'Completed',
        archive_status: 'pending',
        checklist: body.checklist,
      },
    ])
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update machine status to Completed
  await supabaseAdmin
    .from('machines')
    .update({ status: 'Completed' })
    .eq('id', body.machine_id)

  const inspectionId = (data as Record<string, unknown>).id as string

  let archiveWarning: string | null = null
  try {
    await archiveInspectionAndSendEmail({ inspectionId, triggeredBy: auth.userId })
  } catch (archiveError) {
    archiveWarning = archiveError instanceof Error ? archiveError.message : 'Inspection archived delivery failed.'
  }

  return NextResponse.json({
    inspection: {
      id: inspectionId,
      machineId: body.machine_id,
      operatorName: body.operator_name,
      archiveStatus: archiveWarning ? 'failed' : 'archived',
    },
    warning: archiveWarning,
  })
}
