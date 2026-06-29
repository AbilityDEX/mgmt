import { runInspectionScheduler } from '@/lib/services/inspectionScheduling'
import { queueDailyReminderEmails, sendScheduledReminders } from '@/lib/services/reminders'
import { processEmailQueue } from '@/lib/services/emailQueue'
import { getRetentionSettings } from '@/lib/services/retention'
import { retryFailedArchiveDeliveries } from '@/lib/services/archivePipeline'
import { runScheduledCleanupJob } from '@/lib/services/cleanup'

export type SchedulerCadence = 'midnight' | 'morning' | 'hourly' | 'monthly' | 'all'

export async function runSchedulerCadence(cadence: SchedulerCadence, now = new Date()) {
  const output: Record<string, unknown> = {
    cadence,
    executedAt: now.toISOString(),
  }

  if (cadence === 'midnight' || cadence === 'all') {
    output.midnight = {
      scheduler: await runInspectionScheduler(now),
      remindersQueued: await queueDailyReminderEmails(now),
    }
  }

  if (cadence === 'morning' || cadence === 'all') {
    output.morning = await sendScheduledReminders(now)
  }

  if (cadence === 'hourly' || cadence === 'all') {
    const retention = await getRetentionSettings()
    output.hourly = {
      retries: await retryFailedArchiveDeliveries(retention.maxDeliveryRetries),
      queue: await processEmailQueue(200),
    }
  }

  if (cadence === 'monthly' || cadence === 'all') {
    output.monthly = await runScheduledCleanupJob()
  }

  return output
}
