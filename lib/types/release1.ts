export type ScheduleFrequency =
  | 'Daily'
  | 'Weekly'
  | 'Fortnightly'
  | 'Monthly'
  | 'Quarterly'
  | 'Six Monthly'
  | 'Annually'
  | 'Custom'

export type ScheduleTrafficStatus = 'On Time' | 'Due Soon' | 'Overdue' | 'Paused'

export type EmailRecipientType = 'to' | 'cc' | 'bcc'

export type EmailDeliveryScope =
  | 'all_inspections'
  | 'passed_inspections'
  | 'failed_inspections'
  | 'failed_only'
  | 'defects_only'

export type ArchiveStatus = 'pending' | 'archived' | 'failed'

export type ArchiveDeliveryLogStatus = 'success' | 'failed' | 'retrying' | 'skipped'

export type CompanySettings = {
  id: string
  companyName: string
  logoUrl: string | null
  address: string | null
  telephone: string | null
  email: string | null
  website: string | null
  reportFooter: string | null
  reportPrimaryColor: string
  reportAccentColor: string
}

export type EmailDistributionRecipient = {
  id: string
  name: string
  email: string
  recipientType: EmailRecipientType
  enabled: boolean
  deliveryScope: EmailDeliveryScope
  departmentFilter: string | null
  machineFilter: string | null
  createdAt: string
  updatedAt: string
}

export type EmailTemplate = {
  id: string
  name: string
  subject: string
  body: string
  signature: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export type RetentionSettings = {
  id: string
  retentionDays: number
  useCustom: boolean
  customDays: number | null
  maxDeliveryRetries: number
  createdAt: string
  updatedAt: string
}

export type ArchiveDeliveryLog = {
  id: string
  inspectionId: string
  archiveId: string | null
  pdfGenerated: boolean
  emailSent: boolean
  archived: boolean
  recipientSnapshot: Array<{ type: EmailRecipientType; email: string; name: string }>
  status: ArchiveDeliveryLogStatus
  failureReason: string | null
  retryCount: number
  createdAt: string
}
