import { CronExpressionParser } from 'cron-parser'
import {
  serverConfigErrorMessage,
  supabaseAdmin,
} from '@/lib/admin'
import { getInspectionEngineMetrics } from '@/lib/services/inspectionMetrics'

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
  machines:
    | { id: string; name: string; status: string | null; grace_period: number | null }
    | { id: string; name: string; status: string | null; grace_period: number | null }[]
    | null
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

type CoverageScheduleRow = {
  id: string
  machine_template_id: string
  frequency: ScheduleFrequency
  interval_value: number
  custom_cron: string | null
  next_due: string
  created_at: string
  updated_at: string
  active: boolean
}

type CoverageMachineRow = {
  id: string
  inspection_frequency: string | null
  inspection_deadline: string | null
  reminder_days_before_due: number | null
  grace_period: number | null
}

type CoverageAssignmentRow = {
  id: string
  machine_id: string
  template_id: string
  inspection_frequency: ScheduleFrequency
  active: boolean
  machines: CoverageMachineRow | CoverageMachineRow[] | null
}

type ScheduleOverviewRow = {
  scheduleId: string
  machineTemplateId: string
  machineId: string
  machineName: string
  machineGracePeriod: number
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

function addDays(date: Date, dayCount: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + dayCount)
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

function getGraceCutoff(dueDate: Date, gracePeriodDays: number) {
  return addDays(startOfUtcDay(dueDate), Math.max(0, gracePeriodDays))
}

function isScheduleDue(nextDue: Date, now: Date, gracePeriodDays: number) {
  return nextDue <= now && now < getGraceCutoff(nextDue, gracePeriodDays)
}

function isScheduleOverdue(nextDue: Date, now: Date, gracePeriodDays: number) {
  return now >= getGraceCutoff(nextDue, gracePeriodDays)
}

export function calculateNextDue(params: {
  frequency: ScheduleFrequency
  intervalValue?: number
  customCron?: string | null
  fromDate: Date
}) {
  const intervalValue = Math.max(1, params.intervalValue ?? 1)
  const base = startOfUtcDay(new Date(params.fromDate))

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
      return startOfUtcDay(parsed.next().toDate())
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
  const normalizedNextDue = startOfUtcDay(nextDue)

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
          next_due: normalizedNextDue.toISOString(),
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
      next_due: normalizedNextDue.toISOString(),
      active: params.active ?? true,
    })
    .eq('id', existingSchedule.id as string)

  if (updateError) {
    throw updateError
  }

  return { scheduleId: existingSchedule.id as string, created: false }
}

export async function repairInspectionScheduleCoverage(now = new Date()) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const { data: assignmentsData, error: assignmentsError } = await supabaseAdmin
    .from('machine_inspection_templates')
    .select(
      'id, machine_id, template_id, inspection_frequency, active, machines(id, inspection_frequency, inspection_deadline, reminder_days_before_due, grace_period)'
    )
    .eq('active', true)

  if (assignmentsError) {
    throw assignmentsError
  }

  const activeAssignments = (assignmentsData ?? []) as CoverageAssignmentRow[]
  const assignmentIds = activeAssignments.map((row) => row.id)

  if (assignmentIds.length === 0) {
    return {
      activeAssignments: 0,
      missingBefore: 0,
      repairedCreated: 0,
      repairedReactivated: 0,
      missingAfter: 0,
    }
  }

  const { data: schedulesData, error: schedulesError } = await supabaseAdmin
    .from('inspection_schedules')
    .select('id, machine_template_id, frequency, interval_value, custom_cron, next_due, created_at, updated_at, active')
    .in('machine_template_id', assignmentIds)

  if (schedulesError) {
    throw schedulesError
  }

  const schedules = (schedulesData ?? []) as CoverageScheduleRow[]
  const schedulesByAssignmentId = new Map<string, CoverageScheduleRow[]>()
  const activeScheduleByAssignmentId = new Map<string, CoverageScheduleRow>()

  for (const schedule of schedules) {
    const list = schedulesByAssignmentId.get(schedule.machine_template_id) ?? []
    list.push(schedule)
    schedulesByAssignmentId.set(schedule.machine_template_id, list)
    if (schedule.active) {
      activeScheduleByAssignmentId.set(schedule.machine_template_id, schedule)
    }
  }

  let duplicateAssignmentsBefore = 0
  let duplicateRowsDisabled = 0

  for (const [assignmentId, assignmentSchedules] of schedulesByAssignmentId.entries()) {
    if (assignmentSchedules.length <= 1) {
      continue
    }

    duplicateAssignmentsBefore += 1

    const sorted = [...assignmentSchedules].sort((a, b) => {
      const aUpdated = new Date(a.updated_at).getTime()
      const bUpdated = new Date(b.updated_at).getTime()
      if (aUpdated !== bUpdated) return bUpdated - aUpdated
      const aCreated = new Date(a.created_at).getTime()
      const bCreated = new Date(b.created_at).getTime()
      if (aCreated !== bCreated) return bCreated - aCreated
      return b.id.localeCompare(a.id)
    })

    const activeSorted = sorted.filter((row) => row.active)
    const keeper = activeSorted[0] ?? sorted[0]

    const toDisable = sorted.filter((row) => row.id !== keeper.id && row.active)
    if (toDisable.length > 0) {
      const disableIds = toDisable.map((row) => row.id)
      const { error: disableError } = await supabaseAdmin
        .from('inspection_schedules')
        .update({ active: false })
        .in('id', disableIds)

      if (disableError) {
        throw disableError
      }
      duplicateRowsDisabled += disableIds.length
    }

    if (!keeper.active) {
      const { error: activateError } = await supabaseAdmin
        .from('inspection_schedules')
        .update({ active: true })
        .eq('id', keeper.id)

      if (activateError) {
        throw activateError
      }
    }

    activeScheduleByAssignmentId.set(assignmentId, { ...keeper, active: true })
  }

  const missingBefore = activeAssignments.filter((assignment) => !activeScheduleByAssignmentId.has(assignment.id)).length

  let repairedCreated = 0
  let repairedReactivated = 0

  for (const assignment of activeAssignments) {
    if (activeScheduleByAssignmentId.has(assignment.id)) {
      continue
    }

    const machine = toSingle(assignment.machines)
    const configuredFrequency = (assignment.inspection_frequency as ScheduleFrequency) ||
      ((machine?.inspection_frequency as ScheduleFrequency | null) ?? 'Monthly')

    const existingSchedule = (schedulesByAssignmentId.get(assignment.id) ?? [])[0]
    if (existingSchedule) {
      const preservedNextDue = new Date(existingSchedule.next_due)
      await ensureScheduleForMachineTemplate({
        machineTemplateId: assignment.id,
        frequency: existingSchedule.frequency,
        intervalValue: Number(existingSchedule.interval_value ?? 1),
        customCron: existingSchedule.custom_cron,
        active: true,
        nextDue: Number.isNaN(preservedNextDue.getTime()) ? now : preservedNextDue,
      })
      repairedReactivated += 1
      continue
    }

    const { data: latestCompletedInspection } = await supabaseAdmin
      .from('inspections')
      .select('completed_at')
      .eq('machine_id', assignment.machine_id)
      .eq('template_id', assignment.template_id)
      .eq('status', 'Completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const completionAt = (latestCompletedInspection?.completed_at as string | null) ?? null
    const completionDate = completionAt ? new Date(completionAt) : null

    let nextDue = completionDate && !Number.isNaN(completionDate.getTime())
      ? calculateNextDue({
          frequency: configuredFrequency,
          intervalValue: 1,
          customCron: null,
          fromDate: completionDate,
        })
      : new Date(now)

    if (!completionDate && nextDue > now) {
      nextDue = new Date(now)
    }

    await ensureScheduleForMachineTemplate({
      machineTemplateId: assignment.id,
      frequency: configuredFrequency,
      intervalValue: 1,
      customCron: null,
      active: true,
      nextDue,
    })

    repairedCreated += 1

    console.info('Inspection schedule repair created', {
      machine_template_assignment_id: assignment.id,
      machine_id: assignment.machine_id,
      template_id: assignment.template_id,
      inspection_frequency: configuredFrequency,
      inspection_deadline: machine?.inspection_deadline ?? null,
      reminder_days_before_due: machine?.reminder_days_before_due ?? null,
      grace_period: machine?.grace_period ?? null,
      completed_at: completionAt,
      next_due: nextDue.toISOString(),
    })
  }

  const { data: postRepairActiveSchedules, error: postRepairSchedulesError } = await supabaseAdmin
    .from('inspection_schedules')
    .select('machine_template_id')
    .in('machine_template_id', assignmentIds)
    .eq('active', true)

  if (postRepairSchedulesError) {
    throw postRepairSchedulesError
  }

  const activeAfter = new Set((postRepairActiveSchedules ?? []).map((row) => row.machine_template_id as string))
  const activeScheduleCountAfter = activeAfter.size
  const missingAfter = activeAssignments.filter((assignment) => !activeAfter.has(assignment.id)).length

  return {
    activeAssignments: activeAssignments.length,
    activeSchedulesAfter: activeScheduleCountAfter,
    missingBefore,
    duplicateAssignmentsBefore,
    duplicateRowsDisabled,
    repairedCreated,
    repairedReactivated,
    missingAfter,
    coverageValid: missingAfter === 0 && activeScheduleCountAfter === activeAssignments.length,
  }
}

async function markOverdueInspections(now: Date) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const { data: openInspections, error: openError } = await supabaseAdmin
    .from('inspections')
    .select('id, due_at, inspection_schedules(machine_inspection_templates(machines(grace_period)))')
    .eq('status', 'In Progress')
    .eq('is_overdue', false)

  if (openError) {
    throw openError
  }

  if (!openInspections || openInspections.length === 0) {
    return 0
  }

  const ids: string[] = []

  for (const inspection of openInspections as Array<Record<string, unknown>>) {
    const dueAt = inspection.due_at ? new Date(inspection.due_at as string) : null
    if (!dueAt || Number.isNaN(dueAt.getTime())) continue

    const schedules = inspection.inspection_schedules
    const schedule = Array.isArray(schedules) ? schedules[0] : schedules
    const machineTemplate = schedule?.machine_inspection_templates
    const machineTemplateRow = Array.isArray(machineTemplate) ? machineTemplate[0] : machineTemplate
    const machine = machineTemplateRow?.machines
    const machineRow = Array.isArray(machine) ? machine[0] : machine
    const gracePeriod = Number(machineRow?.grace_period ?? 0)

    if (isScheduleOverdue(dueAt, now, gracePeriod)) {
      ids.push(inspection.id as string)
    }
  }

  if (ids.length === 0) {
    return 0
  }

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
  const db = supabaseAdmin

  const nowIso = now.toISOString()

  const repairSummary = await repairInspectionScheduleCoverage(now)

  const { data: scheduleRows, error: schedulesError } = await db
    .from('inspection_schedules')
    .select(
      `id, machine_template_id, frequency, interval_value, custom_cron, next_due, last_generated, active,
      machine_inspection_templates(id, machine_id, template_id, inspection_frequency, active, checklist_templates(id, name), machines(id, name, status, grace_period))`
    )
    .eq('active', true)
    .order('next_due', { ascending: true })

  if (schedulesError) {
    throw schedulesError
  }

  const dueSchedules = (scheduleRows ?? []) as SchedulerScheduleRow[]

  const overdueMarked = await markOverdueInspections(now)

  const machineStatusUpdates = new Map<string, string>()

  for (const schedule of dueSchedules) {
    const machineTemplate = toSingle(schedule.machine_inspection_templates)
    if (!machineTemplate || !machineTemplate.active) continue

    const machine = toSingle(machineTemplate.machines)
    if (!machine?.id) continue

    const { data: openInspection, error: openInspectionError } = await db
      .from('inspections')
      .select('id, is_overdue')
      .eq('schedule_id', schedule.id)
      .eq('status', 'In Progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (openInspectionError) {
      throw openInspectionError
    }

    if (openInspection?.id) {
      machineStatusUpdates.set(machine.id, openInspection.is_overdue ? 'Overdue' : 'In Progress')
      continue
    }

    const nextDue = new Date(schedule.next_due)
    const gracePeriod = Number(machine.grace_period ?? 0)
    if (isScheduleOverdue(nextDue, now, gracePeriod)) {
      machineStatusUpdates.set(machine.id, 'Overdue')
    } else if (nextDue <= now) {
      machineStatusUpdates.set(machine.id, 'Due')
    } else {
      machineStatusUpdates.set(machine.id, 'Completed')
    }
  }

  if (machineStatusUpdates.size > 0) {
    await Promise.all(
      Array.from(machineStatusUpdates.entries()).map(([machineId, status]) =>
        db.from('machines').update({ status }).eq('id', machineId)
      )
    )
  }

  return {
    checkedCount: dueSchedules.length,
    generatedCount: 0,
    skippedDuplicateCount: 0,
    overdueMarked,
    processedAt: nowIso,
    scheduleRepair: repairSummary,
  }
}

function getScheduleStatus(row: {
  active: boolean
  nextDue: Date
  hasOpenInspection: boolean
  openInspectionIsOverdue: boolean
  gracePeriod: number
  now: Date
}): ScheduleStatus {
  if (!row.active) return 'Paused'
  if (row.openInspectionIsOverdue) return 'Overdue'

  const dueSoonThreshold = endOfUtcWeek(row.now)

  if (isScheduleOverdue(row.nextDue, row.now, row.gracePeriod)) return 'Overdue'
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
      machine_inspection_templates(id, machine_id, template_id, active, checklist_templates(id, name), machines(id, name, status, grace_period))`
    )
    .order('next_due', { ascending: true })

  if (schedulesError) {
    throw schedulesError
  }

  const schedules = (schedulesData ?? []) as Array<
    SchedulerScheduleRow & {
      machine_inspection_templates:
        | (SchedulerMachineTemplateRow & {
            machines:
              | { id: string; name: string; status: string | null; grace_period: number | null }
              | { id: string; name: string; status: string | null; grace_period: number | null }[]
              | null
          })
        | Array<
            SchedulerMachineTemplateRow & {
              machines:
                | { id: string; name: string; status: string | null; grace_period: number | null }
                | { id: string; name: string; status: string | null; grace_period: number | null }[]
                | null
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
        machines:
          | { id: string; name: string; status: string | null; grace_period: number | null }
          | { id: string; name: string; status: string | null; grace_period: number | null }[]
          | null
      }).machines
    )

    if (!template?.id || !machine?.id) continue

    const gracePeriod = Number(machine.grace_period ?? 0)

    const openInspection = openInspectionByScheduleId.get(schedule.id)
    const lastCompleted = lastCompletedByScheduleId.get(schedule.id)
    const nextDue = new Date(schedule.next_due)

    const status = getScheduleStatus({
      active: Boolean(schedule.active),
      nextDue,
      hasOpenInspection: Boolean(openInspection?.inspectionId),
      openInspectionIsOverdue: Boolean(openInspection?.isOverdue),
      gracePeriod,
      now,
    })

    rows.push({
      scheduleId: schedule.id,
      machineTemplateId: schedule.machine_template_id,
      machineId: machine.id,
      machineName: machine.name,
      machineGracePeriod: gracePeriod,
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
    const nextDueDate = new Date(row.nextDue)

    if (row.status === 'Overdue') {
      dueBuckets.overdue.push(row)
    } else if (nextDueDate <= now) {
      dueBuckets.dueToday.push(row)
    } else if (nextDueDate <= endOfUtcWeek(now)) {
      dueBuckets.dueThisWeek.push(row)
    } else if (row.status === 'On Time') {
      dueBuckets.upcoming.push(row)
    }
  }

  const todayStart = startOfUtcDay(now)
  const todayEnd = endOfUtcDay(now)
  const tomorrowStart = startOfUtcDay(addDays(now, 1))
  const tomorrowEnd = endOfUtcDay(addDays(now, 1))

  const { count: completedTodayCount } = await supabaseAdmin
    .from('inspections')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Completed')
    .gte('completed_at', todayStart.toISOString())
    .lte('completed_at', todayEnd.toISOString())

  const { count: dueTomorrowCount } = await supabaseAdmin
    .from('inspection_schedules')
    .select('*', { count: 'exact', head: true })
    .eq('active', true)
    .gte('next_due', tomorrowStart.toISOString())
    .lte('next_due', tomorrowEnd.toISOString())

  const { data: todayCompletedItems } = await supabaseAdmin
    .from('inspection_items')
    .select('inspection_id, answer, inspections!inner(status, completed_at)')
    .eq('inspections.status', 'Completed')
    .gte('inspections.completed_at', todayStart.toISOString())
    .lte('inspections.completed_at', todayEnd.toISOString())

  const completedSet = new Set<string>()
  const failedSet = new Set<string>()
  for (const row of todayCompletedItems ?? []) {
    const inspectionId = String(row.inspection_id)
    completedSet.add(inspectionId)
    if ((row.answer as string | null) === 'fail') failedSet.add(inspectionId)
  }

  const failedInspections = failedSet.size
  const passRate = completedSet.size > 0
    ? Number((((completedSet.size - failedSet.size) / completedSet.size) * 100).toFixed(1))
    : 100

  const totalOutstanding = dueBuckets.dueToday.length + dueBuckets.dueThisWeek.length + dueBuckets.overdue.length

  const complianceDenominator =
    dueBuckets.overdue.length + dueBuckets.dueToday.length + dueBuckets.dueThisWeek.length

  const compliantCount = dueBuckets.dueToday.length + dueBuckets.dueThisWeek.length

  const compliancePercentage =
    complianceDenominator > 0
      ? Number(((compliantCount / complianceDenominator) * 100).toFixed(1))
      : 100

  const engineMetrics = await getInspectionEngineMetrics().catch(() => ({
    failedInspectionStarts: 0,
    duplicateInspectionAttemptsBlocked: 0,
    successfulStarts: 0,
    successfulCompletions: 0,
    cancelledInspections: 0,
    lockDenials: 0,
  }))

  return {
    dueBuckets,
    rows,
    widgets: {
      dueToday: dueBuckets.dueToday.length,
      dueTomorrow: dueTomorrowCount ?? 0,
      overdue: dueBuckets.overdue.length,
      upcomingThisWeek: dueBuckets.dueThisWeek.length,
      completedToday: completedTodayCount ?? 0,
      failedInspections,
      passRate,
      totalOutstanding,
      compliancePercentage,
      failedInspectionStarts: engineMetrics.failedInspectionStarts,
      duplicateInspectionAttemptsBlocked: engineMetrics.duplicateInspectionAttemptsBlocked,
      successfulStarts: engineMetrics.successfulStarts,
      successfulCompletions: engineMetrics.successfulCompletions,
      cancelledInspections: engineMetrics.cancelledInspections,
      lockDenials: engineMetrics.lockDenials,
    },
  }
}

export async function advanceScheduleFromCompletedInspection(params: {
  scheduleId: string | null
  completedAt: Date
}) {
  if (!params.scheduleId || !supabaseAdmin) {
    return { advanced: false as const, reason: 'missing_schedule_or_client' as const }
  }

  const { data: scheduleData, error: scheduleError } = await supabaseAdmin
    .from('inspection_schedules')
    .select('id, machine_template_id, frequency, interval_value, custom_cron, active')
    .eq('id', params.scheduleId)
    .maybeSingle()

  if (scheduleError || !scheduleData || !scheduleData.active) {
    return { advanced: false as const, reason: 'schedule_not_found_or_inactive' as const }
  }

  const nextDue = calculateNextDue({
    frequency: scheduleData.frequency as ScheduleFrequency,
    intervalValue: Number(scheduleData.interval_value ?? 1),
    customCron: (scheduleData.custom_cron as string | null) ?? null,
    fromDate: params.completedAt,
  })

  const { error: updateError } = await supabaseAdmin
    .from('inspection_schedules')
    .update({
      next_due: nextDue.toISOString(),
      last_generated: params.completedAt.toISOString(),
    })
    .eq('id', params.scheduleId)

  if (updateError) {
    return { advanced: false as const, reason: 'schedule_update_failed' as const }
  }

  return {
    advanced: true as const,
    scheduleId: params.scheduleId,
    machineTemplateId: scheduleData.machine_template_id as string,
    nextDue: nextDue.toISOString(),
    completedAt: params.completedAt.toISOString(),
  }
}
