import { NextResponse } from 'next/server'
import { requireAuthContext, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { canAccessInspection } from '@/lib/services/inspectionAccess'
import { autoSaveInspectionProgress } from '@/lib/services/inspectionDrafts'

type RouteContext = {
  params: Promise<{ inspectionId: string }>
}

/**
 * POST /api/inspection-executions/autosave/[inspectionId]
 * Autosave inspection progress (current question, scroll position, etc)
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAuthContext(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const { inspectionId } = await context.params

  if (!auth.isAdmin) {
    const access = await canAccessInspection(auth, inspectionId)
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason === 'not_found' ? 'Inspection not found.' : 'Forbidden' }, { status: access.reason === 'not_found' ? 404 : 403 })
    }
  }

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
