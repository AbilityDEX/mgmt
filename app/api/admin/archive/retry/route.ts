import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { retryFailedArchiveDeliveries } from '@/lib/services/archivePipeline'
import { getRetentionSettings } from '@/lib/services/retention'

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const settings = await getRetentionSettings()
    const result = await retryFailedArchiveDeliveries(settings.maxDeliveryRetries)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Retry failed.' }, { status: 500 })
  }
}
