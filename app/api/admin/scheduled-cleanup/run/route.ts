import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { runScheduledCleanupJob } from '@/lib/services/cleanup'

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const result = await runScheduledCleanupJob()
    return NextResponse.json({ success: true, result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Cleanup run failed.' }, { status: 500 })
  }
}
