import crypto from 'crypto'
import nodemailer from 'nodemailer'

import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { INSPECTION_TIMEZONE, normalizeInspectionTimezone } from '@/lib/inspectionTime'
import { resolveCompanyName, resolveEmailEnvelope } from '@/lib/services/emailConfig'
import { buildSmtpTestEmailTemplate } from '@/lib/services/emailMessageTemplates'
import { createTestPDF } from '@/lib/services/pdf'
import { getCompanySettings } from '@/lib/services/companySettings'

type SmtpEncryption = 'SSL/TLS' | 'STARTTLS' | 'NONE'

type StoredSmtpConfig = {
  host: string
  port: number
  username: string
  passwordCiphertext: string
  passwordIv: string
  passwordTag: string
  encryption: SmtpEncryption
  fromName: string
  fromEmail: string
  replyToEmail: string | null
  updatedAt: string
  orgSettings?: {
    archiveEmail?: string | null
    supportEmail?: string | null
    timezone?: string | null
    dateFormat?: string | null
    timeFormat?: string | null
    dailyReminderSendTime?: string | null
    dueSoonWarningDays?: number | null
    enableDueSoon?: boolean | null
    enableEmployeeReminderEmails?: boolean | null
    enableManagementOverdueNotifications?: boolean | null
  }
}

export type SmtpOrgSettingsInput = {
  archiveEmail?: string | null
  supportEmail?: string | null
  timezone?: string | null
  dateFormat?: string | null
  timeFormat?: string | null
  dailyReminderSendTime?: string | null
  dueSoonWarningDays?: number | null
  enableDueSoon?: boolean | null
  enableEmployeeReminderEmails?: boolean | null
  enableManagementOverdueNotifications?: boolean | null
}

export type SmtpConfigInput = {
  host: string
  port: number
  username: string
  password: string
  encryption: SmtpEncryption
  fromName: string
  fromEmail: string
  replyToEmail: string | null
}

export type SmtpConfigPublic = {
  configured: boolean
  host: string
  port: number
  username: string
  encryption: SmtpEncryption
  fromName: string
  fromEmail: string
  replyToEmail: string | null
  hasPassword: boolean
  updatedAt: string | null
  orgSettings: {
    archiveEmail: string | null
    supportEmail: string | null
    timezone: string | null
    dateFormat: string | null
    timeFormat: string | null
    dailyReminderSendTime: string | null
    dueSoonWarningDays: number | null
    enableDueSoon: boolean | null
    enableEmployeeReminderEmails: boolean | null
    enableManagementOverdueNotifications: boolean | null
  }
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function getEncryptionKey() {
  const raw = process.env.SMTP_CONFIG_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!raw) {
    throw new Error('Missing SMTP_CONFIG_ENCRYPTION_KEY (or SUPABASE_SERVICE_ROLE_KEY fallback) for SMTP secret encryption.')
  }

  return crypto.createHash('sha256').update(raw).digest()
}

function encryptSecret(plainText: string) {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    passwordCiphertext: ciphertext.toString('base64'),
    passwordIv: iv.toString('base64'),
    passwordTag: tag.toString('base64'),
  }
}

function decryptSecret(payload: Pick<StoredSmtpConfig, 'passwordCiphertext' | 'passwordIv' | 'passwordTag'>) {
  const key = getEncryptionKey()
  const iv = Buffer.from(payload.passwordIv, 'base64')
  const tag = Buffer.from(payload.passwordTag, 'base64')
  const ciphertext = Buffer.from(payload.passwordCiphertext, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plainText = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  return plainText
}

function validateInput(input: SmtpConfigInput, options?: { allowEmptyPassword?: boolean }) {
  const errors: string[] = []

  if (!input.host.trim()) errors.push('SMTP host is required.')
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) errors.push('SMTP port must be between 1 and 65535.')
  if (!input.username.trim()) errors.push('SMTP username is required.')
  if (!options?.allowEmptyPassword && !input.password.trim()) errors.push('SMTP password is required.')
  if (!['SSL/TLS', 'STARTTLS', 'NONE'].includes(input.encryption)) errors.push('Encryption must be SSL/TLS, STARTTLS, or NONE.')
  if (!input.fromName.trim()) errors.push('From name is required.')
  if (!isValidEmail(input.fromEmail.trim())) errors.push('From email is invalid.')
  if (input.replyToEmail && !isValidEmail(input.replyToEmail.trim())) errors.push('Reply-to email is invalid.')

  return errors
}

function mapStoredToPublic(config: StoredSmtpConfig | null): SmtpConfigPublic {
  if (!config) {
    return {
      configured: false,
      host: '',
      port: 587,
      username: '',
      encryption: 'STARTTLS',
      fromName: 'MGMT Inspect',
      fromEmail: '',
      replyToEmail: null,
      hasPassword: false,
      updatedAt: null,
      orgSettings: {
        archiveEmail: null,
        supportEmail: null,
        timezone: INSPECTION_TIMEZONE,
        dateFormat: null,
        timeFormat: null,
        dailyReminderSendTime: null,
        dueSoonWarningDays: null,
        enableDueSoon: null,
        enableEmployeeReminderEmails: null,
        enableManagementOverdueNotifications: null,
      },
    }
  }

  return {
    configured: true,
    host: config.host,
    port: config.port,
    username: config.username,
    encryption: config.encryption,
    fromName: config.fromName,
    fromEmail: config.fromEmail,
    replyToEmail: config.replyToEmail,
    hasPassword: Boolean(config.passwordCiphertext),
    updatedAt: config.updatedAt,
    orgSettings: {
      archiveEmail: config.orgSettings?.archiveEmail ?? null,
      supportEmail: config.orgSettings?.supportEmail ?? null,
      timezone: normalizeInspectionTimezone(config.orgSettings?.timezone ?? null),
      dateFormat: config.orgSettings?.dateFormat ?? null,
      timeFormat: config.orgSettings?.timeFormat ?? null,
      dailyReminderSendTime: config.orgSettings?.dailyReminderSendTime ?? null,
      dueSoonWarningDays: config.orgSettings?.dueSoonWarningDays ?? null,
      enableDueSoon: config.orgSettings?.enableDueSoon ?? null,
      enableEmployeeReminderEmails: config.orgSettings?.enableEmployeeReminderEmails ?? null,
      enableManagementOverdueNotifications: config.orgSettings?.enableManagementOverdueNotifications ?? null,
    },
  }
}

async function getRawStoredConfig() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const { data, error } = await supabaseAdmin
    .from('company_settings')
    .select('id, smtp_config, smtp_updated_at')
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.message.toLowerCase().includes('column') && error.message.toLowerCase().includes('smtp_config')) {
      return { companySettingsId: null as string | null, config: null as StoredSmtpConfig | null, migrationMissing: true }
    }
    throw error
  }

  if (!data) {
    return { companySettingsId: null as string | null, config: null as StoredSmtpConfig | null, migrationMissing: false }
  }

  const config = (data.smtp_config as StoredSmtpConfig | null) ?? null
  if (!config) {
    return {
      companySettingsId: data.id as string,
      config: null,
      migrationMissing: false,
    }
  }

  return {
    companySettingsId: data.id as string,
    config: {
      ...config,
      updatedAt: (data.smtp_updated_at as string | null) ?? config.updatedAt,
    },
    migrationMissing: false,
  }
}

export async function getSmtpConfigSummary() {
  const stored = await getRawStoredConfig()
  return {
    ...mapStoredToPublic(stored.config),
    migrationMissing: stored.migrationMissing,
    warning: stored.migrationMissing
      ? 'SMTP settings migration is pending. Run database migrations to enable SMTP configuration.'
      : stored.config
        ? null
        : 'SMTP is not configured yet.',
  }
}

export async function saveSmtpConfig(input: SmtpConfigInput) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const stored = await getRawStoredConfig()

  const hasExistingPassword = Boolean(stored.config?.passwordCiphertext)
  const errors = validateInput(input, { allowEmptyPassword: hasExistingPassword && !input.password.trim() })
  if (errors.length > 0) {
    return { ok: false as const, errors }
  }

  if (stored.migrationMissing) {
    return {
      ok: false as const,
      errors: ['SMTP settings migration is pending. Please run database migrations first.'],
    }
  }

  if (!stored.companySettingsId) {
    return {
      ok: false as const,
      errors: ['Company settings row is missing. Configure company settings first.'],
    }
  }

  const encrypted = input.password.trim()
    ? encryptSecret(input.password)
    : {
        passwordCiphertext: stored.config?.passwordCiphertext ?? '',
        passwordIv: stored.config?.passwordIv ?? '',
        passwordTag: stored.config?.passwordTag ?? '',
      }
  const nowIso = new Date().toISOString()

  const payload: StoredSmtpConfig = {
    host: input.host.trim(),
    port: input.port,
    username: input.username.trim(),
    ...encrypted,
    encryption: input.encryption,
    fromName: input.fromName.trim(),
    fromEmail: input.fromEmail.trim(),
    replyToEmail: input.replyToEmail?.trim() || null,
    updatedAt: nowIso,
    orgSettings: stored.config?.orgSettings ?? {
      archiveEmail: null,
      supportEmail: null,
      timezone: INSPECTION_TIMEZONE,
      dateFormat: null,
      timeFormat: null,
      dailyReminderSendTime: '07:00',
      dueSoonWarningDays: 2,
      enableDueSoon: true,
      enableEmployeeReminderEmails: true,
      enableManagementOverdueNotifications: true,
    },
  }

  const { error } = await supabaseAdmin
    .from('company_settings')
    .update({ smtp_config: payload, smtp_updated_at: nowIso })
    .eq('id', stored.companySettingsId)

  if (error) {
    return { ok: false as const, errors: [error.message] }
  }

  return {
    ok: true as const,
    config: mapStoredToPublic(payload),
  }
}

export async function getSmtpTransport() {
  const stored = await getRawStoredConfig()

  if (stored.migrationMissing) {
    return {
      configured: false,
      warning: 'SMTP settings migration is pending. Run database migrations to enable SMTP configuration.',
      transport: null as null,
    }
  }

  if (!stored.config) {
    return {
      configured: false,
      warning: 'SMTP is not configured. Emails remain queued until SMTP settings are saved.',
      transport: null as null,
    }
  }

  try {
    const password = decryptSecret(stored.config)
    const secure = stored.config.encryption === 'SSL/TLS'
    const requireTLS = stored.config.encryption === 'STARTTLS'

    const transporter = nodemailer.createTransport({
      host: stored.config.host,
      port: stored.config.port,
      secure,
      requireTLS,
      auth: {
        user: stored.config.username,
        pass: password,
      },
    })

    return {
      configured: true,
      warning: null as string | null,
      transport: {
        transporter,
        fromEmail: stored.config.fromEmail,
        fromName: stored.config.fromName,
        replyToEmail: stored.config.replyToEmail,
      },
    }
  } catch (error) {
    return {
      configured: false,
      warning: error instanceof Error ? `SMTP config could not be decrypted: ${error.message}` : 'SMTP config could not be decrypted.',
      transport: null as null,
    }
  }
}

export async function saveSmtpOrgSettings(input: SmtpOrgSettingsInput) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const stored = await getRawStoredConfig()
  if (stored.migrationMissing) {
    return {
      ok: false as const,
      errors: ['SMTP settings migration is pending. Please run database migrations first.'],
    }
  }

  if (!stored.companySettingsId) {
    return {
      ok: false as const,
      errors: ['Company settings row is missing. Configure company settings first.'],
    }
  }

  const base = stored.config ?? {
    host: '',
    port: 587,
    username: '',
    passwordCiphertext: '',
    passwordIv: '',
    passwordTag: '',
    encryption: 'STARTTLS' as SmtpEncryption,
    fromName: 'MGMT Inspect',
    fromEmail: '',
    replyToEmail: null,
    updatedAt: new Date().toISOString(),
    orgSettings: {},
  }

  const payload: StoredSmtpConfig = {
    ...base,
    orgSettings: {
      archiveEmail: input.archiveEmail?.trim() || null,
      supportEmail: input.supportEmail?.trim() || null,
      timezone: INSPECTION_TIMEZONE,
      dateFormat: input.dateFormat?.trim() || null,
      timeFormat: input.timeFormat?.trim() || null,
      dailyReminderSendTime: input.dailyReminderSendTime?.trim() || null,
      dueSoonWarningDays: input.dueSoonWarningDays ?? null,
      enableDueSoon: input.enableDueSoon ?? null,
      enableEmployeeReminderEmails: input.enableEmployeeReminderEmails ?? null,
      enableManagementOverdueNotifications: input.enableManagementOverdueNotifications ?? null,
    },
  }

  const nowIso = new Date().toISOString()
  payload.updatedAt = nowIso

  const { error } = await supabaseAdmin
    .from('company_settings')
    .update({ smtp_config: payload, smtp_updated_at: nowIso })
    .eq('id', stored.companySettingsId)

  if (error) {
    return { ok: false as const, errors: [error.message] }
  }

  return {
    ok: true as const,
    config: mapStoredToPublic(payload),
  }
}

export async function verifySmtpConnection() {
  const smtp = await getSmtpTransport()
  if (!smtp.transport) {
    return { ok: false, warning: smtp.warning || 'SMTP is not configured.' }
  }

  try {
    await smtp.transport.transporter.verify()
    return { ok: true, warning: null as string | null }
  } catch (error) {
    return { ok: false, warning: error instanceof Error ? error.message : 'SMTP verification failed.' }
  }
}

export async function sendSmtpTestEmail() {
  const smtp = await getSmtpTransport()
  if (!smtp.transport) {
    return {
      ok: false as const,
      message: smtp.warning || 'SMTP is not configured.',
    }
  }

  const company = await getCompanySettings().catch(() => ({
    companyName: 'MGMT Inspect',
    reportFooter: 'Generated by MGMT Inspect',
  }))

  const pdf = await createTestPDF({
    title: 'SMTP Test PDF Attachment',
    lines: [
      'This is a production SMTP test attachment.',
      `Generated at: ${new Date().toISOString()}`,
    ],
    company: {
      companyName: company.companyName,
      reportFooter: company.reportFooter,
      address: 'address' in company ? company.address : null,
      telephone: 'telephone' in company ? company.telephone : null,
      email: 'email' in company ? company.email : null,
      website: 'website' in company ? company.website : null,
    },
  })

  const to = smtp.transport.replyToEmail || smtp.transport.fromEmail
  const companyName = resolveCompanyName(company)
  const template = buildSmtpTestEmailTemplate({
    companyName,
    generatedAt: new Date().toISOString(),
  })
  const envelope = resolveEmailEnvelope({
    subject: template.subject,
    recipientType: 'to',
    recipientEmail: to,
    smtp: smtp.transport,
    companyName,
  })

  try {
    await smtp.transport.transporter.sendMail({
      from: envelope.from,
      to: envelope.to,
      cc: envelope.cc,
      bcc: envelope.bcc,
      replyTo: envelope.replyTo,
      subject: envelope.subject,
      html: template.html,
      text: template.text,
      attachments: [
        {
          filename: 'smtp-test.pdf',
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    })
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : 'SMTP test email failed.',
    }
  }

  return {
    ok: true as const,
    message: `Test email sent to ${to}.`,
  }
}
