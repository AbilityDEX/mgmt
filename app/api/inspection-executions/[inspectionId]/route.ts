import { NextResponse } from 'next/server'
import { requireAuth, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { ensureDefectForFailedInspectionItem } from '@/lib/services/defects'
import { archiveInspectionAndSendEmail } from '@/lib/services/archivePipeline'
import { advanceScheduleFromCompletedInspection } from '@/lib/services/inspectionScheduling'

type RouteContext = {
  params: Promise<{ inspectionId: string }>
}

type InspectionItemRow = {
  id: string
  display_order: number
  question: string
  question_type: string
  required: boolean
  answer: string | null
  comments: string | null
  completed: boolean
}

type DefectRow = {
  id: string
  inspection_item_id: string
}

function normalizeAnswer(answer: string | null | undefined) {
  const normalized = answer?.trim() ?? ''
  return normalized || null
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const { inspectionId } = await context.params

  // VALIDATION: Reject undefined inspection IDs
  if (!inspectionId || inspectionId === 'undefined' || inspectionId === '') {
    return NextResponse.json({ error: `Invalid inspection ID: ${JSON.stringify(inspectionId)}` }, { status: 400 })
  }

  const { data: inspectionData, error: inspectionError } = await supabaseAdmin
    .from('inspections')
    .select('id, machine_id, template_id, template_name, template_version, status, started_by, started_at, completed_at')
    .eq('id', inspectionId)
    .maybeSingle()

  if (inspectionError) {
    return NextResponse.json({ error: inspectionError.message }, { status: 500 })
  }

  if (!inspectionData) {
    return NextResponse.json({ error: 'Inspection not found.' }, { status: 404 })
  }

  const { data: machineData, error: machineError } = await supabaseAdmin
    .from('machines')
    .select('id, name, area')
    .eq('id', inspectionData.machine_id)
    .maybeSingle()

  if (machineError) {
    return NextResponse.json({ error: machineError.message }, { status: 500 })
  }

  const { data: itemsData, error: itemsError } = await supabaseAdmin
    .from('inspection_items')
    .select('id, display_order, question, question_type, required, answer, comments, completed')
    .eq('inspection_id', inspectionId)
    .order('display_order', { ascending: true })

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  const itemIds = ((itemsData ?? []) as InspectionItemRow[]).map((item) => item.id)
  let defectByItemId = new Map<string, string>()

  if (itemIds.length > 0) {
    const { data: defectRows } = await supabaseAdmin
      .from('defects')
      .select('id, inspection_item_id')
      .in('inspection_item_id', itemIds)

    defectByItemId = new Map(
      ((defectRows ?? []) as DefectRow[]).map((defect) => [defect.inspection_item_id, defect.id])
    )
  }

  return NextResponse.json({
    inspection: {
      id: inspectionData.id as string,
      machineId: inspectionData.machine_id as string,
      machineName: (machineData?.name as string) || 'Unknown Machine',
      templateId: inspectionData.template_id as string | null,
      templateName: (inspectionData.template_name as string | null) ?? 'Legacy Inspection',
      templateVersion: (inspectionData.template_version as number | null) ?? 1,
      status: (inspectionData.status as string | null) ?? 'Completed',
      startedBy: inspectionData.started_by as string | null,
      startedAt: inspectionData.started_at as string | null,
      completedAt: inspectionData.completed_at as string | null,
      items: ((itemsData ?? []) as InspectionItemRow[]).map((item) => ({
        id: item.id,
        displayOrder: item.display_order,
        question: item.question,
        questionType: item.question_type,
        required: item.required,
        answer: item.answer,
        comments: item.comments,
        completed: item.completed,
        defectId: defectByItemId.get(item.id) ?? null,
      })),
    },
  })
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const { inspectionId } = await context.params

  const body = (await request.json()) as
    | {
        type: 'item'
        item_id?: string
        answer?: string | null
        comments?: string | null
      }
    | {
        type: 'complete'
      }

  const { data: inspectionData, error: inspectionError } = await supabaseAdmin
    .from('inspections')
    .select('id, machine_id, status, schedule_id')
    .eq('id', inspectionId)
    .maybeSingle()

  if (inspectionError) {
    return NextResponse.json({ error: inspectionError.message }, { status: 500 })
  }

  if (!inspectionData) {
    return NextResponse.json({ error: 'Inspection not found.' }, { status: 404 })
  }

  if ((inspectionData.status as string) !== 'In Progress') {
    return NextResponse.json({ error: 'This inspection is read-only.' }, { status: 409 })
  }

  if (body.type === 'item') {
    const itemId = body.item_id?.trim() ?? ''
    if (!itemId) {
      return NextResponse.json({ error: 'item_id is required.' }, { status: 400 })
    }

    const answer = normalizeAnswer(body.answer)
    const comments = body.comments?.trim() ?? null

    const { data: existingItem, error: existingItemError } = await supabaseAdmin
      .from('inspection_items')
      .select('id, question')
      .eq('id', itemId)
      .eq('inspection_id', inspectionId)
      .maybeSingle()

    if (existingItemError) {
      return NextResponse.json({ error: existingItemError.message }, { status: 500 })
    }

    if (!existingItem) {
      return NextResponse.json({ error: 'Inspection item not found.' }, { status: 404 })
    }

    const { data: updatedItem, error: updateError } = await supabaseAdmin
      .from('inspection_items')
      .update({
        answer,
        comments,
        completed: Boolean(answer),
      })
      .eq('id', itemId)
      .eq('inspection_id', inspectionId)
      .select('id, answer, comments, completed')
      .maybeSingle()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    if (!updatedItem) {
      return NextResponse.json({ error: 'Inspection item not found.' }, { status: 404 })
    }

    let defectId: string | null = null
    if ((updatedItem.answer as string | null) === 'fail') {
      const defectResult = await ensureDefectForFailedInspectionItem({
        machineId: inspectionData.machine_id as string,
        inspectionId,
        inspectionItemId: updatedItem.id as string,
        createdBy: auth.userId,
        title: existingItem.question as string,
        description: (updatedItem.comments as string | null) ?? null,
      })
      defectId = defectResult.defectId
    } else {
      const { data: existingDefect } = await supabaseAdmin
        .from('defects')
        .select('id')
        .eq('inspection_item_id', updatedItem.id as string)
        .maybeSingle()

      defectId = (existingDefect?.id as string | undefined) ?? null
    }

    return NextResponse.json({
      item: {
        id: updatedItem.id as string,
        answer: updatedItem.answer as string | null,
        comments: updatedItem.comments as string | null,
        completed: Boolean(updatedItem.completed),
        defectId,
      },
    })
  }

  if (body.type === 'complete') {
    const { data: itemsData, error: itemsError } = await supabaseAdmin
      .from('inspection_items')
      .select('id, question, required, answer, comments')
      .eq('inspection_id', inspectionId)
      .order('display_order', { ascending: true })

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    for (const item of itemsData ?? []) {
      const answer = normalizeAnswer(item.answer as string | null)
      if (answer === 'fail') {
        await ensureDefectForFailedInspectionItem({
          machineId: inspectionData.machine_id as string,
          inspectionId,
          inspectionItemId: item.id as string,
          createdBy: auth.userId,
          title: item.question as string,
          description: (item.comments as string | null) ?? null,
        })
      }
    }

    const items = itemsData ?? []
    const incompleteRequired = items.filter((item) => {
      if (!item.required) return false
      const answer = normalizeAnswer(item.answer as string | null)
      return !answer
    })

    if (incompleteRequired.length > 0) {
      return NextResponse.json(
        {
          error: 'Please complete all required inspection items before finishing.',
          incompleteItems: incompleteRequired.map((item) => ({
            id: item.id as string,
            question: item.question as string,
          })),
        },
        { status: 400 }
      )
    }

    const completedAt = new Date().toISOString()

    const legacyChecklist = items.map((item) => {
      const answer = normalizeAnswer(item.answer as string | null)
      return {
        id: item.id as string,
        label: item.question as string,
        status: answer === 'fail' ? 'fail' : 'pass',
        faultDescription: answer === 'fail' ? ((item.comments as string | null) ?? '') : undefined,
      }
    })

    const { error: completeError } = await supabaseAdmin
      .from('inspections')
      .update({
        status: 'Completed',
        completed_at: completedAt,
        is_overdue: false,
        archive_status: 'pending',
        archive_last_error: null,
        checklist: legacyChecklist,
      })
      .eq('id', inspectionId)

    if (completeError) {
      return NextResponse.json({ error: completeError.message }, { status: 500 })
    }

    await supabaseAdmin
      .from('machines')
      .update({ status: 'Completed' })
      .eq('id', inspectionData.machine_id as string)

    await advanceScheduleFromCompletedInspection({
      scheduleId: (inspectionData.schedule_id as string | null) ?? null,
      completedAt: new Date(completedAt),
    })

    try {
      await archiveInspectionAndSendEmail({
        inspectionId,
        triggeredBy: auth.userId,
      })
    } catch (archiveError) {
      // Archive failed but inspection is still completed
      // The email will be queued or retry later
      console.error('Archive failed:', archiveError)
    }

    return NextResponse.json({
      inspection: {
        id: inspectionId,
        status: 'Completed',
        completedAt,
        archiveStatus: 'archived',
      },
    })
  }

  return NextResponse.json({ error: 'Unsupported patch payload.' }, { status: 400 })
}
