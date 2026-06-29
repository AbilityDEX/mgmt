import { NextResponse } from 'next/server'
import { requireAdmin, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import {
  ensureScheduleForMachineTemplate,
  type ScheduleFrequency,
} from '@/lib/services/inspectionScheduling'

type AssignmentFrequency =
  | 'Daily'
  | 'Weekly'
  | 'Fortnightly'
  | 'Monthly'
  | 'Quarterly'
  | 'Six Monthly'
  | 'Annually'
  | 'Custom'

const frequencies: AssignmentFrequency[] = [
  'Daily',
  'Weekly',
  'Fortnightly',
  'Monthly',
  'Quarterly',
  'Six Monthly',
  'Annually',
  'Custom',
]

function isFrequency(value: string): value is AssignmentFrequency {
  return frequencies.includes(value as AssignmentFrequency)
}

function toScheduleFrequency(value: AssignmentFrequency): ScheduleFrequency {
  return value
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const url = new URL(request.url)
  const machineId = url.searchParams.get('machine_id')
  const templateId = url.searchParams.get('template_id')
  const availableOnly = url.searchParams.get('available_only') === 'true'

  // Get active templates for machine creation/edit selector
  if (availableOnly) {
    const { data, error } = await supabaseAdmin
      .from('checklist_templates')
      .select('id, name, description')
      .order('name', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ templates: data ?? [] })
  }

  // Get all machines assigned to a specific template
  if (templateId) {
    const { data, error } = await supabaseAdmin
      .from('machine_inspection_templates')
      .select(
        `machine_id, inspection_frequency, active, 
        machines(id, name, area, code)`
      )
      .eq('template_id', templateId)
      .eq('active', true)
      .order('machines(name)', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const assignments = (data ?? []).map((row: Record<string, unknown>) => ({
      machineId: row.machine_id,
      machine: row.machines,
      inspectionFrequency: row.inspection_frequency,
      active: row.active,
    }))

    return NextResponse.json({ assignments })
  }

  // Get assignments for a specific machine (original behavior)
  if (!machineId) {
    return NextResponse.json({ error: 'machine_id or template_id is required.' }, { status: 400 })
  }

  const { data: machineData, error: machineError } = await supabaseAdmin
    .from('machines')
    .select('id, name, area, status')
    .eq('id', machineId)
    .maybeSingle()

  if (machineError) {
    return NextResponse.json({ error: machineError.message }, { status: 500 })
  }

  if (!machineData) {
    return NextResponse.json({ error: 'Machine not found.' }, { status: 404 })
  }

  const { data: assignmentData, error: assignmentError } = await supabaseAdmin
    .from('machine_inspection_templates')
    .select('id, machine_id, template_id, inspection_frequency, active, created_at, checklist_templates(id, name)')
    .eq('machine_id', machineId)
    .order('created_at', { ascending: false })

  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 500 })
  }

  const assignments = (assignmentData ?? []).map((assignment) => {
    const template = Array.isArray(assignment.checklist_templates)
      ? assignment.checklist_templates[0]
      : assignment.checklist_templates

    return {
      id: assignment.id as string,
      machineId: assignment.machine_id as string,
      templateId: assignment.template_id as string,
      templateName: (template?.name as string) || 'Unknown Template',
      inspectionFrequency: assignment.inspection_frequency as AssignmentFrequency,
      active: Boolean(assignment.active),
      createdAt: assignment.created_at as string,
    }
  })

  const assignedTemplateIds = assignments.map((assignment) => assignment.templateId)

  let availableTemplatesQuery = supabaseAdmin
    .from('checklist_templates')
    .select('id, name')
    .order('name', { ascending: true })

  if (assignedTemplateIds.length > 0) {
    // Pass unquoted comma-separated ids to the client 'in' operator.
    // Quoting them here led to double-quoting and invalid UUID literal errors.
    availableTemplatesQuery = availableTemplatesQuery.not('id', 'in', `(${assignedTemplateIds.join(',')})`)
  }

  const { data: availableTemplatesData, error: availableTemplatesError } = await availableTemplatesQuery

  if (availableTemplatesError) {
    return NextResponse.json({ error: availableTemplatesError.message }, { status: 500 })
  }

  return NextResponse.json({
    machine: {
      id: machineData.id as string,
      name: machineData.name as string,
      area: (machineData.area as string) ?? '',
      status: (machineData.status as string) ?? 'Not Started',
    },
    assignments,
    frequencies,
    availableTemplates: (availableTemplatesData ?? []).map((template) => ({
      id: template.id as string,
      name: template.name as string,
    })),
  })
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const body = (await request.json()) as {
    machine_id?: string
    template_id?: string
    inspection_frequency?: string
  }

  const machineId = body.machine_id?.trim() ?? ''
  const templateId = body.template_id?.trim() ?? ''
  const inspectionFrequency = body.inspection_frequency?.trim() ?? ''

  if (!machineId || !templateId || !inspectionFrequency) {
    return NextResponse.json(
      { error: 'machine_id, template_id, and inspection_frequency are required.' },
      { status: 400 }
    )
  }

  if (!isFrequency(inspectionFrequency)) {
    return NextResponse.json({ error: 'Inspection frequency is invalid.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('machine_inspection_templates')
    .insert([
      {
        machine_id: machineId,
        template_id: templateId,
        inspection_frequency: inspectionFrequency,
        active: true,
      },
    ])
    .select('id, machine_id, template_id, inspection_frequency, active, created_at')
    .single()

  if (error) {
    if ('code' in error && error.code === '23505') {
      return NextResponse.json(
        { error: 'This template is already assigned to the selected machine.' },
        { status: 409 }
      )
    }

    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: templateData } = await supabaseAdmin
    .from('checklist_templates')
    .select('name')
    .eq('id', templateId)
    .maybeSingle()

  await ensureScheduleForMachineTemplate({
    machineTemplateId: data.id as string,
    frequency: toScheduleFrequency(data.inspection_frequency as AssignmentFrequency),
    intervalValue: 1,
    customCron: null,
    active: true,
    nextDue: new Date(),
  })

  return NextResponse.json({
    assignment: {
      id: data.id as string,
      machineId: data.machine_id as string,
      templateId: data.template_id as string,
      templateName: (templateData?.name as string) || 'Unknown Template',
      inspectionFrequency: data.inspection_frequency as AssignmentFrequency,
      active: Boolean(data.active),
      createdAt: data.created_at as string,
    },
  })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const body = (await request.json()) as {
    assignment_id?: string
  }

  const assignmentId = body.assignment_id?.trim() ?? ''
  if (!assignmentId) {
    return NextResponse.json({ error: 'assignment_id is required.' }, { status: 400 })
  }

  const { data: existingAssignment, error: existingAssignmentError } = await supabaseAdmin
    .from('machine_inspection_templates')
    .select('id, machine_id, template_id')
    .eq('id', assignmentId)
    .maybeSingle()

  if (existingAssignmentError) {
    return NextResponse.json({ error: existingAssignmentError.message }, { status: 500 })
  }

  if (!existingAssignment) {
    return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 })
  }

  const { error: deleteError } = await supabaseAdmin
    .from('machine_inspection_templates')
    .delete()
    .eq('id', assignmentId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  // Clean up associated inspection schedules
  await supabaseAdmin.from('inspection_schedules').delete().eq('machine_template_id', assignmentId)

  return NextResponse.json({ success: true })
}
