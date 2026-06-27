import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { runRuntimeVerification } from '@/lib/services/runtimeVerification'

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const result = await runRuntimeVerification()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Verification failed.' }, { status: 500 })
  }
}
