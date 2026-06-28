import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { sendSmtpTestEmail } from '@/lib/services/smtpConfig'

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const result = await sendSmtpTestEmail()
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }
    return NextResponse.json({ success: true, message: result.message })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to send SMTP test email.' }, { status: 500 })
  }
}
