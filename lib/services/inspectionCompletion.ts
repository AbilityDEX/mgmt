import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { archiveInspectionAndSendEmail } from '@/lib/services/archivePipeline'
import { trackInspectionEvent } from '@/lib/services/inspectionMetrics'
import { advanceScheduleFromCompletedInspection } from '@/lib/services/inspectionScheduling'

type CompletionStage =
  | 'load-inspection'
  | 'persist-answers'
  | 'create-checklist'
  | 'mark-completed'
  | 'advance-schedule'
  | 'archive-and-email'
  | 'update-machine'
  | 'rollback'

type InspectionItemRow = {
  id: string
  display_order: number
  question: string
  required: boolean
  answer: string | null
  comments: string | null
  completed: boolean
  description?: string | null
}

type InspectionSnapshot = {
  status: string
  completed_at: string | null
  checklist: unknown[]
  archive_status: string
  archive_last_error: string | null
  archive_retry_count: number
  archived_reference: string | null
  archived_at: string | null
  is_overdue: boolean
}

type ScheduleSnapshot = {
  id: string
  next_due: string
  last_generated: string | null
}

type MachineSnapshot = {
  id: string
  status: string
  last_inspection: string | null
}

type ArchiveArtifacts = {
  archiveIds: Set<string>
  deliveryLogIds: Set<string>
  archiveJobIds: Set<string>
  emailHistoryIds: Set<string>
}

function logCompletionStage(stage: CompletionStage, details: Record<string, unknown>) {
  console.info('[inspection-completion]', { stage, ...details })
}

function normalizeAnswer(answer: string | null | undefined) {
  const normalized = answer?.trim() ?? ''
  return normalized || null
}

function normalizeComments(comments: string | null | undefined) {
  const normalized = comments?.trim() ?? ''
  return normalized || null
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

export class InspectionCompletionError extends Error {
  stage: CompletionStage
  status: number
  details?: Record<string, unknown>

  constructor(stage: CompletionStage, message: string, status = 500, details?: Record<string, unknown>) {
    super(message)
    this.name = 'InspectionCompletionError'
    this.stage = stage
    this.status = status
    this.details = details
  }
}

async function readArchiveArtifacts(inspectionId: string): Promise<ArchiveArtifacts> {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const [archivesResult, logsResult, jobsResult, historyResult] = await Promise.all([
    supabaseAdmin.from('inspection_archives').select('id').eq('inspection_id', inspectionId),
    supabaseAdmin.from('archive_delivery_logs').select('id').eq('inspection_id', inspectionId),
    supabaseAdmin.from('archive_jobs').select('id').eq('inspection_id', inspectionId),
    supabaseAdmin.from('inspection_email_history').select('id').eq('inspection_id', inspectionId),
  ])

  if (archivesResult.error) throw archivesResult.error
  if (logsResult.error) throw logsResult.error
  if (jobsResult.error) throw jobsResult.error
  if (historyResult.error) throw historyResult.error

  return {
    archiveIds: new Set((archivesResult.data ?? []).map((row) => row.id as string)),
    deliveryLogIds: new Set((logsResult.data ?? []).map((row) => row.id as string)),
    archiveJobIds: new Set((jobsResult.data ?? []).map((row) => row.id as string)),
    emailHistoryIds: new Set((historyResult.data ?? []).map((row) => row.id as string)),
  }
}

function idsToDelete(before: Set<string>, after: Set<string>) {
  return Array.from(after).filter((id) => !before.has(id))
}

async function rollbackArchiveArtifacts(inspectionId: string, before: ArchiveArtifacts) {
  if (!supabaseAdmin) {
    throw new Error(serverConfigErrorMessage)
  }

  const after = await readArchiveArtifacts(inspectionId)

  const archiveJobIds = idsToDelete(before.archiveJobIds, after.archiveJobIds)
  const deliveryLogIds = idsToDelete(before.deliveryLogIds, after.deliveryLogIds)
  const emailHistoryIds = idsToDelete(before.emailHistoryIds, after.emailHistoryIds)
  const archiveIds = idsToDelete(before.archiveIds, after.archiveIds)

  if (archiveJobIds.length > 0) {
    const { error } = await supabaseAdmin.from('archive_jobs').delete().in('id', archiveJobIds)
    if (error) throw error
  }

  if (deliveryLogIds.length > 0) {
    const { error } = await supabaseAdmin.from('archive_delivery_logs').delete().in('id', deliveryLogIds)
    if (error) throw error
  }

  if (emailHistoryIds.length > 0) {
    const { error } = await supabaseAdmin.from('inspection_email_history').delete().in('id', emailHistoryIds)
    if (error) throw error
  }

  if (archiveIds.length > 0) {
    const { error } = await supabaseAdmin.from('inspection_archives').delete().in('id', archiveIds)
    if (error) throw error
  }
}

export async function completeInspectionWorkflow(params: { inspectionId: string; userId: string }) {
  if (!supabaseAdmin) {
    throw new InspectionCompletionError('load-inspection', serverConfigErrorMessage, 500)
  }

  const completedAt = new Date().toISOString()
  let stage: CompletionStage = 'load-inspection'
  const rollbackErrors: string[] = []

  let inspectionSnapshot: InspectionSnapshot | null = null
  let scheduleSnapshot: ScheduleSnapshot | null = null
  let machineSnapshot: MachineSnapshot | null = null
  let archiveArtifactsBefore: ArchiveArtifacts | null = null
  let scheduleAdvanced = false
  let machineUpdated = false

  try {
    logCompletionStage(stage, { inspectionId: params.inspectionId })
    const { data: inspectionData, error: inspectionError } = await supabaseAdmin
      .from('inspections')
      .select(
        'id, machine_id, schedule_id, status, completed_at, checklist, archive_status, archive_last_error, archive_retry_count, archived_reference, archived_at, is_overdue'
      )
      .eq('id', params.inspectionId)
      .maybeSingle()

    if (inspectionError) {
      throw new InspectionCompletionError(stage, inspectionError.message, 500)
    }

    if (!inspectionData) {
      throw new InspectionCompletionError(stage, 'Inspection not found.', 404)
    }

    const currentStatus = inspectionData.status as string
    if (currentStatus !== 'In Progress') {
      throw new InspectionCompletionError(stage, 'This inspection is read-only.', 409)
    }

    inspectionSnapshot = {
      status: currentStatus,
      completed_at: (inspectionData.completed_at as string | null) ?? null,
      checklist: Array.isArray(inspectionData.checklist) ? (inspectionData.checklist as unknown[]) : [],
      archive_status: (inspectionData.archive_status as string) ?? 'pending',
      archive_last_error: (inspectionData.archive_last_error as string | null) ?? null,
      archive_retry_count: Number(inspectionData.archive_retry_count ?? 0),
      archived_reference: (inspectionData.archived_reference as string | null) ?? null,
      archived_at: (inspectionData.archived_at as string | null) ?? null,
      is_overdue: Boolean(inspectionData.is_overdue),
    }

    const { data: machineData, error: machineError } = await supabaseAdmin
      .from('machines')
      .select('id, status, last_inspection')
      .eq('id', inspectionData.machine_id as string)
      .maybeSingle()

    if (machineError) {
      throw new InspectionCompletionError(stage, machineError.message, 500)
    }

    if (!machineData) {
      throw new InspectionCompletionError(stage, 'Machine not found for this inspection.', 404)
    }

    machineSnapshot = {
      id: machineData.id as string,
      status: (machineData.status as string) ?? 'Not Started',
      last_inspection: (machineData.last_inspection as string | null) ?? null,
    }

    if (inspectionData.schedule_id) {
      const { data: scheduleData, error: scheduleError } = await supabaseAdmin
        .from('inspection_schedules')
        .select('id, next_due, last_generated')
        .eq('id', inspectionData.schedule_id as string)
        .maybeSingle()

      if (scheduleError) {
        throw new InspectionCompletionError(stage, scheduleError.message, 500)
      }

      if (!scheduleData) {
        throw new InspectionCompletionError(stage, 'Schedule not found for this inspection.', 500)
      }

      scheduleSnapshot = {
        id: scheduleData.id as string,
        next_due: scheduleData.next_due as string,
        last_generated: (scheduleData.last_generated as string | null) ?? null,
      }
    }

    archiveArtifactsBefore = await readArchiveArtifacts(params.inspectionId)

    stage = 'persist-answers'
    logCompletionStage(stage, { inspectionId: params.inspectionId })
    const { data: itemsData, error: itemsError } = await supabaseAdmin
      .from('inspection_items')
      .select('id, display_order, question, description, required, answer, comments, completed')
      .eq('inspection_id', params.inspectionId)
      .order('display_order', { ascending: true })

    if (itemsError) {
      throw new InspectionCompletionError(stage, itemsError.message, 500)
    }

    const items = (itemsData ?? []) as InspectionItemRow[]

    if (items.length === 0) {
      throw new InspectionCompletionError(
        stage,
        'Inspection cannot be completed because no inspection_items exist for this inspection.',
        500
      )
    }

    for (const item of items) {
      const answer = normalizeAnswer(item.answer)
      const comments = normalizeComments(item.comments)
      const completed = Boolean(answer)

      if (item.answer !== answer || item.comments !== comments || Boolean(item.completed) !== completed) {
        const { error: updateItemError } = await supabaseAdmin
          .from('inspection_items')
          .update({ answer, comments, completed })
          .eq('id', item.id)
          .eq('inspection_id', params.inspectionId)

        if (updateItemError) {
          throw new InspectionCompletionError(stage, updateItemError.message, 500)
        }
      }
    }

    const { data: persistedItemsData, error: persistedItemsError } = await supabaseAdmin
      .from('inspection_items')
      .select('id, original_template_item_id, display_order, question, description, required, answer, comments')
      .eq('inspection_id', params.inspectionId)
      .order('display_order', { ascending: true })

    if (persistedItemsError) {
      throw new InspectionCompletionError(stage, persistedItemsError.message, 500)
    }

    const persistedItems = (persistedItemsData ?? []) as Array<{
      id: string
      display_order: number
      question: string
      description?: string | null
      required: boolean
      answer: string | null
      comments: string | null
        original_template_item_id?: string | null
    }>
      // Check for missing required answers
      const incompleteRequired = persistedItems.filter((item) => {
        if (!item.required) return false
        return !normalizeAnswer(item.answer)
      })

      if (incompleteRequired.length > 0) {
        throw new InspectionCompletionError(
          stage,
          'Please complete all required inspection items before finishing.',
          400,
          {
            incompleteItems: incompleteRequired.map((item) => ({ id: item.id, question: item.question })),
          }
        )
      }

      // Fetch template-level behaviour flags for items that require comment on fail
      const templateIds = Array.from(new Set(persistedItems.map((i) => i.original_template_item_id).filter(Boolean)))
      let behaviourByTemplateId = new Map<string, any>()
      if (templateIds.length > 0) {
          const { data: templateFlagsData, error: templateFlagsError } = await supabaseAdmin
            .from('checklist_template_items')
            .select('id, fail_require_comment, fail_require_photos')
            .in('id', templateIds)

        if (!templateFlagsError && templateFlagsData) {
          behaviourByTemplateId = new Map((templateFlagsData as any[]).map((t) => [t.id, t]))
        }
      }

      // Validate fail-require-comment
      const missingCommentsForFails = persistedItems.filter((item) => {
        const answer = normalizeAnswer(item.answer)
        if (answer !== 'fail') return false
        const flags = behaviourByTemplateId.get(item.original_template_item_id)
        if (!flags?.fail_require_comment) return false
        return !normalizeComments(item.comments)
      })

      if (missingCommentsForFails.length > 0) {
        throw new InspectionCompletionError(
          stage,
          'Some failed items require comments before finishing.',
          400,
          {
            incompleteItems: missingCommentsForFails.map((item) => ({ id: item.id, question: item.question })),
          }
        )
      }

      // Validate fail-require-photos
      const itemsRequiringPhotos = persistedItems.filter((item) => {
        const answer = normalizeAnswer(item.answer)
        if (answer !== 'fail') return false
        const flags = behaviourByTemplateId.get(item.original_template_item_id)
        return Boolean(flags?.fail_require_photos)
      })

      if (itemsRequiringPhotos.length > 0) {
        const itemIds = itemsRequiringPhotos.map((i) => i.id)
        const { data: photosData, error: photosError } = await supabaseAdmin
          .from('photo_uploads')
          .select('id, inspection_item_id')
          .in('inspection_item_id', itemIds)

        if (photosError) {
          throw new InspectionCompletionError(stage, photosError.message, 500)
        }

        const countByItem: Record<string, number> = {}
        ;(photosData ?? []).forEach((p: any) => {
          const iid = p.inspection_item_id as string
          countByItem[iid] = (countByItem[iid] ?? 0) + 1
        })

        const missingPhotos = itemsRequiringPhotos.filter((item) => (countByItem[item.id] ?? 0) === 0)

        if (missingPhotos.length > 0) {
          throw new InspectionCompletionError(
            stage,
            'Some failed items require photos before finishing.',
            400,
            {
              incompleteItems: missingPhotos.map((item) => ({ id: item.id, question: item.question })),
            }
          )
        }
      }

    stage = 'create-checklist'
    logCompletionStage(stage, { inspectionId: params.inspectionId, itemCount: persistedItems.length })
    const checklist = persistedItems.map((item) => {
      const answer = normalizeAnswer(item.answer)
      return {
        id: item.id,
        label: item.question,
        description: (item.description as string | null) ?? null,
        status: answer === 'fail' ? 'fail' : 'pass',
        faultDescription: answer === 'fail' ? (item.comments ?? '') : undefined,
      }
    })

    stage = 'mark-completed'
    logCompletionStage(stage, { inspectionId: params.inspectionId, completedAt })
    const { data: completedInspection, error: completeError } = await supabaseAdmin
      .from('inspections')
      .update({
        status: 'Completed',
        completed_at: completedAt,
        is_overdue: false,
        archive_status: 'pending',
        archive_last_error: null,
        checklist,
      })
      .eq('id', params.inspectionId)
      .select('id, status, completed_at, checklist')
      .maybeSingle()

    if (completeError) {
      throw new InspectionCompletionError(stage, completeError.message, 500)
    }

    if (!completedInspection || (completedInspection.status as string) !== 'Completed' || !(completedInspection.completed_at as string | null)) {
      throw new InspectionCompletionError(stage, 'Inspection completion verification failed: status/completed_at not persisted.', 500)
    }

    stage = 'advance-schedule'
    logCompletionStage(stage, { inspectionId: params.inspectionId, scheduleId: (inspectionData.schedule_id as string | null) ?? null })
    const scheduleAdvanceResult = await advanceScheduleFromCompletedInspection({
      scheduleId: (inspectionData.schedule_id as string | null) ?? null,
      completedAt: new Date(completedAt),
    })

    if (inspectionData.schedule_id && !scheduleAdvanceResult.advanced) {
      throw new InspectionCompletionError(
        stage,
        `Schedule advancement failed: ${String((scheduleAdvanceResult as { reason?: string }).reason ?? 'unknown')}`,
        500,
        { scheduleAdvanceResult }
      )
    }

    scheduleAdvanced = Boolean(scheduleAdvanceResult.advanced)

    stage = 'archive-and-email'
    logCompletionStage(stage, { inspectionId: params.inspectionId })
    const archiveResult = await archiveInspectionAndSendEmail({
      inspectionId: params.inspectionId,
      triggeredBy: params.userId,
      requireEmailDelivery: true,
    })

    if (!archiveResult || !archiveResult.archiveId || archiveResult.emailSent !== true) {
      throw new InspectionCompletionError(stage, 'Archive pipeline did not confirm PDF archive + email delivery.', 500)
    }

    stage = 'update-machine'
    logCompletionStage(stage, { inspectionId: params.inspectionId, machineId: inspectionData.machine_id as string })
    const { error: machineUpdateError } = await supabaseAdmin
      .from('machines')
      .update({
        status: 'Completed',
        last_inspection: completedAt,
      })
      .eq('id', inspectionData.machine_id as string)

    if (machineUpdateError) {
      throw new InspectionCompletionError(stage, machineUpdateError.message, 500)
    }

    machineUpdated = true

    logCompletionStage('update-machine', {
      inspectionId: params.inspectionId,
      machineId: inspectionData.machine_id as string,
      status: 'Completed',
      lastInspection: completedAt,
    })

    await trackInspectionEvent({
      eventType: 'completion_success',
      inspectionId: params.inspectionId,
      machineId: inspectionData.machine_id as string,
      scheduleId: (inspectionData.schedule_id as string | null) ?? null,
      userId: params.userId,
      details: {
        completedAt,
        scheduleAdvanced: Boolean(scheduleAdvanceResult.advanced),
        archiveStatus: 'archived',
      },
    }).catch(() => undefined)

    return {
      inspectionId: params.inspectionId,
      status: 'Completed' as const,
      completedAt,
      scheduleAdvanceResult,
      archiveStatus: 'archived' as const,
      machineUpdated: true,
    }
  } catch (rawError) {
    const baseMessage = errorMessage(rawError)
    logCompletionStage('rollback', {
      inspectionId: params.inspectionId,
      failedStage: stage,
      error: baseMessage,
    })

    stage = 'rollback'

    if (machineUpdated && machineSnapshot) {
      const { error } = await supabaseAdmin
        .from('machines')
        .update({ status: machineSnapshot.status, last_inspection: machineSnapshot.last_inspection })
        .eq('id', machineSnapshot.id)
      if (error) rollbackErrors.push(`machine-rollback: ${error.message}`)
    }

    if (scheduleAdvanced && scheduleSnapshot) {
      const { error } = await supabaseAdmin
        .from('inspection_schedules')
        .update({ next_due: scheduleSnapshot.next_due, last_generated: scheduleSnapshot.last_generated })
        .eq('id', scheduleSnapshot.id)
      if (error) rollbackErrors.push(`schedule-rollback: ${error.message}`)
    }

    if (archiveArtifactsBefore) {
      try {
        await rollbackArchiveArtifacts(params.inspectionId, archiveArtifactsBefore)
      } catch (rollbackArchiveError) {
        rollbackErrors.push(`archive-rollback: ${errorMessage(rollbackArchiveError)}`)
      }
    }

    if (inspectionSnapshot) {
      const { error } = await supabaseAdmin
        .from('inspections')
        .update({
          status: inspectionSnapshot.status,
          completed_at: inspectionSnapshot.completed_at,
          checklist: inspectionSnapshot.checklist,
          archive_status: inspectionSnapshot.archive_status,
          archive_last_error: inspectionSnapshot.archive_last_error,
          archive_retry_count: inspectionSnapshot.archive_retry_count,
          archived_reference: inspectionSnapshot.archived_reference,
          archived_at: inspectionSnapshot.archived_at,
          is_overdue: inspectionSnapshot.is_overdue,
        })
        .eq('id', params.inspectionId)
      if (error) rollbackErrors.push(`inspection-rollback: ${error.message}`)
    }

    const wrapped = rawError instanceof InspectionCompletionError
      ? rawError
      : new InspectionCompletionError('rollback', baseMessage, 500)

    throw new InspectionCompletionError(
      wrapped.stage,
      wrapped.message,
      wrapped.status,
      {
        ...(wrapped.details ?? {}),
        rootCause: baseMessage,
        rollbackErrors,
      }
    )
  }
}
