import { supabaseAdmin } from '@/lib/admin'
import { queueDefectCreatedNotification } from '@/lib/services/notifications'

export type DefectSeverity = 'Low' | 'Medium' | 'High' | 'Critical'
export type DefectStatus = 'Open' | 'In Progress' | 'Awaiting Parts' | 'Resolved' | 'Closed'

export const activeDefectStatuses: DefectStatus[] = ['Open', 'In Progress', 'Awaiting Parts']

export async function ensureDefectForFailedInspectionItem(params: {
  machineId: string
  inspectionId: string
  inspectionItemId: string
  createdBy: string
  title: string
  description?: string | null
  severity?: DefectSeverity
}) {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client is not configured.')
  }

  const { data: existingDefect, error: existingDefectError } = await supabaseAdmin
    .from('defects')
    .select('id')
    .eq('inspection_item_id', params.inspectionItemId)
    .maybeSingle()

  if (existingDefectError) {
    throw existingDefectError
  }

  if (existingDefect?.id) {
    return { defectId: existingDefect.id as string, created: false }
  }

  const { data: insertedDefect, error: insertError } = await supabaseAdmin
    .from('defects')
    .insert([
      {
        machine_id: params.machineId,
        inspection_id: params.inspectionId,
        inspection_item_id: params.inspectionItemId,
        title: params.title,
        description: params.description ?? null,
        severity: params.severity ?? 'Medium',
        status: 'Open',
        created_by: params.createdBy,
      },
    ])
    .select('id, assigned_to')
    .single()

  if (insertError || !insertedDefect) {
    throw insertError ?? new Error('Failed to create defect.')
  }

  await queueDefectCreatedNotification({
    defectId: insertedDefect.id as string,
    machineId: params.machineId,
    recipientUserId: (insertedDefect.assigned_to as string | null) ?? null,
  })

  return { defectId: insertedDefect.id as string, created: true }
}
