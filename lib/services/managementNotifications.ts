import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { listEmailRecipients, resolveManagementRecipients, type ManagementNotificationEvent } from '@/lib/services/emailDistribution'
import { resolveCompanyName, resolveEmailEnvelope } from '@/lib/services/emailConfig'
import { getCompanySettings } from '@/lib/services/companySettings'
import { textToHtmlParagraphs } from '@/lib/services/emailMessageTemplates'
import { getSmtpTransport } from '@/lib/services/smtpConfig'

type ManagementAlertInput = {
  event: ManagementNotificationEvent
  machineId?: string | null
  machineName?: string | null
  machineArea?: string | null
  reference?: string | null
  details: string
  subject: string
  hasDefects?: boolean
  overallResult?: 'PASS' | 'FAIL' | 'INCOMPLETE'
}

export async function sendManagementAlert(input: ManagementAlertInput) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const [smtpState, company, recipients] = await Promise.all([
    getSmtpTransport(),
    getCompanySettings(),
    listEmailRecipients(),
  ])

  if (!smtpState.transport) {
    return { sent: 0, skipped: 0, warning: smtpState.warning ?? 'SMTP not configured.' }
  }

  const selected = resolveManagementRecipients({
    recipients,
    event: input.event,
    machineId: input.machineId ?? null,
    machineArea: input.machineArea ?? null,
    hasDefects: input.hasDefects,
    overallResult: input.overallResult,
  })

  if (selected.length === 0) {
    return { sent: 0, skipped: 0, warning: 'No enabled recipients configured in Email Distribution.' }
  }

  const companyName = resolveCompanyName(company)
  const lines = [
    input.details,
    '',
    `Machine: ${input.machineName ?? 'N/A'}`,
    `Department: ${input.machineArea ?? 'N/A'}`,
    `Reference: ${input.reference ?? 'N/A'}`,
    '',
    'Regards,',
    '',
    companyName,
  ]
  const text = lines.join('\n')
  const html = textToHtmlParagraphs(text)

  let sent = 0
  let skipped = 0

  for (const recipient of selected) {
    try {
      const envelope = resolveEmailEnvelope({
        subject: input.subject,
        recipientType: recipient.recipientType,
        recipientEmail: recipient.email,
        smtp: smtpState.transport,
        companyName,
      })

      await smtpState.transport.transporter.sendMail({
        from: envelope.from,
        to: envelope.to,
        cc: envelope.cc,
        bcc: envelope.bcc,
        replyTo: envelope.replyTo,
        subject: envelope.subject,
        text,
        html,
      })

      sent += 1
    } catch {
      skipped += 1
    }
  }

  return { sent, skipped, warning: null as string | null }
}
