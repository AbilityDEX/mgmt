// Complete TypeScript types for the inspection execution system

export type QuestionType = 
  | 'pass_fail' 
  | 'yes_no' 
  | 'text' 
  | 'number' 
  | 'decimal' 
  | 'long_notes'
  | 'multiple_choice' 
  | 'dropdown' 
  | 'photo' 
  | 'signature'

export type ValidationRule = {
  min?: number
  max?: number
  pattern?: string
  step?: number
  allowDecimals?: boolean
  minLength?: number
  maxLength?: number
  required?: boolean
}

export type ChoiceOption = {
  label: string
  value: string
}

export type PhotoData = {
  id: string
  url: string
  timestamp: string
  caption?: string
}

export type SignatureData = {
  data: string // Base64 encoded
  timestamp: string
}

export type InspectionItem = {
  id: string
  displayOrder: number
  question: string
  questionType: QuestionType
  required: boolean
  helpText?: string
  placeholderText?: string
  defaultValue?: string
  validationRules?: ValidationRule
  options?: ChoiceOption[] // For multiple_choice, dropdown
  expectedAnswer?: string
  photoRequired: boolean
  signatureRequired: boolean
  // Behaviour flags from the template
  failRequireComment?: boolean
  failAllowPhotos?: boolean
  failRequirePhotos?: boolean
  passAllowPhotos?: boolean
  photoMaxCount?: number
  
  // Runtime state
  answer: string | null
  comments: string | null
  completed: boolean
  photos?: PhotoData[]
  signature?: SignatureData
  defectId?: string | null
  autoSavedAt?: string | null
}

export type InspectionDraft = {
  id: string
  inspectionId: string
  userId: string
  currentQuestionIndex: number
  scrollPosition: number
  progressPercent: number
  lastSavedAt: string
  autoSaveEnabled: boolean
}

export type DraftState = {
  currentQuestionIndex: number
  scrollPosition: number
  lastAutosaveTime?: string
}

export type ValidationResult = {
  valid: boolean
  errors: Array<{
    itemId: string
    question: string
    message: string
  }>
}

export type InspectionStatus = 'In Progress' | 'Completed' | 'Cancelled' | 'Draft'

export type Inspection = {
  id: string
  machineId: string
  machineName: string
  machineArea?: string
  templateId: string | null
  templateName: string
  templateVersion: number
  status: InspectionStatus
  startedBy: string | null
  startedAt: string | null
  completedAt: string | null
  items: InspectionItem[]
  draftState?: DraftState
  autoSaveEnabled: boolean
  lastAutoSavedAt?: string | null
}

export type InspectionHistory = {
  id: string
  machineId: string
  machineName: string
  templateName: string
  inspector: string
  status: InspectionStatus
  result: 'PASS' | 'FAIL' | 'INCOMPLETE'
  passCount?: number
  failCount?: number
  failedItemCount: number
  defectCount: number
  isOverdue: boolean
  dueAt: string | null
  startedAt: string | null
  completedAt: string | null
  duration?: string // Human readable, e.g. "23 minutes"
}

export type DraftInspection = {
  id: string
  machineId: string
  machineName: string
  templateName: string
  started: string
  lastEdited: string
  progressPercent: number
  remainingQuestions: number
  totalQuestions: number
}

export type PhotoUpload = {
  id: string
  itemId: string
  storagePath: string
  caption?: string
  uploadedBy: string
  uploadedAt: string
}
