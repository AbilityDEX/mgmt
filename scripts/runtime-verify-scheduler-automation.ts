import { ensureSystemSuperAdmin, supabaseAdmin } from '@/lib/admin'
import { combineLondonDateAndTime, formatInspectionDateTime } from '@/lib/inspectionTime'
import { archiveInspectionAndSendEmail } from '@/lib/services/archivePipeline'
import { ensureScheduleForMachineTemplate } from '@/lib/services/inspectionScheduling'
import { runAutomatedSchedulerCycle } from '@/lib/services/schedulerAutomation'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

type TableName =
  | 'inspections'
  | 'inspection_email_history'
  | 'archive_delivery_logs'
  | 'archive_jobs'
  | 'inspection_engine_events'

async function countTableRows(table: TableName) {
  if (!supabaseAdmin) throw new Error('supabaseAdmin unavailable')
  const result = await supabaseAdmin.from(table).select('id', { count: 'exact', head: true })
  if (result.error) throw result.error
  return result.count ?? 0
}

async function duplicateKeyStats(
  table: 'inspection_email_history' | 'archive_delivery_logs' | 'archive_jobs' | 'inspection_engine_events',
  keyColumn: 'event_key' | 'log_key' | 'job_key'
) {
  if (!supabaseAdmin) throw new Error('supabaseAdmin unavailable')

  const result = await supabaseAdmin
    .from(table)
    .select(`id, ${keyColumn}`)
    .not(keyColumn, 'is', null)

  if (result.error) throw result.error

  const rows = (result.data ?? []) as Array<Record<string, unknown>>
  const seen = new Map<string, number>()

  for (const row of rows) {
    const key = row[keyColumn]
    if (!key || typeof key !== 'string') continue
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }

  const duplicates = Array.from(seen.entries())
    .filter((entry) => entry[1] > 1)
    .map(([key, count]) => ({ key, count }))

  return {
    table,
    keyColumn,
    keyedRows: rows.length,
    distinctKeys: seen.size,
    duplicateKeyCount: duplicates.length,
    duplicateSample: duplicates.slice(0, 5),
  }
}

async function ensureUser(input: {
  email: string
  password: string
  username: string
  fullName: string
  role?: string
}) {
  if (!supabaseAdmin) throw new Error('supabaseAdmin unavailable')

  const role = input.role ?? 'user'
  const existingProfile = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .eq('username', input.username)
    .maybeSingle()

  if (existingProfile.error) throw existingProfile.error

  let userId = existingProfile.data?.user_id as string | undefined

  if (!userId) {
    const existingUsers = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (existingUsers.error) throw existingUsers.error
    const matched = existingUsers.data.users.find((user) => user.email === input.email)
    if (matched) userId = matched.id
  }

  if (!userId) {
    const createdUser = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    })
    if (createdUser.error || !createdUser.data.user) {
      throw createdUser.error ?? new Error('user creation failed')
    }
    userId = createdUser.data.user.id
  } else {
    const updatedUser = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: input.email,
      password: input.password,
      email_confirm: true,
    })
    if (updatedUser.error) throw updatedUser.error
  }

  const userPayload = {
    id: userId,
    email: input.email,
    full_name: input.fullName,
    role,
    work_area: 'QA',
    active: true,
  }

  const existingUserRow = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  if (existingUserRow.error) throw existingUserRow.error

  if (existingUserRow.data) {
    const userUpdate = await supabaseAdmin.from('users').update(userPayload).eq('id', userId)
    if (userUpdate.error) throw userUpdate.error
  } else {
    const userInsert = await supabaseAdmin.from('users').insert(userPayload)
    if (userInsert.error) throw userInsert.error
  }

  const profilePayload = {
    user_id: userId,
    username: input.username,
    email: input.email,
    full_name: input.fullName,
    role,
    work_area: 'QA',
    active: true,
    receive_inspection_reminder_emails: true,
  }

  const existingProfileRow = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (existingProfileRow.error) throw existingProfileRow.error

  if (existingProfileRow.data) {
    const profileUpdate = await supabaseAdmin.from('profiles').update(profilePayload).eq('user_id', userId)
    if (profileUpdate.error) throw profileUpdate.error
  } else {
    const profileInsert = await supabaseAdmin.from('profiles').insert(profilePayload)
    if (profileInsert.error) throw profileInsert.error
  }

  return { userId, ...input, role }
}

async function main() {
  if (!supabaseAdmin) throw new Error('supabaseAdmin unavailable')
  const adminClient = supabaseAdmin

  await ensureSystemSuperAdmin()

  const suffix = `automation-${Date.now()}`
  const assigned = await ensureUser({
    email: `${suffix}@example.com`,
    password: 'SchedulerPass123!',
    username: `scheduler_${suffix}`,
    fullName: 'Scheduler Test User',
  })

  const templateInsert = await adminClient
    .from('checklist_templates')
    .insert([{ name: `Automation Template ${suffix}`, description: 'Scheduler automation verification' }])
    .select('id')
    .single()
  if (templateInsert.error || !templateInsert.data) throw templateInsert.error ?? new Error('template create failed')
  const templateId = templateInsert.data.id as string

  const itemInsert = await adminClient.from('checklist_template_items').insert([
    {
      template_id: templateId,
      display_order: 1,
      question: 'Automation verification question',
      question_type: 'pass_fail',
      required: false,
    },
  ])
  if (itemInsert.error) throw itemInsert.error

  const machineInsert = await adminClient
    .from('machines')
    .insert([
      {
        name: `Automation Machine ${suffix}`,
        area: 'QA',
        assigned_user: assigned.username,
        status: 'Not Started',
        inspection_deadline: '09:30',
        inspection_frequency: 'Daily',
        reminder_days_before_due: 0,
        auto_generate_inspection: true,
      },
    ])
    .select('id')
    .single()
  if (machineInsert.error || !machineInsert.data) throw machineInsert.error ?? new Error('machine create failed')
  const machineId = machineInsert.data.id as string

  const assignmentInsert = await adminClient
    .from('machine_inspection_templates')
    .insert([
      {
        machine_id: machineId,
        template_id: templateId,
        inspection_frequency: 'Daily',
        active: true,
      },
    ])
    .select('id')
    .single()
  if (assignmentInsert.error || !assignmentInsert.data) throw assignmentInsert.error ?? new Error('assignment create failed')
  const assignmentId = assignmentInsert.data.id as string

  const now = new Date()
  const pastDueSeed = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const dueNow = combineLondonDateAndTime(pastDueSeed, '09:30')

  const schedule = await ensureScheduleForMachineTemplate({
    machineTemplateId: assignmentId,
    frequency: 'Daily',
    intervalValue: 1,
    customCron: null,
    active: true,
    nextDue: dueNow,
  })

  const expectedGenerationKey = `inspection-cycle:${schedule.scheduleId}:${dueNow.toISOString()}`

  const baselineCounts = {
    inspections: await countTableRows('inspections'),
    emailHistory: await countTableRows('inspection_email_history'),
    archiveLogs: await countTableRows('archive_delivery_logs'),
    archiveJobs: await countTableRows('archive_jobs'),
    engineEvents: await countTableRows('inspection_engine_events'),
  }

  const sequentialRunCount = Number(process.env.RUNTIME_VERIFY_SEQUENTIAL_RUNS ?? 10)
  const concurrentRunCount = Number(process.env.RUNTIME_VERIFY_CONCURRENT_RUNS ?? 20)
  const archiveRunCount = Number(process.env.RUNTIME_VERIFY_ARCHIVE_RUNS ?? 3)

  const firstHundredRuns = [] as Array<{ index: number; skipped: boolean; reason: string }>
  for (let index = 0; index < sequentialRunCount; index += 1) {
    const result = await runAutomatedSchedulerCycle(now, { owner: `verify-100-${suffix}-${index}` })
    if (index < 5 || index >= Math.max(sequentialRunCount - 5, 0)) {
      firstHundredRuns.push({ index, skipped: result.skipped, reason: result.reason })
    }
  }

  const inspectionsForCycle = await adminClient
    .from('inspections')
    .select('id, generation_key, schedule_id, status')
    .eq('schedule_id', schedule.scheduleId)

  if (inspectionsForCycle.error) throw inspectionsForCycle.error
  const cycleRows = (inspectionsForCycle.data ?? []) as Array<Record<string, unknown>>
  const cycleRowsForGenerationKey = cycleRows.filter((row) => row.generation_key === expectedGenerationKey)

  assert(
    cycleRows.length === 1,
    `Expected exactly one inspection for schedule ${schedule.scheduleId}, found ${cycleRows.length}`
  )

  const concurrentRuns = await Promise.all(
    Array.from({ length: concurrentRunCount }, (_, index) =>
      runAutomatedSchedulerCycle(now, { owner: `verify-concurrent-${suffix}-${index}` }).then((result) => ({
        index,
        skipped: result.skipped,
        reason: result.reason,
      }))
    )
  )

  const concurrentCycleCheck = await adminClient
    .from('inspections')
    .select('id, generation_key, schedule_id')
    .eq('schedule_id', schedule.scheduleId)
  if (concurrentCycleCheck.error) throw concurrentCycleCheck.error

  assert(
    (concurrentCycleCheck.data ?? []).length === 1,
    `Concurrent runs produced duplicates for schedule ${schedule.scheduleId}`
  )

  const generatedInspectionId = (concurrentCycleCheck.data?.[0]?.id as string | undefined) ?? null
  assert(Boolean(generatedInspectionId), 'Generated inspection id missing')

  const markCompleted = await adminClient
    .from('inspections')
    .update({
      status: 'Completed',
      started_at: now.toISOString(),
      completed_at: now.toISOString(),
      completion_source: 'runtime-verify',
      operator_id: assigned.userId,
      operator_name: assigned.fullName,
    })
    .eq('id', generatedInspectionId)
  if (markCompleted.error) throw markCompleted.error

  const recipientInsert = await adminClient.from('email_distribution_recipients').insert([
    {
      name: 'Automation QA Recipient',
      email: `archive-${suffix}@example.com`,
      recipient_type: 'to',
      enabled: true,
      delivery_scope: 'all_inspections',
      department_filter: null,
      machine_filter: null,
    },
  ])
  if (recipientInsert.error) throw recipientInsert.error

  const archiveRuns = [] as Array<{ index: number; ok: boolean; archiveId?: string | null; queuedForDelivery?: boolean }>
  for (let index = 0; index < archiveRunCount; index += 1) {
    const archiveResult = await archiveInspectionAndSendEmail({
      inspectionId: generatedInspectionId as string,
      triggeredBy: assigned.userId,
      requireEmailDelivery: false,
    })
    archiveRuns.push({
      index,
      ok: true,
      archiveId: archiveResult.archiveId,
      queuedForDelivery: archiveResult.queuedForDelivery ?? false,
    })
  }

  const afterArchiveCounts = {
    inspections: await countTableRows('inspections'),
    emailHistory: await countTableRows('inspection_email_history'),
    archiveLogs: await countTableRows('archive_delivery_logs'),
    archiveJobs: await countTableRows('archive_jobs'),
    engineEvents: await countTableRows('inspection_engine_events'),
  }

  const manualReopenResult = await runAutomatedSchedulerCycle(now, { owner: `verify-reopen-${suffix}` })
  const afterReopen = await adminClient
    .from('inspections')
    .select('id')
    .eq('schedule_id', schedule.scheduleId)
  if (afterReopen.error) throw afterReopen.error

  assert((afterReopen.data ?? []).length === 1, 'Manual re-run produced duplicate inspection')

  const duplicateStats = {
    emailHistoryEventKey: await duplicateKeyStats('inspection_email_history', 'event_key'),
    archiveDeliveryLogKey: await duplicateKeyStats('archive_delivery_logs', 'log_key'),
    archiveJobKey: await duplicateKeyStats('archive_jobs', 'job_key'),
    inspectionEngineEventKey: await duplicateKeyStats('inspection_engine_events', 'event_key'),
  }

  const summary = {
    executedAt: formatInspectionDateTime(now),
    seeded: {
      scheduleId: schedule.scheduleId,
      expectedGenerationKey,
      resolvedGenerationKey: (concurrentCycleCheck.data?.[0]?.generation_key as string | undefined) ?? null,
      assignedUsername: assigned.username,
      machineId,
      templateId,
    },
    hundredConsecutiveRuns: {
      runCount: sequentialRunCount,
      sample: firstHundredRuns,
      inspectionsForSchedule: cycleRows.length,
      inspectionsForGenerationKey: cycleRowsForGenerationKey.length,
      expectedOneInspectionPerCycle: cycleRows.length === 1,
    },
    concurrentRuns: {
      runCount: concurrentRunCount,
      results: concurrentRuns,
      lockedCount: concurrentRuns.filter((row) => row.reason === 'locked').length,
      completedCount: concurrentRuns.filter((row) => row.reason === 'completed').length,
      inspectionsForGenerationKeyAfterConcurrent: (concurrentCycleCheck.data ?? []).length,
      expectedOneInspectionPerCycle: (concurrentCycleCheck.data ?? []).length === 1,
    },
    idempotencyEvidence: {
      archiveRuns,
      duplicateStats,
    },
    invocationOnlyEvidence: {
      reopenRun: {
        skipped: manualReopenResult.skipped,
        reason: manualReopenResult.reason,
      },
      countAfterReopen: (afterReopen.data ?? []).length,
      expectedSingleAfterReopen: (afterReopen.data ?? []).length === 1,
    },
    beforeAfterRowCounts: {
      baselineCounts,
      afterArchiveCounts,
    },
    queryChecks: [
      `select id, generation_key, schedule_id from inspections where schedule_id = '${schedule.scheduleId}';`,
      "select event_key, count(*) from inspection_email_history where event_key is not null group by event_key having count(*) > 1;",
      "select job_key, count(*) from archive_jobs where job_key is not null group by job_key having count(*) > 1;",
      "select log_key, count(*) from archive_delivery_logs where log_key is not null group by log_key having count(*) > 1;",
      "select event_key, count(*) from inspection_engine_events where event_key is not null group by event_key having count(*) > 1;",
    ],
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})