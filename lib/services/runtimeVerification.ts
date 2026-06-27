import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'

export async function runRuntimeVerification() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const checks: Array<{ name: string; ok: boolean; details?: string }> = []

  const requiredTables = [
    'inspection_schedules',
    'email_distribution_recipients',
    'email_templates',
    'inspection_archives',
    'archive_delivery_logs',
    'retention_settings',
    'company_settings',
  ]

  for (const tableName of requiredTables) {
    const { error } = await supabaseAdmin.from(tableName).select('*', { count: 'exact', head: true })
    checks.push({ name: `table:${tableName}`, ok: !error, details: error?.message })
  }

  const { error: scheduleQueryError } = await supabaseAdmin
    .from('inspection_schedules')
    .select('id, frequency, next_due, active')
    .limit(1)
  checks.push({ name: 'scheduling_query', ok: !scheduleQueryError, details: scheduleQueryError?.message })

  const { error: recipientsError } = await supabaseAdmin
    .from('email_distribution_recipients')
    .select('id, email, recipient_type, enabled, delivery_scope')
    .limit(5)
  checks.push({ name: 'email_distribution_query', ok: !recipientsError, details: recipientsError?.message })

  const { error: templateError } = await supabaseAdmin
    .from('email_templates')
    .select('id, subject, body, signature')
    .limit(1)
  checks.push({ name: 'email_templates_query', ok: !templateError, details: templateError?.message })

  const { error: archiveLogError } = await supabaseAdmin
    .from('archive_delivery_logs')
    .select('id, inspection_id, archived, status, retry_count')
    .limit(5)
  checks.push({ name: 'archive_logs_query', ok: !archiveLogError, details: archiveLogError?.message })

  const { error: retentionError } = await supabaseAdmin
    .from('retention_settings')
    .select('id, retention_days, use_custom, custom_days')
    .limit(1)
  checks.push({ name: 'retention_query', ok: !retentionError, details: retentionError?.message })

  const { error: inspectionsError } = await supabaseAdmin
    .from('inspections')
    .select('id, status, archive_status')
    .limit(5)
  checks.push({ name: 'inspection_workflow_query', ok: !inspectionsError, details: inspectionsError?.message })

  return {
    ok: checks.every((check) => check.ok),
    checks,
    generatedAt: new Date().toISOString(),
  }
}
