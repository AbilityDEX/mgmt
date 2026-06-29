import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import {
  addLondonDays,
  combineLondonDateAndTime,
  formatInspectionDateTime,
  getLondonDateKey,
  startOfLondonDay,
} from '@/lib/inspectionTime'
import { resolveCompanyName, resolveEmailEnvelope } from '@/lib/services/emailConfig'
import { textToHtmlParagraphs } from '@/lib/services/emailMessageTemplates'
import { getCompanySettings } from '@/lib/services/companySettings'
import {
  buildInspectionGenerationKey,
  buildReminderEventKey,
} from '@/lib/services/schedulerKeys'
import { getSmtpTransport } from '@/lib/services/smtpConfig'

type ReminderScheduleRow = {
  id: string
  next_due: string
  machine_template_id: string
  machine_inspection_templates:
    | {
        machine_id: string
        template_id: string
        machines:
          | {
              id: string
              name: string
              area: string | null
              assigned_user: string | null
              inspection_deadline: string | null
            }
          | null
        checklist_templates: { id: string; name: string } | null
      }
    | Array<{
        machine_id: string
        template_id: string
        machines:
          | {
              id: string
              name: string
              area: string | null
              assigned_user: string | null
              inspection_deadline: string | null
            }
          | null
        checklist_templates: { id: string; name: string } | null
      }>
    | null
}

type InspectionRef = {
  id: string
  schedule_id: string | null
  generation_key: string | null
  status: string
  completed_at: string | null
  started_at: string | null
}

type ReminderQueueRow = {
  id: string
  inspection_id: string
  recipient_email: string
  recipient_type: 'to' | 'cc' | 'bcc'
  subject: string
  body: string
  status: string
  attempt_count: number
  queue_key: string | null
}

type ProfileRow = {
  username: string | null
  email: string | null
  full_name: string | null
  active: boolean | null
  receive_inspection_reminder_emails: boolean | null
}

function toSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function parseReminderSendAt(baseDate: Date, timeValue: string | null | undefined) {
  return combineLondonDateAndTime(baseDate, timeValue?.trim() || '07:00')
}

function buildReminderText(input: {
  machineName: string
  department: string | null
  templateName: string
  assignedUser: string
  dueAt: Date
  inspectionLink: string
}) {
  return [
    'Hello,',
    '',
    'Your assigned inspection is now due.',
    '',
    `Machine: ${input.machineName}`,
    `Department: ${input.department || 'N/A'}`,
    `Template: ${input.templateName}`,
    `Due At: ${formatInspectionDateTime(input.dueAt)}`,
    `Assigned User: ${input.assignedUser}`,
    `Inspection Link: ${input.inspectionLink}`,
    '',
    'Regards,',
    '',
    'MGMT Inspect',
  ].join('\n')
}

async function isDuplicateForDay(params: {
  inspectionId: string
  recipientEmail: string
  subject: string
  now: Date
}) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const start = startOfLondonDay(params.now)
  const end = startOfLondonDay(addLondonDays(params.now, 1))

  const { data } = await supabaseAdmin
    .from('inspection_email_history')
    .select('id')
    .eq('inspection_id', params.inspectionId)
    .eq('recipient_email', params.recipientEmail)
    .eq('subject', params.subject)
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .limit(1)

  return Boolean((data ?? [])[0])
}

export async function queueDailyReminderEmails(now = new Date()) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const company = await getCompanySettings()
  if (company.enableEmployeeReminderEmails === false) {
    return { queued: 0, skipped: 0, reason: 'employee_reminders_disabled' as const }
  }

  const { data: schedulesData, error: schedulesError } = await supabaseAdmin
    .from('inspection_schedules')
    .select(
      'id, next_due, machine_template_id, machine_inspection_templates(machine_id, template_id, machines(id, name, area, assigned_user, inspection_deadline), checklist_templates(id, name))'
    )
    .eq('active', true)

  if (schedulesError) throw schedulesError

  const schedules = ((schedulesData ?? []) as unknown) as ReminderScheduleRow[]
  if (schedules.length === 0) {
    return { queued: 0, skipped: 0, reason: null as string | null }
  }

  const scheduleIds = schedules.map((row) => row.id)
  const { data: inspections } = await supabaseAdmin
    .from('inspections')
    .select('id, schedule_id, generation_key, status, started_at, completed_at')
    .in('schedule_id', scheduleIds)

  const inspectionsBySchedule = new Map<string, InspectionRef>()
  const inspectionsByGenerationKey = new Map<string, InspectionRef>()
  for (const row of (inspections ?? []) as InspectionRef[]) {
    if (row.generation_key) {
      inspectionsByGenerationKey.set(row.generation_key, row)
    }

    if (!row.schedule_id) continue
    const existing = inspectionsBySchedule.get(row.schedule_id)
    if (!existing) {
      inspectionsBySchedule.set(row.schedule_id, row)
      continue
    }

    const existingDate = new Date(existing.completed_at ?? existing.started_at ?? 0).getTime()
    const rowDate = new Date(row.completed_at ?? row.started_at ?? 0).getTime()
    if (rowDate > existingDate) {
      inspectionsBySchedule.set(row.schedule_id, row)
    }
  }

  const usernames = Array.from(
    new Set(
      schedules
        .map((schedule) => {
          const assignment = toSingle(schedule.machine_inspection_templates)
          const machine = toSingle(assignment?.machines ?? null)
          return (machine?.assigned_user ?? '').trim()
        })
        .filter(Boolean)
    )
  )

  const profilesByUsername = new Map<string, ProfileRow>()
  if (usernames.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('username, email, full_name, active, receive_inspection_reminder_emails')
      .in('username', usernames)

    for (const profile of (profiles ?? []) as ProfileRow[]) {
      if (!profile.username) continue
      profilesByUsername.set(profile.username, profile)
    }
  }

  const todayKey = getLondonDateKey(now)
  const reminderSendAt = parseReminderSendAt(now, company.dailyReminderSendTime)

  let queued = 0
  let skipped = 0

  for (const schedule of schedules) {
    const assignment = toSingle(schedule.machine_inspection_templates)
    const machine = toSingle(assignment?.machines ?? null)
    const template = toSingle(assignment?.checklist_templates ?? null)

    if (!assignment || !machine?.assigned_user || !template?.name) {
      skipped += 1
      continue
    }

    const profile = profilesByUsername.get(machine.assigned_user)
    if (!profile?.active || !profile.receive_inspection_reminder_emails || !profile.email) {
      skipped += 1
      continue
    }

    const dueAt = new Date(schedule.next_due)
    if (Number.isNaN(dueAt.getTime()) || getLondonDateKey(dueAt) !== todayKey) {
      skipped += 1
      continue
    }

    const generationKey = buildInspectionGenerationKey(schedule.id, dueAt)
    const inspectionRef = inspectionsByGenerationKey.get(generationKey) ?? inspectionsBySchedule.get(schedule.id)
    if (!inspectionRef?.id) {
      skipped += 1
      continue
    }

    const subject = `Inspection Reminder - ${machine.name} - Due`
    const reminderEventKey = buildReminderEventKey(inspectionRef.id, profile.email, todayKey)
    const inspectionLink = `${(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/inspection/${machine.id}`
    const body = buildReminderText({
      machineName: machine.name,
      department: machine.area,
      templateName: template.name,
      assignedUser: profile.full_name || machine.assigned_user,
      dueAt,
      inspectionLink,
    })

    const duplicate = await isDuplicateForDay({
      inspectionId: inspectionRef.id,
      recipientEmail: profile.email,
      subject,
      now,
    })
    if (duplicate) {
      skipped += 1
      continue
    }

    const { error: queueError } = await supabaseAdmin.from('email_queue').upsert([
      {
        inspection_id: inspectionRef.id,
        recipient_email: profile.email,
        recipient_type: 'to',
        subject,
        body,
        status: 'pending',
        attempt_count: 0,
        queue_key: reminderEventKey,
        next_retry_at: reminderSendAt.toISOString(),
        created_at: new Date().toISOString(),
      },
    ], {
      onConflict: 'queue_key',
      ignoreDuplicates: true,
    })

    if (queueError) {
      skipped += 1
      continue
    }

    await supabaseAdmin.from('inspection_email_history').upsert([
      {
        inspection_id: inspectionRef.id,
        recipient_email: profile.email,
        recipient_type: 'to',
        subject,
        event_key: `${reminderEventKey}:queued`,
        status: 'queued',
      },
    ], {
      onConflict: 'event_key',
      ignoreDuplicates: true,
    })

    queued += 1
  }

  return { queued, skipped, reason: null as string | null }
}

export async function sendScheduledReminders(now = new Date()) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const company = await getCompanySettings()
  if (company.enableEmployeeReminderEmails === false) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0, warning: 'Employee reminders are disabled.' }
  }

  const reminderSendAt = parseReminderSendAt(now, company.dailyReminderSendTime)
  if (now < reminderSendAt) {
    return {
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      warning: `Reminder send time is ${reminderSendAt.toISOString()}.`,
    }
  }

  const smtpState = await getSmtpTransport()
  const smtp = smtpState.transport
  if (!smtp) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0, warning: smtpState.warning ?? 'SMTP not configured.' }
  }

  const companyName = resolveCompanyName(company)
  const nowIso = new Date().toISOString()
  const { data: queuedRows, error } = await supabaseAdmin
    .from('email_queue')
    .select('id, inspection_id, recipient_email, recipient_type, subject, body, status, attempt_count, queue_key')
    .or('status.eq.pending,status.eq.failed')
    .ilike('subject', 'Inspection Reminder -%')
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) throw error

  let sent = 0
  let failed = 0

  for (const row of (queuedRows ?? []) as ReminderQueueRow[]) {
    try {
      const envelope = resolveEmailEnvelope({
        subject: row.subject as string,
        recipientType: row.recipient_type as 'to' | 'cc' | 'bcc',
        recipientEmail: row.recipient_email as string,
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
        text: row.body as string,
        html: textToHtmlParagraphs(row.body as string),
      })

      await supabaseAdmin
        .from('email_queue')
        .update({ status: 'sent', last_attempt_at: new Date().toISOString(), error_message: null })
        .eq('id', row.id as string)

      await supabaseAdmin.from('inspection_email_history').insert([
        {
          inspection_id: row.inspection_id as string,
          recipient_email: row.recipient_email as string,
          recipient_type: row.recipient_type as 'to' | 'cc' | 'bcc',
          subject: envelope.subject,
          event_key: row.queue_key ? `${row.queue_key}:sent` : null,
          status: 'sent',
          sent_at: new Date().toISOString(),
        },
      ])

      sent += 1
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Reminder send failed.'
      const nextAttempt = Number(row.attempt_count ?? 0) + 1
      await supabaseAdmin
        .from('email_queue')
        .update({
          status: nextAttempt >= 5 ? 'abandoned' : 'failed',
          attempt_count: nextAttempt,
          last_attempt_at: new Date().toISOString(),
          next_retry_at: nextAttempt >= 5 ? null : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          error_message: message,
        })
        .eq('id', row.id as string)

      failed += 1
    }
  }

  return {
    processed: (queuedRows ?? []).length,
    sent,
    skipped: Math.max((queuedRows ?? []).length - sent - failed, 0),
    failed,
    warning: null as string | null,
  }
}
