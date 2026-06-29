import { runAutomatedSchedulerCycle } from '@/lib/services/schedulerAutomation'
import { dailyMaintenance } from '@/lib/services/dailyMaintenance'
import { supabaseAdmin } from '@/lib/admin'
import { getLondonDateKey } from '@/lib/inspectionTime'
import util from 'util'

type SchedulerRuntimeState = {
  started: boolean
  inFlight: boolean
  owner: string
  timer: NodeJS.Timeout | null
  baseIntervalMs: number
  nextDelayMs: number
  consecutiveFailures: number
  cleanupRegistered: boolean
  runCount: number
}

const schedulerRuntimeState = globalThis as typeof globalThis & {
  __mgmtBackgroundScheduler?: SchedulerRuntimeState
}

function resolveBaseIntervalMs() {
  // Default watchdog interval: 30-60 minutes. This is now a lightweight check,
  // not a high-frequency scheduler.
  const raw = process.env.BACKGROUND_SCHEDULER_INTERVAL_MS
  const parsed = Number(raw ?? 30 * 60 * 1000) // Default 30 minutes

  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn('[background-scheduler] invalid interval config, falling back to 30min', {
      raw,
    })
    return 30 * 60 * 1000
  }

  // Minimum 5 minutes, maximum 2 hours for the watchdog
  return Math.max(5 * 60 * 1000, Math.min(Math.floor(parsed), 2 * 60 * 60 * 1000))
}

function nextBackoffDelayMs(baseIntervalMs: number, consecutiveFailures: number) {
  // Exponential backoff, capped at 10 minutes.
  // But for a watchdog, we want faster retry than the base interval.
  const multiplier = Math.min(2 ** consecutiveFailures, 10)
  return Math.min(baseIntervalMs * multiplier, 10 * 60 * 1000)
}

function formatThrowable(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause ?? null,
    }
  }

  return {
    message: 'Non-Error throwable',
    value: util.inspect(error, { depth: 6, breakLength: 120 }),
  }
}

function clearSchedulerTimer(state: SchedulerRuntimeState) {
  if (state.timer) {
    clearTimeout(state.timer)
    state.timer = null
  }
}

function registerCleanupHandlers(state: SchedulerRuntimeState) {
  if (state.cleanupRegistered) {
    return
  }

  const shutdown = (signal: string) => {
    const current = schedulerRuntimeState.__mgmtBackgroundScheduler
    if (!current) return

    clearSchedulerTimer(current)
    current.started = false

    console.info('[background-scheduler] stopped', {
      signal,
      owner: current.owner,
      runCount: current.runCount,
      consecutiveFailures: current.consecutiveFailures,
    })
  }

  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('beforeExit', () => shutdown('beforeExit'))

  state.cleanupRegistered = true
}

function scheduleNextTick(
  state: SchedulerRuntimeState,
  reason: 'success' | 'failure' | 'idle',
  trigger: 'startup' | 'interval'
) {
  clearSchedulerTimer(state)

  if (!state.started) {
    return
  }

  let delayMs = state.baseIntervalMs
  if (reason === 'failure') {
    delayMs = nextBackoffDelayMs(state.baseIntervalMs, state.consecutiveFailures)
  }

  state.nextDelayMs = delayMs

  state.timer = setTimeout(() => {
    void tickScheduler(state, 'interval')
  }, delayMs)

  if (typeof state.timer.unref === 'function') {
    state.timer.unref()
  }

  console.info('[background-scheduler] scheduled next tick', {
    owner: state.owner,
    trigger,
    reason,
    delayMs,
    consecutiveFailures: state.consecutiveFailures,
  })
}

async function tickScheduler(state: SchedulerRuntimeState, trigger: 'startup' | 'interval') {
  if (state.inFlight) {
    scheduleNextTick(state, 'idle', trigger)
    return
  }

  state.inFlight = true
  state.runCount += 1

  try {
    // New lightweight watchdog logic:
    // 1. Check if today's daily maintenance has already completed
    // 2. If yes, do nothing and exit
    // 3. If no, run the daily maintenance job

    if (!supabaseAdmin) {
      console.warn('[background-scheduler] supabase admin client not configured, skipping maintenance check')
      state.consecutiveFailures = 0
      scheduleNextTick(state, 'idle', trigger)
      return
    }

    const maintenanceDate = getLondonDateKey(new Date())
    const hasCompleted = await dailyMaintenance.hasMaintenanceCompletedToday(
      supabaseAdmin,
      maintenanceDate
    )

    if (hasCompleted) {
      console.info('[background-scheduler] daily maintenance already completed, idle tick', {
        trigger,
        runCount: state.runCount,
      })
      state.consecutiveFailures = 0
      scheduleNextTick(state, 'success', trigger)
      return
    }

    // Daily maintenance not completed, run it now
    console.info('[background-scheduler] running daily maintenance', {
      trigger,
      runCount: state.runCount,
    })

    const result = await dailyMaintenance.runDailyMaintenance(
      supabaseAdmin,
      state.owner
    )

    if (result.success) {
      console.info('[background-scheduler] daily maintenance completed successfully', {
        trigger,
        runCount: state.runCount,
        durationMs: result.durationMs,
        stats: result.stats,
      })
      state.consecutiveFailures = 0
      scheduleNextTick(state, 'success', trigger)
    } else {
      throw new Error(result.error || 'Daily maintenance failed')
    }
  } catch (error) {
    state.consecutiveFailures += 1
    const errorPayload = formatThrowable(error)
    console.error('[background-scheduler] watchdog tick failed', {
      trigger,
      runCount: state.runCount,
      consecutiveFailures: state.consecutiveFailures,
      ...errorPayload,
    })
    scheduleNextTick(state, 'failure', trigger)
  } finally {
    state.inFlight = false
  }
}

export function startBackgroundScheduler() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    return
  }

  if (process.env.BACKGROUND_SCHEDULER_ENABLED === 'false') {
    return
  }

  const existing = schedulerRuntimeState.__mgmtBackgroundScheduler
  if (existing?.started) {
    console.info('[background-scheduler] start ignored: already running', {
      owner: existing.owner,
      runCount: existing.runCount,
      nextDelayMs: existing.nextDelayMs,
      consecutiveFailures: existing.consecutiveFailures,
    })
    return
  }

  const owner = `watchdog:${Date.now()}`
  const baseIntervalMs = resolveBaseIntervalMs()

  const state: SchedulerRuntimeState = {
    started: true,
    inFlight: false,
    owner,
    timer: null,
    baseIntervalMs,
    nextDelayMs: baseIntervalMs,
    consecutiveFailures: 0,
    cleanupRegistered: false,
    runCount: 0,
  }

  schedulerRuntimeState.__mgmtBackgroundScheduler = state
  registerCleanupHandlers(state)

  console.info('[background-scheduler] started as lightweight watchdog', {
    owner,
    baseIntervalMs,
    pid: process.pid,
    env: process.env.NODE_ENV ?? 'unknown',
  })

  // Schedule first tick after base interval instead of running on startup
  scheduleNextTick(state, 'success', 'startup')
}