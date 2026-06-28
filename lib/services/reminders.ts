import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { resolveArchiveMailbox, resolveCompanyName, resolveEmailEnvelope } from '@/lib/services/emailConfig'
import { getCompanySettings } from '@/lib/services/companySettings'
import { getDefaultInspectionTemplate, renderTemplate } from '@/lib/services/emailTemplates'
import { buildReminderEmailTemplate } from '@/lib/services/emailMessageTemplates'
import { getSmtpTransport } from '@/lib/services/smtpConfig'

type ReminderStage = 'before_due' | 'due_today' | 'overdue'

type ScheduleRow = {
  id: string
  next_due: string
  machine_template_id: string
  machine_inspection_templates:
    | {
        machine_id: string
        template_id: string
        machines: { id: string; name: string; area: string | null; reminder_days_before_due: number | null; assigned_user: string | null } | null
        checklist_templates: { id: string; name: string } | null
      }
    | Array<{
        machine_id: string
        template_id: string
        machines: { id: string; name: string; area: string | null; reminder_days_before_due: number | null; assigned_user: string | null } | null
        checklist_templates: { id: string; name: string } | null
      }>
    | null
}

type InspectionRef = {
  id: string
  schedule_id: string | null
  status: string
  completed_at: string | null
  started_at: string | null
}

function toSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0))
}

function getReminderStage(nextDueIso: string, reminderDays: number, now: Date): ReminderStage | null {
  const due = startOfUtcDay(new Date(nextDueIso))
  if (Number.isNaN(due.getTime())) return null

  const current = startOfUtcDay(now)
  const diffDays = Math.floor((due.getTime() - current.getTime()) / 86400000)

  if (reminderDays > 0 && diffDays === reminderDays) return 'before_due'
  if (diffDays === 0) return 'due_today'
  if (diffDays < 0) return 'overdue'
  return null
}

function isDuplicateForToday(createdAt: string, now: Date) {
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return false
  const start = startOfUtcDay(now)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  return created >= start && created < end
}

async function enqueueReminderRetry(input: {
  inspectionId: string
  recipientEmail: string
  subject: string
  body: string
  status: 'pending' | 'failed'
  attemptCount: number
  errorMessage?: string
}) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const nowIso = new Date().toISOString()
  const { error } = await supabaseAdmin.from('email_queue').insert([
    {
      inspection_id: input.inspectionId,
      recipient_email: input.recipientEmail,
      recipient_type: 'to',
      subject: input.subject,
      body: input.body,
      status: input.status,
      attempt_count: input.attemptCount,
      error_message: input.errorMessage ?? null,
      last_attempt_at: input.status === 'failed' ? nowIso : null,
      next_retry_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      created_at: nowIso,
    },
  ])

  if (error && !error.message.toLowerCase().includes("could not find the table 'public.email_queue'")) {
    throw error
  }
}

export async function sendScheduledReminders(now = new Date()) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const smtpState = await getSmtpTransport()
  const smtp = smtpState.transport

  const [company, template, schedulesResult] = await Promise.all([
    getCompanySettings(),
    getDefaultInspectionTemplate(),
    supabaseAdmin
      .from('inspection_schedules')
      .select(
        'id, next_due, machine_template_id, machine_inspection_templates(machine_id, template_id, machines(id, name, area, reminder_days_before_due, assigned_user), checklist_templates(id, name))'
      )
      .eq('active', true),
  ])

  if (schedulesResult.error) throw schedulesResult.error

  const schedules = ((schedulesResult.data ?? []) as unknown) as ScheduleRow[]
  if (schedules.length === 0) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0, warning: null as string | null }
  }

  const scheduleIds = schedules.map((s) => s.id)
  const inspectionsResult = await supabaseAdmin
    .from('inspections')
    .select('id, schedule_id, status, started_at, completed_at')
    .in('schedule_id', scheduleIds)
    .order('completed_at', { ascending: false })

  if (inspectionsResult.error) throw inspectionsResult.error
  const inspectionRows = (inspectionsResult.data ?? []) as InspectionRef[]

  const inProgressBySchedule = new Map<string, InspectionRef>()
  const latestCompletedBySchedule = new Map<string, InspectionRef>()
  for (const row of inspectionRows) {
    if (!row.schedule_id) continue
    if (row.status === 'In Progress' && !inProgressBySchedule.has(row.schedule_id)) {
      inProgressBySchedule.set(row.schedule_id, row)
    }
    if (row.status === 'Completed' && !latestCompletedBySchedule.has(row.schedule_id)) {
      latestCompletedBySchedule.set(row.schedule_id, row)
    }
  }

  let processed = 0
  let sent = 0
  let skipped = 0
  let failed = 0

  const companyName = resolveCompanyName(company)
  const archiveRecipient = resolveArchiveMailbox({
    email: company.email,
    archiveEmail: company.archiveEmail ?? null,
  })

  for (const schedule of schedules) {
    const assignment = toSingle(schedule.machine_inspection_templates)
    const machine = toSingle(assignment?.machines ?? null)
    const templateDef = toSingle(assignment?.checklist_templates ?? null)
    if (!assignment || !machine) continue

    const reminderDays = Math.max(0, Number(machine.reminder_days_before_due ?? 0))
    const stage = getReminderStage(schedule.next_due, reminderDays, now)
    if (!stage) continue

    const inspectionRef = inProgressBySchedule.get(schedule.id) ?? latestCompletedBySchedule.get(schedule.id)
    if (!inspectionRef?.id) {
      skipped += 1
      continue
    }

    const dueDate = new Date(schedule.next_due)
    const formattedDue = Number.isNaN(dueDate.getTime()) ? 'N/A' : dueDate.toLocaleDateString('en-GB')
    const formattedDueTime = Number.isNaN(dueDate.getTime())
      ? 'N/A'
      : dueDate.toLocaleTimeString('en-GB', { hour12: false })

    const stageLabel = stage === 'before_due'
      ? `${reminderDays} day(s) before due`
      : stage === 'due_today'
        ? 'Due today'
        : 'Overdue'

    const subject = `Inspection Reminder - ${machine.name} - ${stageLabel}`

    const body = renderTemplate({
      raw: `${template.body}\n\nReminder Type: ${stageLabel}`,
      vars: {
        Machine: machine.name,
        Inspector: 'N/A',
        Department: machine.area || 'N/A',
        Result: stage === 'overdue' ? 'OVERDUE' : 'DUE',
        Date: formattedDue,
        Reference: inspectionRef.id,
        Company: company.companyName,
        NextInspection: formattedDue,
      },
    })

    processed += 1

    const duplicate = await supabaseAdmin
      .from('inspection_email_history')
      .select('created_at')
      .eq('inspection_id', inspectionRef.id)
      .eq('recipient_email', archiveRecipient)
      .eq('subject', subject)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!duplicate.error) {
      const alreadySentToday = (duplicate.data ?? []).some((row) => isDuplicateForToday(String(row.created_at), now))
      if (alreadySentToday) {
        skipped += 1
        continue
      }
    }

    const reminderTemplate = buildReminderEmailTemplate({
      machine: machine.name,
      department: machine.area || 'N/A',
      inspectionTemplate: templateDef?.name || 'Inspection Template',
      dueDate: formattedDue,
      dueTime: formattedDueTime,
      assignedUser: machine.assigned_user || 'N/A',
      inspectionLink: `${(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/inspection/${machine.id}`,
      stageLabel,
    })
    const text = `${body}\n\n${reminderTemplate.text}\n\n${template.signature}`

    try {
      if (!smtp) {
        await enqueueReminderRetry({
          inspectionId: inspectionRef.id,
          recipientEmail: archiveRecipient,
          subject,
          body: text,
          status: 'pending',
          attemptCount: 0,
        })

        await supabaseAdmin.from('inspection_email_history').insert([
          {
            inspection_id: inspectionRef.id,
            template_id: template.id,
            recipient_email: archiveRecipient,
            recipient_type: 'to',
            subject,
            status: 'queued',
          },
        ])

        skipped += 1
        continue
      }

      const envelope = resolveEmailEnvelope({
        subject,
        recipientType: 'to',
        recipientEmail: archiveRecipient,
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
        text,
        html: reminderTemplate.html,
      })

      await supabaseAdmin.from('inspection_email_history').insert([
        {
          inspection_id: inspectionRef.id,
          template_id: template.id,
          recipient_email: archiveRecipient,
          recipient_type: 'to',
          subject: envelope.subject,
          status: 'sent',
          sent_at: new Date().toISOString(),
        },
      ])

      sent += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reminder send failed'
      await supabaseAdmin.from('inspection_email_history').insert([
        {
          inspection_id: inspectionRef.id,
          template_id: template.id,
          recipient_email: archiveRecipient,
          recipient_type: 'to',
          subject,
          status: 'failed',
          error_message: message,
        },
      ])

      await enqueueReminderRetry({
        inspectionId: inspectionRef.id,
        recipientEmail: archiveRecipient,
        subject,
        body: text,
        status: 'failed',
        attemptCount: 1,
        errorMessage: message,
      })

      failed += 1
    }
  }

  return {
    processed,
    sent,
    skipped,
    failed,
    warning: smtpState.warning ?? null,
  }
}
