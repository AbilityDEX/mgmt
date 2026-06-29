import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import type {
  EmailDeliveryScope,
  EmailDistributionRecipient,
  EmailRecipientType,
} from '@/lib/types/release1'

export type ManagementNotificationEvent =
  | 'inspection_completed'
  | 'inspection_overdue'
  | 'archive_delivery_failed'
  | 'retry_queue_failed'

function mapRecipient(row: Record<string, unknown>): EmailDistributionRecipient {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    recipientType: row.recipient_type as EmailRecipientType,
    enabled: Boolean(row.enabled),
    deliveryScope: row.delivery_scope as EmailDeliveryScope,
    departmentFilter: (row.department_filter as string | null) ?? null,
    machineFilter: (row.machine_filter as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function listEmailRecipients() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const { data, error } = await supabaseAdmin
    .from('email_distribution_recipients')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => mapRecipient(row as Record<string, unknown>))
}

export async function createEmailRecipient(input: {
  name: string
  email: string
  recipientType: EmailRecipientType
  enabled?: boolean
  deliveryScope: EmailDeliveryScope
  departmentFilter?: string | null
  machineFilter?: string | null
}) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const { data, error } = await supabaseAdmin
    .from('email_distribution_recipients')
    .insert([
      {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        recipient_type: input.recipientType,
        enabled: input.enabled ?? true,
        delivery_scope: input.deliveryScope,
        department_filter: input.departmentFilter?.trim() || null,
        machine_filter: input.machineFilter ?? null,
      },
    ])
    .select('*')
    .single()

  if (error || !data) throw error ?? new Error('Failed to create recipient.')
  return mapRecipient(data as Record<string, unknown>)
}

export async function updateEmailRecipient(
  recipientId: string,
  input: {
    name?: string
    email?: string
    recipientType?: EmailRecipientType
    enabled?: boolean
    deliveryScope?: EmailDeliveryScope
    departmentFilter?: string | null
    machineFilter?: string | null
  }
) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const updates: Record<string, unknown> = {}
  if (input.name !== undefined) updates.name = input.name.trim()
  if (input.email !== undefined) updates.email = input.email.trim().toLowerCase()
  if (input.recipientType !== undefined) updates.recipient_type = input.recipientType
  if (input.enabled !== undefined) updates.enabled = input.enabled
  if (input.deliveryScope !== undefined) updates.delivery_scope = input.deliveryScope
  if (input.departmentFilter !== undefined) updates.department_filter = input.departmentFilter?.trim() || null
  if (input.machineFilter !== undefined) updates.machine_filter = input.machineFilter ?? null

  const { data, error } = await supabaseAdmin
    .from('email_distribution_recipients')
    .update(updates)
    .eq('id', recipientId)
    .select('*')
    .single()

  if (error || !data) throw error ?? new Error('Failed to update recipient.')
  return mapRecipient(data as Record<string, unknown>)
}

export async function deleteEmailRecipient(recipientId: string) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const { error } = await supabaseAdmin
    .from('email_distribution_recipients')
    .delete()
    .eq('id', recipientId)

  if (error) throw error
}

export function recipientMatchesInspection(params: {
  deliveryScope: EmailDeliveryScope
  hasDefects: boolean
  overallResult: 'PASS' | 'FAIL' | 'INCOMPLETE'
}) {
  const { deliveryScope, hasDefects, overallResult } = params
  if (deliveryScope === 'all_inspections') return true
  if (deliveryScope === 'passed_inspections') return overallResult === 'PASS'
  if (deliveryScope === 'failed_inspections') return overallResult === 'FAIL' || overallResult === 'INCOMPLETE'
  if (deliveryScope === 'failed_only') return overallResult === 'FAIL'
  if (deliveryScope === 'defects_only') return hasDefects
  return false
}

export function resolveManagementRecipients(params: {
  recipients: EmailDistributionRecipient[]
  event: ManagementNotificationEvent
  machineId?: string | null
  machineArea?: string | null
  hasDefects?: boolean
  overallResult?: 'PASS' | 'FAIL' | 'INCOMPLETE'
}) {
  const machineId = params.machineId ?? null
  const machineArea = (params.machineArea ?? '').trim().toLowerCase()

  return params.recipients.filter((recipient) => {
    if (!recipient.enabled) return false

    if (recipient.machineFilter && machineId && recipient.machineFilter !== machineId) return false
    if (recipient.machineFilter && !machineId) return false

    if (recipient.departmentFilter) {
      if (!machineArea) return false
      if (!machineArea.includes(recipient.departmentFilter.trim().toLowerCase())) return false
    }

    if (params.event === 'inspection_completed') {
      return recipientMatchesInspection({
        deliveryScope: recipient.deliveryScope,
        hasDefects: Boolean(params.hasDefects),
        overallResult: params.overallResult ?? 'INCOMPLETE',
      })
    }

    return true
  })
}
