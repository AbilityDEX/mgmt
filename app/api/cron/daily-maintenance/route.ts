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

  const owner = `vercel-cron:${new Date().toISOString()}`

  try {
    const result = await dailyMaintenance.runDailyMaintenance(supabaseAdmin, owner)
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
