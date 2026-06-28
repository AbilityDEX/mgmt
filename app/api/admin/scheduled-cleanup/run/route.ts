import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { runScheduledCleanupJob } from '@/lib/services/cleanup'
import { runSchedulerCadence, type SchedulerCadence } from '@/lib/services/scheduler'

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    let cadence: SchedulerCadence = 'monthly'
    try {
      const body = (await request.json()) as { cadence?: SchedulerCadence }
      if (body?.cadence && ['midnight', 'morning', 'hourly', 'monthly', 'all'].includes(body.cadence)) {
        cadence = body.cadence
      }
    } catch {
      // Empty body keeps legacy monthly behavior.
    }

    if (cadence !== 'monthly') {
      const result = await runSchedulerCadence(cadence)
      return NextResponse.json({ success: true, cadence, result })
    }

    const result = await runScheduledCleanupJob()
    return NextResponse.json({ success: true, cadence: 'monthly', result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Cleanup run failed.' }, { status: 500 })
  }
}
