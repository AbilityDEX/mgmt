export type MachineStatus = 'Not Started' | 'Completed' | 'Overdue' | 'In Progress'

export type InspectionFrequency = 'Daily' | 'Weekly' | 'Fortnightly' | 'Monthly' | 'Quarterly' | 'Six Monthly' | 'Annually' | 'Custom'

export interface Machine {
  id: string
  name: string
  area: string
  assetId?: string
  templateId?: string | null
  templateName?: string | null
  assignedUserId: string
  assignedUser: string
  status: MachineStatus
  inspectionDeadline: string
  reminderDaysBeforeDue?: number
  gracePeriod?: number
  autoGenerateInspection?: boolean
}

export interface MachineTemplate {
  id: string
  machineId: string
  templateId: string
  templateName: string
  inspectionFrequency: InspectionFrequency
  intervalValue?: number
  customIntervalUnit?: 'Days' | 'Weeks' | 'Months'
  active: boolean
}
