import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const missingServerEnvVars = [
  !supabaseUrl ? 'NEXT_PUBLIC_SUPABASE_URL' : null,
  !serviceRoleKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
].filter((value): value is string => Boolean(value))

export const serverConfigErrorMessage = missingServerEnvVars.length
  ? `Missing required server environment variable(s): ${missingServerEnvVars.join(', ')}`
  : 'Supabase admin client is not configured.'

export const supabaseAdmin: SupabaseClient | null =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      })
    : null

export const SYSTEM_ADMIN_USERNAME = 'admin'
export const SYSTEM_ADMIN_ROLE = 'super_admin'
export const SYSTEM_ADMIN_EMAIL = 'admin@mgmt.local'
export const SYSTEM_ADMIN_PASSWORD = 'Meg4vaux!'
export const SYSTEM_ADMIN_FULL_NAME = 'Built-in Super Admin'
export const SYSTEM_ADMIN_WORK_AREA = 'Administration'

export type AuthResult =
  | { userId: string; status: 200 }
  | { error: string; status: number }

export type AuthenticatedUser = {
  userId: string
  username: string | null
  role: string | null
  isAdmin: boolean
}

export type AuthContextResult =
  | ({ status: 200 } & AuthenticatedUser)
  | { error: string; status: number }

export function isAdminRole(role: string | null | undefined) {
  const normalized = role?.trim().toLowerCase() ?? ''
  return normalized === 'admin' || normalized === SYSTEM_ADMIN_ROLE
}

async function getUserFromBearerToken(request: Request) {
  if (!supabaseAdmin) {
    return { error: serverConfigErrorMessage, status: 500 as const }
  }

  const authHeader = request.headers.get('authorization') ?? ''
  // Do not log authorization headers or tokens in production.
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  // Avoid exposing token presence in logs.

  if (!token) {
    return { error: 'Authentication required', status: 401 as const }
  }

  const { data: userResponse, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userResponse.user) {
    return { error: userError?.message ?? 'Invalid authentication token', status: 401 as const }
  }

  return { user: userResponse.user, status: 200 as const }
}

export async function requireAuthContext(request: Request): Promise<AuthContextResult> {
  if (!supabaseAdmin) {
    return { error: serverConfigErrorMessage, status: 500 }
  }

  const authUser = await getUserFromBearerToken(request)
  if ('error' in authUser && typeof authUser.error === 'string') {
    return authUser
  }

  const userId = authUser.user.id
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('username, role')
    .eq('user_id', userId)
    .maybeSingle()

  if (profileError) {
    return { error: profileError.message, status: 500 }
  }

  const role = (profile?.role as string | null | undefined) ?? null
  return {
    status: 200,
    userId,
    username: (profile?.username as string | null | undefined) ?? null,
    role,
    isAdmin: isAdminRole(role),
  }
}

export function isReservedSystemUsername(username: string) {
  return username.trim().toLowerCase() === SYSTEM_ADMIN_USERNAME
}

export function isProtectedSystemProfile(profile?: { username?: string | null; role?: string | null }) {
  return profile?.username === SYSTEM_ADMIN_USERNAME || profile?.role === SYSTEM_ADMIN_ROLE
}

export async function requireAuth(request: Request): Promise<AuthResult> {
  const auth = await requireAuthContext(request)
  if ('error' in auth) {
    return auth
  }

  return { userId: auth.userId, status: 200 }
}

export async function requireAdmin(request: Request): Promise<AuthResult> {
  if (!supabaseAdmin) {
    return { error: serverConfigErrorMessage, status: 500 }
  }

  try {
    await ensureSystemSuperAdmin()
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : serverConfigErrorMessage,
      status: 500,
    }
  }

  const auth = await requireAuthContext(request)
  if ('error' in auth) {
    return auth
  }

  if (!auth.isAdmin) {
    return { error: 'Admin rights required', status: 403 }
  }

  return { userId: auth.userId, status: 200 }
}

export async function ensureSystemSuperAdmin() {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const { data: existingProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .eq('username', SYSTEM_ADMIN_USERNAME)
    .maybeSingle()

  if (profileError) {
    throw profileError
  }

  if (existingProfile?.user_id) {
    return existingProfile.user_id
  }

  const { data: existingUser, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', SYSTEM_ADMIN_EMAIL)
    .maybeSingle()

  if (usersError) {
    throw usersError
  }

  let userId = existingUser?.id

  if (!userId) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: SYSTEM_ADMIN_EMAIL,
      password: SYSTEM_ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: {},
    })

    if (authError) {
      if (!authError.message.toLowerCase().includes('already exists')) {
        throw authError
      }

      const { data: duplicateUser, error: duplicateUserError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', SYSTEM_ADMIN_EMAIL)
        .maybeSingle()

      if (duplicateUserError) {
        throw duplicateUserError
      }

      userId = duplicateUser?.id
    } else {
      userId = authData.user?.id
      if (!userId) {
        throw new Error('Unable to create system admin user')
      }

      const { error: insertUsersError } = await supabaseAdmin.from('users').insert([
        {
          id: userId,
          email: SYSTEM_ADMIN_EMAIL,
          full_name: SYSTEM_ADMIN_FULL_NAME,
          role: SYSTEM_ADMIN_ROLE,
          work_area: SYSTEM_ADMIN_WORK_AREA,
          phone: null,
          active: true,
        },
      ])

      if (insertUsersError) {
        await supabaseAdmin.auth.admin.deleteUser(userId)
        throw insertUsersError
      }
    }
  }

  if (!userId) {
    throw new Error('Unable to resolve system admin user id')
  }

  const { error: insertProfileError } = await supabaseAdmin.from('profiles').insert([
    {
      user_id: userId,
      username: SYSTEM_ADMIN_USERNAME,
      email: SYSTEM_ADMIN_EMAIL,
      full_name: SYSTEM_ADMIN_FULL_NAME,
      role: SYSTEM_ADMIN_ROLE,
      work_area: SYSTEM_ADMIN_WORK_AREA,
      phone: null,
      active: true,
    },
  ])

  if (insertProfileError) {
    throw insertProfileError
  }

  return userId
}
