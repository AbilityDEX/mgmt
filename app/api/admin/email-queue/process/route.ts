import { NextResponse } from 'next/server'
import { requireAdmin, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import nodemailer from 'nodemailer'

type EmailQueueRow = {
  id: string
  inspection_id: string
  recipient_email: string
  recipient_type: string
  subject: string
  body: string
  status: string
  attempt_count: number
  last_attempt_at: string | null
  next_retry_at: string | null
  error_message: string | null
}

function resolveSmtpTransport() {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || '587')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM

  if (!host || !user || !pass || !from) {
    return null
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  return { transporter, from }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const smtp = resolveSmtpTransport()
  if (!smtp) {
    return NextResponse.json(
      { message: 'SMTP not configured. Emails remain queued for delivery.' },
      { status: 503 }
    )
  }

  try {
    const { data: queuedEmails, error: fetchError } = await supabaseAdmin
      .from('email_queue')
      .select('*')
      .or('status.eq.pending,status.eq.failed')
      .lt('next_retry_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(100)

    if (fetchError) {
      throw fetchError
    }

    let successCount = 0
    let failureCount = 0
    const errors: Array<{ emailId: string; error: string }> = []

    for (const email of (queuedEmails ?? []) as EmailQueueRow[]) {
      try {
        await smtp.transporter.sendMail({
          from: smtp.from,
          to: email.recipient_email,
          cc: email.recipient_type === 'cc' ? email.recipient_email : undefined,
          bcc: email.recipient_type === 'bcc' ? email.recipient_email : undefined,
          subject: email.subject,
          text: email.body,
        })

        await supabaseAdmin
          .from('email_queue')
          .update({
            status: 'sent',
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', email.id)

        successCount++
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const nextRetry = new Date()
        nextRetry.setHours(nextRetry.getHours() + 1)

        await supabaseAdmin
          .from('email_queue')
          .update({
            status: email.attempt_count >= 5 ? 'abandoned' : 'failed',
            attempt_count: email.attempt_count + 1,
            last_attempt_at: new Date().toISOString(),
            next_retry_at: email.attempt_count >= 5 ? null : nextRetry.toISOString(),
            error_message: errorMessage,
          })
          .eq('id', email.id)

        failureCount++
        errors.push({ emailId: email.id, error: errorMessage })
      }
    }

    return NextResponse.json({
      message: 'Email queue processing completed',
      processed: queuedEmails?.length ?? 0,
      success: successCount,
      failed: failureCount,
      errors: errors.length > 0 ? errors : undefined,
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
