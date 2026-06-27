import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { retryFailedArchiveDeliveries } from '@/lib/services/archivePipeline'
import { getRetentionSettings, getEffectiveRetentionDays } from '@/lib/services/retention'
import { runInspectionScheduler } from '@/lib/services/inspectionScheduling'

export async function runScheduledCleanupJob() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const { data: runData, error: runError } = await supabaseAdmin
    .from('scheduled_cleanup_runs')
    .insert([{ status: 'running' }])
    .select('id')
    .single()

  if (runError || !runData) {
    throw runError ?? new Error('Failed to start cleanup run.')
  }

  const runId = runData.id as string

  try {
    const scheduler = await runInspectionScheduler()

    const retentionSettings = await getRetentionSettings()
    const retentionDays = getEffectiveRetentionDays(retentionSettings)

    const retryStats = await retryFailedArchiveDeliveries(retentionSettings.maxDeliveryRetries)

    const retentionCutoff = new Date()
    retentionCutoff.setUTCDate(retentionCutoff.getUTCDate() - retentionDays)

    const { data: deletableInspections, error: deletableError } = await supabaseAdmin
      .from('inspections')
      .select('id')
      .eq('archive_status', 'archived')
      .lt('completed_at', retentionCutoff.toISOString())

    if (deletableError) throw deletableError

    let deleted = 0
    const ids = (deletableInspections ?? []).map((row) => row.id as string)
    if (ids.length > 0) {
      const { error: deleteError } = await supabaseAdmin.from('inspections').delete().in('id', ids)
      if (deleteError) throw deleteError
      deleted = ids.length
    }

    const summary = {
      scheduler,
      retryStats,
      retentionDays,
      deleted,
      completedAt: new Date().toISOString(),
    }

    await supabaseAdmin
      .from('scheduled_cleanup_runs')
      .update({ status: 'success', completed_at: new Date().toISOString(), summary })
      .eq('id', runId)

    return { runId, summary }
  } catch (error) {
    await supabaseAdmin
      .from('scheduled_cleanup_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        summary: {
          error: error instanceof Error ? error.message : 'Scheduled cleanup failed.',
        },
      })
      .eq('id', runId)

    throw error
  }
}
