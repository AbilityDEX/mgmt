import { NextResponse } from 'next/server'
import { requireAuth, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'

/**
 * GET /api/inspection-executions/drafts
 * Get all incomplete inspections for the current user
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  try {
    const { data: draftsData, error: draftsError } = await supabaseAdmin
      .from('inspection_drafts')
      .select(
        `
        inspection_id,
        last_saved_at,
        progress_percent,
        inspections(
          id,
          machine_id,
          template_name,
          started_at,
          machines(id, name)
        )
      `
      )
      .eq('user_id', auth.userId)
      .order('last_saved_at', { ascending: false })

    if (draftsError) {
      console.error('List drafts error:', draftsError)
      return NextResponse.json({ error: draftsError.message }, { status: 500 })
    }

    const drafts = (draftsData ?? []).map((draft) => {
      const draftAsAny = draft as any
      const inspection = Array.isArray(draftAsAny.inspections) 
        ? draftAsAny.inspections[0] 
        : draftAsAny.inspections
      const machinesData = Array.isArray(inspection?.machines) 
        ? inspection.machines 
        : [inspection?.machines]
      const machine = machinesData?.[0]

      // Count total and remaining questions
      return {
        id: (inspection?.id as string) || '',
        machineId: (inspection?.machine_id as string) || '',
        machineName: (machine?.name as string) || 'Unknown Machine',
        templateName: (inspection?.template_name as string) || 'Unknown Template',
        started: (inspection?.started_at as string) || '',
        lastEdited: (draft.last_saved_at as string) || '',
        progressPercent: Math.round((draft.progress_percent as number) || 0),
        remainingQuestions: 0, // Will be calculated after fetching items
        totalQuestions: 0,
      }
    })

    // For each draft, fetch the item counts
    const enrichedDrafts = await Promise.all(
      drafts.map(async (draft) => {
        if (!draft.id || !supabaseAdmin) return draft

        const { data: itemsData } = await supabaseAdmin
          .from('inspection_items')
          .select('id, completed')
          .eq('inspection_id', draft.id)

        const totalQuestions = itemsData?.length ?? 0
        const completedQuestions = (itemsData ?? []).filter((item) => item.completed).length
        const remainingQuestions = totalQuestions - completedQuestions

        return {
          ...draft,
          totalQuestions,
          remainingQuestions,
        }
      })
    )

    return NextResponse.json({
      drafts: enrichedDrafts,
    })
  } catch (error) {
    console.error('Get drafts error:', error)
    return NextResponse.json({ error: 'Failed to get draft inspections' }, { status: 500 })
  }
}
