export function buildInspectionGenerationKey(scheduleId: string, dueAt: string | Date) {
  const dueAtIso = typeof dueAt === 'string' ? new Date(dueAt).toISOString() : dueAt.toISOString()
  return `inspection-cycle:${scheduleId}:${dueAtIso}`
}

export function buildReminderEventKey(inspectionId: string, recipientEmail: string, dueDateKey: string) {
  return `reminder:${inspectionId}:${recipientEmail.toLowerCase()}:${dueDateKey}`
}

export function buildArchiveJobKey(inspectionId: string, suffix: string) {
  return `archive-job:${inspectionId}:${suffix}`
}

export function buildArchiveDeliveryLogKey(inspectionId: string, suffix: string) {
  return `archive-log:${inspectionId}:${suffix}`
}

export function buildInspectionEventKey(scope: string, scheduleId: string, dueAt: string | Date) {
  const dueAtIso = typeof dueAt === 'string' ? new Date(dueAt).toISOString() : dueAt.toISOString()
  return `${scope}:${scheduleId}:${dueAtIso}`
}