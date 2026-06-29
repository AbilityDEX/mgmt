import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { retryFailedArchiveDeliveries } from '@/lib/services/archivePipeline'
import { processEmailQueue } from '@/lib/services/emailQueue'
import { runInspectionScheduler } from '@/lib/services/inspectionScheduling'
import { queueDailyReminderEmails, sendScheduledReminders } from '@/lib/services/reminders'
import { getRetentionSettings } from '@/lib/services/retention'
import util from 'util'

const SCHEDULER_LOCK_NAME = 'inspection-automation'

type SchedulerStep =
  | 'acquire scheduler lease'
  | 'load retention settings'
  | 'load schedules'
  | 'evaluate due inspections'
  | 'generate draft inspections'
  | 'queue reminders'
  | 'send reminders'
  | 'process email queue'
  | 'archive processing'
  | 'release scheduler lease'

class SchedulerStepError extends Error {
  step: SchedulerStep
  raw: unknown

  constructor(step: SchedulerStep, raw: unknown) {
    const normalized = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
    const code = normalized?.code ? ` code=${String(normalized.code)}` : ''
    const details = normalized?.details ? ` details=${String(normalized.details)}` : ''
    const hint = normalized?.hint ? ` hint=${String(normalized.hint)}` : ''
    const message = normalized?.message
      ? String(normalized.message)
      : raw instanceof Error
        ? raw.message
        : util.inspect(raw, { depth: 6, breakLength: 120 })

    super(`[scheduler-step:${step}] ${message}${code}${details}${hint}`)
    this.name = 'SchedulerStepError'
    this.step = step
    this.raw = raw
  }
}

function formatStepError(raw: unknown) {
  if (raw instanceof Error) {
    return {
      name: raw.name,
      message: raw.message,
      stack: raw.stack,
      cause: raw.cause ?? null,
    }
  }

  return {
    message: util.inspect(raw, { depth: 6, breakLength: 120 }),
  }
}

async function runStep<T>(step: SchedulerStep, action: () => Promise<T>): Promise<T> {
  const startedAt = Date.now()
  console.info('[scheduler-automation] step:start', { step })
  try {
    const output = await action()
    console.info('[scheduler-automation] step:success', {
      step,
      durationMs: Date.now() - startedAt,
    })
    return output
  } catch (error) {
    const wrapped = new SchedulerStepError(step, error)
    console.error('[scheduler-automation] step:failed', {
      step,
      durationMs: Date.now() - startedAt,
      ...formatStepError(wrapped),
      raw: formatStepError(error),
    })
    throw wrapped
  }
}

export type AutomatedSchedulerResult = {
  success: boolean
  executedAt: string
  owner: string
  skipped: boolean
  reason: 'completed' | 'locked' | 'server_config'
  scheduler?: Awaited<ReturnType<typeof runInspectionScheduler>>
  remindersQueued?: Awaited<ReturnType<typeof queueDailyReminderEmails>>
  remindersSent?: Awaited<ReturnType<typeof sendScheduledReminders>>
  queue?: Awaited<ReturnType<typeof processEmailQueue>>
  retries?: Awaited<ReturnType<typeof retryFailedArchiveDeliveries>>
}

async function acquireSchedulerLease(owner: string, leaseSeconds = 55) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const { data, error } = await supabaseAdmin.rpc('try_acquire_scheduler_lock', {
    p_name: SCHEDULER_LOCK_NAME,
    p_owner: owner,
    p_lease_seconds: leaseSeconds,
  })

  if (error) throw error
  return Boolean(data)
}

async function releaseSchedulerLease(owner: string) {
  if (!supabaseAdmin) return false

  const { data, error } = await supabaseAdmin.rpc('release_scheduler_lock', {
    p_name: SCHEDULER_LOCK_NAME,
    p_owner: owner,
  })

  if (error) {
    const wrapped = new SchedulerStepError('release scheduler lease', error)
    console.error('[scheduler-automation] release failed', {
      owner,
      ...formatStepError(wrapped),
      raw: formatStepError(error),
    })
    return false
  }

  return Boolean(data)
}

export async function runAutomatedSchedulerCycle(
  now = new Date(),
  options?: { owner?: string; leaseSeconds?: number }
): Promise<AutomatedSchedulerResult> {
  const owner = options?.owner ?? `scheduler:${Date.now()}`

  if (!supabaseAdmin) {
    return {
      success: false,
      executedAt: now.toISOString(),
      owner,
      skipped: true,
      reason: 'server_config',
    }
  }

  const locked = await runStep('acquire scheduler lease', () =>
    acquireSchedulerLease(owner, options?.leaseSeconds ?? 55)
  )
  if (!locked) {
    return {
      success: true,
      executedAt: now.toISOString(),
      owner,
      skipped: true,
      reason: 'locked',
    }
  }

  try {
    const retention = await runStep('load retention settings', () => getRetentionSettings())
    const scheduler = await runStep('load schedules', () => runInspectionScheduler(now))
    console.info('[scheduler-automation] step:derived', {
      step: 'evaluate due inspections',
      checkedCount: scheduler.checkedCount,
      overdueMarked: scheduler.overdueMarked,
    })
    console.info('[scheduler-automation] step:derived', {
      step: 'generate draft inspections',
      generatedCount: scheduler.generatedCount,
      skippedDuplicateCount: scheduler.skippedDuplicateCount,
    })

    const remindersQueued = await runStep('queue reminders', () => queueDailyReminderEmails(now))
    const remindersSent = await runStep('send reminders', () => sendScheduledReminders(now))
    const queue = await runStep('process email queue', () => processEmailQueue(200))
    const retries = await runStep('archive processing', () =>
      retryFailedArchiveDeliveries(retention.maxDeliveryRetries)
    )

    return {
      success: true,
      executedAt: now.toISOString(),
      owner,
      skipped: false,
      reason: 'completed',
      scheduler,
      remindersQueued,
      remindersSent,
      queue,
      retries,
    }
  } finally {
    await runStep('release scheduler lease', () => releaseSchedulerLease(owner))
  }
}