import { NextResponse } from 'next/server'
import { requireAdmin, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { runAutomatedSchedulerCycle } from '@/lib/services/schedulerAutomation'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  try {
    const result = await runAutomatedSchedulerCycle()

    return NextResponse.json({
      success: true,
      skipped: result.skipped,
      reason: result.reason,
      executedAt: result.executedAt,
      scheduler: result.scheduler ?? null,
      remindersQueued: result.remindersQueued ?? null,
      remindersSent: result.remindersSent ?? null,
      queue: result.queue ?? null,
      retries: result.retries ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process schedules.',
      },
      { status: 500 }
    )
  }
}
