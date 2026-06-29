import { createClient } from '@supabase/supabase-js'

import {
  ensureSystemSuperAdmin,
  supabaseAdmin,
  SYSTEM_ADMIN_EMAIL,
  SYSTEM_ADMIN_PASSWORD,
} from '../lib/admin'
import {
  addLondonDays,
  combineLondonDateAndTime,
  formatInspectionDateTime,
} from '../lib/inspectionTime'
import { queueDailyReminderEmails } from '../lib/services/reminders'
import {
  ensureScheduleForMachineTemplate,
  getScheduleOverview,
} from '../lib/services/inspectionScheduling'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const baseUrl = 'http://127.0.0.1:3000'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function main() {
  if (!supabaseAdmin) throw new Error('supabaseAdmin unavailable')
  const adminClient = supabaseAdmin

  const suffix = `rt-${Date.now()}`
  const created = {
    templateIds: [] as string[],
    machineIds: [] as string[],
    assignmentIds: [] as string[],
    scheduleIds: [] as string[],
    inspectionIds: [] as string[],
  }

  async function ensureUser(input: {
    email: string
    password: string
    username: string
    fullName: string
    role?: string
  }) {
    const role = input.role ?? 'user'
    const existingProfile = await adminClient
      .from('profiles')
      .select('user_id')
      .eq('username', input.username)
      .maybeSingle()

    let userId = existingProfile.data?.user_id as string | undefined

    if (!userId) {
      const existingUsers = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const matched = existingUsers.data.users.find((user) => user.email === input.email)
      if (matched) userId = matched.id
    }

    if (!userId) {
      const createdUser = await adminClient.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
      })
      if (createdUser.error || !createdUser.data.user) {
        throw createdUser.error ?? new Error('user creation failed')
      }
      userId = createdUser.data.user.id
    } else {
      const updatedUser = await adminClient.auth.admin.updateUserById(userId, {
        email: input.email,
        password: input.password,
        email_confirm: true,
      })
      if (updatedUser.error) throw updatedUser.error
    }

    const userRow = await adminClient.from('users').upsert({
      id: userId,
      email: input.email,
      full_name: input.fullName,
      role,
      work_area: 'QA',
      active: true,
    })
    if (userRow.error) throw userRow.error

    const profileRow = await adminClient.from('profiles').upsert({
      user_id: userId,
      username: input.username,
      email: input.email,
      full_name: input.fullName,
      role,
      work_area: 'QA',
      active: true,
      receive_inspection_reminder_emails: true,
    })
    if (profileRow.error) throw profileRow.error

    return { userId, ...input, role }
  }

  async function signIn(email: string, password: string) {
    const client = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const result = await client.auth.signInWithPassword({ email, password })
    if (result.error || !result.data.session) {
      throw result.error ?? new Error(`sign in failed for ${email}`)
    }

    return result.data.session.access_token
  }

  async function api(path: string, token: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })

    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }

    return { status: response.status, body }
  }

  try {
    await ensureSystemSuperAdmin()

    const connor = await ensureUser({
      email: `connor+${suffix}@example.com`,
      password: 'ConnorPass123!',
      username: `connor_${suffix}`,
      fullName: 'Connor',
    })
    const ryan = await ensureUser({
      email: `ryan+${suffix}@example.com`,
      password: 'RyanPass123!',
      username: `ryan_${suffix}`,
      fullName: 'Ryan',
    })

    const connorToken = await signIn(connor.email, connor.password)
    const ryanToken = await signIn(ryan.email, ryan.password)
    const adminToken = await signIn(SYSTEM_ADMIN_EMAIL, SYSTEM_ADMIN_PASSWORD)

    const template = await adminClient
      .from('checklist_templates')
      .insert([{ name: `Runtime Template ${suffix}`, description: 'Runtime test template' }])
      .select('id')
      .single()
    if (template.error || !template.data) throw template.error ?? new Error('template create failed')
    created.templateIds.push(template.data.id as string)

    const templateItem = await adminClient.from('checklist_template_items').insert([
      {
        template_id: template.data.id as string,
        display_order: 1,
        question: 'Runtime check',
        question_type: 'pass_fail',
        required: false,
      },
    ])
    if (templateItem.error) throw templateItem.error

    const permissionMachine = await adminClient
      .from('machines')
      .insert([
        {
          name: `Permission Machine ${suffix}`,
          area: 'QA',
          assigned_user: connor.username,
          status: 'Not Started',
          inspection_deadline: '09:30',
          inspection_frequency: 'Daily',
          reminder_days_before_due: 0,
          auto_generate_inspection: true,
        },
      ])
      .select('id')
      .single()
    if (permissionMachine.error || !permissionMachine.data) {
      throw permissionMachine.error ?? new Error('permission machine create failed')
    }
    created.machineIds.push(permissionMachine.data.id as string)

    const permissionAssignment = await adminClient
      .from('machine_inspection_templates')
      .insert([
        {
          machine_id: permissionMachine.data.id as string,
          template_id: template.data.id as string,
          inspection_frequency: 'Daily',
          active: true,
        },
      ])
      .select('id')
      .single()
    if (permissionAssignment.error || !permissionAssignment.data) {
      throw permissionAssignment.error ?? new Error('assignment create failed')
    }
    created.assignmentIds.push(permissionAssignment.data.id as string)

    const permissionSchedule = await ensureScheduleForMachineTemplate({
      machineTemplateId: permissionAssignment.data.id as string,
      frequency: 'Daily',
      intervalValue: 1,
      customCron: null,
      active: true,
      nextDue: new Date('2026-06-29T00:00:00.000Z'),
    })
    created.scheduleIds.push(permissionSchedule.scheduleId)

    const schedulingCases = [
      { label: 'Daily', frequency: 'Daily' as const, nextDue: new Date('2026-06-29T00:00:00.000Z') },
      { label: 'Weekly', frequency: 'Weekly' as const, nextDue: new Date('2026-06-29T00:00:00.000Z') },
      { label: 'Monthly', frequency: 'Monthly' as const, nextDue: new Date('2026-06-29T00:00:00.000Z') },
      {
        label: 'Custom',
        frequency: 'Custom' as const,
        nextDue: new Date('2026-06-29T00:00:00.000Z'),
        customCron: '30 9 * * 1',
      },
    ]

    const caseRows: Array<{ label: string; machineId: string }> = []

    for (const item of schedulingCases) {
      const machine = await adminClient
        .from('machines')
        .insert([
          {
            name: `${item.label} Machine ${suffix}`,
            area: 'QA',
            assigned_user: connor.username,
            status: 'Not Started',
            inspection_deadline: '09:30',
            inspection_frequency: item.frequency,
            reminder_days_before_due: item.frequency === 'Daily' ? 0 : 2,
            auto_generate_inspection: true,
          },
        ])
        .select('id')
        .single()
      if (machine.error || !machine.data) {
        throw machine.error ?? new Error(`${item.label} machine create failed`)
      }
      created.machineIds.push(machine.data.id as string)

      const assignment = await adminClient
        .from('machine_inspection_templates')
        .insert([
          {
            machine_id: machine.data.id as string,
            template_id: template.data.id as string,
            inspection_frequency: item.frequency,
            active: true,
          },
        ])
        .select('id')
        .single()
      if (assignment.error || !assignment.data) {
        throw assignment.error ?? new Error(`${item.label} assignment create failed`)
      }
      created.assignmentIds.push(assignment.data.id as string)

      const ensured = await ensureScheduleForMachineTemplate({
        machineTemplateId: assignment.data.id as string,
        frequency: item.frequency,
        intervalValue: 1,
        customCron: item.customCron ?? null,
        active: true,
        nextDue: item.nextDue,
      })
      created.scheduleIds.push(ensured.scheduleId)
      caseRows.push({ label: item.label, machineId: machine.data.id as string })
    }

    const connorMachines = await api('/api/machines', connorToken)
    const ryanMachines = await api('/api/machines', ryanToken)
    const connorMachineVisible = ((connorMachines.body as any)?.machines ?? []).some(
      (row: any) => row.id === permissionMachine.data.id
    )
    const ryanMachineVisible = ((ryanMachines.body as any)?.machines ?? []).some(
      (row: any) => row.id === permissionMachine.data.id
    )
    const ryanListDenied = await api(`/api/inspection-executions?machine_id=${permissionMachine.data.id}`, ryanToken)

    const connorStart = await api('/api/inspection-executions', connorToken, {
      method: 'POST',
      body: JSON.stringify({
        machine_id: permissionMachine.data.id,
        template_id: template.data.id,
      }),
    })
    if (connorStart.status !== 200) throw new Error(`Connor start failed: ${JSON.stringify(connorStart)}`)
    const inspectionId = (connorStart.body as any)?.inspection?.id as string
    created.inspectionIds.push(inspectionId)

    const reminderSkip = await queueDailyReminderEmails(new Date('2026-06-28T22:30:00.000Z'))
    const reminderQueued = await queueDailyReminderEmails(new Date('2026-06-28T23:30:00.000Z'))

    const connorDashboardSchedules = await api('/api/schedules', connorToken)
    const ryanDashboardSchedules = await api('/api/schedules', ryanToken)

    const ryanDetailDenied = await api(`/api/inspection-executions/${inspectionId}`, ryanToken)
    const ryanCompleteDenied = await api(`/api/inspection-executions/${inspectionId}`, ryanToken, {
      method: 'PATCH',
      body: JSON.stringify({ type: 'complete' }),
    })
    const adminDetail = await api(`/api/inspection-executions/${inspectionId}`, adminToken)
    const adminItemUpdate = await api(`/api/inspection-executions/${inspectionId}`, adminToken, {
      method: 'PATCH',
      body: JSON.stringify({
        type: 'item',
        item_id: (adminDetail.body as any)?.inspection?.items?.[0]?.id,
        answer: 'pass',
        comments: 'verified',
      }),
    })
    const adminComplete = await api(`/api/inspection-executions/${inspectionId}`, adminToken, {
      method: 'PATCH',
      body: JSON.stringify({ type: 'complete' }),
    })
    const reportsResponse = await api('/api/inspections', adminToken)

    const machineCreate = await api('/api/machines', adminToken, {
      method: 'POST',
      body: JSON.stringify({
        name: `Regression Machine ${suffix}`,
        area: 'QA',
        assigned_user: connor.username,
        inspection_deadline: '09:30',
        template_id: template.data.id,
        inspection_frequency: 'Daily',
        reminder_days_before_due: 0,
        auto_generate_inspection: true,
      }),
    })
    const regressionMachineId = (machineCreate.body as any)?.machine?.id as string | undefined
    if (regressionMachineId) created.machineIds.push(regressionMachineId)

    const regressionAssignments = regressionMachineId
      ? await adminClient.from('machine_inspection_templates').select('id').eq('machine_id', regressionMachineId)
      : { data: [], error: null }
    const regressionAssignmentId = (regressionAssignments.data?.[0]?.id as string | undefined) ?? ''
    if (regressionAssignmentId) created.assignmentIds.push(regressionAssignmentId)

    const regressionSchedules = regressionAssignmentId
      ? await adminClient.from('inspection_schedules').select('id').eq('machine_template_id', regressionAssignmentId)
      : { data: [], error: null }
    const regressionScheduleId = (regressionSchedules.data?.[0]?.id as string | undefined) ?? ''
    if (regressionScheduleId) created.scheduleIds.push(regressionScheduleId)

    const machinePatch = regressionMachineId
      ? await api('/api/machines', adminToken, {
          method: 'PATCH',
          body: JSON.stringify({
            id: regressionMachineId,
            name: `Regression Machine ${suffix} Updated`,
            area: 'QA-Updated',
          }),
        })
      : { status: 500, body: null }

    const machineDelete = regressionMachineId
      ? await api('/api/machines', adminToken, {
          method: 'DELETE',
          body: JSON.stringify({ id: regressionMachineId }),
        })
      : { status: 500, body: null }

    const before = new Date('2026-06-29T08:29:00.000Z')
    const exact = new Date('2026-06-29T08:30:00.000Z')
    const after = new Date('2026-06-29T08:31:00.000Z')
    const overviewBefore = await getScheduleOverview(before)
    const overviewExact = await getScheduleOverview(exact)
    const overviewAfter = await getScheduleOverview(after)
    const statusByLabel = (overview: Awaited<ReturnType<typeof getScheduleOverview>>) =>
      Object.fromEntries(
        caseRows.map((item) => [
          item.label,
          overview.rows.find((row) => row.machineId === item.machineId)?.status ?? 'missing',
        ])
      )

    const output = {
      permission: {
        connorMachineVisible,
        ryanMachineVisible,
        ryanListStatus: ryanListDenied.status,
        ryanDetailStatus: ryanDetailDenied.status,
        ryanCompleteStatus: ryanCompleteDenied.status,
        adminDetailStatus: adminDetail.status,
        adminItemUpdateStatus: adminItemUpdate.status,
        adminCompleteStatus: adminComplete.status,
      },
      scheduling: {
        before: { at: formatInspectionDateTime(before), statuses: statusByLabel(overviewBefore) },
        exact: { at: formatInspectionDateTime(exact), statuses: statusByLabel(overviewExact) },
        after: { at: formatInspectionDateTime(after), statuses: statusByLabel(overviewAfter) },
        dstStart: formatInspectionDateTime(
          combineLondonDateAndTime(new Date('2026-03-29T00:00:00.000Z'), '09:30')
        ),
        dstEnd: formatInspectionDateTime(
          combineLondonDateAndTime(new Date('2026-10-25T00:00:00.000Z'), '09:30')
        ),
        reminderWindowExample: formatInspectionDateTime(
          addLondonDays(
            combineLondonDateAndTime(new Date('2026-06-29T00:00:00.000Z'), '09:30'),
            -2
          )
        ),
        reminderQueuedBeforeLocalDueDay: reminderSkip.queued,
        reminderQueuedOnLocalDueDay: reminderQueued.queued,
      },
      regression: {
        dashboardConnorStatus: connorDashboardSchedules.status,
        dashboardRyanStatus: ryanDashboardSchedules.status,
        dashboardRyanOutstanding: (ryanDashboardSchedules.body as any)?.widgets?.totalOutstanding ?? null,
        reportsStatus: reportsResponse.status,
        machineCreateStatus: machineCreate.status,
        generatedAssignment: Boolean(regressionAssignmentId),
        generatedSchedule: Boolean(regressionScheduleId),
        machinePatchStatus: machinePatch.status,
        machineDeleteStatus: machineDelete.status,
      },
    }

    assert(connorMachineVisible === true, 'Connor should see assigned machine')
    assert(ryanMachineVisible === false, 'Ryan should not see Connor machine in machine list')
    assert(ryanListDenied.status === 403, 'Ryan should get 403 on machine inspection list')
    assert(ryanDetailDenied.status === 403, 'Ryan should get 403 on direct inspection access')
    assert(ryanCompleteDenied.status === 403, 'Ryan should get 403 on inspection completion')
    assert(adminDetail.status === 200, 'Admin should view inspection')
    assert(adminItemUpdate.status === 200, 'Admin should update inspection item')
    assert(adminComplete.status === 200, 'Admin should complete inspection')
    assert(reminderSkip.queued === 0, 'Reminder should not queue before the local due day starts')
    assert(reminderQueued.queued >= 1, 'Reminder should queue once the local due day has started')
    assert(connorDashboardSchedules.status === 200, 'Connor dashboard schedules should load')
    assert(ryanDashboardSchedules.status === 200, 'Ryan dashboard schedules should load')
    assert(((ryanDashboardSchedules.body as any)?.widgets?.totalOutstanding ?? 0) === 0, 'Ryan should not see Connor schedule counts')
    assert(reportsResponse.status === 200, 'Reports endpoint should still load for admin')
    assert(machineCreate.status === 200, 'Machine creation should still work')
    assert(Boolean(regressionAssignmentId), 'Machine creation should still generate an assignment')
    assert(Boolean(regressionScheduleId), 'Machine creation should still generate a schedule')
    assert(machinePatch.status === 200, 'Machine editing should still work')
    assert(machineDelete.status === 200, 'Machine deletion should still work')
    assert((output.scheduling.before.statuses as any).Daily === 'Due', 'Daily should be Due before configured inspection time on due day')
    assert((output.scheduling.exact.statuses as any).Daily === 'Due', 'Daily should be Due at configured inspection time')
    assert((output.scheduling.after.statuses as any).Daily === 'Overdue', 'Daily should be Overdue after configured inspection time')
    assert((output.scheduling.after.statuses as any).Weekly === 'Overdue', 'Weekly should be Overdue after configured inspection time')
    assert((output.scheduling.after.statuses as any).Monthly === 'Overdue', 'Monthly should be Overdue after configured inspection time')
    assert((output.scheduling.after.statuses as any).Custom === 'Overdue', 'Custom should be Overdue after configured inspection time')

    console.log(JSON.stringify(output, null, 2))
  } finally {
    if (created.inspectionIds.length > 0) {
      await adminClient.from('inspection_email_history').delete().in('inspection_id', created.inspectionIds)
      await adminClient.from('email_queue').delete().in('inspection_id', created.inspectionIds)
      await adminClient.from('inspection_items').delete().in('inspection_id', created.inspectionIds)
      await adminClient.from('inspection_drafts').delete().in('inspection_id', created.inspectionIds)
      await adminClient.from('defects').delete().in('inspection_id', created.inspectionIds)
      await adminClient.from('inspections').delete().in('id', created.inspectionIds)
    }
    if (created.scheduleIds.length > 0) {
      await adminClient.from('inspection_schedules').delete().in('id', created.scheduleIds)
    }
    if (created.assignmentIds.length > 0) {
      await adminClient.from('machine_inspection_templates').delete().in('id', created.assignmentIds)
    }
    if (created.machineIds.length > 0) {
      await adminClient.from('machines').delete().in('id', created.machineIds)
    }
    if (created.templateIds.length > 0) {
      await adminClient.from('checklist_template_items').delete().in('template_id', created.templateIds)
      await adminClient.from('checklist_templates').delete().in('id', created.templateIds)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})