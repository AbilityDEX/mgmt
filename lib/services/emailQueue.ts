import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { resolveCompanyName, resolveEmailEnvelope } from '@/lib/services/emailConfig'
import { textToHtmlParagraphs } from '@/lib/services/emailMessageTemplates'
import { getCompanySettings } from '@/lib/services/companySettings'
import { sendManagementAlert } from '@/lib/services/managementNotifications'
import { getSmtpTransport } from '@/lib/services/smtpConfig'

type EmailQueueRow = {
  id: string
  inspection_id: string
  recipient_email: string
  recipient_type: 'to' | 'cc' | 'bcc'
  subject: string
  body: string
  status: string
  attempt_count: number
}

function logQueueEvent(input: {
  event: 'retry_succeeded' | 'retry_failed'
  inspectionId: string
  machineId: string
  referenceNumber: string
  details?: Record<string, unknown>
}) {
  console.info('[archive-event]', {
    event: input.event,
    inspectionId: input.inspectionId,
    machineId: input.machineId,
    referenceNumber: input.referenceNumber,
    timestamp: new Date().toISOString(),
    ...(input.details ?? {}),
  })
}

export async function processEmailQueue(limit = 100) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const smtpState = await getSmtpTransport()
  const smtp = smtpState.transport
  if (!smtp) {
    return {
      processed: 0,
      success: 0,
      failed: 0,
      warning: smtpState.warning || 'SMTP not configured',
      errors: [] as Array<{ emailId: string; error: string }>,
    }
  }

  const company = await getCompanySettings().catch(() => ({ companyName: 'MGMT Inspect' }))
  const companyName = resolveCompanyName(company)

  const nowIso = new Date().toISOString()
  const { data: queuedEmails, error: fetchError } = await supabaseAdmin
    .from('email_queue')
    .select('id, inspection_id, recipient_email, recipient_type, subject, body, status, attempt_count')
    .or('status.eq.pending,status.eq.failed')
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (fetchError) throw fetchError

  let success = 0
  let failed = 0
  const errors: Array<{ emailId: string; error: string }> = []

  for (const row of (queuedEmails ?? []) as EmailQueueRow[]) {
    try {
      const envelope = resolveEmailEnvelope({
        subject: row.subject,
        recipientType: row.recipient_type,
        recipientEmail: row.recipient_email,
        smtp,
        companyName,
      })

      await smtp.transporter.sendMail({
        from: envelope.from,
        to: envelope.to,
        cc: envelope.cc,
        bcc: envelope.bcc,
        replyTo: envelope.replyTo,
        subject: envelope.subject,
        text: row.body,
        html: textToHtmlParagraphs(row.body),
      })

      await supabaseAdmin
        .from('email_queue')
        .update({
          status: 'sent',
          last_attempt_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', row.id)

      await supabaseAdmin
        .from('inspection_email_history')
        .insert([
          {
            inspection_id: row.inspection_id,
            recipient_email: row.recipient_email,
            recipient_type: row.recipient_type,
            subject: envelope.subject,
            status: 'sent',
            sent_at: new Date().toISOString(),
          },
        ])

      const { data: inspectionMeta } = await supabaseAdmin
        .from('inspections')
        .select('machine_id')
        .eq('id', row.inspection_id)
        .maybeSingle()

      logQueueEvent({
        event: 'retry_succeeded',
        inspectionId: row.inspection_id,
        machineId: (inspectionMeta?.machine_id as string | null) ?? 'N/A',
        referenceNumber: row.inspection_id,
        details: { emailQueueId: row.id },
      })

      success += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const nextRetry = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      const nextAttempt = (row.attempt_count ?? 0) + 1

      await supabaseAdmin
        .from('email_queue')
        .update({
          status: nextAttempt >= 5 ? 'abandoned' : 'failed',
          attempt_count: nextAttempt,
          last_attempt_at: new Date().toISOString(),
          next_retry_at: nextAttempt >= 5 ? null : nextRetry,
          error_message: message,
        })
        .eq('id', row.id)

      if (nextAttempt >= 5) {
        const { data: machineMeta } = await supabaseAdmin
          .from('inspections')
          .select('machine_id, machines(name, area)')
          .eq('id', row.inspection_id)
          .maybeSingle()

        const machine = Array.isArray(machineMeta?.machines)
          ? machineMeta?.machines[0]
          : machineMeta?.machines

        await sendManagementAlert({
          event: 'retry_queue_failed',
          machineId: (machineMeta?.machine_id as string | null) ?? null,
          machineName: (machine?.name as string | null) ?? 'Unknown Machine',
          machineArea: (machine?.area as string | null) ?? null,
          reference: row.inspection_id,
          subject: 'Retry Queue Failed',
          details: `Email queue item ${row.id} reached max retries and was abandoned. Last error: ${message}`,
        }).catch(() => undefined)
      }

      await supabaseAdmin
        .from('inspection_email_history')
        .insert([
          {
            inspection_id: row.inspection_id,
            recipient_email: row.recipient_email,
            recipient_type: row.recipient_type,
            subject: row.subject,
            status: 'failed',
            error_message: message,
          },
        ])

      const { data: inspectionMeta } = await supabaseAdmin
        .from('inspections')
        .select('machine_id')
        .eq('id', row.inspection_id)
        .maybeSingle()

      logQueueEvent({
        event: 'retry_failed',
        inspectionId: row.inspection_id,
        machineId: (inspectionMeta?.machine_id as string | null) ?? 'N/A',
        referenceNumber: row.inspection_id,
        details: { emailQueueId: row.id, error: message },
      })

      failed += 1
      errors.push({ emailId: row.id, error: message })
    }
  }

  return {
    processed: queuedEmails?.length ?? 0,
    success,
    failed,
    warning: null as string | null,
    errors,
  }
}
