import { NextResponse } from 'next/server'
import { requireAdmin, requireAuth, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'

function computeStatus(raw: string, deadline: string): string {
  if (raw === 'Completed' || raw === 'In Progress') return raw
  const [h, m] = (deadline || '09:00').split(':').map(Number)
  const now = new Date()
  if (now.getHours() * 60 + now.getMinutes() > h * 60 + m) return 'Overdue'
  return raw
}

async function getAssignedUserMaps(rows: Array<Record<string, unknown>>) {
  if (!supabaseAdmin) {
    return {
      fullNameByUsername: new Map<string, string>(),
      userIdByUsername: new Map<string, string>(),
    }
  }

  const assignedUsernames = Array.from(
    new Set(rows.map((row) => String(row.assigned_user ?? '')).filter(Boolean))
  )

  if (assignedUsernames.length === 0) {
    return {
      fullNameByUsername: new Map<string, string>(),
      userIdByUsername: new Map<string, string>(),
    }
  }

  const { data } = await supabaseAdmin
    .from('profiles')
    .select('user_id, username, full_name')
    .in('username', assignedUsernames)

  const fullNameByUsername = new Map<string, string>()
  const userIdByUsername = new Map<string, string>()
  for (const profile of data ?? []) {
    if (!profile.username) continue
    fullNameByUsername.set(profile.username, profile.full_name || profile.username)
    userIdByUsername.set(profile.username, profile.user_id)
  }

  return { fullNameByUsername, userIdByUsername }
}

function mapRow(
  row: Record<string, unknown>,
  fullNameByUsername: Map<string, string>,
  userIdByUsername: Map<string, string>
) {
  const assignedUsername = (row.assigned_user as string) ?? ''

  return {
    id: row.id as string,
    name: row.name as string,
    area: (row.area as string) ?? '',
    assetId: (row.code as string) ?? '',
    templateId: (row.template_id as string | null) ?? null,
    templateName: (row.template_name as string | null) ?? null,
    assignedUserId: userIdByUsername.get(assignedUsername) ?? '',
    assignedUser: fullNameByUsername.get(assignedUsername) ?? assignedUsername ?? 'Unassigned',
    status: computeStatus(row.status as string, row.inspection_deadline as string),
    inspectionDeadline: row.inspection_deadline as string,
    reminderDaysBeforeDue: (row.reminder_days_before_due as number) ?? 7,
    gracePeriod: (row.grace_period as number) ?? 3,
    autoGenerateInspection: (row.auto_generate_inspection as boolean) ?? true,
  }
}

async function validateAssignedUser(username: string | undefined) {
  const nextUsername = username?.trim() || ''
  if (!nextUsername || !supabaseAdmin) {
    return { username: '' }
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('username, active')
    .eq('username', nextUsername)
    .maybeSingle()

  if (error || !data) {
    return { error: 'Assigned user was not found.' }
  }

  if (!data.active) {
    return { error: 'Assigned user must be enabled.' }
  }

  return { username: data.username }
}

async function getUsernameForUserId(userId: string) {
  if (!supabaseAdmin || !userId) return ''

  const { data } = await supabaseAdmin
    .from('profiles')
    .select('username')
    .eq('user_id', userId)
    .maybeSingle()

  return data?.username ?? ''
}

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const url = new URL(request.url)
  const assignedTo = url.searchParams.get('assigned_to')
  const machineName = url.searchParams.get('name')
  const assetId = url.searchParams.get('asset_id')

  let query = supabaseAdmin
    .from('machines')
    .select(
      `id, name, area, assigned_user, status, inspection_deadline, code, 
      reminder_days_before_due, grace_period, auto_generate_inspection,
      machine_inspection_templates!inner(template_id, inspection_frequency, active,
        checklist_templates!inner(name))`
    )
    .eq('machine_inspection_templates.active', true)
    .order('name', { ascending: true })

  if (assignedTo) {
    const username = await getUsernameForUserId(assignedTo)
    if (username) {
      query = query.eq('assigned_user', username)
    }
  }

  if (machineName) {
    query = query.ilike('name', `%${machineName}%`)
  }

  if (assetId) {
    query = query.ilike('code', `%${assetId}%`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>
  const mappedRows = rows.map((row) => {
    const mit = (row.machine_inspection_templates as Array<Record<string, unknown>> | undefined)?.[0]
    const template = (mit?.checklist_templates as Record<string, unknown> | undefined)
    return {
      ...row,
      template_id: mit?.template_id,
      template_name: template?.name,
    }
  })

  const { fullNameByUsername, userIdByUsername } = await getAssignedUserMaps(mappedRows)

  return NextResponse.json({
    machines: mappedRows.map((row) => mapRow(row, fullNameByUsername, userIdByUsername)),
  })
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const body = (await request.json()) as {
    name: string
    area: string
    assigned_user: string
    inspection_deadline: string
    asset_id?: string
    template_id?: string | null
    inspection_frequency?: string
    reminder_days_before_due?: number
    grace_period?: number
    auto_generate_inspection?: boolean
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Machine name is required' }, { status: 400 })
  }

  const assignment = await validateAssignedUser(body.assigned_user)
  if ('error' in assignment) {
    return NextResponse.json({ error: assignment.error }, { status: 400 })
  }

  // Create the machine
  const { data: machineData, error: machineError } = await supabaseAdmin
    .from('machines')
    .insert([
      {
        name: body.name.trim(),
        area: body.area ?? '',
        code: body.asset_id?.trim() ? body.asset_id.trim() : null,
        assigned_user: assignment.username || null,
        status: 'Not Started',
        inspection_deadline: body.inspection_deadline ?? '09:00',
        reminder_days_before_due: body.reminder_days_before_due ?? 7,
        grace_period: body.grace_period ?? 3,
        auto_generate_inspection: body.auto_generate_inspection ?? true,
      },
    ])
    .select('id')
    .single()

  if (machineError) {
    return NextResponse.json({ error: machineError.message }, { status: 500 })
  }

  const machineId = (machineData as Record<string, unknown>).id as string

  // If a template is provided, create the assignment
  if (body.template_id?.trim()) {
    const { error: assignmentError } = await supabaseAdmin
      .from('machine_inspection_templates')
      .insert([
        {
          machine_id: machineId,
          template_id: body.template_id.trim(),
          inspection_frequency: body.inspection_frequency ?? 'Monthly',
          active: true,
        },
      ])

    if (assignmentError) {
      // Delete the machine if assignment fails
      await supabaseAdmin.from('machines').delete().eq('id', machineId)
      return NextResponse.json({ error: assignmentError.message }, { status: 500 })
    }
  }

  // Fetch the created machine with its template
  const { data, error } = await supabaseAdmin
    .from('machines')
    .select(
      `id, name, area, assigned_user, status, inspection_deadline, code,
      reminder_days_before_due, grace_period, auto_generate_inspection,
      machine_inspection_templates(template_id, inspection_frequency, active, checklist_templates(name))`
    )
    .eq('id', machineId)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const row = data as Record<string, unknown>
  const mit = (row.machine_inspection_templates as Array<Record<string, unknown>> | undefined)?.[0]
  const template = (mit?.checklist_templates as Record<string, unknown> | undefined)
  const mappedRow = {
    ...row,
    template_id: mit?.template_id,
    template_name: template?.name,
  }

  const { fullNameByUsername, userIdByUsername } = await getAssignedUserMaps([mappedRow])
  return NextResponse.json({ machine: mapRow(mappedRow, fullNameByUsername, userIdByUsername) })
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const body = (await request.json()) as {
    id: string
    name?: string
    area?: string
    assigned_user?: string
    status?: string
    inspection_deadline?: string
    asset_id?: string
    template_id?: string | null
    inspection_frequency?: string
    reminder_days_before_due?: number
    grace_period?: number
    auto_generate_inspection?: boolean
  }

  if (!body.id) {
    return NextResponse.json({ error: 'Machine id is required' }, { status: 400 })
  }

  const updates: Record<string, string | number | boolean | null> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.area !== undefined) updates.area = body.area
  if (body.status !== undefined) updates.status = body.status
  if (body.inspection_deadline !== undefined) updates.inspection_deadline = body.inspection_deadline
  if (body.asset_id !== undefined) updates.code = body.asset_id.trim() ? body.asset_id.trim() : null
  if (body.reminder_days_before_due !== undefined) updates.reminder_days_before_due = body.reminder_days_before_due
  if (body.grace_period !== undefined) updates.grace_period = body.grace_period
  if (body.auto_generate_inspection !== undefined) updates.auto_generate_inspection = body.auto_generate_inspection

  // Update machine base fields
  const { error: updateError } = await supabaseAdmin.from('machines').update(updates).eq('id', body.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Handle template assignment if provided
  if (body.template_id !== undefined) {
    if (body.template_id?.trim()) {
      // Delete existing assignment and create new one
      await supabaseAdmin.from('machine_inspection_templates').delete().eq('machine_id', body.id)

      const { error: assignmentError } = await supabaseAdmin
        .from('machine_inspection_templates')
        .insert([
          {
            machine_id: body.id,
            template_id: body.template_id.trim(),
            inspection_frequency: body.inspection_frequency ?? 'Monthly',
            active: true,
          },
        ])

      if (assignmentError) {
        return NextResponse.json({ error: assignmentError.message }, { status: 500 })
      }
    } else {
      // Remove template assignment
      await supabaseAdmin.from('machine_inspection_templates').delete().eq('machine_id', body.id)
    }
  }

  // Fetch updated machine with template
  const { data, error } = await supabaseAdmin
    .from('machines')
    .select(
      `id, name, area, assigned_user, status, inspection_deadline, code,
      reminder_days_before_due, grace_period, auto_generate_inspection,
      machine_inspection_templates(template_id, inspection_frequency, active, checklist_templates(name))`
    )
    .eq('id', body.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const row = data as Record<string, unknown>
  const mit = (row.machine_inspection_templates as Array<Record<string, unknown>> | undefined)?.[0]
  const template = (mit?.checklist_templates as Record<string, unknown> | undefined)
  const mappedRow = {
    ...row,
    template_id: mit?.template_id,
    template_name: template?.name,
  }

  const { fullNameByUsername, userIdByUsername } = await getAssignedUserMaps([mappedRow])
  return NextResponse.json({ machine: mapRow(mappedRow, fullNameByUsername, userIdByUsername) })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const { id } = (await request.json()) as { id: string }
  if (!id) {
    return NextResponse.json({ error: 'Machine id is required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('machines').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
