import { NextResponse } from 'next/server'
import { requireAuth, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'

type InspectionStatus = 'In Progress' | 'Completed' | 'Cancelled'
type InspectionResult = 'PASS' | 'FAIL' | 'INCOMPLETE'

type SnapshotTemplateItem = {
  id: string
  display_order: number
  question: string
  question_type: string
  required: boolean
}

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const url = new URL(request.url)
  const machineId = url.searchParams.get('machine_id')

  // VALIDATION: machineId must be valid before proceeding
  if (!machineId || machineId === 'undefined' || machineId === '') {
    return NextResponse.json({ error: 'Invalid machine_id parameter. Received: ' + JSON.stringify(machineId) }, { status: 400 })
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
    .select('id, name, area, status, code')
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
  let templatesById = new Map<string, { id: string; name: string }>()

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
        nextScheduledAt = nextScheduleData.next_due as string
        const now = new Date()
        const dueDate = new Date(nextScheduleData.next_due as string)
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

      return {
        templateId: assignment.template_id as string,
        templateName: template?.name || 'Unnamed Template',
        inspectionFrequency: (assignment.inspection_frequency as string) || 'Monthly',
        active: Boolean(assignment.active),
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
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const body = (await request.json()) as {
    machine_id?: string
    template_id?: string
  }

  const machineId = body.machine_id?.trim() ?? ''
  const requestedTemplateId = body.template_id?.trim() ?? ''

  // VALIDATION: Reject undefined machine IDs
  if (!machineId || machineId === 'undefined') {
    return NextResponse.json({ error: `Invalid machine_id: ${JSON.stringify(machineId)}` }, { status: 400 })
  }

  const { data: machineData, error: machineError } = await supabaseAdmin
    .from('machines')
    .select('id, name')
    .eq('id', machineId)
    .maybeSingle()

  if (machineError) {
    return NextResponse.json({ error: machineError.message }, { status: 500 })
  }

  if (!machineData) {
    return NextResponse.json({ error: 'Machine not found.' }, { status: 404 })
  }

  const { data: assignmentsData, error: assignmentsError } = await supabaseAdmin
    .from('machine_inspection_templates')
    .select('template_id, active')
    .eq('machine_id', machineId)
    .eq('active', true)

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 500 })
  }

  const assignmentTemplateIds = (assignmentsData ?? []).map((a) => a.template_id as string)
  let assignmentTemplatesById = new Map<string, { id: string; name: string }>()

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
      templateId: assignment.template_id as string,
      templateName: template?.name || 'Unnamed Template',
    }
  })

  if (assignments.length === 0) {
    return NextResponse.json({ error: 'No inspection templates assigned.' }, { status: 400 })
  }

  let selectedTemplateId = requestedTemplateId
  if (!selectedTemplateId) {
    if (assignments.length > 1) {
      return NextResponse.json({ error: 'Please select a template to start this inspection.' }, { status: 400 })
    }
    selectedTemplateId = assignments[0].templateId
  }

  const selectedTemplate = assignments.find((assignment) => assignment.templateId === selectedTemplateId)
  if (!selectedTemplate) {
    return NextResponse.json({ error: 'Selected template is not assigned to this machine.' }, { status: 400 })
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

  const { data: inspectionData, error: inspectionError } = await supabaseAdmin
    .from('inspections')
    .insert([
      {
        machine_id: machineId,
        template_id: selectedTemplateId,
        template_name: selectedTemplate.templateName,
        template_version: 1,
        status: 'In Progress',
        started_by: auth.userId,
        started_at: startedAt,
        operator_id: auth.userId,
        operator_name: operatorName,
        checklist: [],
      },
    ])
    .select('id')
    .single()

  if (inspectionError || !inspectionData) {
    return NextResponse.json(
      { error: inspectionError?.message || 'Failed to create inspection.' },
      { status: 500 }
    )
  }

  const inspectionId = inspectionData.id as string

  const { error: snapshotItemsError } = await supabaseAdmin
    .from('inspection_items')
    .insert(
      templateItems.map((item) => ({
        inspection_id: inspectionId,
        original_template_item_id: item.id,
        display_order: item.display_order,
        question: item.question,
        question_type: item.question_type,
        required: Boolean(item.required),
        completed: false,
      }))
    )

  if (snapshotItemsError) {
    await supabaseAdmin.from('inspections').delete().eq('id', inspectionId)
    return NextResponse.json({ error: snapshotItemsError.message }, { status: 500 })
  }

  return NextResponse.json({
    inspection: {
      id: inspectionId,
      machineId,
      templateId: selectedTemplateId,
      templateName: selectedTemplate.templateName,
      status: 'In Progress' as InspectionStatus,
      startedAt,
    },
  })
}
