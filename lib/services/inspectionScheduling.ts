import {
  serverConfigErrorMessage,
  supabaseAdmin,
} from '@/lib/admin'
import {
  addLondonDays,
  addLondonMonths,
  calculateNextInspectionDueAt,
  combineLondonDateAndTime,
  endOfLondonDay,
  endOfLondonWeek,
  formatInspectionDateTime,
  INSPECTION_TIMEZONE,
  startOfLondonDay,
} from '@/lib/inspectionTime'
import { trackInspectionEvent } from '@/lib/services/inspectionMetrics'
import { getCompanySettings } from '@/lib/services/companySettings'
import { getInspectionEngineMetrics } from '@/lib/services/inspectionMetrics'
import { sendManagementAlert } from '@/lib/services/managementNotifications'
import {
  buildInspectionEventKey,
  buildInspectionGenerationKey,
} from '@/lib/services/schedulerKeys'

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

export type ScheduleStatus = 'Completed' | 'Due Soon' | 'Due' | 'Overdue'

type DueBucket = 'dueToday' | 'dueThisWeek' | 'overdue' | 'upcoming'

type SchedulerMachineTemplateRow = {
  id: string
  machine_id: string
  template_id: string
  inspection_frequency: ScheduleFrequency
  active: boolean
  machines:
    | {
        id: string
        name: string
        status: string | null
        inspection_deadline: string | null
        inspection_frequency: string | null
        reminder_days_before_due: number | null
        assigned_user: string | null
        area: string | null
      }
    | {
        id: string
        name: string
        status: string | null
        inspection_deadline: string | null
        inspection_frequency: string | null
        reminder_days_before_due: number | null
        assigned_user: string | null
        area: string | null
      }[]
    | null
  checklist_templates: { id: string; name: string } | { id: string; name: string }[] | null
}

type SchedulerAssignedProfile = {
  user_id: string
  username: string
  full_name: string | null
  active: boolean | null
}

type GeneratedInspectionResult = {
  inspectionId: string | null
  generationKey: string
  created: boolean
  itemSnapshotCreated: boolean
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
  machineInspectionDeadline: string | null
  unlockTime: string | null
  deadlineTime: string | null
  reminderOffsetMinutes: number | null
  schedulePreview: {
    frequency: ScheduleFrequency | string
    unlockTime: string | null
    deadlineTime: string | null
    reminderTime: string | null
    statusFlow: string
  }
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
  diagnostics: {
    currentTime: string
    inspectionTime: string
    currentStatus: string
    dueSoonTime: string | null
    dueTime: string
    overdueTime: string
    lockUntil: string
    schedulerDecision: string
    apiDecision: string
    dbDecision: string
  }
}

function toSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function supportsDueSoon(frequency: ScheduleFrequency) {
  return frequency !== 'Daily'
}

function resolveScheduleWindow(nextDueIso: string, deadline: string | null) {
  const dueAt = new Date(nextDueIso)
  if (Number.isNaN(dueAt.getTime())) return null

  const normalizedDueAt = deadline ? combineLondonDateAndTime(dueAt, deadline) : dueAt
  if (Number.isNaN(normalizedDueAt.getTime())) return null

  return {
    dueStart: startOfLondonDay(normalizedDueAt),
    dueAt: normalizedDueAt,
  }
}

export function calculateNextDue(params: {
  frequency: ScheduleFrequency
  intervalValue?: number
  customCron?: string | null
  fromDate: Date
  inspectionTime?: string | null
}) {
  return calculateNextInspectionDueAt(params)
}

async function ensureGeneratedInspectionForSchedule(params: {
  scheduleId: string
  machineId: string
  templateId: string
  templateName: string
  dueAt: Date
  assignedProfile: SchedulerAssignedProfile | null
}) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const generationKey = buildInspectionGenerationKey(params.scheduleId, params.dueAt)
  const assignedProfile = params.assignedProfile

  if (!assignedProfile?.user_id) {
    return {
      inspectionId: null,
      generationKey,
      created: false,
      itemSnapshotCreated: false,
    } satisfies GeneratedInspectionResult
  }

  let inspectionId: string | null = null
  let created = false

  const { data: existingInspection, error: existingInspectionError } = await supabaseAdmin
    .from('inspections')
    .select('id')
    .eq('generation_key', generationKey)
    .maybeSingle()

  if (existingInspectionError) {
    throw existingInspectionError
  }

  inspectionId = (existingInspection?.id as string | undefined) ?? null

  if (!inspectionId) {
    const { data: insertedInspection, error: insertInspectionError } = await supabaseAdmin
      .from('inspections')
      .insert([
        {
          machine_id: params.machineId,
          operator_id: assignedProfile.user_id,
          operator_name: assignedProfile.full_name ?? assignedProfile.username,
          checklist: [],
          completed_at: null,
          due_at: params.dueAt.toISOString(),
          generation_key: generationKey,
          is_overdue: false,
          schedule_id: params.scheduleId,
          status: 'Draft',
          template_id: params.templateId,
          template_name: params.templateName,
          template_version: 1,
          started_by: null,
          started_at: null,
          completion_source: 'scheduler',
        },
      ])
      .select('id')
      .maybeSingle()

    if (insertInspectionError) {
      if ('code' in insertInspectionError && insertInspectionError.code === '23505') {
        const { data: duplicateInspection, error: duplicateInspectionError } = await supabaseAdmin
          .from('inspections')
          .select('id')
          .eq('generation_key', generationKey)
          .maybeSingle()

        if (duplicateInspectionError) {
          throw duplicateInspectionError
        }

        inspectionId = (duplicateInspection?.id as string | undefined) ?? null
      } else {
        throw insertInspectionError
      }
    } else {
      inspectionId = (insertedInspection?.id as string | undefined) ?? null
      created = Boolean(inspectionId)
    }
  }

  if (!inspectionId) {
    return {
      inspectionId: null,
      generationKey,
      created: false,
      itemSnapshotCreated: false,
    } satisfies GeneratedInspectionResult
  }

  const { count: existingItemCount, error: existingItemCountError } = await supabaseAdmin
    .from('inspection_items')
    .select('id', { count: 'exact', head: true })
    .eq('inspection_id', inspectionId)

  if (existingItemCountError) {
    throw existingItemCountError
  }

  let itemSnapshotCreated = false
  if ((existingItemCount ?? 0) === 0) {
    const { data: templateItems, error: templateItemsError } = await supabaseAdmin
      .from('checklist_template_items')
      .select('id, display_order, question, description, question_type, required')
      .eq('template_id', params.templateId)
      .order('display_order', { ascending: true })

    if (templateItemsError) {
      throw templateItemsError
    }

      if ((templateItems ?? []).length > 0) {
        const snapshotRows = (templateItems ?? []).map((item) => ({
          inspection_id: inspectionId,
          original_template_item_id: item.id as string,
          display_order: Number(item.display_order ?? 0),
          question: item.question as string,
          description: (item.description as string | null) ?? null,
          question_type: (item.question_type as string | null) ?? 'pass_fail',
          required: Boolean(item.required ?? true),
          completed: false,
        }))

        // Postgres does not allow ON CONFLICT (cols) to reference a partial
        // unique index (one with a WHERE clause). The unique index
        // `idx_inspection_items_template_snapshot_unique` is partial
        // (WHERE original_template_item_id IS NOT NULL) so an UPSERT with an
        // ON CONFLICT(column list) fails with 42P10. To preserve DB-side
        // constraints and avoid schema changes, insert rows individually and
        // ignore duplicate-key errors (23505). This maintains idempotency
        // and avoids relying on ON CONFLICT against a partial index.
        for (const row of snapshotRows) {
          const { error: insertErr } = await supabaseAdmin.from('inspection_items').insert([row])
          if (insertErr) {
            // If the row already exists (concurrent insert), ignore the
            // duplicate-key error. Otherwise rethrow.
            if (typeof insertErr === 'object' && 'code' in insertErr && String((insertErr as any).code) === '23505') {
              // duplicate - ignore
            } else {
              throw new Error(
                `generate draft inspections failed at statement: insert inspection_items snapshot: ${insertErr?.message ?? String(insertErr)}`,
                { cause: insertErr }
              )
            }
          }
        }
        itemSnapshotCreated = true
      }
  }

  return {
    inspectionId,
    generationKey,
    created,
    itemSnapshotCreated,
  } satisfies GeneratedInspectionResult
}

async function getMachineScheduleDefaults(machineTemplateId: string) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const { data, error } = await supabaseAdmin
    .from('machine_inspection_templates')
    .select('machines(inspection_deadline, reminder_days_before_due)')
    .eq('id', machineTemplateId)
    .maybeSingle()

  if (error) {
    throw error
  }

  const machineRelation = data?.machines
  const machine = Array.isArray(machineRelation) ? (machineRelation[0] ?? null) : machineRelation

  const unlockTime = (machine?.inspection_deadline as string | null | undefined) ?? null
  const reminderDays = machine?.reminder_days_before_due as number | null | undefined

  return {
    unlockTime,
    deadlineTime: null as string | null,
    reminderOffsetMinutes: Number.isFinite(Number(reminderDays)) ? Number(reminderDays) * 24 * 60 : null,
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
  const defaults = await getMachineScheduleDefaults(params.machineTemplateId)
  const inspectionTime = defaults.unlockTime ?? '09:00'
  const base = params.nextDue ?? new Date()
  const nextDue = params.nextDue ?? calculateNextDue({
    frequency: params.frequency,
    intervalValue,
    customCron: params.customCron,
    fromDate: base,
    inspectionTime,
  })
  const normalizedNextDue = params.nextDue
    ? combineLondonDateAndTime(params.nextDue, inspectionTime)
    : nextDue

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
          unlock_time: defaults.unlockTime ?? null,
          deadline_time: defaults.deadlineTime ?? null,
          reminder_offset_minutes: defaults.reminderOffsetMinutes ?? null,
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
      unlock_time: defaults.unlockTime ?? null,
      deadline_time: defaults.deadlineTime ?? null,
      reminder_offset_minutes: defaults.reminderOffsetMinutes ?? null,
      active: params.active ?? true,
    })
    .eq('id', existingSchedule.id as string)

  if (updateError) {
    throw updateError
  }

  return { scheduleId: existingSchedule.id as string, created: false }
}

export async function resolveScheduleForAssignment(assignmentId: string) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const { data, error } = await supabaseAdmin
    .from('inspection_schedules')
    .select('id, machine_template_id, next_due, active')
    .eq('machine_template_id', assignmentId)
    .eq('active', true)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as {
    id: string
    machine_template_id: string
    next_due: string
    active: boolean
  } | null) ?? null
}

export async function repairInspectionScheduleCoverage(now = new Date()) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const { data: assignmentsData, error: assignmentsError } = await supabaseAdmin
    .from('machine_inspection_templates')
    .select(
      'id, machine_id, template_id, inspection_frequency, active, machines(id, inspection_frequency, inspection_deadline, reminder_days_before_due)'
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
    .select('id, due_at')
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

    if (now > dueAt) {
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
  const companySettings = await getCompanySettings().catch(() => null)
  const companyDueSoonWarningDays = Math.max(0, Number(companySettings?.dueSoonWarningDays ?? 2))
  const dueSoonEnabled = Boolean(companySettings?.enableDueSoon ?? true)
  const managementOverdueEnabled = Boolean(companySettings?.enableManagementOverdueNotifications ?? true)

  const repairSummary = await repairInspectionScheduleCoverage(now)

  const { data: scheduleRows, error: schedulesError } = await db
    .from('inspection_schedules')
    .select(
      `id, machine_template_id, frequency, interval_value, custom_cron, next_due, last_generated, active,
      machine_inspection_templates(id, machine_id, template_id, inspection_frequency, active, checklist_templates(id, name), machines(id, name, area, status, inspection_deadline, inspection_frequency, reminder_days_before_due, assigned_user))`
    )
    .eq('active', true)
    .order('next_due', { ascending: true })

  if (schedulesError) {
    throw schedulesError
  }

  const dueSchedules = (scheduleRows ?? []) as SchedulerScheduleRow[]

  const assignedUsernames = Array.from(
    new Set(
      dueSchedules
        .map((schedule) => {
          const machineTemplate = toSingle(schedule.machine_inspection_templates)
          const machine = toSingle(machineTemplate?.machines ?? null)
          return machine?.assigned_user?.trim() ?? ''
        })
        .filter(Boolean)
    )
  )

  const assignedProfileByUsername = new Map<string, SchedulerAssignedProfile>()
  if (assignedUsernames.length > 0) {
    const { data: profilesData, error: profilesError } = await db
      .from('profiles')
      .select('user_id, username, full_name, active')
      .in('username', assignedUsernames)

    if (profilesError) {
      throw profilesError
    }

    for (const profile of (profilesData ?? []) as SchedulerAssignedProfile[]) {
      assignedProfileByUsername.set(profile.username, profile)
    }
  }

  const overdueMarked = await markOverdueInspections(now)

  const machineStatusUpdates = new Map<string, string>()
  const overdueTransitions: Array<{ machineId: string; machineName: string; machineArea: string | null; nextDue: string }> = []
  let generatedCount = 0
  let skippedDuplicateCount = 0

  for (const schedule of dueSchedules) {
    const machineTemplate = toSingle(schedule.machine_inspection_templates)
    if (!machineTemplate || !machineTemplate.active) continue

    const machine = toSingle(machineTemplate.machines)
    if (!machine?.id) continue

    const template = toSingle(machineTemplate.checklist_templates)

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

    const window = resolveScheduleWindow(schedule.next_due, machine.inspection_deadline)
    if (!window) continue

    if (template?.id && now >= window.dueStart) {
      const generatedInspection = await ensureGeneratedInspectionForSchedule({
        scheduleId: schedule.id,
        machineId: machine.id,
        templateId: template.id,
        templateName: template.name,
        dueAt: window.dueAt,
        assignedProfile: machine.assigned_user
          ? assignedProfileByUsername.get(machine.assigned_user) ?? null
          : null,
      })

      if (generatedInspection.created) {
        generatedCount += 1
        await trackInspectionEvent({
          eventType: 'generated_cycle',
          inspectionId: generatedInspection.inspectionId,
          machineId: machine.id,
          scheduleId: schedule.id,
          details: {
            generationKey: generatedInspection.generationKey,
            dueAt: window.dueAt.toISOString(),
          },
          eventKey: buildInspectionEventKey('generated-cycle', schedule.id, window.dueAt),
        }).catch(() => undefined)
      } else if (now >= window.dueStart) {
        skippedDuplicateCount += 1
      }
    }

    const dueSoonWarningDays = Math.max(0, Number(machine.reminder_days_before_due ?? companyDueSoonWarningDays))
    const dueSoonThreshold = addLondonDays(window.dueAt, -dueSoonWarningDays)
    if (now > window.dueAt) {
      machineStatusUpdates.set(machine.id, 'Overdue')
      if ((machine.status ?? '') !== 'Overdue') {
        const overdueEventKey = buildInspectionEventKey('overdue-notification', schedule.id, window.dueAt)
        try {
          await trackInspectionEvent({
            eventType: 'overdue_notification_sent',
            machineId: machine.id,
            scheduleId: schedule.id,
            details: {
              dueAt: window.dueAt.toISOString(),
            },
            eventKey: overdueEventKey,
          })

          overdueTransitions.push({
            machineId: machine.id,
            machineName: machine.name,
            machineArea: machine.area,
            nextDue: window.dueAt.toISOString(),
          })
        } catch {
          // Another safe scheduler execution already recorded this transition.
        }
      }
    } else if (now >= window.dueStart) {
      machineStatusUpdates.set(machine.id, 'Due')
    } else if (dueSoonEnabled && supportsDueSoon(schedule.frequency) && now >= dueSoonThreshold) {
      machineStatusUpdates.set(machine.id, 'Due Soon')
    } else {
      machineStatusUpdates.set(machine.id, machine.status === 'Completed' ? 'Completed' : 'Not Started')
    }
  }

  if (machineStatusUpdates.size > 0) {
    await Promise.all(
      Array.from(machineStatusUpdates.entries()).map(([machineId, status]) =>
        db.from('machines').update({ status }).eq('id', machineId)
      )
    )
  }

  if (managementOverdueEnabled && overdueTransitions.length > 0) {
    for (const item of overdueTransitions) {
      await sendManagementAlert({
        event: 'inspection_overdue',
        machineId: item.machineId,
        machineName: item.machineName,
        machineArea: item.machineArea,
        reference: item.machineId,
        subject: `Inspection Overdue - ${item.machineName}`,
        details: `Inspection is overdue as of ${formatInspectionDateTime(item.nextDue)} (${INSPECTION_TIMEZONE}).`,
      }).catch(() => undefined)
    }
  }

  return {
    checkedCount: dueSchedules.length,
    generatedCount,
    skippedDuplicateCount,
    overdueMarked,
    processedAt: nowIso,
    scheduleRepair: repairSummary,
  }
}

function getScheduleStatus(row: {
  active: boolean
  frequency: ScheduleFrequency
  dueStart: Date
  dueAt: Date
  hasOpenInspection: boolean
  openInspectionIsOverdue: boolean
  dueSoonEnabled: boolean
  dueSoonWarningDays: number
  now: Date
}): ScheduleStatus {
  if (!row.active) return 'Completed'
  if (row.openInspectionIsOverdue) return 'Overdue'

  if (row.now > row.dueAt) return 'Overdue'
  if (row.now >= row.dueStart || row.hasOpenInspection) return 'Due'

  const dueSoonStart = addLondonDays(row.dueAt, -row.dueSoonWarningDays)
  if (row.dueSoonEnabled && supportsDueSoon(row.frequency) && row.now >= dueSoonStart) return 'Due Soon'

  return 'Completed'
}

export async function getScheduleOverview(now = new Date()) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const { data: schedulesData, error: schedulesError } = await supabaseAdmin
    .from('inspection_schedules')
    .select(
      `id, machine_template_id, frequency, interval_value, custom_cron, next_due, last_generated, active,
      machine_inspection_templates(id, machine_id, template_id, active, checklist_templates(id, name), machines(id, name, status, inspection_deadline, inspection_frequency, reminder_days_before_due, assigned_user, area))`
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
              | {
                  id: string
                  name: string
                  status: string | null
                  inspection_deadline: string | null
                  inspection_frequency: string | null
                  reminder_days_before_due: number | null
                  area: string | null
                }
              | {
                  id: string
                  name: string
                  status: string | null
                  inspection_deadline: string | null
                  inspection_frequency: string | null
                  reminder_days_before_due: number | null
                  area: string | null
                }[]
              | null
          })
        | Array<
            SchedulerMachineTemplateRow & {
              machines:
                | {
                    id: string
                    name: string
                    status: string | null
                    inspection_deadline: string | null
                    inspection_frequency: string | null
                    reminder_days_before_due: number | null
                    area: string | null
                  }
                | {
                    id: string
                    name: string
                    status: string | null
                    inspection_deadline: string | null
                    inspection_frequency: string | null
                    reminder_days_before_due: number | null
                    area: string | null
                  }[]
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
  const companySettings = await getCompanySettings().catch(() => null)
  const companyDueSoonWarningDays = Math.max(0, Number(companySettings?.dueSoonWarningDays ?? 2))
  const dueSoonEnabled = Boolean(companySettings?.enableDueSoon ?? true)

  for (const schedule of schedules) {
    const machineTemplate = toSingle(schedule.machine_inspection_templates)
    if (!machineTemplate) continue

    const template = toSingle(machineTemplate.checklist_templates)
    const machine = toSingle(
      (machineTemplate as SchedulerMachineTemplateRow & {
        machines:
          | {
              id: string
              name: string
              status: string | null
              inspection_deadline: string | null
              inspection_frequency: string | null
              reminder_days_before_due: number | null
              area: string | null
            }
          | {
              id: string
              name: string
              status: string | null
              inspection_deadline: string | null
              inspection_frequency: string | null
              reminder_days_before_due: number | null
              area: string | null
            }[]
          | null
      }).machines
    )

    if (!template?.id || !machine?.id) continue

    const openInspection = openInspectionByScheduleId.get(schedule.id)
    const lastCompleted = lastCompletedByScheduleId.get(schedule.id)
    const window = resolveScheduleWindow(schedule.next_due, machine.inspection_deadline)
    if (!window) continue
    const dueSoonWarningDays = Math.max(0, Number(machine.reminder_days_before_due ?? companyDueSoonWarningDays))
    const dueSoonTime = supportsDueSoon(schedule.frequency)
      ? addLondonDays(window.dueAt, -dueSoonWarningDays).toISOString()
      : null


    const status = getScheduleStatus({
      active: Boolean(schedule.active),
      frequency: schedule.frequency,
      dueStart: window.dueStart,
      dueAt: window.dueAt,
      hasOpenInspection: Boolean(openInspection?.inspectionId),
      openInspectionIsOverdue: Boolean(openInspection?.isOverdue),
      dueSoonEnabled,
      dueSoonWarningDays,
      now,
    })

    rows.push({
      scheduleId: schedule.id,
      machineTemplateId: schedule.machine_template_id,
      machineId: machine.id,
      machineName: machine.name,
      machineInspectionDeadline: machine.inspection_deadline,
      unlockTime: machine.inspection_deadline ?? null,
      deadlineTime: null,
      reminderOffsetMinutes: machine.reminder_days_before_due !== null && machine.reminder_days_before_due !== undefined
        ? Number(machine.reminder_days_before_due) * 24 * 60
        : null,
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
      diagnostics: {
        currentTime: now.toISOString(),
        inspectionTime: machine.inspection_deadline ?? '09:00',
        currentStatus: machine.status ?? 'Unknown',
        dueSoonTime,
        dueTime: window.dueAt.toISOString(),
        overdueTime: window.dueAt.toISOString(),
        lockUntil: window.dueStart.toISOString(),
        schedulerDecision: `computed_status=${status}; frequency=${schedule.frequency}`,
        apiDecision: now < window.dueStart ? 'start_locked_until_due_day' : 'start_allowed',
        dbDecision: `machine_status=${machine.status ?? 'Unknown'}; schedule_active=${Boolean(schedule.active)}`,
      },
      schedulePreview: {
        frequency: schedule.frequency,
        unlockTime: machine.inspection_deadline ?? null,
        deadlineTime: null,
        reminderTime: dueSoonTime ? formatInspectionDateTime(dueSoonTime) : null,
        statusFlow: 'Locked ↓ Due (' + (machine.inspection_deadline ?? '09:00') + ') ↓ Overdue (TBD) ↓ Completed',
      },
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
    } else if (row.status === 'Due') {
      dueBuckets.dueToday.push(row)
    } else if (row.status === 'Due Soon') {
      dueBuckets.dueThisWeek.push(row)
    } else if (row.status === 'Completed' && nextDueDate <= endOfLondonWeek(now)) {
      dueBuckets.upcoming.push(row)
    }
  }

  const todayStart = startOfLondonDay(now)
  const todayEnd = endOfLondonDay(now)
  const tomorrowStart = startOfLondonDay(addLondonDays(now, 1))
  const tomorrowEnd = endOfLondonDay(addLondonDays(now, 1))

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

  const defaults = await getMachineScheduleDefaults(scheduleData.machine_template_id as string)
  const nextDue = calculateNextDue({
    frequency: scheduleData.frequency as ScheduleFrequency,
    intervalValue: Number(scheduleData.interval_value ?? 1),
    customCron: (scheduleData.custom_cron as string | null) ?? null,
    fromDate: params.completedAt,
    inspectionTime: defaults.unlockTime ?? '09:00',
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
