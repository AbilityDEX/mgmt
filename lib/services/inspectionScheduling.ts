import { CronExpressionParser } from 'cron-parser'
import {
  ensureSystemSuperAdmin,
  serverConfigErrorMessage,
  supabaseAdmin,
  SYSTEM_ADMIN_FULL_NAME,
} from '@/lib/admin'

export type ScheduleFrequency =
  | 'Daily'
  | 'Weekly'
  | 'Fortnightly'
  | 'Monthly'
  | 'Quarterly'
  | 'Six Monthly'
  | 'Annually'
  | 'Custom'

export const scheduleFrequencies: ScheduleFrequency[] = [
  'Daily',
  'Weekly',
  'Fortnightly',
  'Monthly',
  'Quarterly',
  'Six Monthly',
  'Annually',
  'Custom',
]

export type ScheduleStatus = 'Overdue' | 'Due Soon' | 'On Time' | 'Paused'

type DueBucket = 'dueToday' | 'dueThisWeek' | 'overdue' | 'upcoming'

type SchedulerMachineTemplateRow = {
  id: string
  machine_id: string
  template_id: string
  inspection_frequency: ScheduleFrequency
  active: boolean
  checklist_templates: { id: string; name: string } | { id: string; name: string }[] | null
}

type SchedulerScheduleRow = {
  id: string
  machine_template_id: string
  frequency: ScheduleFrequency
  interval_value: number
  custom_cron: string | null
  next_due: string
  last_generated: string | null
  active: boolean
  machine_inspection_templates: SchedulerMachineTemplateRow | SchedulerMachineTemplateRow[] | null
}

type ScheduleOverviewRow = {
  scheduleId: string
  machineTemplateId: string
  machineId: string
  machineName: string
  templateId: string
  templateName: string
  frequency: ScheduleFrequency
  intervalValue: number
  customCron: string | null
  nextDue: string
  lastGenerated: string | null
  active: boolean
  lastInspectionId: string | null
  lastInspectionCompletedAt: string | null
  openInspectionId: string | null
  openInspectionIsOverdue: boolean
  status: ScheduleStatus
}

function toSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function addMonths(date: Date, monthCount: number) {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + monthCount)
  return next
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0))
}

function endOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999))
}

function endOfUtcWeek(date: Date) {
  const start = startOfUtcDay(date)
  const day = start.getUTCDay() || 7
  const offset = 7 - day
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + offset)
  return endOfUtcDay(end)
}

export function calculateNextDue(params: {
  frequency: ScheduleFrequency
  intervalValue?: number
  customCron?: string | null
  fromDate: Date
}) {
  const intervalValue = Math.max(1, params.intervalValue ?? 1)
  const base = new Date(params.fromDate)

  switch (params.frequency) {
    case 'Daily': {
      const next = new Date(base)
      next.setUTCDate(next.getUTCDate() + intervalValue)
      return next
    }
    case 'Weekly': {
      const next = new Date(base)
      next.setUTCDate(next.getUTCDate() + 7 * intervalValue)
      return next
    }
    case 'Fortnightly': {
      const next = new Date(base)
      next.setUTCDate(next.getUTCDate() + 14 * intervalValue)
      return next
    }
    case 'Monthly':
      return addMonths(base, intervalValue)
    case 'Quarterly':
      return addMonths(base, 3 * intervalValue)
    case 'Six Monthly':
      return addMonths(base, 6 * intervalValue)
    case 'Annually':
      return addMonths(base, 12 * intervalValue)
    case 'Custom': {
      if (!params.customCron?.trim()) {
        const next = new Date(base)
        next.setUTCDate(next.getUTCDate() + intervalValue)
        return next
      }

      const parsed = CronExpressionParser.parse(params.customCron, {
        currentDate: base,
        tz: 'UTC',
      })
      return parsed.next().toDate()
    }
    default: {
      const fallback = new Date(base)
      fallback.setUTCDate(fallback.getUTCDate() + 1)
      return fallback
    }
  }
}

export async function ensureScheduleForMachineTemplate(params: {
  machineTemplateId: string
  frequency: ScheduleFrequency
  intervalValue?: number
  customCron?: string | null
  active?: boolean
  nextDue?: Date
}) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const intervalValue = Math.max(1, params.intervalValue ?? 1)
  const base = params.nextDue ?? new Date()
  const nextDue = params.nextDue ?? calculateNextDue({
    frequency: params.frequency,
    intervalValue,
    customCron: params.customCron,
    fromDate: base,
  })

  const { data: existingSchedule, error: existingError } = await supabaseAdmin
    .from('inspection_schedules')
    .select('id, machine_template_id')
    .eq('machine_template_id', params.machineTemplateId)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (!existingSchedule) {
    const { data: insertedSchedule, error: insertError } = await supabaseAdmin
      .from('inspection_schedules')
      .insert([
        {
          machine_template_id: params.machineTemplateId,
          frequency: params.frequency,
          interval_value: intervalValue,
          custom_cron: params.customCron?.trim() || null,
          next_due: nextDue.toISOString(),
          active: params.active ?? true,
        },
      ])
      .select('id')
      .single()

    if (insertError || !insertedSchedule) {
      throw insertError ?? new Error('Failed to create schedule.')
    }

    return { scheduleId: insertedSchedule.id as string, created: true }
  }

  const { error: updateError } = await supabaseAdmin
    .from('inspection_schedules')
    .update({
      frequency: params.frequency,
      interval_value: intervalValue,
      custom_cron: params.customCron?.trim() || null,
      next_due: nextDue.toISOString(),
      active: params.active ?? true,
    })
    .eq('id', existingSchedule.id as string)

  if (updateError) {
    throw updateError
  }

  return { scheduleId: existingSchedule.id as string, created: false }
}

async function createInspectionSnapshotFromSchedule(params: {
  scheduleId: string
  machineId: string
  templateId: string
  templateName: string
  dueAt: Date
  generationKey: string
}) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const { data: existingInspection } = await supabaseAdmin
    .from('inspections')
    .select('id')
    .eq('generation_key', params.generationKey)
    .maybeSingle()

  if (existingInspection?.id) {
    return { inspectionId: existingInspection.id as string, created: false }
  }

  const { data: templateItemsData, error: templateItemsError } = await supabaseAdmin
    .from('checklist_template_items')
    .select('id, display_order, question, question_type, required')
    .eq('template_id', params.templateId)
    .order('display_order', { ascending: true })

  if (templateItemsError) {
    throw templateItemsError
  }

  if (!templateItemsData || templateItemsData.length === 0) {
    throw new Error('Scheduled template has no inspection items.')
  }

  const systemUserId = await ensureSystemSuperAdmin()
  const nowIso = new Date().toISOString()

  const { data: inspectionData, error: inspectionError } = await supabaseAdmin
    .from('inspections')
    .insert([
      {
        machine_id: params.machineId,
        template_id: params.templateId,
        template_name: params.templateName,
        template_version: 1,
        status: 'In Progress',
        started_by: systemUserId,
        started_at: nowIso,
        operator_id: systemUserId,
        operator_name: `${SYSTEM_ADMIN_FULL_NAME} (Scheduler)`,
        checklist: [],
        schedule_id: params.scheduleId,
        generation_key: params.generationKey,
        due_at: params.dueAt.toISOString(),
        completion_source: 'scheduled',
        is_overdue: false,
      },
    ])
    .select('id')
    .single()

  if (inspectionError || !inspectionData) {
    throw inspectionError ?? new Error('Failed to create scheduled inspection.')
  }

  const inspectionId = inspectionData.id as string

  const { error: snapshotItemsError } = await supabaseAdmin
    .from('inspection_items')
    .insert(
      templateItemsData.map((item) => ({
        inspection_id: inspectionId,
        original_template_item_id: item.id,
        display_order: item.display_order,
        question: item.question,
        question_type: item.question_type,
        required: Boolean(item.required),
        completed: false,
      }))
    )

  if (snapshotItemsError) {
    await supabaseAdmin.from('inspections').delete().eq('id', inspectionId)
    throw snapshotItemsError
  }

  return { inspectionId, created: true }
}

async function markOverdueInspections(now: Date) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const nowIso = now.toISOString()

  const { data: openInspections, error: openError } = await supabaseAdmin
    .from('inspections')
    .select('id')
    .eq('status', 'In Progress')
    .lt('due_at', nowIso)
    .eq('is_overdue', false)

  if (openError) {
    throw openError
  }

  if (!openInspections || openInspections.length === 0) {
    return 0
  }

  const ids = openInspections.map((item) => item.id as string)
  const { error: updateError } = await supabaseAdmin
    .from('inspections')
    .update({ is_overdue: true })
    .in('id', ids)

  if (updateError) {
    throw updateError
  }

  return ids.length
}

export async function runInspectionScheduler(now = new Date()) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const nowIso = now.toISOString()

  const { data: scheduleRows, error: schedulesError } = await supabaseAdmin
    .from('inspection_schedules')
    .select(
      `id, machine_template_id, frequency, interval_value, custom_cron, next_due, last_generated, active,
      machine_inspection_templates(id, machine_id, template_id, inspection_frequency, active, checklist_templates(id, name))`
    )
    .eq('active', true)
    .lte('next_due', nowIso)
    .order('next_due', { ascending: true })

  if (schedulesError) {
    throw schedulesError
  }

  const dueSchedules = (scheduleRows ?? []) as SchedulerScheduleRow[]

  let generatedCount = 0
  let skippedDuplicateCount = 0

  for (const schedule of dueSchedules) {
    const machineTemplate = toSingle(schedule.machine_inspection_templates)
    if (!machineTemplate || !machineTemplate.active) {
      continue
    }

    const template = toSingle(machineTemplate.checklist_templates)
    if (!template?.id) {
      continue
    }

    const dueAt = new Date(schedule.next_due)

    const { data: openInspection, error: openInspectionError } = await supabaseAdmin
      .from('inspections')
      .select('id, due_at')
      .eq('schedule_id', schedule.id)
      .eq('status', 'In Progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (openInspectionError) {
      throw openInspectionError
    }

    if (openInspection?.id) {
      skippedDuplicateCount += 1

      if (openInspection.due_at && new Date(openInspection.due_at as string) < now) {
        await supabaseAdmin
          .from('inspections')
          .update({ is_overdue: true })
          .eq('id', openInspection.id as string)
      }

      continue
    }

    const generationKey = `${schedule.id}:${dueAt.toISOString()}`
    const createdInspection = await createInspectionSnapshotFromSchedule({
      scheduleId: schedule.id,
      machineId: machineTemplate.machine_id,
      templateId: template.id,
      templateName: template.name || 'Unnamed Template',
      dueAt,
      generationKey,
    })

    if (!createdInspection.created) {
      skippedDuplicateCount += 1
    } else {
      generatedCount += 1
    }

    let nextDue = calculateNextDue({
      frequency: schedule.frequency,
      intervalValue: schedule.interval_value,
      customCron: schedule.custom_cron,
      fromDate: dueAt,
    })

    while (nextDue <= now) {
      nextDue = calculateNextDue({
        frequency: schedule.frequency,
        intervalValue: schedule.interval_value,
        customCron: schedule.custom_cron,
        fromDate: nextDue,
      })
    }

    const { error: scheduleUpdateError } = await supabaseAdmin
      .from('inspection_schedules')
      .update({
        last_generated: nowIso,
        next_due: nextDue.toISOString(),
      })
      .eq('id', schedule.id)

    if (scheduleUpdateError) {
      throw scheduleUpdateError
    }
  }

  const overdueMarked = await markOverdueInspections(now)

  return {
    checkedCount: dueSchedules.length,
    generatedCount,
    skippedDuplicateCount,
    overdueMarked,
    processedAt: nowIso,
  }
}

function getScheduleStatus(row: {
  active: boolean
  nextDue: Date
  hasOpenInspection: boolean
  openInspectionIsOverdue: boolean
  now: Date
}): ScheduleStatus {
  if (!row.active) return 'Paused'
  if (row.openInspectionIsOverdue) return 'Overdue'

  const dueSoonThreshold = endOfUtcWeek(row.now)

  if (row.nextDue < row.now) return 'Overdue'
  if (row.nextDue <= dueSoonThreshold) return 'Due Soon'
  if (row.hasOpenInspection) return 'Due Soon'

  return 'On Time'
}

export async function getScheduleOverview(now = new Date()) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const { data: schedulesData, error: schedulesError } = await supabaseAdmin
    .from('inspection_schedules')
    .select(
      `id, machine_template_id, frequency, interval_value, custom_cron, next_due, last_generated, active,
      machine_inspection_templates(id, machine_id, template_id, active, checklist_templates(id, name), machines(id, name))`
    )
    .order('next_due', { ascending: true })

  if (schedulesError) {
    throw schedulesError
  }

  const schedules = (schedulesData ?? []) as Array<
    SchedulerScheduleRow & {
      machine_inspection_templates:
        | (SchedulerMachineTemplateRow & {
            machines: { id: string; name: string } | { id: string; name: string }[] | null
          })
        | Array<
            SchedulerMachineTemplateRow & {
              machines: { id: string; name: string } | { id: string; name: string }[] | null
            }
          >
        | null
    }
  >

  const scheduleIds = schedules.map((row) => row.id)

  const { data: inProgressData } = await supabaseAdmin
    .from('inspections')
    .select('id, schedule_id, due_at, is_overdue, started_at')
    .in('schedule_id', scheduleIds)
    .eq('status', 'In Progress')

  const { data: completedData } = await supabaseAdmin
    .from('inspections')
    .select('id, schedule_id, completed_at')
    .in('schedule_id', scheduleIds)
    .eq('status', 'Completed')
    .order('completed_at', { ascending: false })

  const openInspectionByScheduleId = new Map<
    string,
    { inspectionId: string; isOverdue: boolean; dueAt: string | null }
  >()

  for (const row of inProgressData ?? []) {
    const scheduleId = row.schedule_id as string | null
    if (!scheduleId || openInspectionByScheduleId.has(scheduleId)) continue

    openInspectionByScheduleId.set(scheduleId, {
      inspectionId: row.id as string,
      isOverdue: Boolean(row.is_overdue),
      dueAt: (row.due_at as string | null) ?? null,
    })
  }

  const lastCompletedByScheduleId = new Map<string, { inspectionId: string; completedAt: string | null }>()
  for (const row of completedData ?? []) {
    const scheduleId = row.schedule_id as string | null
    if (!scheduleId || lastCompletedByScheduleId.has(scheduleId)) continue

    lastCompletedByScheduleId.set(scheduleId, {
      inspectionId: row.id as string,
      completedAt: (row.completed_at as string | null) ?? null,
    })
  }

  const rows: ScheduleOverviewRow[] = []

  for (const schedule of schedules) {
    const machineTemplate = toSingle(schedule.machine_inspection_templates)
    if (!machineTemplate) continue

    const template = toSingle(machineTemplate.checklist_templates)
    const machine = toSingle(
      (machineTemplate as SchedulerMachineTemplateRow & {
        machines: { id: string; name: string } | { id: string; name: string }[] | null
      }).machines
    )

    if (!template?.id || !machine?.id) continue

    const openInspection = openInspectionByScheduleId.get(schedule.id)
    const lastCompleted = lastCompletedByScheduleId.get(schedule.id)
    const nextDue = new Date(schedule.next_due)

    const status = getScheduleStatus({
      active: Boolean(schedule.active),
      nextDue,
      hasOpenInspection: Boolean(openInspection?.inspectionId),
      openInspectionIsOverdue: Boolean(openInspection?.isOverdue),
      now,
    })

    rows.push({
      scheduleId: schedule.id,
      machineTemplateId: schedule.machine_template_id,
      machineId: machine.id,
      machineName: machine.name,
      templateId: template.id,
      templateName: template.name,
      frequency: schedule.frequency,
      intervalValue: schedule.interval_value,
      customCron: schedule.custom_cron,
      nextDue: schedule.next_due,
      lastGenerated: schedule.last_generated,
      active: Boolean(schedule.active),
      lastInspectionId: lastCompleted?.inspectionId ?? null,
      lastInspectionCompletedAt: lastCompleted?.completedAt ?? null,
      openInspectionId: openInspection?.inspectionId ?? null,
      openInspectionIsOverdue: Boolean(openInspection?.isOverdue),
      status,
    })
  }

  const dueBuckets: Record<DueBucket, ScheduleOverviewRow[]> = {
    dueToday: [],
    dueThisWeek: [],
    overdue: [],
    upcoming: [],
  }

  for (const row of rows) {
    if (row.status === 'Overdue') {
      dueBuckets.overdue.push(row)
    } else if (row.status === 'Due Soon') {
      dueBuckets.dueToday.push(row)
    } else if (row.status === 'On Time') {
      dueBuckets.upcoming.push(row)
    }
  }

  const todayStart = startOfUtcDay(now)
  const todayEnd = endOfUtcDay(now)

  const { count: completedTodayCount } = await supabaseAdmin
    .from('inspections')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Completed')
    .gte('completed_at', todayStart.toISOString())
    .lte('completed_at', todayEnd.toISOString())

  const complianceDenominator =
    dueBuckets.overdue.length + dueBuckets.dueToday.length + dueBuckets.dueThisWeek.length

  const compliantCount = dueBuckets.dueToday.length + dueBuckets.dueThisWeek.length

  const compliancePercentage =
    complianceDenominator > 0
      ? Number(((compliantCount / complianceDenominator) * 100).toFixed(1))
      : 100

  return {
    dueBuckets,
    rows,
    widgets: {
      dueToday: dueBuckets.dueToday.length,
      overdue: dueBuckets.overdue.length,
      upcomingThisWeek: dueBuckets.dueThisWeek.length,
      completedToday: completedTodayCount ?? 0,
      compliancePercentage,
    },
  }
}

export async function advanceScheduleFromCompletedInspection(params: {
  scheduleId: string | null
  completedAt: Date
}) {
  if (!params.scheduleId || !supabaseAdmin) {
    return
  }

  const { data: scheduleData, error: scheduleError } = await supabaseAdmin
    .from('inspection_schedules')
    .select('id, frequency, interval_value, custom_cron, active')
    .eq('id', params.scheduleId)
    .maybeSingle()

  if (scheduleError || !scheduleData || !scheduleData.active) {
    return
  }

  const nextDue = calculateNextDue({
    frequency: scheduleData.frequency as ScheduleFrequency,
    intervalValue: Number(scheduleData.interval_value ?? 1),
    customCron: (scheduleData.custom_cron as string | null) ?? null,
    fromDate: params.completedAt,
  })

  await supabaseAdmin
    .from('inspection_schedules')
    .update({
      next_due: nextDue.toISOString(),
      last_generated: params.completedAt.toISOString(),
    })
    .eq('id', params.scheduleId)
}
