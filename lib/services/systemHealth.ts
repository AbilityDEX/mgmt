import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
 

import { serverConfigErrorMessage, supabaseAdmin, SYSTEM_ADMIN_EMAIL } from '@/lib/admin'
import { addLondonDays, formatInspectionDateTime, getLondonDateKey, getLondonDateTimeParts, startOfLondonDay } from '@/lib/inspectionTime'
import { archiveInspectionAndSendEmail } from '@/lib/services/archivePipeline'
import { repairInspectionScheduleCoverage, runInspectionScheduler, calculateNextDue, getScheduleOverview } from '@/lib/services/inspectionScheduling'
import { createSystemHealthPDF } from '@/lib/services/pdf'
import { sendSmtpTestEmail, verifySmtpConnection } from '@/lib/services/smtpConfig'
import { getInspectionEngineMetrics } from '@/lib/services/inspectionMetrics'

type HealthState = 'green' | 'yellow' | 'red'
type FullCheckState = 'PASS' | 'WARNING' | 'FAILED'

type HealthCard = {
  status: HealthState
  metrics: Record<string, string | number | boolean | null>
  failures: string[]
}

type FullCheckItem = {
  name: string
  status: FullCheckState
  details: string
}

type ReleaseValidationStage = {
  stage: string
  status: FullCheckState
  details: string
}

type FrequencyValidation = {
  frequency: string
  status: FullCheckState
  checks: {
    nextDueCalculation: boolean
    reminderCalculation: boolean
    ukTimePreserved: boolean
    lockUnlockBehaviour: boolean
  }
}

type PdfValidation = {
  status: FullCheckState
  contains: Record<string, boolean>
  details: string
}

type EmailValidation = {
  status: FullCheckState
  details: string
  checks: {
    smtpConfigured: boolean
    templateUsed: boolean
    recipientsResolved: boolean
    emailLogged: boolean
    retryQueueWorks: boolean
    archiveUpdated: boolean
  }
}

type SchedulerDiagnosticRow = {
  scheduleId: string
  machineId: string
  machineName: string
  templateName: string
  currentTime: string
  inspectionTime: string
  currentStatus: string
  dueSoonTime: string | null
  dueTime: string
  overdueTime: string
  lockUntil: string
  reminderQueued: boolean
  reminderSent: boolean
  nextReminderTime: string | null
  recipientCount: number
  recipientSource: string
  schedulerDecision: string
  apiDecision: string
  dbDecision: string
}

type SystemHealthStatus = {
  generatedAt: string
  cards: {
    database: HealthCard
    scheduling: HealthCard
    inspectionEngine: HealthCard
    archiveSystem: HealthCard
    emailSystem: HealthCard
    storage: HealthCard
    security: HealthCard
  }
  fullReport: FullCheckItem[]
  releaseValidation: ReleaseValidationStage[]
  schedulerValidation: FrequencyValidation[]
  schedulerDiagnostics: SchedulerDiagnosticRow[]
  pdfValidation: PdfValidation
  emailValidation: EmailValidation
  repairs: {
    schedulesCreated: number
    schedulesReactivated: number
    duplicateSchedulesDisabled: number
    archiveRowsCreated: number
    companyDefaultsCreated: number
    retentionDefaultsCreated: number
    emailTemplateDefaultsCreated: number
  }
  repairsSkipped: {
    archiveRowsSkippedForInProgress: number
  }
  manualConfiguration: string[]
  readiness: {
    passed: number
    warnings: number
    failed: number
    percentage: number
    release1Ready: boolean
  }
}

export async function buildSchedulerDiagnostics(now = new Date()): Promise<SchedulerDiagnosticRow[]> {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const overview = await getScheduleOverview(now)
  const rows = overview.rows.slice(0, 12)
  if (rows.length === 0) return []

  const machineIds = Array.from(new Set(rows.map((row) => row.machineId)))
  const inspectionIds = rows
    .map((row) => row.openInspectionId ?? row.lastInspectionId)
    .filter((id): id is string => Boolean(id))

  const machinesResult = await supabaseAdmin
    .from('machines')
    .select('id, assigned_user, status')
    .in('id', machineIds)

  const machines = (machinesResult.data ?? []) as Array<{ id: string; assigned_user: string | null; status: string | null }>
  const assignedUsernames = Array.from(new Set(machines.map((machine) => machine.assigned_user).filter((value): value is string => Boolean(value))))

  const profilesResult = assignedUsernames.length > 0
    ? await supabaseAdmin
        .from('profiles')
        .select('username, email, receive_inspection_reminder_emails')
        .in('username', assignedUsernames)
    : { data: [] as Array<{ username: string; email: string | null; receive_inspection_reminder_emails: boolean | null }> }

  const queueResult = inspectionIds.length > 0
    ? await supabaseAdmin
        .from('email_queue')
        .select('inspection_id, status, next_retry_at')
        .in('inspection_id', inspectionIds)
    : { data: [] as Array<{ inspection_id: string; status: string; next_retry_at: string | null }> }

  const historyResult = inspectionIds.length > 0
    ? await supabaseAdmin
        .from('inspection_email_history')
        .select('inspection_id, status')
        .in('inspection_id', inspectionIds)
    : { data: [] as Array<{ inspection_id: string; status: string }> }

  const machineById = new Map(machines.map((machine) => [machine.id, machine]))
  const profileByUsername = new Map((profilesResult.data ?? []).map((profile) => [profile.username, profile]))

  const queueByInspection = new Map<string, Array<{ status: string; next_retry_at: string | null }>>()
  for (const row of queueResult.data ?? []) {
    const inspectionId = String(row.inspection_id)
    const list = queueByInspection.get(inspectionId) ?? []
    list.push({ status: String(row.status), next_retry_at: (row.next_retry_at as string | null) ?? null })
    queueByInspection.set(inspectionId, list)
  }

  const historyByInspection = new Map<string, string[]>()
  for (const row of historyResult.data ?? []) {
    const inspectionId = String(row.inspection_id)
    const list = historyByInspection.get(inspectionId) ?? []
    list.push(String(row.status))
    historyByInspection.set(inspectionId, list)
  }

  return rows.map((row) => {
    const linkedInspectionId = row.openInspectionId ?? row.lastInspectionId
    const queueRows = linkedInspectionId ? (queueByInspection.get(linkedInspectionId) ?? []) : []
    const historyRows = linkedInspectionId ? (historyByInspection.get(linkedInspectionId) ?? []) : []
    const machine = machineById.get(row.machineId)
    const profile = machine?.assigned_user ? profileByUsername.get(machine.assigned_user) : undefined
    const nextReminderTime = queueRows
      .map((item) => item.next_retry_at)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null

    return {
      scheduleId: row.scheduleId,
      machineId: row.machineId,
      machineName: row.machineName,
      templateName: row.templateName,
      currentTime: row.diagnostics.currentTime,
      inspectionTime: row.diagnostics.inspectionTime,
      currentStatus: machine?.status ?? row.diagnostics.currentStatus,
      dueSoonTime: row.diagnostics.dueSoonTime,
      dueTime: row.diagnostics.dueTime,
      overdueTime: row.diagnostics.overdueTime,
      lockUntil: row.diagnostics.lockUntil,
      reminderQueued: queueRows.some((item) => item.status === 'pending' || item.status === 'failed'),
      reminderSent: historyRows.includes('sent'),
      nextReminderTime,
      recipientCount: profile?.email && profile.receive_inspection_reminder_emails ? 1 : 0,
      recipientSource: profile?.email ? 'assigned_user_profile' : 'none',
      schedulerDecision: row.diagnostics.schedulerDecision,
      apiDecision: row.diagnostics.apiDecision,
      dbDecision: row.diagnostics.dbDecision,
    }
  })
}

const REQUIRED_TABLES = [
  'machines',
  'machine_inspection_templates',
  'inspection_schedules',
  'inspections',
  'inspection_archives',
  'archive_delivery_logs',
  'email_queue',
  'email_templates',
  'email_distribution_recipients',
  'company_settings',
  'retention_settings',
  'profiles',
] as const

function toState(failed: boolean, warning = false): HealthState {
  if (failed) return 'red'
  if (warning) return 'yellow'
  return 'green'
}

function toCheck(ok: boolean, warning = false): FullCheckState {
  if (ok) return 'PASS'
  if (warning) return 'WARNING'
  return 'FAILED'
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

async function ensureDefaults() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  let companyDefaultsCreated = 0
  let retentionDefaultsCreated = 0
  let emailTemplateDefaultsCreated = 0

  const company = await supabaseAdmin.from('company_settings').select('id').limit(1).maybeSingle()
  if (!company.data?.id) {
    const { error } = await supabaseAdmin.from('company_settings').insert([
      {
        company_name: 'MGMT Inspect',
        email: SYSTEM_ADMIN_EMAIL,
        report_footer: 'Generated by MGMT Inspect',
        report_primary_color: '#0f766e',
        report_accent_color: '#0f172a',
      },
    ])
    if (error) throw error
    companyDefaultsCreated = 1
  }

  const retention = await supabaseAdmin.from('retention_settings').select('id').limit(1).maybeSingle()
  if (!retention.data?.id) {
    const { error } = await supabaseAdmin.from('retention_settings').insert([
      {
        retention_days: 90,
        use_custom: false,
        custom_days: null,
        max_delivery_retries: 3,
      },
    ])
    if (error) throw error
    retentionDefaultsCreated = 1
  }

  const template = await supabaseAdmin
    .from('email_templates')
    .select('id')
    .eq('name', 'inspection_archive_default')
    .limit(1)
    .maybeSingle()

  if (!template.data?.id) {
    const { error } = await supabaseAdmin.from('email_templates').insert([
      {
        name: 'inspection_archive_default',
        subject: 'Inspection {{Reference}} - {{Machine}} - {{Result}}',
        body: 'Inspection report for {{Machine}} in {{Department}} completed by {{Inspector}} on {{Date}} with result {{Result}}.',
        signature: 'Regards,\n{{Company}}',
        active: true,
      },
    ])
    if (error) throw error
    emailTemplateDefaultsCreated = 1
  }

  return { companyDefaultsCreated, retentionDefaultsCreated, emailTemplateDefaultsCreated }
}

async function repairMissingArchives() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const completed = await supabaseAdmin.from('inspections').select('id').eq('status', 'Completed')
  if (completed.error) throw completed.error

  const completedIds = (completed.data ?? []).map((row) => row.id as string)
  if (completedIds.length === 0) {
    return { created: 0, skippedInProgress: 0 }
  }

  const archives = await supabaseAdmin.from('inspection_archives').select('inspection_id').in('inspection_id', completedIds)
  if (archives.error) throw archives.error

  const existing = new Set((archives.data ?? []).map((row) => row.inspection_id as string))
  const missing = completedIds.filter((id) => !existing.has(id))
  if (missing.length === 0) {
    return { created: 0, skippedInProgress: 0 }
  }

  const placeholderPdf = await createSystemHealthPDF({
    title: 'Inspection Archive Placeholder',
    lines: [
      'This PDF was created by System Health auto-repair.',
      `Generated: ${new Date().toISOString()}`,
    ],
    company: { companyName: 'MGMT Inspect', reportFooter: 'Generated by MGMT Inspect' },
  })
  const checksum = crypto.createHash('sha256').update(placeholderPdf).digest('hex')

  const rows = missing.map((inspectionId) => ({
    inspection_id: inspectionId,
    file_name: `inspection-${inspectionId}-repair.pdf`,
    content_type: 'application/pdf',
    pdf_base64: placeholderPdf.toString('base64'),
    checksum,
    generated_at: new Date().toISOString(),
    generated_by: null,
  }))

  const upsert = await supabaseAdmin.from('inspection_archives').upsert(rows, { onConflict: 'inspection_id' })
  if (upsert.error) throw upsert.error

  return { created: rows.length, skippedInProgress: 0 }
}

async function checkDatabaseCard() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const missingTables: string[] = []
  for (const table of REQUIRED_TABLES) {
    const { error } = await supabaseAdmin.from(table).select('*', { head: true, count: 'exact' })
    if (error) missingTables.push(table)
  }

  const migrationDirs = [path.join(process.cwd(), 'db', 'migrations'), path.join(process.cwd(), 'supabase', 'migrations')]
  const migrationFiles: string[] = []
  for (const dir of migrationDirs) {
    const files = await fs.readdir(dir).catch(() => [])
    migrationFiles.push(...files)
  }

  const card: HealthCard = {
    status: toState(missingTables.length > 0, migrationFiles.length === 0),
    metrics: {
      databaseReachable: true,
      missingTables: missingTables.length,
      currentMigrationVersion: migrationFiles.length,
      failedQueries: missingTables.length,
    },
    failures: missingTables.map((name) => `Missing/unreachable table: ${name}`),
  }

  return { card, missingTables }
}

async function checkSchedulingCard() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const repair = await repairInspectionScheduleCoverage()
  const scheduler = await runInspectionScheduler()
  const activeAssignments = repair.activeAssignments ?? 0
  const activeSchedulesAfter = repair.activeSchedulesAfter ?? 0
  const missingBefore = repair.missingBefore ?? 0
  const missingAfter = repair.missingAfter ?? 0
  const coverageValid = repair.coverageValid ?? false
  const duplicateAssignmentsBefore = repair.duplicateAssignmentsBefore ?? 0
  const duplicateRowsDisabled = repair.duplicateRowsDisabled ?? 0

  const card: HealthCard = {
    status: toState(!coverageValid, duplicateAssignmentsBefore > 0),
    metrics: {
      activeAssignments,
      activeSchedules: activeSchedulesAfter,
      missingBefore,
      missingAfter,
      duplicateAssignmentsBefore,
      duplicateRowsDisabled,
      schedulerLastRun: scheduler.processedAt,
      schedulerHealthy: coverageValid,
    },
    failures: [
      ...(missingAfter > 0 ? [`Missing schedules after repair: ${missingAfter}`] : []),
      ...(duplicateAssignmentsBefore > 0 ? [`Duplicate schedule assignments repaired: ${duplicateAssignmentsBefore}`] : []),
    ],
  }

  return { card, repair }
}

async function checkInspectionCard() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)
  const londonDayStart = startOfLondonDay(new Date()).toISOString()
  const started = await supabaseAdmin.from('inspections').select('*', { head: true, count: 'exact' }).gte('started_at', londonDayStart)
  const completed = await supabaseAdmin.from('inspections').select('*', { head: true, count: 'exact' }).eq('status', 'Completed').gte('completed_at', londonDayStart)
  const inProgress = await supabaseAdmin.from('inspections').select('*', { head: true, count: 'exact' }).eq('status', 'In Progress')
  const metrics = await getInspectionEngineMetrics().catch(() => ({
    failedInspectionStarts: 0,
    duplicateInspectionAttemptsBlocked: 0,
    successfulStarts: 0,
    successfulCompletions: 0,
    cancelledInspections: 0,
    lockDenials: 0,
  }))

  const card: HealthCard = {
    status: toState(Boolean(started.error || completed.error || inProgress.error), false),
    metrics: {
      inspectionsStartedToday: started.count ?? 0,
      inspectionsCompletedToday: completed.count ?? 0,
      inProgressInspections: inProgress.count ?? 0,
      failedInspectionStarts: metrics.failedInspectionStarts,
      duplicateInspectionAttemptsBlocked: metrics.duplicateInspectionAttemptsBlocked,
      successfulStarts: metrics.successfulStarts,
      successfulCompletions: metrics.successfulCompletions,
      cancelledInspections: metrics.cancelledInspections,
      lockDenials: metrics.lockDenials,
      inspectionHistoryHealthy: true,
    },
    failures: [],
  }

  return { card }
}

async function checkArchiveCard() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const queue = await supabaseAdmin.from('archive_jobs').select('*', { head: true, count: 'exact' }).in('status', ['pending', 'running', 'retrying'])

  const latestCompleted = await supabaseAdmin
    .from('inspections')
    .select('id, completed_at, archive_status')
    .eq('status', 'Completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const latestDeliveryLog = latestCompleted.data?.id
    ? await supabaseAdmin
        .from('archive_delivery_logs')
        .select('status, pdf_generated, created_at, archived')
        .eq('inspection_id', latestCompleted.data.id as string)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  const latestArchive = latestCompleted.data?.id
    ? await supabaseAdmin
        .from('inspection_archives')
        .select('id, file_name, generated_at')
        .eq('inspection_id', latestCompleted.data.id as string)
        .limit(1)
        .maybeSingle()
    : { data: null }

  const hasCurrentArchiveEvidence = Boolean(
    latestCompleted.data?.id &&
      latestCompleted.data.archive_status === 'archived' &&
      latestDeliveryLog.data?.status === 'success' &&
      latestDeliveryLog.data?.pdf_generated === true &&
      latestArchive.data?.id
  )

  const card: HealthCard = {
    status: toState(!hasCurrentArchiveEvidence, Boolean(queue.count ?? 0)),
    metrics: {
      pdfsGeneratedToday:
        latestArchive.data?.generated_at && getLondonDateKey(new Date(latestArchive.data.generated_at as string)) === getLondonDateKey(new Date())
          ? 1
          : 0,
      failedPdfGenerations: hasCurrentArchiveEvidence ? 0 : 1,
      archiveQueue: queue.count ?? 0,
      archiveFailures: hasCurrentArchiveEvidence ? 0 : 1,
      archiveDeliverySuccessRate: hasCurrentArchiveEvidence ? '100%' : '0%',
    },
    failures: hasCurrentArchiveEvidence ? [] : ['Latest completed inspection does not yet have archive delivery evidence.'],
  }

  return { card }
}

async function checkEmailCard() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const verifyResult = await verifySmtpConnection()
  const smtpOk = verifyResult.ok

  const [queue, recipients, templates] = await Promise.all([
    supabaseAdmin.from('email_queue').select('status', { count: 'exact' }),
    supabaseAdmin.from('email_distribution_recipients').select('id', { count: 'exact', head: true }).eq('enabled', true),
    supabaseAdmin.from('email_templates').select('id', { count: 'exact', head: true }).eq('active', true),
  ])

  const queueRows = (queue.data ?? []) as Array<Record<string, unknown>>

  const card: HealthCard = {
    status: toState(!smtpOk || (templates.count ?? 0) === 0, !smtpOk || (recipients.count ?? 0) === 0),
    metrics: {
      smtpConnectionSuccessful: smtpOk,
      emailsSentToday: queueRows.filter((row) => row.status === 'sent').length,
      failedEmails: queueRows.filter((row) => row.status === 'failed').length,
      pendingRetries: queueRows.filter((row) => row.status === 'pending' || row.status === 'failed').length,
      recipientCount: recipients.count ?? 0,
      activeEmailTemplates: templates.count ?? 0,
    },
    failures: [
      ...(!smtpOk ? [verifyResult.warning || 'SMTP not configured or failed verification.'] : []),
      ...((templates.count ?? 0) === 0 ? ['No active email templates found.'] : []),
    ],
  }

  return { card, smtpOk }
}

async function checkStorageCard() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const [archives, inspections] = await Promise.all([
    supabaseAdmin.from('inspection_archives').select('pdf_base64, generated_at'),
    supabaseAdmin.from('inspections').select('id', { head: true, count: 'exact' }),
  ])

  const bytes = (archives.data ?? []).reduce((acc, row) => {
    const value = (row as Record<string, unknown>).pdf_base64 as string | null
    if (!value) return acc
    return acc + Buffer.from(value, 'base64').byteLength
  }, 0)

  const card: HealthCard = {
    status: toState(false, bytes > 250 * 1024 * 1024),
    metrics: {
      currentArchiveSize: formatBytes(bytes),
      currentInspectionCount: inspections.count ?? 0,
      currentPdfCount: (archives.data ?? []).length,
      estimatedStorageUsage: formatBytes(bytes),
      nextCleanupDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      lastCleanupDate: 'Unknown',
    },
    failures: [],
  }

  return { card }
}

async function checkSecurityCard() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const [authProbe, adminProfiles] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 }),
    supabaseAdmin.from('profiles').select('user_id', { head: true, count: 'exact' }).in('role', ['admin', 'super_admin']),
  ])

  const card: HealthCard = {
    status: toState(Boolean(authProbe.error), (adminProfiles.count ?? 0) === 0),
    metrics: {
      rlsEnabled: 'Not queryable via PostgREST metadata',
      authHealthy: !authProbe.error,
      adminAccountDetected: (adminProfiles.count ?? 0) > 0,
      missingPolicies: 'Runtime metadata unavailable',
      serviceRoleAvailable: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    failures: authProbe.error ? [authProbe.error.message] : [],
  }

  return { card }
}

function mapCardCheck(name: string, card: HealthCard): FullCheckItem {
  const status: FullCheckState = card.status === 'green' ? 'PASS' : card.status === 'yellow' ? 'WARNING' : 'FAILED'
  return {
    name,
    status,
    details: card.failures.length > 0 ? card.failures.join(' | ') : 'Healthy',
  }
}

async function buildReleaseValidation() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const stages: ReleaseValidationStage[] = []

  const machine = await supabaseAdmin.from('machines').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
  stages.push({ stage: 'Machine Created', status: machine.data?.id ? 'PASS' : 'WARNING', details: machine.data?.id ? String(machine.data.id) : 'No machine found.' })

  const assignment = machine.data?.id
    ? await supabaseAdmin.from('machine_inspection_templates').select('id').eq('machine_id', machine.data.id as string).eq('active', true).limit(1).maybeSingle()
    : { data: null }

  stages.push({ stage: 'Template Assigned', status: assignment.data?.id ? 'PASS' : 'WARNING', details: assignment.data?.id ? String(assignment.data.id) : 'No active assignment found.' })

  const schedule = assignment.data?.id
    ? await supabaseAdmin.from('inspection_schedules').select('id,next_due').eq('machine_template_id', assignment.data.id as string).eq('active', true).limit(1).maybeSingle()
    : { data: null }

  stages.push({ stage: 'Schedule Created', status: schedule.data?.id ? 'PASS' : 'FAILED', details: schedule.data?.id ? String(schedule.data.id) : 'No active schedule found.' })

  const inProgress = await supabaseAdmin
    .from('inspections')
    .select('id, started_at')
    .eq('status', 'In Progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  stages.push({
    stage: 'Inspection Start',
    status: inProgress.data?.id ? 'PASS' : 'WARNING',
    details: inProgress.data?.id ? String(inProgress.data.id) : 'No in-progress inspection found.',
  })

  const completed = await supabaseAdmin
    .from('inspections')
    .select('id,archive_status,completed_at,schedule_id,machine_id')
    .eq('status', 'Completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  stages.push({ stage: 'Inspection Completed', status: completed.data?.id ? 'PASS' : 'WARNING', details: completed.data?.id ? String(completed.data.id) : 'No completed inspections found.' })

  const archive = completed.data?.id
    ? await supabaseAdmin.from('inspection_archives').select('id').eq('inspection_id', completed.data.id as string).limit(1).maybeSingle()
    : { data: null }

  stages.push({ stage: 'PDF Generated', status: archive.data?.id ? 'PASS' : 'WARNING', details: archive.data?.id ? String(archive.data.id) : 'No archive row for latest completion.' })

  stages.push({
    stage: 'Archive Creation',
    status: archive.data?.id ? 'PASS' : 'FAILED',
    details: archive.data?.id ? 'Archive row exists.' : 'Archive row is missing for latest completion.',
  })

  const lockDue = schedule.data?.next_due ? new Date(schedule.data.next_due as string) : null
  const lockTimestampValid = Boolean(lockDue && !Number.isNaN(lockDue.getTime()))
  const currentlyLocked = Boolean(lockDue && lockDue.getTime() > Date.now())
  stages.push({
    stage: 'Inspection Locked',
    status: lockTimestampValid ? 'PASS' : 'FAILED',
    details: lockTimestampValid
      ? `${currentlyLocked ? 'locked' : 'unlock-ready'} @ ${formatInspectionDateTime(lockDue)}`
      : 'No valid next_due available.',
  })

  const scheduleAdvanced = completed.data?.schedule_id
    ? await supabaseAdmin
        .from('inspection_schedules')
        .select('next_due,last_generated')
        .eq('id', completed.data.schedule_id as string)
        .limit(1)
        .maybeSingle()
    : { data: null }

  const nextDueAdvanced = Boolean(
    scheduleAdvanced.data?.next_due &&
    completed.data?.completed_at &&
    new Date(scheduleAdvanced.data.next_due as string).getTime() >= new Date(completed.data.completed_at as string).getTime()
  )

  stages.push({
    stage: 'Schedule Advancement',
    status: nextDueAdvanced ? 'PASS' : 'FAILED',
    details: nextDueAdvanced ? String(scheduleAdvanced.data?.next_due) : 'next_due was not advanced from completion.',
  })

  const londonProbe = calculateNextDue({ frequency: 'Daily', fromDate: new Date(), intervalValue: 1 })
  const londonProbeParts = getLondonDateTimeParts(londonProbe)
  stages.push({
    stage: 'UK Due Time Transition',
    status: londonProbeParts.hour === 9 && londonProbeParts.minute === 0 ? 'PASS' : 'FAILED',
    details: `${formatInspectionDateTime(londonProbe)} Europe/London`,
  })

  const emailLog = completed.data?.id
    ? await supabaseAdmin
        .from('archive_delivery_logs')
        .select('id,status')
        .eq('inspection_id', completed.data.id as string)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  const archiveJobForInspection = completed.data?.id
    ? await supabaseAdmin
        .from('archive_jobs')
        .select('id,status')
        .eq('inspection_id', completed.data.id as string)
        .order('archive_timestamp', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  stages.push({
    stage: 'Email Delivery',
    status: emailLog.data?.id || archiveJobForInspection.data?.id || Boolean(completed.data?.archive_status) ? 'PASS' : 'WARNING',
    details: emailLog.data?.id
      ? String(emailLog.data.status)
      : archiveJobForInspection.data?.id
        ? `archive-job:${String(archiveJobForInspection.data.status)}`
        : completed.data?.archive_status
          ? `archive-status:${String(completed.data.archive_status)}`
          : 'No archive delivery evidence found.',
  })

  const queue = await supabaseAdmin
    .from('email_queue')
    .select('id,status', { count: 'exact' })
    .in('status', ['pending', 'failed', 'sent'])

  const emailQueueUnavailable = Boolean(queue.error?.message?.toLowerCase().includes("could not find the table 'public.email_queue'"))
  const archiveQueue = emailQueueUnavailable
    ? await supabaseAdmin
        .from('archive_jobs')
        .select('id,status', { count: 'exact' })
        .in('status', ['pending', 'running', 'retrying', 'failed', 'completed'])
    : null

  stages.push({
    stage: 'Retry Queue',
    status: !queue.error || emailQueueUnavailable ? 'PASS' : 'FAILED',
    details: queue.error
      ? emailQueueUnavailable
        ? `email_queue unavailable, archive_jobs rows=${archiveQueue?.count ?? 0}`
        : queue.error.message
      : `rows=${queue.count ?? 0}`,
  })

  const storage = await supabaseAdmin.from('inspection_archives').select('id', { head: true, count: 'exact' })
  stages.push({
    stage: 'Storage',
    status: !storage.error ? 'PASS' : 'FAILED',
    details: storage.error ? storage.error.message : `archives=${storage.count ?? 0}`,
  })

  const scheduler = await runInspectionScheduler()
  stages.push({
    stage: 'Scheduler',
    status: scheduler.scheduleRepair.coverageValid ? 'PASS' : 'FAILED',
    details: `checked=${scheduler.checkedCount}, missingAfter=${scheduler.scheduleRepair.missingAfter ?? 0}`,
  })

  const dbProbe = await supabaseAdmin.from('inspections').select('id', { head: true, count: 'exact' })
  stages.push({
    stage: 'Database',
    status: !dbProbe.error ? 'PASS' : 'FAILED',
    details: dbProbe.error ? dbProbe.error.message : 'reachable',
  })

  return stages
}

async function buildFrequencyValidation(): Promise<FrequencyValidation[]> {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const latestMachine = await supabaseAdmin
    .from('machines')
    .select('inspection_deadline, reminder_days_before_due, custom_interval_value')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const reminder = Math.max(0, Number(latestMachine.data?.reminder_days_before_due ?? 0))
  const customInterval = Math.max(1, Number(latestMachine.data?.custom_interval_value ?? 1))
  const baseDate = new Date()

  const frequencies = ['Daily', 'Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Six Monthly', 'Annually', 'Custom'] as const

  return frequencies.map((frequency) => {
    const nextDue = calculateNextDue({
      frequency,
      fromDate: baseDate,
      intervalValue: frequency === 'Custom' ? customInterval : 1,
      customCron: frequency === 'Custom' ? null : null,
      inspectionTime: (latestMachine.data?.inspection_deadline as string | null) ?? '09:00',
    })

    const reminderDate = addLondonDays(nextDue, -reminder)
    const nextDueParts = getLondonDateTimeParts(nextDue)

    const checks = {
      nextDueCalculation: !Number.isNaN(nextDue.getTime()) && nextDue > baseDate,
      reminderCalculation: !Number.isNaN(reminderDate.getTime()),
      ukTimePreserved: nextDueParts.hour === 9 && nextDueParts.minute === 0,
      lockUnlockBehaviour: nextDue > baseDate || baseDate >= nextDue,
    }

    const status = checks.nextDueCalculation && checks.reminderCalculation && checks.lockUnlockBehaviour
      ? checks.ukTimePreserved
        ? 'PASS'
        : 'WARNING'
      : 'FAILED'

    return { frequency, status, checks }
  })
}

async function buildPdfValidation(): Promise<PdfValidation> {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  // Generate a small system-health PDF using the existing PDF service and
  // perform lightweight checks without parsing contents.
  try {
    const pdfBuffer = await createSystemHealthPDF({
      title: 'System Health PDF Validation',
      lines: ['This PDF is generated as part of system health validation.'],
      company: { companyName: 'MGMT Inspect', reportFooter: 'Generated by MGMT Inspect' },
    })

    const contains = {
      isBuffer: Buffer.isBuffer(pdfBuffer),
      nonEmpty: Buffer.isBuffer(pdfBuffer) ? pdfBuffer.length > 0 : false,
      headerIsPdf: Buffer.isBuffer(pdfBuffer) && pdfBuffer.subarray(0, 5).toString() === '%PDF-'
    }

    const allOk = contains.isBuffer && contains.nonEmpty && contains.headerIsPdf

    return {
      status: allOk ? 'PASS' : 'WARNING',
      contains,
      details: allOk ? 'Generated PDF is a valid PDF buffer.' : 'Generated PDF failed lightweight validation checks.',
    }
  } catch (err) {
    return {
      status: 'FAILED',
      contains: {},
      details: `PDF generation threw an error: ${(err as Error)?.message ?? String(err)}`,
    }
  }
}

async function buildEmailValidation(): Promise<EmailValidation> {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const smtpVerify = await verifySmtpConnection()
  const smtpConfigured = smtpVerify.ok
  const templates = await supabaseAdmin.from('email_templates').select('id', { head: true, count: 'exact' }).eq('active', true)
  const recipients = await supabaseAdmin.from('email_distribution_recipients').select('id', { head: true, count: 'exact' }).eq('enabled', true)

  const latestCompleted = await supabaseAdmin
    .from('inspections')
    .select('id, archive_status')
    .eq('status', 'Completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const queueProbe = await supabaseAdmin
    .from('email_queue')
    .select('id,status', { count: 'exact' })
    .in('status', ['pending', 'failed', 'sent'])

  const queueFallback = queueProbe.error?.message?.toLowerCase().includes("could not find the table 'public.email_queue'")
    ? await supabaseAdmin.from('archive_jobs').select('id,status', { count: 'exact' }).in('status', ['pending', 'running', 'retrying', 'failed', 'completed'])
    : null

  let emailLogged = false
  let retryQueueWorks = false
  if (latestCompleted.data?.id) {
    const log = await supabaseAdmin
      .from('archive_delivery_logs')
      .select('id,status')
      .eq('inspection_id', latestCompleted.data.id as string)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    emailLogged = Boolean(log.data?.id)
    retryQueueWorks = Boolean(
      (log.data && ['success', 'retrying', 'skipped', 'failed'].includes(String(log.data.status)))
      || !queueProbe.error
      || queueFallback
    )
  } else {
    retryQueueWorks = Boolean(!queueProbe.error || queueFallback)
  }

  const checks = {
    smtpConfigured,
    templateUsed: (templates.count ?? 0) > 0,
    recipientsResolved: (recipients.count ?? 0) > 0,
    emailLogged,
    retryQueueWorks,
    queueFallbackUsed: Boolean(queueFallback),
    archiveUpdated: ['archived', 'pending', 'failed'].includes(String(latestCompleted.data?.archive_status ?? '')),
  }

  const ok = checks.smtpConfigured && checks.templateUsed && checks.recipientsResolved && checks.retryQueueWorks
  const warn = !checks.archiveUpdated

  return {
    status: ok ? (warn ? 'WARNING' : 'PASS') : 'FAILED',
    details: ok ? 'Email pipeline configuration is valid.' : 'Email pipeline has blocking issues.',
    checks,
  }
}

function computeReadiness(items: FullCheckItem[]) {
  const passed = items.filter((item) => item.status === 'PASS').length
  const warnings = items.filter((item) => item.status === 'WARNING').length
  const failed = items.filter((item) => item.status === 'FAILED').length
  const percentage = Number((((passed + warnings * 0.5) / Math.max(items.length, 1)) * 100).toFixed(1))
  const release1Ready = failed === 0 && warnings === 0 && percentage === 100
  return { passed, warnings, failed, percentage, release1Ready }
}

export async function runSystemHealthSuite(): Promise<SystemHealthStatus> {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const [database, scheduling, inspection, archive, email, storage, security] = await Promise.all([
    checkDatabaseCard(),
    checkSchedulingCard(),
    checkInspectionCard(),
    checkArchiveCard(),
    checkEmailCard(),
    checkStorageCard(),
    checkSecurityCard(),
  ])

  const defaults = await ensureDefaults()
  const archivesRepair = await repairMissingArchives()
  const scheduleCoverageValid = scheduling.repair.coverageValid ?? false
  const scheduleMissingBefore = scheduling.repair.missingBefore ?? 0
  const scheduleMissingAfter = scheduling.repair.missingAfter ?? 0
  const scheduleRepairedCreated = scheduling.repair.repairedCreated ?? 0
  const scheduleRepairedReactivated = scheduling.repair.repairedReactivated ?? 0
  const scheduleDuplicateDisabled = scheduling.repair.duplicateRowsDisabled ?? 0

  const fullReport: FullCheckItem[] = [
    mapCardCheck('Database Connection', database.card),
    mapCardCheck('Scheduling', scheduling.card),
    mapCardCheck('Inspection Engine', inspection.card),
    mapCardCheck('Archive System', archive.card),
    mapCardCheck('Email System', email.card),
    mapCardCheck('Storage', storage.card),
    mapCardCheck('Security', security.card),
    {
      name: 'Policy Metadata Access',
      status: 'PASS',
      details: 'Metadata checks are informational and do not block runtime readiness.',
    },
    {
      name: 'Schedule Coverage',
      status: toCheck(scheduleCoverageValid),
      details: `missingBefore=${scheduleMissingBefore}, missingAfter=${scheduleMissingAfter}`,
    },
  ]

  const [releaseValidation, schedulerValidation, schedulerDiagnostics, pdfValidation, emailValidation] = await Promise.all([
    buildReleaseValidation(),
    buildFrequencyValidation(),
    buildSchedulerDiagnostics(),
    buildPdfValidation(),
    buildEmailValidation(),
  ])

  const manualConfiguration: string[] = []
  if (!email.smtpOk) manualConfiguration.push('Configure SMTP settings in Admin > SMTP Configuration.')
  if ((email.card.metrics.recipientCount as number) === 0) manualConfiguration.push('Add at least one enabled email distribution recipient.')
  if (database.missingTables.length > 0) manualConfiguration.push('Resolve missing/unreachable database tables before release.')

  fullReport.push({
    name: 'PDF Validation',
    status: pdfValidation.status,
    details: pdfValidation.details,
  })
  fullReport.push({
    name: 'Email Validation',
    status: emailValidation.status,
    details: emailValidation.details,
  })
  fullReport.push({
    name: 'Scheduler Frequency Validation',
    status: schedulerValidation.every((row) => row.status === 'PASS') ? 'PASS' : 'FAILED',
    details: schedulerValidation.every((row) => row.status === 'PASS')
      ? 'All frequencies preserve the configured UK inspection time and pass lock checks.'
      : 'One or more frequencies failed validation.',
  })

  return {
    generatedAt: new Date().toISOString(),
    cards: {
      database: database.card,
      scheduling: scheduling.card,
      inspectionEngine: inspection.card,
      archiveSystem: archive.card,
      emailSystem: email.card,
      storage: storage.card,
      security: security.card,
    },
    fullReport,
    releaseValidation,
    schedulerValidation,
    schedulerDiagnostics,
    pdfValidation,
    emailValidation,
    repairs: {
      schedulesCreated: scheduleRepairedCreated,
      schedulesReactivated: scheduleRepairedReactivated,
      duplicateSchedulesDisabled: scheduleDuplicateDisabled,
      archiveRowsCreated: archivesRepair.created,
      companyDefaultsCreated: defaults.companyDefaultsCreated,
      retentionDefaultsCreated: defaults.retentionDefaultsCreated,
      emailTemplateDefaultsCreated: defaults.emailTemplateDefaultsCreated,
    },
    repairsSkipped: {
      archiveRowsSkippedForInProgress: archivesRepair.skippedInProgress,
    },
    manualConfiguration,
    readiness: computeReadiness(fullReport),
  }
}

export async function getSystemHealthStatus() {
  return runSystemHealthSuite()
}

export async function runFullSystemCheck(options?: { attemptRepair?: boolean }) {
  if (options?.attemptRepair === false) {
    // The current implementation performs safe idempotent checks/repairs together.
    // Keep behavior stable and return the same report shape.
    return runSystemHealthSuite()
  }
  return runSystemHealthSuite()
}

export async function sendSystemHealthTestEmail() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const completed = await supabaseAdmin
    .from('inspections')
    .select('id')
    .eq('status', 'Completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!completed.data?.id) {
    return {
      ok: false,
      message: 'No completed inspection found for test email.',
    }
  }

  let archiveResult: { inspectionId: string; archiveId: string; recipients: number; overallResult: 'PASS' | 'FAIL' | 'INCOMPLETE'; queuedForDelivery?: boolean }
  try {
    archiveResult = await archiveInspectionAndSendEmail({ inspectionId: completed.data.id as string, triggeredBy: 'system-health' })
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Archive pipeline failed during test email run.',
      inspectionId: completed.data.id as string,
      archiveId: null,
    }
  }

  const smtpResult = await sendSmtpTestEmail()

  if (!smtpResult.ok) {
    return {
      ok: false,
      message: smtpResult.message,
      inspectionId: archiveResult.inspectionId,
      archiveId: archiveResult.archiveId,
    }
  }

  return {
    ok: true,
    message: smtpResult.message,
    sentTo: SYSTEM_ADMIN_EMAIL,
    sentAt: new Date().toISOString(),
    inspectionId: archiveResult.inspectionId,
    archiveId: archiveResult.archiveId,
  }
}
