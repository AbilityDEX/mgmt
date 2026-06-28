import type { CompanySettings } from '@/lib/types/release1'

const DEFAULT_ARCHIVE_MAILBOX = 'mgmtinspect@gmail.com'

export type EmailTransportConfig = {
  fromName: string
  fromEmail: string
  replyToEmail: string | null
}

export function getSubjectPrefix() {
  return (process.env.EMAIL_SUBJECT_PREFIX ?? '').trim()
}

export function applySubjectPrefix(subject: string) {
  const prefix = getSubjectPrefix()
  if (!prefix) return subject
  if (subject.startsWith(`${prefix} `)) return subject
  return `${prefix} ${subject}`
}

export function resolveArchiveMailbox(company: Pick<CompanySettings, 'email'> & { archiveEmail?: string | null }) {
  void company
  return DEFAULT_ARCHIVE_MAILBOX
}

export function resolveCompanyName(company: Pick<CompanySettings, 'companyName'> | null | undefined) {
  return (company?.companyName ?? '').trim() || 'MGMT Inspect'
}

export function resolveEmailEnvelope(input: {
  subject: string
  recipientType: 'to' | 'cc' | 'bcc'
  recipientEmail: string
  smtp: EmailTransportConfig
  companyName: string
}) {
  return {
    from: `"${input.smtp.fromName}" <${input.smtp.fromEmail}>`,
    to: input.recipientType === 'to' ? input.recipientEmail : undefined,
    cc: input.recipientType === 'cc' ? input.recipientEmail : undefined,
    bcc: input.recipientType === 'bcc' ? input.recipientEmail : undefined,
    replyTo: input.smtp.replyToEmail || undefined,
    subject: applySubjectPrefix(input.subject),
    companyName: input.companyName,
  }
}