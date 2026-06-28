import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getSystemHealthStatus, runFullSystemCheck } from '@/lib/services/systemHealth'

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const result = await getSystemHealthStatus()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load system health status.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let attemptRepair = true

  try {
    const body = (await request.json()) as { attemptRepair?: boolean }
    if (typeof body?.attemptRepair === 'boolean') {
      attemptRepair = body.attemptRepair
    }
  } catch {
    // Empty or invalid JSON body defaults to attemptRepair=true.
  }

  try {
    const result = await runFullSystemCheck({ attemptRepair })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to run full system check.' }, { status: 500 })
  }
}
