import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { dailyMaintenance } from '@/lib/services/dailyMaintenance'
import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAuthorizedCronRequest(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expectedSecret = process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? ''
  const authorizationHeader = request.headers.get('authorization') ?? ''
  const token = authorizationHeader.startsWith('Bearer ') ? authorizationHeader.slice(7) : ''

  if (!expectedSecret) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, status: 500, error: 'CRON_SECRET is not configured.' }
    }

    return { ok: true }
  }

  if (!token) {
    return { ok: false, status: 401, error: 'Unauthorized cron request.' }
  }

  const expectedBuffer = Buffer.from(expectedSecret)
  const providedBuffer = Buffer.from(token)
  if (expectedBuffer.length !== providedBuffer.length) {
    return { ok: false, status: 401, error: 'Unauthorized cron request.' }
  }

  const matches = timingSafeEqual(expectedBuffer, providedBuffer)
  if (!matches) {
    return { ok: false, status: 401, error: 'Unauthorized cron request.' }
  }

  return { ok: true }
}

/**
 * Attempt a minimal DB query to verify Supabase is awake.
 * Uses exponential backoff until a successful response or timeout.
 */
async function waitForDatabaseConnection(
  supabaseClient: any,
  maxWaitMs = 5 * 60 * 1000
): Promise<
  | { ok: true; metrics: { attempts: number; totalMs: number; delays: number[]; startedAt: number; finishedAt: number } }
  | { ok: false; error: string; metrics?: { attempts: number; totalMs: number; delays: number[]; startedAt: number; finishedAt: number } }
> {
  const startedAt = Date.now()
  const delays = [15000, 30000, 60000, 120000]
  const recordedDelays: number[] = []
  let attempt = 0

  console.info('[cron-daily-maintenance] Database wake check start', { startedAt })

  while (Date.now() - startedAt < maxWaitMs) {
    attempt += 1
    try {
      // Call a lightweight SQL function that returns a constant value.
      // This avoids probing application tables and verifies the DB is accepting
      // queries. The function `public.health_ping()` is created by a migration
      // and returns integer 1.
      const { data, error } = await supabaseClient.rpc('health_ping')

      if (!error) {
        const finishedAt = Date.now()
        const totalMs = finishedAt - startedAt
        console.info('[cron-daily-maintenance] Database available (health_ping)', {
          attempt,
          totalMs,
          startedAt,
          finishedAt,
        })
        return {
          ok: true,
          metrics: { attempts: attempt, totalMs, delays: recordedDelays, startedAt, finishedAt },
        }
      }

      console.warn('[cron-daily-maintenance] DB health_ping returned error, will retry', {
        attempt,
        error: error?.message ?? String(error),
      })
    } catch (err) {
      console.warn('[cron-daily-maintenance] DB health_ping exception, will retry', {
        attempt,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    const delay = delays[Math.min(attempt - 1, delays.length - 1)]
    recordedDelays.push(delay)
    console.info('[cron-daily-maintenance] Sleeping before retry', { attempt, delay })
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  const finishedAt = Date.now()
  const totalMs = finishedAt - startedAt
  return {
    ok: false,
    error: 'Timed out waiting for database to become available',
    metrics: { attempts: attempt, totalMs, delays: recordedDelays, startedAt, finishedAt },
  }
}

async function executeDailyMaintenance(request: Request) {
  const startedAt = Date.now()
  const authResult = isAuthorizedCronRequest(request)

  if (!authResult.ok) {
    return NextResponse.json(
      {
        success: false,
        error: authResult.error,
        durationMs: Date.now() - startedAt,
      },
      { status: authResult.status }
    )
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      {
        success: false,
        error: serverConfigErrorMessage,
        durationMs: Date.now() - startedAt,
      },
      { status: 500 }
    )
  }

  console.info('[cron-daily-maintenance] Cron start')

  // Ensure the database is awake before attempting maintenance. This will
  // retry with exponential backoff for up to ~5 minutes.
  const dbWake = await waitForDatabaseConnection(supabaseAdmin)
  if (!dbWake.ok) {
    const durationMs = Date.now() - startedAt
    console.error('[cron-daily-maintenance] Database did not become available', {
      durationMs,
      error: dbWake.error,
      metrics: dbWake.metrics ?? null,
    })

    return NextResponse.json(
      {
        success: false,
        error: dbWake.error,
        durationMs,
        metrics: dbWake.metrics ?? null,
      },
      { status: 503 }
    )
  }

  // Log DB wake metrics when available
  if (dbWake.ok && 'metrics' in dbWake && dbWake.metrics) {
    console.info('[cron-daily-maintenance] Database wake metrics', dbWake.metrics)
  }

  const owner = `vercel-cron:${new Date().toISOString()}`

  try {
    const maintenanceStart = Date.now()
    console.info('[cron-daily-maintenance] Maintenance start', { maintenanceStart })
    const result = await dailyMaintenance.runDailyMaintenance(supabaseAdmin, owner)
    const maintenanceFinish = Date.now()
    console.info('[cron-daily-maintenance] Maintenance finished', {
      maintenanceStart,
      maintenanceFinish,
      maintenanceDurationMs: maintenanceFinish - maintenanceStart,
    })
    const durationMs = Date.now() - startedAt
    const skipped = result.success && !result.logId
    const statusCode = result.success ? 200 : 500

    console.info('[cron-daily-maintenance] execution completed', {
      success: result.success,
      owner,
      durationMs,
      maintenanceDate: result.maintenanceDate,
      skipped,
      stats: result.stats,
      error: result.error ?? null,
    })

    return NextResponse.json(
      {
        success: result.success,
        owner,
        maintenanceDate: result.maintenanceDate,
        durationMs,
        skipped,
        stats: result.stats,
        error: result.error ?? null,
      },
      { status: statusCode }
    )
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const message = error instanceof Error ? error.message : 'Unexpected cron execution error.'

    console.error('[cron-daily-maintenance] execution failed', {
      owner,
      durationMs,
      error: message,
    })

    return NextResponse.json(
      {
        success: false,
        owner,
        durationMs,
        error: message,
      },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  return executeDailyMaintenance(request)
}

export async function POST(request: Request) {
  return executeDailyMaintenance(request)
}
