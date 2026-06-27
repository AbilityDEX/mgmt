import { supabaseAdmin } from '@/lib/admin'

export type NotificationChannel = 'email' | 'push' | 'in_app'

export type NotificationIntent = {
  type: 'defect_created' | 'defect_status_changed'
  defectId: string
  machineId: string
  recipientUserId?: string | null
  metadata?: Record<string, string>
}

function buildNotificationMessage(intent: NotificationIntent) {
  if (intent.type === 'defect_created') {
    return 'A new defect has been created.'
  }

  return 'A defect status has changed.'
}

// Extension point: integrate outbound email and push workers here.
export async function queueNotification(intent: NotificationIntent) {
  if (!supabaseAdmin) return

  if (!intent.recipientUserId) {
    return
  }

  await supabaseAdmin.from('notifications').insert([
    {
      user_id: intent.recipientUserId,
      title: 'Defect Notification',
      message: buildNotificationMessage(intent),
      type: intent.type,
      read: false,
    },
  ])
}

export async function queueDefectCreatedNotification(params: {
  defectId: string
  machineId: string
  recipientUserId?: string | null
}) {
  await queueNotification({
    type: 'defect_created',
    defectId: params.defectId,
    machineId: params.machineId,
    recipientUserId: params.recipientUserId ?? null,
  })
}

export async function queueDefectStatusChangedNotification(params: {
  defectId: string
  machineId: string
  recipientUserId?: string | null
  nextStatus: string
}) {
  await queueNotification({
    type: 'defect_status_changed',
    defectId: params.defectId,
    machineId: params.machineId,
    recipientUserId: params.recipientUserId ?? null,
    metadata: { nextStatus: params.nextStatus },
  })
}
