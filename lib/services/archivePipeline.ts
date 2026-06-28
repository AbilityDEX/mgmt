import crypto from 'crypto'

import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { getCompanySettings } from '@/lib/services/companySettings'
import { applySubjectPrefix, resolveArchiveMailbox, resolveCompanyName, resolveEmailEnvelope } from '@/lib/services/emailConfig'
import { buildArchiveRetryStatusTemplate, buildInspectionArchiveEmailTemplate } from '@/lib/services/emailMessageTemplates'
import { createArchivePDF } from '@/lib/services/pdf'
import { getSmtpTransport } from '@/lib/services/smtpConfig'

type InspectionForArchive = {
  id: string
  machineId: string
  machineName: string
  assetId: string | null
  machineArea: string | null
  templateName: string
  inspectionFrequency: string | null
  status: string
  startedAt: string | null
  completedAt: string | null
  operatorName: string
  dueAt: string | null
}

type InspectionItemForArchive = {
  id: string
  displayOrder: number
  question: string
  questionType: string
  answer: string | null
  comments: string | null
  photos: Array<{ id: string; url: string; timestamp: string; caption: string | null }>
  signatureData: string | null
}

type DefectForArchive = {
  id: string
  title: string
  severity: string
  status: string
  description: string | null
}

type ArchiveJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying' | 'cancelled'

function formatDateTime(value: string | null) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleString('en-GB', { hour12: false })
}

function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return 'N/A'
  const startMs = new Date(startedAt).getTime()
  const endMs = new Date(completedAt).getTime()
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return 'N/A'

  const totalMinutes = Math.round((endMs - startMs) / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

function logArchiveStage(stage: string, details: Record<string, unknown>) {
  console.info('[archive-pipeline]', { stage, ...details })
}

function logArchiveEvent(input: {
  event: 'email_sent' | 'email_failed' | 'retry_queued' | 'retry_succeeded' | 'pdf_generated' | 'archive_created'
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

function formatDateForFilename(value: string | null) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function sanitizeFilenamePart(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 'Unknown Machine'
  return trimmed.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80)
}


async function loadInspectionArchiveData(inspectionId: string) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const { data: inspectionData, error: inspectionError } = await supabaseAdmin
    .from('inspections')
    .select('id, machine_id, schedule_id, template_name, status, started_at, completed_at, operator_name, due_at')
    .eq('id', inspectionId)
    .maybeSingle()

  if (inspectionError) throw inspectionError
  if (!inspectionData) throw new Error('Inspection not found.')

  const { data: machineData, error: machineError } = await supabaseAdmin
    .from('machines')
    .select('id, name, area, code')
    .eq('id', inspectionData.machine_id as string)
    .maybeSingle()

  if (machineError) throw machineError

  let inspectionFrequency: string | null = null
  if (inspectionData.schedule_id) {
    const { data: scheduleData } = await supabaseAdmin
      .from('inspection_schedules')
      .select('machine_template_id, machine_inspection_templates(inspection_frequency)')
      .eq('id', inspectionData.schedule_id as string)
      .maybeSingle()

    const assignment = (scheduleData?.machine_inspection_templates as Record<string, unknown> | Record<string, unknown>[] | null) ?? null
    const row = Array.isArray(assignment) ? assignment[0] : assignment
    inspectionFrequency = (row?.inspection_frequency as string | null) ?? null
  }

  const { data: itemsData, error: itemsError } = await supabaseAdmin
    .from('inspection_items')
    .select('id, display_order, question, question_type, answer, comments')
    .eq('inspection_id', inspectionId)
    .order('display_order', { ascending: true })

  if (itemsError) throw itemsError

  const itemIds = (itemsData ?? []).map((row) => row.id as string)
  const photoByItemId = new Map<string, Array<{ id: string; url: string; timestamp: string; caption: string | null }>>()

  if (itemIds.length > 0) {
    const { data: photosData, error: photosError } = await supabaseAdmin
      .from('photo_uploads')
      .select('id, inspection_item_id, storage_path, caption, uploaded_at')
      .in('inspection_item_id', itemIds)
      .order('uploaded_at', { ascending: true })

    if (photosError) {
      const message = photosError.message.toLowerCase()
      const photoTableMissing = message.includes("could not find the table 'public.photo_uploads'") || message.includes('photo_uploads')
      if (!photoTableMissing) {
        throw photosError
      }
      logArchiveStage('photo-evidence-unavailable', {
        inspectionId,
        reason: photosError.message,
      })
    } else {
      for (const photo of photosData ?? []) {
        const itemId = photo.inspection_item_id as string
        const existing = photoByItemId.get(itemId) ?? []
        existing.push({
          id: photo.id as string,
          url: photo.storage_path as string,
          timestamp: (photo.uploaded_at as string | null) ?? new Date().toISOString(),
          caption: (photo.caption as string | null) ?? null,
        })
        photoByItemId.set(itemId, existing)
      }
    }
  }

  const { data: defectsData, error: defectsError } = await supabaseAdmin
    .from('defects')
    .select('id, title, severity, status, description')
    .eq('inspection_id', inspectionId)

  if (defectsError) throw defectsError

  const items = (itemsData ?? []).map((row) => {
    const answer = (row.answer as string | null) ?? null
    const questionType = (row.question_type as string) ?? ''
    const signatureData =
      questionType.toLowerCase() === 'signature' && answer?.startsWith('data:image/')
        ? answer
        : null

    return {
      id: row.id as string,
      displayOrder: Number(row.display_order ?? 0),
      question: row.question as string,
      questionType,
      answer,
      comments: (row.comments as string | null) ?? null,
      photos: photoByItemId.get(row.id as string) ?? [],
      signatureData,
    }
  })

  const defects = (defectsData ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    severity: row.severity as string,
    status: row.status as string,
    description: (row.description as string | null) ?? null,
  }))

  const failCount = items.filter((item) => item.answer === 'fail').length
  const incompleteCount = items.filter((item) => !item.answer).length
  const overallResult: 'PASS' | 'FAIL' | 'INCOMPLETE' = failCount > 0
    ? 'FAIL'
    : incompleteCount > 0
      ? 'INCOMPLETE'
      : 'PASS'

  const inspection: InspectionForArchive = {
    id: inspectionData.id as string,
    machineId: inspectionData.machine_id as string,
    machineName: (machineData?.name as string) || 'Unknown Machine',
    assetId: (machineData?.code as string | null) ?? null,
    machineArea: (machineData?.area as string | null) ?? null,
    templateName: (inspectionData.template_name as string) || 'Inspection',
    inspectionFrequency,
    status: (inspectionData.status as string) || 'Completed',
    startedAt: (inspectionData.started_at as string | null) ?? null,
    completedAt: (inspectionData.completed_at as string | null) ?? null,
    operatorName: (inspectionData.operator_name as string) || 'Unknown User',
    dueAt: (inspectionData.due_at as string | null) ?? null,
  }

  return { inspection, items, defects, overallResult }
}

async function logDelivery(input: {
  inspectionId: string
  archiveId: string | null
  pdfGenerated: boolean
  emailSent: boolean
  archived: boolean
  status: 'success' | 'failed' | 'retrying' | 'skipped'
  failureReason?: string | null
  retryCount: number
  recipients: Array<{ type: 'to' | 'cc' | 'bcc'; email: string; name: string }>
}) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const result = await supabaseAdmin
    .from('archive_delivery_logs')
    .insert([
      {
        inspection_id: input.inspectionId,
        archive_id: input.archiveId,
        pdf_generated: input.pdfGenerated,
        email_sent: input.emailSent,
        archived: input.archived,
        status: input.status,
        failure_reason: input.failureReason ?? null,
        retry_count: input.retryCount,
        recipient_snapshot: input.recipients,
        archive_status: input.archived ? 'archived' : input.status === 'failed' ? 'failed' : 'pending',
        archive_last_error: input.failureReason ?? null,
        archive_timestamp: new Date().toISOString(),
        archive_reference: input.archiveId,
      },
    ])
    .select('id')
    .maybeSingle()

  return (result.data?.id as string | undefined) ?? null
}

async function logInspectionEmailHistory(input: {
  inspectionId: string
  templateId: string | null
  archiveId: string | null
  recipientEmail: string
  recipientType: 'to' | 'cc' | 'bcc'
  subject: string
  status: 'queued' | 'sent' | 'failed' | 'skipped'
  errorMessage?: string | null
}) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  await supabaseAdmin.from('inspection_email_history').insert([
    {
      inspection_id: input.inspectionId,
      template_id: input.templateId,
      archive_id: input.archiveId,
      recipient_email: input.recipientEmail,
      recipient_type: input.recipientType,
      subject: input.subject,
      status: input.status,
      error_message: input.errorMessage ?? null,
      sent_at: input.status === 'sent' ? new Date().toISOString() : null,
    },
  ])
}

async function createArchiveJob(input: {
  inspectionId: string
  archiveId: string | null
  archiveDeliveryLogId: string | null
  status: ArchiveJobStatus
  archiveStatus: 'pending' | 'archived' | 'failed'
  retryCount: number
  archiveLastError?: string | null
  nextRetryAt?: string | null
}) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const nowIso = new Date().toISOString()
  const result = await supabaseAdmin
    .from('archive_jobs')
    .insert([
      {
        inspection_id: input.inspectionId,
        archive_id: input.archiveId,
        archive_delivery_log_id: input.archiveDeliveryLogId,
        status: input.status,
        archive_status: input.archiveStatus,
        archive_last_error: input.archiveLastError ?? null,
        archive_timestamp: nowIso,
        archive_reference: input.archiveId,
        retry_count: input.retryCount,
        next_retry_at: input.nextRetryAt ?? null,
      },
    ])
    .select('id')
    .maybeSingle()

  return (result.data?.id as string | undefined) ?? null
}

async function enqueueEmailForRetry(input: {
  inspectionId: string
  recipientEmail: string
  recipientType: 'to' | 'cc' | 'bcc'
  subject: string
  body: string
  status: 'pending' | 'failed'
  attemptCount: number
  errorMessage?: string | null
}) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const nowIso = new Date().toISOString()
  const result = await supabaseAdmin.from('email_queue').insert([
    {
      inspection_id: input.inspectionId,
      recipient_email: input.recipientEmail,
      recipient_type: input.recipientType,
      subject: input.subject,
      body: input.body,
      status: input.status,
      attempt_count: input.attemptCount,
      error_message: input.errorMessage ?? null,
      last_attempt_at: input.status === 'failed' ? nowIso : null,
      next_retry_at: input.status === 'failed' || input.status === 'pending'
        ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
        : null,
      created_at: nowIso,
    },
  ])

  if (result.error && !result.error.message.toLowerCase().includes("could not find the table 'public.email_queue'")) {
    throw result.error
  }
}

async function updateInspectionArchiveState(input: {
  inspectionId: string
  archiveStatus: 'pending' | 'archived' | 'failed'
  archiveRetryCount?: number
  archiveLastError?: string | null
  archiveReference?: string | null
  archivedAt?: string | null
}) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const updates: Record<string, unknown> = {
    archive_status: input.archiveStatus,
    archive_last_attempt_at: new Date().toISOString(),
  }

  if (input.archiveRetryCount !== undefined) updates.archive_retry_count = input.archiveRetryCount
  if (input.archiveLastError !== undefined) updates.archive_last_error = input.archiveLastError
  if (input.archiveReference !== undefined) updates.archived_reference = input.archiveReference
  if (input.archivedAt !== undefined) updates.archived_at = input.archivedAt

  await supabaseAdmin.from('inspections').update(updates).eq('id', input.inspectionId)
}

export async function archiveInspectionAndSendEmail(params: {
  inspectionId: string
  triggeredBy?: string
  requireEmailDelivery?: boolean
}) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  logArchiveStage('start', { inspectionId: params.inspectionId, triggeredBy: params.triggeredBy ?? null })

  const { inspection, items, defects, overallResult } = await loadInspectionArchiveData(params.inspectionId)
  logArchiveStage('loaded-inspection', {
    inspectionId: inspection.id,
    itemCount: items.length,
    defectCount: defects.length,
    result: overallResult,
  })

  const company = await getCompanySettings()
  logArchiveStage('loaded-company', {
    inspectionId: inspection.id,
    companyName: company.companyName,
  })

  const pdf = await createArchivePDF({
    company: {
      companyName: company.companyName,
      logoUrl: company.logoUrl,
      address: company.address,
      telephone: company.telephone,
      email: company.email,
      website: company.website,
      reportFooter: company.reportFooter,
      primaryColor: company.reportPrimaryColor,
      accentColor: company.reportAccentColor,
    },
    reportTitle: 'Inspection Archive Report',
    machineName: inspection.machineName,
    assetId: inspection.assetId,
    department: inspection.machineArea,
    templateName: inspection.templateName,
    inspectionFrequency: inspection.inspectionFrequency,
    inspectionStatus: inspection.status,
    inspector: inspection.operatorName,
    startedAt: inspection.startedAt,
    completedAt: inspection.completedAt,
    result: overallResult,
    reference: inspection.id,
    items,
    defects,
  })
  logArchiveStage('pdf-generated', {
    inspectionId: inspection.id,
    bytes: pdf.byteLength,
  })
  logArchiveEvent({
    event: 'pdf_generated',
    inspectionId: inspection.id,
    machineId: inspection.machineId,
    referenceNumber: inspection.id,
    details: { bytes: pdf.byteLength },
  })

  const checksum = crypto.createHash('sha256').update(pdf).digest('hex')
  const fileDate = formatDateForFilename(inspection.completedAt)
  const fileName = `Inspection Report - ${sanitizeFilenamePart(inspection.machineName)} - ${fileDate}.pdf`

  const { data: archiveData, error: archiveError } = await supabaseAdmin
    .from('inspection_archives')
    .upsert(
      [
        {
          inspection_id: inspection.id,
          file_name: fileName,
          content_type: 'application/pdf',
          pdf_base64: pdf.toString('base64'),
          checksum,
          generated_at: new Date().toISOString(),
          generated_by: params.triggeredBy ?? null,
        },
      ],
      { onConflict: 'inspection_id' }
    )
    .select('id')
    .single()

  if (archiveError || !archiveData) {
    logArchiveStage('archive-upsert-failed', {
      inspectionId: inspection.id,
      error: archiveError?.message ?? 'Unknown archive save failure',
    })
    await updateInspectionArchiveState({
      inspectionId: inspection.id,
      archiveStatus: 'failed',
      archiveLastError: archiveError?.message || 'Failed to save PDF archive.',
    })

    await logDelivery({
      inspectionId: inspection.id,
      archiveId: null,
      pdfGenerated: false,
      emailSent: false,
      archived: false,
      status: 'failed',
      failureReason: archiveError?.message || 'Failed to save PDF archive.',
      retryCount: 0,
      recipients: [],
    })

    throw archiveError ?? new Error('Failed to save PDF archive.')
  }

  const archiveId = archiveData.id as string
  logArchiveStage('archive-upserted', { inspectionId: inspection.id, archiveId, fileName })
  logArchiveEvent({
    event: 'archive_created',
    inspectionId: inspection.id,
    machineId: inspection.machineId,
    referenceNumber: inspection.id,
    details: { archiveId, fileName },
  })

  const archiveRecipient = resolveArchiveMailbox({ email: company.email, archiveEmail: (company as { archiveEmail?: string | null }).archiveEmail ?? null })
  const companyName = resolveCompanyName(company)
  const recipients = [
    {
      id: 'company-archive-mailbox',
      name: 'Company Archive Mailbox',
      email: archiveRecipient,
      recipientType: 'to' as const,
    },
  ]

  logArchiveStage('recipients-filtered', {
    inspectionId: inspection.id,
    totalRecipients: recipients.length,
    to: 1,
    cc: 0,
    bcc: 0,
    archiveRecipient,
  })
  const emailContent = buildInspectionArchiveEmailTemplate({
    machineName: inspection.machineName || 'N/A',
    templateName: inspection.templateName || 'N/A',
    inspector: inspection.operatorName || 'N/A',
    result: overallResult,
    completedAt: formatDateTime(inspection.completedAt),
    reference: inspection.id || 'N/A',
  })
  const queuedSubject = applySubjectPrefix(emailContent.subject)

  const smtpState = await getSmtpTransport()
  const smtp = smtpState.transport
  logArchiveStage('smtp-resolved', {
    inspectionId: inspection.id,
    configured: Boolean(smtp),
    warning: smtpState.warning ?? null,
  })
  let finalJobStatus: ArchiveJobStatus = 'running'
  let finalArchiveStatus: 'pending' | 'archived' | 'failed' = 'pending'
  let finalJobError: string | null = null
  let finalNextRetryAt: string | null = null

  const runningJobId = await createArchiveJob({
    inspectionId: inspection.id,
    archiveId,
    archiveDeliveryLogId: null,
    status: 'running',
    archiveStatus: 'pending',
    retryCount: 0,
  })

  if (!smtp) {
    const smtpMissingMessage = smtpState.warning || 'SMTP configuration is not available.'
    if (params.requireEmailDelivery) {
      throw new Error(smtpMissingMessage)
    }

    logArchiveStage('smtp-missing', {
      inspectionId: inspection.id,
      warning: smtpMissingMessage,
    })
    // SMTP not configured - queue for later delivery instead of failing
    await updateInspectionArchiveState({
      inspectionId: inspection.id,
      archiveStatus: 'pending',
      archiveLastError: null,
      archiveReference: archiveId,
    })

    const logId = await logDelivery({
      inspectionId: inspection.id,
      archiveId,
      pdfGenerated: true,
      emailSent: false,
      archived: false,
      status: 'skipped',
      failureReason: smtpState.warning || 'SMTP configuration is not available. Email will be queued for delivery.',
      retryCount: 0,
      recipients: recipients.map((r) => ({
        type: r.recipientType,
        email: r.email,
        name: r.name,
      })),
    })

    await createArchiveJob({
      inspectionId: inspection.id,
      archiveId,
      archiveDeliveryLogId: logId,
      status: 'retrying',
      archiveStatus: 'pending',
      retryCount: 0,
      archiveLastError: smtpMissingMessage,
      nextRetryAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    finalJobStatus = 'retrying'
    finalArchiveStatus = 'pending'
    finalJobError = smtpMissingMessage
    finalNextRetryAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    // Queue all emails for later delivery
    if (supabaseAdmin) {
      await enqueueEmailForRetry({
        inspectionId: inspection.id,
        recipientEmail: archiveRecipient,
        recipientType: 'to',
        subject: queuedSubject,
        body: emailContent.text,
        status: 'pending',
        attemptCount: 0,
      })

      await logInspectionEmailHistory({
        inspectionId: inspection.id,
        templateId: null,
        archiveId,
        recipientEmail: archiveRecipient,
        recipientType: 'to',
        subject: queuedSubject,
        status: 'queued',
      })
    }

    logArchiveEvent({
      event: 'retry_queued',
      inspectionId: inspection.id,
      machineId: inspection.machineId,
      referenceNumber: inspection.id,
      details: { reason: smtpMissingMessage },
    })

    return {
      inspectionId: inspection.id,
      archiveId,
      recipients: recipients.length,
      overallResult,
      emailSent: false,
      queuedForDelivery: true,
    }
  }

  try {
    logArchiveStage('smtp-send-start', {
      inspectionId: inspection.id,
      to: 1,
      cc: 0,
      bcc: 0,
    })
    const mail = resolveEmailEnvelope({
      subject: emailContent.subject,
      recipientType: 'to',
      recipientEmail: archiveRecipient,
      smtp,
      companyName,
    })

    await smtp.transporter.sendMail({
      from: mail.from,
      to: mail.to,
      cc: mail.cc,
      bcc: mail.bcc,
      replyTo: mail.replyTo,
      subject: mail.subject,
      text: emailContent.text,
      html: emailContent.html,
      attachments: [
        {
          filename: fileName,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    })
    logArchiveStage('smtp-send-success', { inspectionId: inspection.id, archiveId })
    logArchiveEvent({
      event: 'email_sent',
      inspectionId: inspection.id,
      machineId: inspection.machineId,
      referenceNumber: inspection.id,
      details: { archiveId, recipient: archiveRecipient },
    })

    const logId = await logDelivery({
      inspectionId: inspection.id,
      archiveId,
      pdfGenerated: true,
      emailSent: true,
      archived: true,
      status: 'success',
      retryCount: 0,
      recipients: recipients.map((r) => ({
        type: r.recipientType,
        email: r.email,
        name: r.name,
      })),
    })
    logArchiveStage('delivery-log-created', { inspectionId: inspection.id, archiveId, logId })

    await createArchiveJob({
      inspectionId: inspection.id,
      archiveId,
      archiveDeliveryLogId: logId,
      status: 'completed',
      archiveStatus: 'archived',
      retryCount: 0,
    })
    logArchiveStage('archive-job-completed', { inspectionId: inspection.id, archiveId })
    finalJobStatus = 'completed'
    finalArchiveStatus = 'archived'
    finalJobError = null
    finalNextRetryAt = null

    for (const recipient of recipients) {
      await logInspectionEmailHistory({
        inspectionId: inspection.id,
        templateId: null,
        archiveId,
        recipientEmail: recipient.email,
        recipientType: recipient.recipientType,
        subject: mail.subject,
        status: 'sent',
      })
    }

    await updateInspectionArchiveState({
      inspectionId: inspection.id,
      archiveStatus: 'archived',
      archiveRetryCount: 0,
      archiveLastError: null,
      archiveReference: archiveId,
      archivedAt: new Date().toISOString(),
    })
    logArchiveStage('archive-state-updated', { inspectionId: inspection.id, archiveId, archiveStatus: 'archived' })
  } catch (emailError) {
    const message = emailError instanceof Error ? emailError.message : 'Email delivery failed.'
    if (params.requireEmailDelivery) {
      throw emailError instanceof Error ? emailError : new Error(message)
    }

    logArchiveStage('smtp-send-failed', { inspectionId: inspection.id, archiveId, error: message })
    logArchiveEvent({
      event: 'email_failed',
      inspectionId: inspection.id,
      machineId: inspection.machineId,
      referenceNumber: inspection.id,
      details: { archiveId, error: message },
    })

    const logId = await logDelivery({
      inspectionId: inspection.id,
      archiveId,
      pdfGenerated: true,
      emailSent: false,
      archived: true,
      status: 'failed',
      retryCount: 0,
      failureReason: message,
      recipients: recipients.map((r) => ({ type: r.recipientType, email: r.email, name: r.name })),
    })
    logArchiveStage('delivery-log-created', { inspectionId: inspection.id, archiveId, logId, status: 'failed' })

    await createArchiveJob({
      inspectionId: inspection.id,
      archiveId,
      archiveDeliveryLogId: logId,
      status: 'retrying',
      archiveStatus: 'failed',
      retryCount: 0,
      archiveLastError: message,
      nextRetryAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    logArchiveStage('archive-job-retrying', { inspectionId: inspection.id, archiveId, error: message })
    finalJobStatus = 'retrying'
    finalArchiveStatus = 'failed'
    finalJobError = message
    finalNextRetryAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    for (const recipient of recipients) {
      await logInspectionEmailHistory({
        inspectionId: inspection.id,
        templateId: null,
        archiveId,
        recipientEmail: recipient.email,
        recipientType: recipient.recipientType,
        subject: queuedSubject,
        status: 'failed',
        errorMessage: message,
      })

      await enqueueEmailForRetry({
        inspectionId: inspection.id,
        recipientEmail: recipient.email,
        recipientType: recipient.recipientType,
        subject: queuedSubject,
        body: emailContent.text,
        status: 'failed',
        attemptCount: 1,
        errorMessage: message,
      })
    }

    logArchiveEvent({
      event: 'retry_queued',
      inspectionId: inspection.id,
      machineId: inspection.machineId,
      referenceNumber: inspection.id,
      details: { archiveId, error: message },
    })

    await updateInspectionArchiveState({
      inspectionId: inspection.id,
      archiveStatus: 'failed',
      archiveLastError: message,
      archiveReference: archiveId,
    })
    logArchiveStage('archive-state-updated', { inspectionId: inspection.id, archiveId, archiveStatus: 'failed' })
  }

  if (runningJobId) {
    await supabaseAdmin
      .from('archive_jobs')
      .update({
        status: finalJobStatus,
        archive_status: finalArchiveStatus,
        archive_last_error: finalJobError,
        next_retry_at: finalNextRetryAt,
        archive_timestamp: new Date().toISOString(),
      })
      .eq('id', runningJobId)
  }

  return {
    inspectionId: inspection.id,
    archiveId,
    recipients: recipients.length,
    overallResult,
    emailSent: true,
  }
}

export async function retryFailedArchiveDeliveries(maxRetries: number) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const [company, smtpState] = await Promise.all([getCompanySettings(), getSmtpTransport()])
  const companyName = resolveCompanyName(company)
  const archiveRecipient = resolveArchiveMailbox({ email: company.email, archiveEmail: (company as { archiveEmail?: string | null }).archiveEmail ?? null })

  const { data, error } = await supabaseAdmin
    .from('inspections')
    .select('id, machine_id, archive_retry_count, completed_at')
    .eq('archive_status', 'failed')
    .lt('archive_retry_count', maxRetries)
    .order('completed_at', { ascending: true })

  if (error) throw error

  const machineIdSet = new Set((data ?? []).map((row) => row.machine_id as string).filter(Boolean))
  const machineNames = new Map<string, string>()
  if (machineIdSet.size > 0) {
    const { data: machineRows } = await supabaseAdmin
      .from('machines')
      .select('id, name')
      .in('id', Array.from(machineIdSet))

    for (const row of machineRows ?? []) {
      machineNames.set(row.id as string, (row.name as string) ?? 'N/A')
    }
  }

  let retried = 0
  let success = 0

  for (const row of data ?? []) {
    const inspectionId = row.id as string
    const currentRetryCount = Number(row.archive_retry_count ?? 0)

    await supabaseAdmin
      .from('inspections')
      .update({ archive_retry_count: currentRetryCount + 1 })
      .eq('id', inspectionId)

    retried += 1
    try {
      await archiveInspectionAndSendEmail({ inspectionId })
      success += 1
      const machineId = (row.machine_id as string) ?? 'N/A'
      const machineName = machineNames.get(machineId) ?? 'N/A'
      logArchiveEvent({
        event: 'retry_succeeded',
        inspectionId,
        machineId,
        referenceNumber: inspectionId,
      })

      if (smtpState.transport) {
        const template = buildArchiveRetryStatusTemplate({
          success: true,
          machineName,
          reference: inspectionId,
          completedAt: (row.completed_at as string | null) ?? new Date().toISOString(),
        })
        const envelope = resolveEmailEnvelope({
          subject: template.subject,
          recipientType: 'to',
          recipientEmail: archiveRecipient,
          smtp: smtpState.transport,
          companyName,
        })

        try {
          await smtpState.transport.transporter.sendMail({
            from: envelope.from,
            to: envelope.to,
            cc: envelope.cc,
            bcc: envelope.bcc,
            replyTo: envelope.replyTo,
            subject: envelope.subject,
            text: template.text,
            html: template.html,
          })
        } catch (notificationError) {
          logArchiveStage('retry-notification-send-failed', {
            inspectionId,
            error: notificationError instanceof Error ? notificationError.message : 'Unknown notification error',
          })
        }
      }
    } catch {
      const machineId = (row.machine_id as string) ?? 'N/A'
      const machineName = machineNames.get(machineId) ?? 'N/A'
      if (smtpState.transport) {
        const template = buildArchiveRetryStatusTemplate({
          success: false,
          machineName,
          reference: inspectionId,
          completedAt: new Date().toISOString(),
          errorMessage: 'Retry failed.',
        })
        const envelope = resolveEmailEnvelope({
          subject: template.subject,
          recipientType: 'to',
          recipientEmail: archiveRecipient,
          smtp: smtpState.transport,
          companyName,
        })

        try {
          await smtpState.transport.transporter.sendMail({
            from: envelope.from,
            to: envelope.to,
            cc: envelope.cc,
            bcc: envelope.bcc,
            replyTo: envelope.replyTo,
            subject: envelope.subject,
            text: template.text,
            html: template.html,
          })
        } catch (notificationError) {
          logArchiveStage('retry-notification-send-failed', {
            inspectionId,
            error: notificationError instanceof Error ? notificationError.message : 'Unknown notification error',
          })
        }
      }

      const logId = await logDelivery({
        inspectionId,
        archiveId: null,
        pdfGenerated: false,
        emailSent: false,
        archived: false,
        status: 'retrying',
        failureReason: 'Retry failed.',
        retryCount: currentRetryCount + 1,
        recipients: [],
      })

      await createArchiveJob({
        inspectionId,
        archiveId: null,
        archiveDeliveryLogId: logId,
        status: 'retrying',
        archiveStatus: 'failed',
        retryCount: currentRetryCount + 1,
        archiveLastError: 'Retry failed.',
        nextRetryAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
    }
  }

  return { retried, success }
}
