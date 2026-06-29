import { NextResponse } from 'next/server'
import {
  isProtectedSystemProfile,
  isReservedSystemUsername,
  requireAdmin,
  serverConfigErrorMessage,
  supabaseAdmin,
  SYSTEM_ADMIN_ROLE,
} from '@/lib/admin'

type NewUserPayload = {
  username: string
  full_name: string
  email: string
  password: string
  role: string
  work_area: string
  phone: string
  receive_inspection_reminder_emails?: boolean
}

type UpdateUserPayload = {
  user_id: string
  username: string
  full_name: string
  email: string
  role: string
  work_area: string
  phone: string
  active: boolean
  receive_inspection_reminder_emails?: boolean
  password?: string
}

type ProfileRow = {
  user_id: string
  username: string | null
  full_name: string | null
  email: string | null
  role: string | null
  work_area: string | null
  phone: string | null
  active: boolean | null
  receive_inspection_reminder_emails: boolean | null
}

function normalizeRole(role: string) {
  const value = role.trim().toLowerCase()
  if (value === 'admin') return 'admin'
  if (value === 'supervisor') return 'supervisor'
  return 'operator'
}

function mapDbError(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') {
    return fallback
  }

  const maybeError = error as { code?: string; message?: string }
  if (maybeError.code === '23505') {
    return 'Username or email already exists.'
  }

  return maybeError.message || fallback
}

async function fetchUsers() {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id, username, full_name, email, role, work_area, phone, active, receive_inspection_reminder_emails')
    .order('full_name', { ascending: true })

  if (error) {
    throw error
  }

  return ((data ?? []) as ProfileRow[]).map((profile) => ({
    id: profile.user_id,
    username: profile.username ?? '',
    name: profile.full_name ?? 'Unknown',
    email: profile.email ?? 'Unknown',
    role: profile.role ?? 'operator',
    workArea: profile.work_area ?? '',
    phone: profile.phone ?? '',
    active: profile.active ?? false,
    receiveInspectionReminderEmails: Boolean(profile.receive_inspection_reminder_emails),
  }))
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const users = await fetchUsers()
    return NextResponse.json({ users })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const payload = (await request.json()) as NewUserPayload

    const username = payload.username?.trim() || ''
    const fullName = payload.full_name?.trim() || ''
    const email = payload.email?.trim().toLowerCase() || ''
    const password = payload.password?.trim() || ''
    const requestedRole = payload.role?.trim().toLowerCase() || 'operator'
    const role = normalizeRole(payload.role || 'operator')
    const receiveInspectionReminderEmails = Boolean(payload.receive_inspection_reminder_emails)

    if (!username || !fullName || !email || !password) {
      return NextResponse.json({ error: 'Username, full name, email, and password are required' }, { status: 400 })
    }

    if (isReservedSystemUsername(username)) {
      return NextResponse.json({ error: 'The username "admin" is reserved' }, { status: 403 })
    }

    if (requestedRole === SYSTEM_ADMIN_ROLE) {
      return NextResponse.json({ error: 'The role "super_admin" is reserved for the built-in system account' }, { status: 403 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {},
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    const userId = authData.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User creation failed' }, { status: 500 })
    }

    const { error: usersInsertError } = await supabaseAdmin.from('users').insert([
      {
        id: userId,
        email,
        full_name: fullName,
        role,
        work_area: payload.work_area,
        phone: payload.phone,
        active: true,
        receive_inspection_reminder_emails: receiveInspectionReminderEmails,
      },
    ])
    // users table is an application-level mirror; non-fatal if it fails
    if (usersInsertError) {
      console.warn('users table insert failed (non-fatal):', usersInsertError.message)
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').insert([
      {
        user_id: userId,
        username,
        email,
        full_name: fullName,
        role,
        work_area: payload.work_area,
        phone: payload.phone,
        active: true,
        receive_inspection_reminder_emails: receiveInspectionReminderEmails,
      },
    ])

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: mapDbError(profileError, 'Failed to create profile') }, { status: 500 })
    }

    return NextResponse.json({
      user: {
        id: userId,
        username,
        name: fullName,
        email,
        role,
        workArea: payload.work_area || '',
        phone: payload.phone || '',
        active: true,
        receiveInspectionReminderEmails,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: mapDbError(error, 'Failed to create user') },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const payload = (await request.json()) as UpdateUserPayload

    const username = payload.username?.trim() || ''
    const fullName = payload.full_name?.trim() || ''
    const email = payload.email?.trim().toLowerCase() || ''
    const requestedRole = payload.role?.trim().toLowerCase() || 'operator'
    const role = normalizeRole(payload.role || 'operator')
    const receiveInspectionReminderEmails = Boolean(payload.receive_inspection_reminder_emails)

    if (!payload.user_id || !username || !fullName || !email) {
      return NextResponse.json({ error: 'User id, username, name, and email are required' }, { status: 400 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
    }

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('profiles')
      .select('username, role')
      .eq('user_id', payload.user_id)
      .maybeSingle()

    if (existingProfileError) {
      return NextResponse.json({ error: existingProfileError.message }, { status: 500 })
    }

    if (!existingProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    if (isProtectedSystemProfile(existingProfile ?? undefined)) {
      return NextResponse.json({ error: 'Protected system account cannot be modified' }, { status: 403 })
    }

    if (isReservedSystemUsername(username)) {
      return NextResponse.json({ error: 'The username "admin" is reserved' }, { status: 403 })
    }

    if (requestedRole === SYSTEM_ADMIN_ROLE) {
      return NextResponse.json({ error: 'The role "super_admin" is reserved for the built-in system account' }, { status: 403 })
    }

    // Mirror update to users table (non-fatal)
    const { error: updateUserError } = await supabaseAdmin
      .from('users')
      .update({
        email,
        full_name: fullName,
        role,
        work_area: payload.work_area,
        phone: payload.phone,
        active: payload.active,
        receive_inspection_reminder_emails: receiveInspectionReminderEmails,
      })
      .eq('id', payload.user_id)
    if (updateUserError) {
      console.warn('users table update failed (non-fatal):', updateUserError.message)
    }

    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        username,
        email,
        full_name: fullName,
        role,
        work_area: payload.work_area,
        phone: payload.phone,
        active: payload.active,
        receive_inspection_reminder_emails: receiveInspectionReminderEmails,
      })
      .eq('user_id', payload.user_id)

    if (updateProfileError) {
      return NextResponse.json({ error: updateProfileError.message }, { status: 500 })
    }

    const authUpdatePayload: Record<string, string> = {
      email,
    }

    if (payload.password?.trim()) {
      authUpdatePayload.password = payload.password
    }

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(payload.user_id, authUpdatePayload)

    if (authUpdateError) {
      return NextResponse.json({ error: authUpdateError.message }, { status: 500 })
    }

    return NextResponse.json({
      user: {
        id: payload.user_id,
        username,
        name: fullName,
        email,
        role,
        workArea: payload.work_area || '',
        phone: payload.phone || '',
        active: payload.active,
        receiveInspectionReminderEmails,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update user' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { user_id } = (await request.json()) as { user_id: string }
    if (!user_id) {
      return NextResponse.json({ error: 'User id is required' }, { status: 400 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
    }

    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from('profiles')
      .select('username, role')
      .eq('user_id', user_id)
      .maybeSingle()

    if (targetProfileError) {
      return NextResponse.json({ error: targetProfileError.message }, { status: 500 })
    }

    if (!targetProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    if (isProtectedSystemProfile(targetProfile ?? undefined)) {
      return NextResponse.json({ error: 'Protected system account cannot be deleted' }, { status: 403 })
    }

    const { error: profileDeleteError } = await supabaseAdmin.from('profiles').delete().eq('user_id', user_id)
    if (profileDeleteError) {
      return NextResponse.json({ error: profileDeleteError.message }, { status: 500 })
    }

    // Mirror delete to users table (non-fatal)
    const { error: usersDeleteError } = await supabaseAdmin.from('users').delete().eq('id', user_id)
    if (usersDeleteError) {
      console.warn('users table delete failed (non-fatal):', usersDeleteError.message)
    }

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id)
    if (authDeleteError) {
      return NextResponse.json({ error: authDeleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete user' },
      { status: 500 }
    )
  }
}
