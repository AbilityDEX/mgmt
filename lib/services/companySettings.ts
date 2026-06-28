import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import type { CompanySettings } from '@/lib/types/release1'

function mapCompanySettingsRow(row: Record<string, unknown>): CompanySettings {
  const smtpConfig = (row.smtp_config as Record<string, unknown> | null) ?? null
  const orgSettings = (smtpConfig?.orgSettings as Record<string, unknown> | null) ?? null

  return {
    id: row.id as string,
    companyName: (row.company_name as string) ?? 'MGMT Inspect',
    archiveEmail: (orgSettings?.archiveEmail as string | null) ?? (row.archive_email as string | null) ?? null,
    supportEmail: (orgSettings?.supportEmail as string | null) ?? null,
    timezone: (orgSettings?.timezone as string | null) ?? null,
    dateFormat: (orgSettings?.dateFormat as string | null) ?? null,
    timeFormat: (orgSettings?.timeFormat as string | null) ?? null,
    defaultReplyTo: (smtpConfig?.replyToEmail as string | null) ?? null,
    logoUrl: (row.logo_url as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    telephone: (row.telephone as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    reportFooter: (row.report_footer as string | null) ?? null,
    reportPrimaryColor: (row.report_primary_color as string) ?? '#0f766e',
    reportAccentColor: (row.report_accent_color as string) ?? '#0f172a',
  }
}

export async function getCompanySettings() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const { data, error } = await supabaseAdmin
    .from('company_settings')
    .select('*')
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    throw new Error('Company settings record is missing.')
  }

  return mapCompanySettingsRow(data as Record<string, unknown>)
}

export async function updateCompanySettings(input: {
  companyName?: string
  logoUrl?: string | null
  address?: string | null
  telephone?: string | null
  email?: string | null
  website?: string | null
  reportFooter?: string | null
  reportPrimaryColor?: string
  reportAccentColor?: string
}) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const updates: Record<string, unknown> = {}
  if (input.companyName !== undefined) updates.company_name = input.companyName.trim() || 'MGMT Inspect'
  if (input.logoUrl !== undefined) updates.logo_url = input.logoUrl?.trim() || null
  if (input.address !== undefined) updates.address = input.address?.trim() || null
  if (input.telephone !== undefined) updates.telephone = input.telephone?.trim() || null
  if (input.email !== undefined) updates.email = input.email?.trim() || null
  if (input.website !== undefined) updates.website = input.website?.trim() || null
  if (input.reportFooter !== undefined) updates.report_footer = input.reportFooter?.trim() || null
  if (input.reportPrimaryColor !== undefined) updates.report_primary_color = input.reportPrimaryColor.trim() || '#0f766e'
  if (input.reportAccentColor !== undefined) updates.report_accent_color = input.reportAccentColor.trim() || '#0f172a'

  const { data: existing } = await supabaseAdmin
    .from('company_settings')
    .select('id')
    .limit(1)
    .maybeSingle()

  if (!existing?.id) {
    const { error: insertError } = await supabaseAdmin.from('company_settings').insert([{ ...updates }])
    if (insertError) throw insertError
  } else {
    const { error: updateError } = await supabaseAdmin
      .from('company_settings')
      .update(updates)
      .eq('id', existing.id as string)
    if (updateError) throw updateError
  }

  return getCompanySettings()
}
