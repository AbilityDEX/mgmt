import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'

type EventType =
  | 'failed_start'
  | 'duplicate_start_blocked'
  | 'start_success'
  | 'completion_success'
  | 'cancelled'
  | 'lock_denial'
  | 'generated_cycle'
  | 'overdue_notification_sent'

export async function trackInspectionEvent(input: {
  eventType: EventType
  inspectionId?: string | null
  machineId?: string | null
  scheduleId?: string | null
  userId?: string | null
  details?: Record<string, unknown>
  eventKey?: string | null
}) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const { error } = await supabaseAdmin.from('inspection_engine_events').insert([
    {
      event_type: input.eventType,
      inspection_id: input.inspectionId ?? null,
      machine_id: input.machineId ?? null,
      schedule_id: input.scheduleId ?? null,
      user_id: input.userId ?? null,
      details: input.details ?? {},
      event_key: input.eventKey ?? null,
    },
  ])

  if (error) {
    if ('code' in error && error.code === '23505' && input.eventKey) {
      return
    }
    throw error
  }
}

export async function getInspectionEngineMetrics() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data, error } = await supabaseAdmin
    .from('inspection_engine_events')
    .select('event_type')
    .gte('created_at', todayStart.toISOString())

  if (error) throw error

  const rows = data ?? []
  const count = (eventType: EventType) => rows.filter((row) => row.event_type === eventType).length

  return {
    failedInspectionStarts: count('failed_start'),
    duplicateInspectionAttemptsBlocked: count('duplicate_start_blocked'),
    successfulStarts: count('start_success'),
    successfulCompletions: count('completion_success'),
    cancelledInspections: count('cancelled'),
    lockDenials: count('lock_denial'),
  }
}
