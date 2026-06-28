import { NextResponse } from 'next/server'
import { requireAdmin, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { runInspectionScheduler } from '@/lib/services/inspectionScheduling'

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  try {
    const result = await runInspectionScheduler()

    return NextResponse.json({
      success: true,
      generated: result.generatedCount,
      skipped: result.skippedDuplicateCount,
      checked: result.checkedCount,
      overdueMarked: result.overdueMarked,
      executedAt: result.processedAt,
      scheduleRepair: result.scheduleRepair,
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
