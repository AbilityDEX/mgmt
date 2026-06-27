import { NextResponse } from 'next/server'
import { requireAdmin, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const url = new URL(request.url)
  const templateId = url.searchParams.get('template_id')

  if (!templateId) {
    return NextResponse.json({ error: 'template_id is required.' }, { status: 400 })
  }

  const { data: templateData, error: templateError } = await supabaseAdmin
    .from('checklist_templates')
    .select('id, name, description, updated_at')
    .eq('id', templateId)
    .maybeSingle()

  if (templateError) {
    return NextResponse.json({ error: templateError.message }, { status: 500 })
  }

  if (!templateData) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
  }

  const { data: machineAssignments, error: machineAssignmentsError } = await supabaseAdmin
    .from('machine_inspection_templates')
    .select('id, machine_id, inspection_frequency, active, machines!inner(id, name, area, code)')
    .eq('template_id', templateId)
    .order('created_at', { ascending: false })

  if (machineAssignmentsError) {
    return NextResponse.json({ error: machineAssignmentsError.message }, { status: 500 })
  }

  const machines = (machineAssignments ?? []).map((assignment) => {
    const machine = Array.isArray(assignment.machines)
      ? assignment.machines[0]
      : assignment.machines

    return {
      assignmentId: assignment.id as string,
      machineId: assignment.machine_id as string,
      machineName: (machine?.name as string) || 'Unknown Machine',
      machineArea: (machine?.area as string) || '',
      machineAssetId: (machine?.code as string | null) ?? null,
      inspectionFrequency: assignment.inspection_frequency as string,
      active: Boolean(assignment.active),
    }
  })

  return NextResponse.json({
    template: {
      id: templateData.id as string,
      name: templateData.name as string,
      description: (templateData.description as string | null) ?? null,
      lastUpdated: templateData.updated_at as string,
    },
    machines,
  })
}
