import { dailyMaintenance } from '@/lib/services/dailyMaintenance'
import { supabaseAdmin } from '@/lib/admin'
type InvokeResult =
  | { success: true; status: 'completed' | 'skipped'; durationMs: number; owner: string; maintenanceDate: string }
  | { success: false; status: 'error' | 'server_config'; durationMs: number; owner: string; error: string }

export async function runBackgroundSchedulerOnce(owner = `manual:${Date.now()}`): Promise<InvokeResult> {
  const startedAt = Date.now()

  if (!supabaseAdmin) {
    return {
      success: false,
      status: 'server_config',
      durationMs: Date.now() - startedAt,
      owner,
      error: 'Supabase admin client is not configured.',
    }
  }

  try {
    const result = await dailyMaintenance.runDailyMaintenance(supabaseAdmin, owner)
    if (result.success) {
      return {
        success: true,
        status: result.logId ? 'completed' : 'skipped',
        durationMs: Date.now() - startedAt,
        owner,
        maintenanceDate: result.maintenanceDate,
      }
    }

    return {
      success: false,
      status: 'error',
      durationMs: Date.now() - startedAt,
      owner,
      error: result.error ?? 'Daily maintenance failed',
    }
  } catch (error) {
    return {
      success: false,
      status: 'error',
      durationMs: Date.now() - startedAt,
      owner,
      error: error instanceof Error ? error.message : 'Unexpected scheduler error',
    }
  }
}

export function startBackgroundScheduler() {
  console.info('[background-scheduler] startup timers removed; scheduling is now cron-invoked only')
}