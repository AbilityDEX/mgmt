import { NextResponse } from 'next/server'
import { requireAuthContext, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { combineLondonDateAndTime, formatInspectionDateTime, startOfLondonDay } from '@/lib/inspectionTime'
import { canAccessMachine } from '@/lib/services/inspectionAccess'
import { buildInspectionGenerationKey } from '@/lib/services/schedulerKeys'
import { repairInspectionScheduleCoverage, runInspectionScheduler } from '@/lib/services/inspectionScheduling'
import { trackInspectionEvent } from '@/lib/services/inspectionMetrics'
import { userActivityFallback } from '@/lib/services/userActivityFallback'

type InspectionStatus = 'Draft' | 'In Progress' | 'Completed' | 'Cancelled'
type InspectionResult = 'PASS' | 'FAIL' | 'INCOMPLETE'

type SnapshotTemplateItem = {
  id: string
  display_order: number
  question: string
  question_type: string
  required: boolean
}

type ScheduleRow = {
  machine_template_id: string
  next_due: string
  active: boolean
}

function formatDateTime(value: string | null) {
  return formatInspectionDateTime(value)
}

export async function GET(request: Request) {
  const auth = await requireAuthContext(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  // Ensure daily maintenance has completed
  await userActivityFallback.triggerMaintenanceFallbackIfNeeded(supabaseAdmin, false)

  const url = new URL(request.url)
  const machineId = url.searchParams.get('machine_id')

  // VALIDATION: machineId must be valid before proceeding
  if (!machineId || machineId === 'undefined' || machineId === '') {
    return NextResponse.json({ error: 'Invalid machine_id parameter. Received: ' + JSON.stringify(machineId) }, { status: 400 })
  }

  if (!auth.isAdmin) {
    const access = await canAccessMachine(auth, machineId)
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason === 'not_found' ? 'Machine not found.' : 'Forbidden' }, { status: access.reason === 'not_found' ? 404 : 403 })
    }
  }

  const { data: inspectionsData, error: inspectionsError } = await supabaseAdmin
    .from('inspections')
    .select('id, machine_id, template_name, status, started_at, completed_at, started_by, operator_name, is_overdue, due_at')
    .eq('machine_id', machineId)
    .order('created_at', { ascending: false })

  if (inspectionsError) {
    return NextResponse.json({ error: inspectionsError.message }, { status: 500 })
  }

  const { data: machineData, error: machineError } = await supabaseAdmin
    .from('machines')
    .select('id, name, area, status, code, inspection_deadline')
    .eq('id', machineId)
    .maybeSingle()

  if (machineError) {
    return NextResponse.json({ error: machineError.message }, { status: 500 })
  }

  const { data: assignmentsData, error: assignmentsError } = await supabaseAdmin
    .from('machine_inspection_templates')
    .select('id, template_id, inspection_frequency, active')
    .eq('machine_id', machineId)
    .eq('active', true)

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 500 })
  }

  const templateIds = (assignmentsData ?? []).map((a) => a.template_id as string)
  const assignmentIds = (assignmentsData ?? []).map((a) => a.id as string)
  const templatesById = new Map<string, { id: string; name: string }>()

  if (templateIds.length > 0) {
    const { data: templatesData, error: templatesError } = await supabaseAdmin
      .from('checklist_templates')
      .select('id, name')
      .in('id', templateIds)

    if (templatesError) {
    } else {
      for (const template of templatesData ?? []) {
        templatesById.set(template.id as string, {
          id: template.id as string,
          name: (template.name as string) || 'Unnamed',
        })
      }
    }
  }

  const scheduleByAssignmentId = new Map<string, ScheduleRow>()
  if (assignmentIds.length > 0) {
    const { data: schedulesData } = await supabaseAdmin
      .from('inspection_schedules')
      .select('machine_template_id, next_due, active')
      .in('machine_template_id', assignmentIds)
      .eq('active', true)

    for (const schedule of (schedulesData ?? []) as ScheduleRow[]) {
      scheduleByAssignmentId.set(schedule.machine_template_id, schedule)
    }
  }

  let nextScheduledAt: string | null = null
  let nextScheduledStatus: string | null = null
  if ((assignmentsData ?? []).length > 0) {
    const assignmentIds = (assignmentsData ?? []).map((assignment) => assignment.id as string)
    if (assignmentIds.length > 0) {
      const { data: nextScheduleData } = await supabaseAdmin
        .from('inspection_schedules')
        .select('next_due, active')
        .in('machine_template_id', assignmentIds)
        .eq('active', true)
        .order('next_due', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (nextScheduleData?.next_due) {
        const dueDate = combineLondonDateAndTime(
          new Date(nextScheduleData.next_due as string),
          (machineData?.inspection_deadline as string | null | undefined) ?? '09:00'
        )
        nextScheduledAt = dueDate.toISOString()
        const now = new Date()
        nextScheduledStatus = dueDate < now ? 'Overdue' : 'Scheduled'
      }
    }
  }

  const inspections = inspectionsData ?? []
  const inspectionIds = inspections.map((inspection) => inspection.id as string)
  const userIds = Array.from(
    new Set(
      inspections
        .map((inspection) => inspection.started_by as string | null)
        .filter((value): value is string => Boolean(value))
    )
  )

  const failedItemCountByInspectionId = new Map<string, number>()
  const passedItemCountByInspectionId = new Map<string, number>()
  const defectCountByInspectionId = new Map<string, number>()

  if (inspectionIds.length > 0) {
    const { data: inspectionItemsData } = await supabaseAdmin
      .from('inspection_items')
      .select('inspection_id, answer')
      .in('inspection_id', inspectionIds)

    for (const row of inspectionItemsData ?? []) {
      const key = row.inspection_id as string
      const answer = (row.answer as string | null) ?? null
      if (answer === 'pass') {
        passedItemCountByInspectionId.set(key, (passedItemCountByInspectionId.get(key) ?? 0) + 1)
      } else if (answer === 'fail') {
        failedItemCountByInspectionId.set(key, (failedItemCountByInspectionId.get(key) ?? 0) + 1)
      }
    }

    const { data: defectsData } = await supabaseAdmin
      .from('defects')
      .select('inspection_id')
      .in('inspection_id', inspectionIds)

    for (const row of defectsData ?? []) {
      const key = row.inspection_id as string
      defectCountByInspectionId.set(key, (defectCountByInspectionId.get(key) ?? 0) + 1)
    }
  }

  const startedByName = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('user_id, full_name, username')
      .in('user_id', userIds)

    for (const profile of profiles ?? []) {
      startedByName.set(profile.user_id, profile.full_name || profile.username || 'Unknown User')
    }
  }

  return NextResponse.json({
    machine: machineData
      ? {
          id: machineData.id as string,
          name: machineData.name as string,
          area: (machineData.area as string) ?? '',
          registrationNumber: (machineData.code as string | null) ?? null,
          status: (machineData.status as string) ?? 'Not Started',
          nextScheduledAt,
          nextScheduledStatus,
        }
      : null,
    assignedTemplates: (assignmentsData ?? []).map((assignment) => {
      const template = templatesById.get(assignment.template_id as string)
      const schedule = scheduleByAssignmentId.get(assignment.id as string)
      const nextDue = schedule?.next_due
        ? combineLondonDateAndTime(
            new Date(schedule.next_due),
            (machineData?.inspection_deadline as string | null | undefined) ?? '09:00'
          ).toISOString()
        : null
      const now = new Date()
      const isLocked = Boolean(nextDue && startOfLondonDay(new Date(nextDue)) > now)

      return {
        templateId: assignment.template_id as string,
        templateName: template?.name || 'Unnamed Template',
        inspectionFrequency: (assignment.inspection_frequency as string) || 'Monthly',
        active: Boolean(assignment.active),
        nextDue,
        isLocked,
        lockMessage: isLocked && nextDue ? `Next inspection available on ${formatDateTime(nextDue)}` : null,
      }
    }),
    inspections: inspections.map((inspection) => ({
      result:
        (inspection.status as InspectionStatus | null) === 'In Progress'
          ? ('INCOMPLETE' as InspectionResult)
          : (failedItemCountByInspectionId.get(inspection.id as string) ?? 0) > 0
            ? ('FAIL' as InspectionResult)
            : ('PASS' as InspectionResult),
      passCount: passedItemCountByInspectionId.get(inspection.id as string) ?? 0,
      failCount: failedItemCountByInspectionId.get(inspection.id as string) ?? 0,
      failedItemCount: failedItemCountByInspectionId.get(inspection.id as string) ?? 0,
      defectCount: defectCountByInspectionId.get(inspection.id as string) ?? 0,
      isOverdue: Boolean(inspection.is_overdue),
      dueAt: (inspection.due_at as string | null) ?? null,
      id: inspection.id as string,
      machineId: inspection.machine_id as string,
      machineName: machineData?.name as string,
      templateName: (inspection.template_name as string | null) ?? 'Legacy Inspection',
      status: (inspection.status as InspectionStatus | null) ?? 'Completed',
      startedAt: inspection.started_at as string | null,
      completedAt: inspection.completed_at as string | null,
      completedBy:
        (inspection.started_by as string | null)
          ? startedByName.get(inspection.started_by as string) ?? (inspection.operator_name as string | null) ?? 'Unknown User'
          : (inspection.operator_name as string | null) ?? 'Unknown User',
      inspector:
        (inspection.started_by as string | null)
          ? startedByName.get(inspection.started_by as string) ?? (inspection.operator_name as string | null) ?? 'Unknown User'
          : (inspection.operator_name as string | null) ?? 'Unknown User',
    })),
  })
}

export async function POST(request: Request) {
  const auth = await requireAuthContext(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  // Automatically repair legacy assignment records that never had schedules created.
  await repairInspectionScheduleCoverage()

  const body = (await request.json()) as {
    machine_id?: string
    template_id?: string
  }

  const machineId = body.machine_id?.trim() ?? ''
  const requestedTemplateId = body.template_id?.trim() ?? ''

  // VALIDATION: Reject undefined machine IDs
  if (!machineId || machineId === 'undefined') {
    await trackInspectionEvent({
      eventType: 'failed_start',
      machineId: machineId || null,
      userId: auth.userId,
      details: { reason: 'invalid_machine_id' },
    }).catch(() => undefined)
    return NextResponse.json({ error: `Invalid machine_id: ${JSON.stringify(machineId)}` }, { status: 400 })
  }

  const { data: machineData, error: machineError } = await supabaseAdmin
    .from('machines')
    .select('id, name, grace_period, status, inspection_deadline')
    .eq('id', machineId)
    .maybeSingle()

  if (machineError) {
    return NextResponse.json({ error: machineError.message }, { status: 500 })
  }

  if (!machineData) {
    return NextResponse.json({ error: 'Machine not found.' }, { status: 404 })
  }

  if (!auth.isAdmin) {
    const access = await canAccessMachine(auth, machineId)
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason === 'not_found' ? 'Machine not found.' : 'Forbidden' }, { status: access.reason === 'not_found' ? 404 : 403 })
    }
  }

  if (!machineData) {
    await trackInspectionEvent({
      eventType: 'failed_start',
      machineId,
      userId: auth.userId,
      details: { reason: 'machine_not_found' },
    }).catch(() => undefined)
    return NextResponse.json({ error: 'Machine not found.' }, { status: 404 })
  }

  const { data: assignmentsData, error: assignmentsError } = await supabaseAdmin
    .from('machine_inspection_templates')
    .select('id, template_id, inspection_frequency, active')
    .eq('machine_id', machineId)
    .eq('active', true)

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 500 })
  }

  const assignmentTemplateIds = (assignmentsData ?? []).map((a) => a.template_id as string)
  const assignmentTemplatesById = new Map<string, { id: string; name: string }>()

  if (assignmentTemplateIds.length > 0) {
    const { data: assignmentTemplatesData } = await supabaseAdmin
      .from('checklist_templates')
      .select('id, name')
      .in('id', assignmentTemplateIds)

    for (const template of assignmentTemplatesData ?? []) {
      assignmentTemplatesById.set(template.id as string, {
        id: template.id as string,
        name: (template.name as string) || 'Unnamed',
      })
    }
  }

  const assignments = (assignmentsData ?? []).map((assignment) => {
    const template = assignmentTemplatesById.get(assignment.template_id as string)

    return {
      id: assignment.id as string,
      templateId: assignment.template_id as string,
      inspectionFrequency: (assignment.inspection_frequency as string) || 'Monthly',
      templateName: template?.name || 'Unnamed Template',
    }
  })

  if (assignments.length === 0) {
    await trackInspectionEvent({
      eventType: 'failed_start',
      machineId,
      userId: auth.userId,
      details: { reason: 'no_template_assignment' },
    }).catch(() => undefined)
    return NextResponse.json({ error: 'No inspection templates assigned.' }, { status: 400 })
  }

  let selectedTemplateId = requestedTemplateId
  if (!selectedTemplateId) {
    if (assignments.length > 1) {
      return NextResponse.json({ error: 'Please select a template to start this inspection.' }, { status: 400 })
    }
    selectedTemplateId = assignments[0].templateId
  }

  const selectedAssignment = assignments.find((assignment) => assignment.templateId === selectedTemplateId)
  if (!selectedAssignment) {
    await trackInspectionEvent({
      eventType: 'failed_start',
      machineId,
      userId: auth.userId,
      details: { reason: 'template_not_assigned', templateId: selectedTemplateId },
    }).catch(() => undefined)
    return NextResponse.json({ error: 'Selected template is not assigned to this machine.' }, { status: 400 })
  }

  const { data: scheduleData, error: scheduleError } = await supabaseAdmin
    .from('inspection_schedules')
    .select('id, next_due, active, machine_template_id')
    .eq('machine_template_id', selectedAssignment.id)
    .eq('active', true)
    .maybeSingle()

  if (scheduleError) {
    return NextResponse.json({ error: scheduleError.message }, { status: 500 })
  }

  if (!scheduleData?.id) {
    await trackInspectionEvent({
      eventType: 'failed_start',
      machineId,
      userId: auth.userId,
      details: { reason: 'missing_schedule', assignmentId: selectedAssignment.id },
    }).catch(() => undefined)
    return NextResponse.json({ error: 'Inspection schedule is missing for this machine/template assignment.' }, { status: 409 })
  }

  const { data: latestCompletedInspection } = await supabaseAdmin
    .from('inspections')
    .select('completed_at')
    .eq('schedule_id', scheduleData.id as string)
    .eq('status', 'Completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const now = new Date()
  const nextDue = scheduleData?.next_due
    ? combineLondonDateAndTime(
        new Date(scheduleData.next_due as string),
        (machineData?.inspection_deadline as string | null | undefined) ?? '09:00'
      )
    : null
  const nextDueIso = nextDue?.toISOString() ?? null
  const currentGenerationKey = nextDueIso
    ? buildInspectionGenerationKey(scheduleData.id as string, nextDueIso)
    : null
  const scheduleUnlockAt = nextDue ? startOfLondonDay(nextDue) : null
  console.info('Inspection start validation', {
    machine_id: machineId,
    template_id: selectedTemplateId,
    machine_template_assignment_id: selectedAssignment.id,
    schedule_id: scheduleData.id as string,
    inspection_frequency: selectedAssignment.inspectionFrequency,
    completed_at: (latestCompletedInspection?.completed_at as string | null) ?? null,
    next_due: nextDueIso,
    grace_period: Number(machineData.grace_period ?? 0),
    current_status: (machineData.status as string | null) ?? null,
  })

  if (scheduleUnlockAt && !Number.isNaN(scheduleUnlockAt.getTime()) && scheduleUnlockAt > now) {
    await trackInspectionEvent({
      eventType: 'lock_denial',
      machineId,
      scheduleId: scheduleData.id as string,
      userId: auth.userId,
      details: { nextDue: nextDueIso, unlockAt: scheduleUnlockAt.toISOString() },
    }).catch(() => undefined)
    return NextResponse.json(
      {
        error: `Inspection is locked until ${scheduleUnlockAt.toISOString()}.`,
        nextDue: nextDueIso,
        unlockAt: scheduleUnlockAt.toISOString(),
      },
      { status: 409 }
    )
  }

  const { data: openInspection } = await supabaseAdmin
    .from('inspections')
    .select('id')
    .eq('schedule_id', scheduleData.id as string)
    .eq('status', 'In Progress')
    .maybeSingle()

  if (openInspection?.id) {
    await trackInspectionEvent({
      eventType: 'duplicate_start_blocked',
      machineId,
      scheduleId: scheduleData.id as string,
      userId: auth.userId,
      details: { existingInspectionId: openInspection.id as string },
    }).catch(() => undefined)
    return NextResponse.json({ error: 'This inspection is already in progress.' }, { status: 409 })
  }

  const { data: templateItemsData, error: templateItemsError } = await supabaseAdmin
    .from('checklist_template_items')
    .select('id, display_order, question, question_type, required')
    .eq('template_id', selectedTemplateId)
    .order('display_order', { ascending: true })

  if (templateItemsError) {
    return NextResponse.json({ error: templateItemsError.message }, { status: 500 })
  }

  const templateItems = (templateItemsData ?? []) as SnapshotTemplateItem[]

  if (templateItems.length === 0) {
    await trackInspectionEvent({
      eventType: 'failed_start',
      machineId,
      scheduleId: scheduleData.id as string,
      userId: auth.userId,
      details: { reason: 'template_has_no_items', templateId: selectedTemplateId },
    }).catch(() => undefined)
    return NextResponse.json({ error: 'Selected template has no inspection items.' }, { status: 400 })
  }

  const { data: profileData } = await supabaseAdmin
    .from('profiles')
    .select('full_name, username')
    .eq('user_id', auth.userId)
    .maybeSingle()

  const operatorName =
    (profileData?.full_name as string | null) ||
    (profileData?.username as string | null) ||
    'Unknown User'

  const startedAt = new Date().toISOString()

  let inspectionData: { id: string } | null = null
  let inspectionError: { message: string } | null = null

  if (currentGenerationKey) {
    const { data: generatedInspection, error: generatedInspectionError } = await supabaseAdmin
      .from('inspections')
      .select('id, status')
      .eq('generation_key', currentGenerationKey)
      .maybeSingle()

    if (generatedInspectionError) {
      return NextResponse.json({ error: generatedInspectionError.message }, { status: 500 })
    }

    if (generatedInspection?.id) {
      const { data: promotedInspection, error: promoteError } = await supabaseAdmin
        .from('inspections')
        .update({
          status: 'In Progress',
          started_by: auth.userId,
          started_at: startedAt,
          operator_id: auth.userId,
          operator_name: operatorName,
          due_at: nextDueIso,
          is_overdue: false,
        })
        .eq('id', generatedInspection.id as string)
        .eq('status', 'Draft')
        .select('id')
        .maybeSingle()

      if (promoteError) {
        inspectionError = { message: promoteError.message }
      } else if (promotedInspection?.id) {
        inspectionData = { id: promotedInspection.id as string }
      } else {
        const { data: alreadyStartedInspection, error: alreadyStartedError } = await supabaseAdmin
          .from('inspections')
          .select('id, status')
          .eq('id', generatedInspection.id as string)
          .maybeSingle()

        if (alreadyStartedError) {
          return NextResponse.json({ error: alreadyStartedError.message }, { status: 500 })
        }

        if ((alreadyStartedInspection?.status as string | null) === 'In Progress') {
          const existingInspectionId = (alreadyStartedInspection?.id as string | undefined) ?? ''
          await trackInspectionEvent({
            eventType: 'duplicate_start_blocked',
            machineId,
            scheduleId: scheduleData.id as string,
            userId: auth.userId,
            details: { source: 'generated_cycle', existingInspectionId },
          }).catch(() => undefined)
          return NextResponse.json({ error: 'This inspection is already in progress.' }, { status: 409 })
        }
      }
    }
  }

  if (!inspectionData) {
    const insertedInspection = await supabaseAdmin
      .from('inspections')
      .insert([
        {
          machine_id: machineId,
          template_id: selectedTemplateId,
          template_name: selectedAssignment.templateName,
          template_version: 1,
          status: 'In Progress',
          started_by: auth.userId,
          started_at: startedAt,
          operator_id: auth.userId,
          operator_name: operatorName,
          schedule_id: scheduleData.id as string,
          due_at: nextDueIso,
          generation_key: currentGenerationKey,
          checklist: [],
        },
      ])
      .select('id')
      .single()

    inspectionData = insertedInspection.data ? { id: insertedInspection.data.id as string } : null
    inspectionError = insertedInspection.error ? { message: insertedInspection.error.message } : inspectionError
  }

  if (inspectionError || !inspectionData) {
    const message = inspectionError?.message || 'Failed to create inspection.'
    if (message.startsWith('LOCKED_UNTIL:')) {
      const nextDueFromDb = message.replace('LOCKED_UNTIL:', '').trim()
      await trackInspectionEvent({
        eventType: 'lock_denial',
        machineId,
        scheduleId: scheduleData.id as string,
        userId: auth.userId,
        details: { source: 'db_trigger', nextDue: nextDueFromDb },
      }).catch(() => undefined)
      return NextResponse.json({ error: `Inspection is locked until ${nextDueFromDb}.`, nextDue: nextDueFromDb }, { status: 409 })
    }

    if (message.startsWith('DUPLICATE_IN_PROGRESS:')) {
      const existingInspectionId = message.replace('DUPLICATE_IN_PROGRESS:', '').trim()
      await trackInspectionEvent({
        eventType: 'duplicate_start_blocked',
        machineId,
        scheduleId: scheduleData.id as string,
        userId: auth.userId,
        details: { source: 'db_trigger', existingInspectionId },
      }).catch(() => undefined)
      return NextResponse.json({ error: 'This inspection is already in progress.' }, { status: 409 })
    }

    await trackInspectionEvent({
      eventType: 'failed_start',
      machineId,
      scheduleId: scheduleData.id as string,
      userId: auth.userId,
      details: { reason: 'insert_failed', message },
    }).catch(() => undefined)

    return NextResponse.json(
      { error: inspectionError?.message || 'Failed to create inspection.' },
      { status: 500 }
    )
  }

  const inspectionId = inspectionData.id as string

  const snapshotRows = templateItems.map((item) => ({
    inspection_id: inspectionId,
    original_template_item_id: item.id,
    display_order: item.display_order,
    question: item.question,
    question_type: item.question_type,
    required: Boolean(item.required),
    completed: false,
  }))

  // Insert snapshot rows individually to avoid ON CONFLICT against a partial
  // unique index (Postgres 42P10). Ignore duplicate-key (23505) errors to
  // preserve idempotency in concurrent scenarios.
  for (const row of snapshotRows) {
    const { error: insertErr } = await supabaseAdmin.from('inspection_items').insert([row])
    if (insertErr) {
      if (typeof insertErr === 'object' && 'code' in insertErr && String((insertErr as any).code) === '23505') {
        // duplicate - ignore
        continue
      }

      await trackInspectionEvent({
        eventType: 'failed_start',
        inspectionId,
        machineId,
        scheduleId: scheduleData.id as string,
        userId: auth.userId,
        details: { reason: 'snapshot_items_failed', message: insertErr?.message ?? String(insertErr) },
      }).catch(() => undefined)

      return NextResponse.json({ error: insertErr?.message ?? 'Failed to insert inspection_items snapshot.' }, { status: 500 })
    }
  }

  await trackInspectionEvent({
    eventType: 'start_success',
    inspectionId,
    machineId,
    scheduleId: scheduleData.id as string,
    userId: auth.userId,
    details: { templateId: selectedTemplateId },
  }).catch(() => undefined)

  return NextResponse.json({
    inspection: {
      id: inspectionId,
      machineId,
      templateId: selectedTemplateId,
      templateName: selectedAssignment.templateName,
      status: 'In Progress' as InspectionStatus,
      startedAt,
    },
  })
}
