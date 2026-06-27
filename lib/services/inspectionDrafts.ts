import { supabaseAdmin } from '@/lib/admin'

/**
 * Autosave inspection progress after answer/note/photo/signature
 */
export async function autoSaveInspectionProgress({
  inspectionId,
  currentQuestionIndex,
  scrollPosition,
  userId,
}: {
  inspectionId: string
  currentQuestionIndex: number
  scrollPosition: number
  userId: string
}): Promise<{ success: boolean; error?: string }> {
  if (!supabaseAdmin) {
    return { success: false, error: 'Server not configured' }
  }

  try {
    const now = new Date().toISOString()

    // Count completed items
    const { data: itemsData } = await supabaseAdmin
      .from('inspection_items')
      .select('id, completed')
      .eq('inspection_id', inspectionId)

    const completedCount = (itemsData ?? []).filter((item) => item.completed).length
    const totalCount = itemsData?.length ?? 1
    const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

    // Update inspection draft state
    const { error: upsertError } = await supabaseAdmin
      .from('inspection_drafts')
      .upsert(
        {
          inspection_id: inspectionId,
          user_id: userId,
          current_question_index: currentQuestionIndex,
          scroll_position: scrollPosition,
          progress_percent: progressPercent,
          last_saved_at: now,
          autosave_enabled: true,
          updated_at: now,
        },
        { onConflict: 'inspection_id, user_id' }
      )

    if (upsertError) {
      console.error('Autosave error:', upsertError)
      return { success: false, error: upsertError.message }
    }

    // Update inspection last_autosaved_at
    await supabaseAdmin
      .from('inspections')
      .update({
        last_autosaved_at: now,
        draft_state: {
          currentQuestionIndex,
          scrollPosition,
          lastAutosaveTime: now,
        },
      })
      .eq('id', inspectionId)

    return { success: true }
  } catch (error) {
    console.error('Autosave error:', error)
    return { success: false, error: 'Failed to autosave' }
  }
}

/**
 * Get draft inspection for recovery
 */
export async function getDraftInspection(inspectionId: string): Promise<{
  inspection: {
    id: string
    machineId: string
    machineName: string
    templateName: string
    status: string
    started: string
    lastEdited: string
    progressPercent: number
    remainingQuestions: number
    totalQuestions: number
  } | null
  error?: string
}> {
  if (!supabaseAdmin) {
    return { inspection: null, error: 'Server not configured' }
  }

  try {
    const { data: draftData, error: draftError } = await supabaseAdmin
      .from('inspection_drafts')
      .select('*')
      .eq('inspection_id', inspectionId)
      .maybeSingle()

    if (draftError) {
      return { inspection: null, error: draftError.message }
    }

    if (!draftData) {
      return { inspection: null }
    }

    const { data: inspectionData, error: inspectionError } = await supabaseAdmin
      .from('inspections')
      .select('id, machine_id, template_name, status, started_at, machines(id, name)')
      .eq('id', inspectionId)
      .maybeSingle()

    if (inspectionError || !inspectionData) {
      return { inspection: null, error: inspectionError?.message ?? 'Inspection not found' }
    }

    const { data: itemsData } = await supabaseAdmin
      .from('inspection_items')
      .select('id, completed')
      .eq('inspection_id', inspectionId)

    const totalQuestions = itemsData?.length ?? 0
    const completedQuestions = (itemsData ?? []).filter((item) => item.completed).length
    const remainingQuestions = totalQuestions - completedQuestions

    const machine = Array.isArray(inspectionData.machines)
      ? inspectionData.machines[0]
      : inspectionData.machines

    return {
      inspection: {
        id: inspectionData.id as string,
        machineId: inspectionData.machine_id as string,
        machineName: (machine?.name as string) || 'Unknown Machine',
        templateName: (inspectionData.template_name as string) || 'Unknown Template',
        status: (inspectionData.status as string) || 'In Progress',
        started: (inspectionData.started_at as string) || '',
        lastEdited: (draftData.last_saved_at as string) || '',
        progressPercent: Math.round((draftData.progress_percent as number) || 0),
        remainingQuestions,
        totalQuestions,
      },
    }
  } catch (error) {
    console.error('Get draft error:', error)
    return { inspection: null, error: 'Failed to get draft' }
  }
}

/**
 * Resume draft inspection - returns to exact position
 */
export async function resumeDraftInspection(inspectionId: string): Promise<{
  inspection: {
    currentQuestionIndex: number
    scrollPosition: number
    progressPercent: number
  } | null
  error?: string
}> {
  if (!supabaseAdmin) {
    return { inspection: null, error: 'Server not configured' }
  }

  try {
    const { data: draftData, error: draftError } = await supabaseAdmin
      .from('inspection_drafts')
      .select('current_question_index, scroll_position, progress_percent')
      .eq('inspection_id', inspectionId)
      .maybeSingle()

    if (draftError) {
      return { inspection: null, error: draftError.message }
    }

    if (!draftData) {
      return { inspection: null }
    }

    return {
      inspection: {
        currentQuestionIndex: draftData.current_question_index as number,
        scrollPosition: draftData.scroll_position as number,
        progressPercent: draftData.progress_percent as number,
      },
    }
  } catch (error) {
    console.error('Resume draft error:', error)
    return { inspection: null, error: 'Failed to resume draft' }
  }
}

/**
 * List all draft inspections for a user
 */
export async function listDraftInspections(userId: string): Promise<
  Array<{
    id: string
    machineId: string
    machineName: string
    templateName: string
    started: string
    lastEdited: string
    progressPercent: number
    remainingQuestions: number
    totalQuestions: number
  }>
> {
  if (!supabaseAdmin) {
    return []
  }

  try {
    const { data: draftsData, error: draftsError } = await supabaseAdmin
      .from('inspection_drafts')
      .select(`
        inspection_id,
        last_saved_at,
        progress_percent,
        inspections(
          id,
          machine_id,
          template_name,
          started_at,
          machines(name)
        )
      `)
      .eq('user_id', userId)
      .eq('inspections.status', 'In Progress')
      .order('last_saved_at', { ascending: false })

    if (draftsError) {
      console.error('List drafts error:', draftsError)
      return []
    }

    const result = (draftsData ?? []).map((draft) => {
      const draftAsAny = draft as any
      const inspection = Array.isArray(draftAsAny.inspections)
        ? draftAsAny.inspections[0]
        : draftAsAny.inspections
      const machines = Array.isArray(inspection?.machines)
        ? inspection.machines
        : [inspection?.machines]
      const machine = machines?.[0]

      return {
        id: (inspection?.id as string) || '',
        machineId: (inspection?.machine_id as string) || '',
        machineName: (machine?.name as string) || 'Unknown Machine',
        templateName: (inspection?.template_name as string) || 'Unknown Template',
        started: (inspection?.started_at as string) || '',
        lastEdited: (draft.last_saved_at as string) || '',
        progressPercent: (draft.progress_percent as number) || 0,
        remainingQuestions: 0, // Will be calculated in UI if needed
        totalQuestions: 0,
      }
    })

    return result
  } catch (error) {
    console.error('List drafts error:', error)
    return []
  }
}

/**
 * Delete draft when inspection is completed
 */
export async function deleteDraft(inspectionId: string): Promise<{ success: boolean; error?: string }> {
  if (!supabaseAdmin) {
    return { success: false, error: 'Server not configured' }
  }

  try {
    const { error } = await supabaseAdmin
      .from('inspection_drafts')
      .delete()
      .eq('inspection_id', inspectionId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Delete draft error:', error)
    return { success: false, error: 'Failed to delete draft' }
  }
}
