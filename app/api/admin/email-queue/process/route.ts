import { NextResponse } from 'next/server'
import { requireAdmin, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { processEmailQueue } from '@/lib/services/emailQueue'

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  try {
    const result = await processEmailQueue(100)

    if (result.warning) {
      return NextResponse.json({ message: result.warning, ...result }, { status: 503 })
    }

    return NextResponse.json({
      message: 'Email queue processing completed',
      processed: result.processed,
      success: result.success,
      failed: result.failed,
      errors: result.errors.length > 0 ? result.errors : undefined,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process email queue',
      },
      { status: 500 }
    )
  }
}
