import { serverConfigErrorMessage, supabaseAdmin, type AuthenticatedUser } from '@/lib/admin'

type MachineAssignmentRow = {
  id: string
  assigned_user: string | null
}

type InspectionAssignmentRow = {
  id: string
  machine_id: string
  machines: MachineAssignmentRow | MachineAssignmentRow[] | null
}

export function userCanAccessAssignedMachine(user: AuthenticatedUser, assignedUsername: string | null | undefined) {
  if (user.isAdmin) return true
  const normalizedAssignedUsername = assignedUsername?.trim() ?? ''
  const normalizedCurrentUsername = user.username?.trim() ?? ''
  return Boolean(normalizedAssignedUsername && normalizedCurrentUsername && normalizedAssignedUsername === normalizedCurrentUsername)
}

export async function getAssignedUsernameForUserId(userId: string) {
  if (!supabaseAdmin || !userId) return ''

  const { data } = await supabaseAdmin
    .from('profiles')
    .select('username')
    .eq('user_id', userId)
    .maybeSingle()

  return (data?.username as string | undefined) ?? ''
}

export async function canAccessMachine(user: AuthenticatedUser, machineId: string) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const { data, error } = await supabaseAdmin
    .from('machines')
    .select('id, assigned_user')
    .eq('id', machineId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return { allowed: false as const, reason: 'not_found' as const, assignedUser: null as string | null }
  }

  return {
    allowed: userCanAccessAssignedMachine(user, data.assigned_user as string | null),
    reason: 'ok' as const,
    assignedUser: (data.assigned_user as string | null | undefined) ?? null,
  }
}

export async function canAccessInspection(user: AuthenticatedUser, inspectionId: string) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const { data, error } = await supabaseAdmin
    .from('inspections')
    .select('id, machine_id, machines(id, assigned_user)')
    .eq('id', inspectionId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return {
      allowed: false as const,
      reason: 'not_found' as const,
      machineId: null as string | null,
      assignedUser: null as string | null,
    }
  }

  const inspection = data as unknown as InspectionAssignmentRow
  const machine = Array.isArray(inspection.machines) ? (inspection.machines[0] ?? null) : inspection.machines

  return {
    allowed: userCanAccessAssignedMachine(user, machine?.assigned_user ?? null),
    reason: 'ok' as const,
    machineId: inspection.machine_id,
    assignedUser: machine?.assigned_user ?? null,
  }
}