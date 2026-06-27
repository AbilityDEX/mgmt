import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import type { RetentionSettings } from '@/lib/types/release1'

function mapRetentionSettings(row: Record<string, unknown>): RetentionSettings {
  return {
    id: row.id as string,
    retentionDays: Number(row.retention_days ?? 90),
    useCustom: Boolean(row.use_custom),
    customDays: (row.custom_days as number | null) ?? null,
    maxDeliveryRetries: Number(row.max_delivery_retries ?? 3),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function getRetentionSettings() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const { data, error } = await supabaseAdmin
    .from('retention_settings')
    .select('*')
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Retention settings row is missing.')

  return mapRetentionSettings(data as Record<string, unknown>)
}

export function getEffectiveRetentionDays(settings: RetentionSettings) {
  if (settings.useCustom && settings.customDays && settings.customDays > 0) {
    return settings.customDays
  }

  return settings.retentionDays
}

export async function updateRetentionSettings(input: {
  retentionDays?: number
  useCustom?: boolean
  customDays?: number | null
  maxDeliveryRetries?: number
}) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const updates: Record<string, unknown> = {}
  if (input.retentionDays !== undefined) updates.retention_days = Math.max(1, Math.floor(input.retentionDays))
  if (input.useCustom !== undefined) updates.use_custom = input.useCustom
  if (input.customDays !== undefined) updates.custom_days = input.customDays ? Math.max(1, Math.floor(input.customDays)) : null
  if (input.maxDeliveryRetries !== undefined) updates.max_delivery_retries = Math.max(0, Math.floor(input.maxDeliveryRetries))

  const { data: existing } = await supabaseAdmin
    .from('retention_settings')
    .select('id')
    .limit(1)
    .maybeSingle()

  if (!existing?.id) {
    const { error: insertError } = await supabaseAdmin.from('retention_settings').insert([{ ...updates }])
    if (insertError) throw insertError
  } else {
    const { error: updateError } = await supabaseAdmin
      .from('retention_settings')
      .update(updates)
      .eq('id', existing.id as string)
    if (updateError) throw updateError
  }

  return getRetentionSettings()
}
