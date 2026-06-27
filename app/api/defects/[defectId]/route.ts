import { NextResponse } from 'next/server'
import { requireAuth, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { DefectSeverity, DefectStatus } from '@/lib/services/defects'
import { queueDefectStatusChangedNotification } from '@/lib/services/notifications'

type RouteContext = {
  params: Promise<{ defectId: string }>
}

const allowedStatuses: DefectStatus[] = ['Open', 'In Progress', 'Awaiting Parts', 'Resolved', 'Closed']
const allowedSeverities: DefectSeverity[] = ['Low', 'Medium', 'High', 'Critical']

function isAllowedStatus(value: string): value is DefectStatus {
  return allowedStatuses.includes(value as DefectStatus)
}

function isAllowedSeverity(value: string): value is DefectSeverity {
  return allowedSeverities.includes(value as DefectSeverity)
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const { defectId } = await context.params

  const { data: defectData, error: defectError } = await supabaseAdmin
    .from('defects')
    .select('id, machine_id, inspection_id, inspection_item_id, title, description, severity, status, assigned_to, created_by, created_at, updated_at, resolved_at, resolved_by, resolution_notes')
    .eq('id', defectId)
    .maybeSingle()

  if (defectError) {
    return NextResponse.json({ error: defectError.message }, { status: 500 })
  }

  if (!defectData) {
    return NextResponse.json({ error: 'Defect not found.' }, { status: 404 })
  }

  const [machineResult, inspectionResult, inspectionItemResult, profilesResult, usersResult] = await Promise.all([
    supabaseAdmin
      .from('machines')
      .select('id, name, area, code')
      .eq('id', defectData.machine_id as string)
      .maybeSingle(),
    supabaseAdmin
      .from('inspections')
      .select('id, template_name, status, started_at, completed_at')
      .eq('id', defectData.inspection_id as string)
      .maybeSingle(),
    supabaseAdmin
      .from('inspection_items')
      .select('id, question, answer, comments, question_type')
      .eq('id', defectData.inspection_item_id as string)
      .maybeSingle(),
    supabaseAdmin
      .from('profiles')
      .select('user_id, full_name, username')
      .in(
        'user_id',
        [
          defectData.assigned_to,
          defectData.created_by,
          defectData.resolved_by,
        ].filter((value): value is string => Boolean(value))
      ),
    supabaseAdmin
      .from('profiles')
      .select('user_id, full_name, username, active')
      .eq('active', true)
      .order('full_name', { ascending: true }),
  ])

  const profileByUserId = new Map<string, string>()
  for (const profile of profilesResult.data ?? []) {
    profileByUserId.set(profile.user_id, profile.full_name || profile.username || 'Unknown User')
  }

  return NextResponse.json({
    options: {
      statuses: allowedStatuses,
      severities: allowedSeverities,
      users: (usersResult.data ?? []).map((user) => ({
        userId: user.user_id as string,
        name: (user.full_name as string) || (user.username as string) || 'Unknown User',
      })),
    },
    defect: {
      id: defectData.id as string,
      title: defectData.title as string,
      description: (defectData.description as string | null) ?? null,
      severity: defectData.severity as DefectSeverity,
      status: defectData.status as DefectStatus,
      assignedTo: (defectData.assigned_to as string | null) ?? null,
      assignedToName: (defectData.assigned_to as string | null)
        ? profileByUserId.get(defectData.assigned_to as string) ?? 'Unknown User'
        : 'Unassigned',
      createdBy: defectData.created_by as string,
      createdByName: profileByUserId.get(defectData.created_by as string) ?? 'Unknown User',
      createdAt: defectData.created_at as string,
      updatedAt: defectData.updated_at as string,
      resolvedAt: (defectData.resolved_at as string | null) ?? null,
      resolvedBy: (defectData.resolved_by as string | null) ?? null,
      resolvedByName: (defectData.resolved_by as string | null)
        ? profileByUserId.get(defectData.resolved_by as string) ?? 'Unknown User'
        : null,
      resolutionNotes: (defectData.resolution_notes as string | null) ?? null,
      machine: machineResult.data
        ? {
            id: machineResult.data.id as string,
            name: machineResult.data.name as string,
            area: (machineResult.data.area as string) ?? '',
            assetId: (machineResult.data.code as string | null) ?? null,
          }
        : null,
      inspection: inspectionResult.data
        ? {
            id: inspectionResult.data.id as string,
            templateName: (inspectionResult.data.template_name as string | null) ?? 'Legacy Inspection',
            status: inspectionResult.data.status as string,
            startedAt: (inspectionResult.data.started_at as string | null) ?? null,
            completedAt: (inspectionResult.data.completed_at as string | null) ?? null,
          }
        : null,
      inspectionItem: inspectionItemResult.data
        ? {
            id: inspectionItemResult.data.id as string,
            question: inspectionItemResult.data.question as string,
            answer: (inspectionItemResult.data.answer as string | null) ?? null,
            comments: (inspectionItemResult.data.comments as string | null) ?? null,
            questionType: inspectionItemResult.data.question_type as string,
          }
        : null,
      timeline: [
        {
          key: 'created',
          label: 'Created',
          at: defectData.created_at as string,
          by: profileByUserId.get(defectData.created_by as string) ?? 'Unknown User',
        },
        {
          key: 'updated',
          label: 'Last Updated',
          at: defectData.updated_at as string,
          by: null,
        },
        {
          key: 'resolved',
          label: 'Resolved',
          at: (defectData.resolved_at as string | null) ?? null,
          by: (defectData.resolved_by as string | null)
            ? profileByUserId.get(defectData.resolved_by as string) ?? 'Unknown User'
            : null,
        },
      ],
    },
  })
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const { defectId } = await context.params

  const body = (await request.json()) as {
    status?: string
    severity?: string
    assigned_to?: string | null
    resolution_notes?: string | null
  }

  const updates: Record<string, string | null> = {}

  if (body.status !== undefined) {
    const nextStatus = body.status.trim()
    if (!isAllowedStatus(nextStatus)) {
      return NextResponse.json({ error: 'Invalid defect status.' }, { status: 400 })
    }

    updates.status = nextStatus

    if (nextStatus === 'Closed') {
      updates.resolved_at = new Date().toISOString()
      updates.resolved_by = auth.userId
    }
  }

  if (body.severity !== undefined) {
    const nextSeverity = body.severity.trim()
    if (!isAllowedSeverity(nextSeverity)) {
      return NextResponse.json({ error: 'Invalid defect severity.' }, { status: 400 })
    }

    updates.severity = nextSeverity
  }

  if (body.assigned_to !== undefined) {
    updates.assigned_to = body.assigned_to?.trim() ? body.assigned_to.trim() : null
  }

  if (body.resolution_notes !== undefined) {
    updates.resolution_notes = body.resolution_notes?.trim() || null
  }

  const { data: existingDefect, error: existingDefectError } = await supabaseAdmin
    .from('defects')
    .select('id, machine_id, status, assigned_to')
    .eq('id', defectId)
    .maybeSingle()

  if (existingDefectError) {
    return NextResponse.json({ error: existingDefectError.message }, { status: 500 })
  }

  if (!existingDefect) {
    return NextResponse.json({ error: 'Defect not found.' }, { status: 404 })
  }

  const { data: updatedDefect, error: updateError } = await supabaseAdmin
    .from('defects')
    .update(updates)
    .eq('id', defectId)
    .select('id, machine_id, status, severity, assigned_to, resolution_notes, updated_at, resolved_at, resolved_by')
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  if (
    body.status !== undefined &&
    existingDefect.status !== updatedDefect.status
  ) {
    await queueDefectStatusChangedNotification({
      defectId: updatedDefect.id as string,
      machineId: updatedDefect.machine_id as string,
      recipientUserId: (updatedDefect.assigned_to as string | null) ?? null,
      nextStatus: updatedDefect.status as string,
    })
  }

  return NextResponse.json({
    defect: {
      id: updatedDefect.id as string,
      status: updatedDefect.status as DefectStatus,
      severity: updatedDefect.severity as DefectSeverity,
      assignedTo: (updatedDefect.assigned_to as string | null) ?? null,
      resolutionNotes: (updatedDefect.resolution_notes as string | null) ?? null,
      updatedAt: updatedDefect.updated_at as string,
      resolvedAt: (updatedDefect.resolved_at as string | null) ?? null,
      resolvedBy: (updatedDefect.resolved_by as string | null) ?? null,
    },
  })
}
