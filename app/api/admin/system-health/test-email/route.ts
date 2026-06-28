import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { sendSystemHealthTestEmail } from '@/lib/services/systemHealth'

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const result = await sendSystemHealthTestEmail()
    if ('ok' in result && !result.ok) {
      return NextResponse.json({ error: result.message, result }, { status: 400 })
    }
    return NextResponse.json({ success: true, result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to send test email.' }, { status: 500 })
  }
}
