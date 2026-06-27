import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getRetentionSettings, updateRetentionSettings } from '@/lib/services/retention'

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const settings = await getRetentionSettings()
    return NextResponse.json({ settings })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load settings.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json()) as {
    retentionDays?: number
    useCustom?: boolean
    customDays?: number | null
    maxDeliveryRetries?: number
  }

  try {
    const settings = await updateRetentionSettings(body)
    return NextResponse.json({ settings })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update settings.' }, { status: 500 })
  }
}
