import { NextResponse } from 'next/server'
import { requireAuth, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { autoSaveInspectionProgress } from '@/lib/services/inspectionDrafts'

type RouteContext = {
  params: Promise<{ inspectionId: string }>
}

/**
 * POST /api/inspection-executions/autosave/[inspectionId]
 * Autosave inspection progress (current question, scroll position, etc)
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const { inspectionId } = await context.params

  const body = (await request.json()) as {
    currentQuestionIndex?: number
    scrollPosition?: number
  }

  const currentQuestionIndex = body.currentQuestionIndex ?? 0
  const scrollPosition = body.scrollPosition ?? 0

  const result = await autoSaveInspectionProgress({
    inspectionId,
    currentQuestionIndex,
    scrollPosition,
    userId: auth.userId,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Failed to autosave' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    lastAutoSavedAt: new Date().toISOString(),
  })
}
