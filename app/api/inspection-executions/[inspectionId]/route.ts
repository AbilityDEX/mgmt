import { NextResponse } from 'next/server'
import { requireAuthContext, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { ensureDefectForFailedInspectionItem } from '@/lib/services/defects'
import { canAccessInspection } from '@/lib/services/inspectionAccess'
import { trackInspectionEvent as baseTrackInspectionEvent } from '@/lib/services/inspectionMetrics'
import { completeInspectionWorkflow, InspectionCompletionError } from '@/lib/services/inspectionCompletion'

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
  description?: string | null
}

type DefectRow = {
  id: string
  inspection_item_id: string
}

function normalizeAnswer(answer: string | null | undefined) {
  const normalized = answer?.trim() ?? ''
  return normalized || null
}

async function trackInspectionEvent(input: Parameters<typeof baseTrackInspectionEvent>[0]) {
  await baseTrackInspectionEvent(input)
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAuthContext(request)
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

  if (!auth.isAdmin) {
    const access = await canAccessInspection(auth, inspectionId)
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason === 'not_found' ? 'Inspection not found.' : 'Forbidden' }, { status: access.reason === 'not_found' ? 404 : 403 })
    }
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
    .select('id, original_template_item_id, display_order, question, question_type, required, description, answer, comments, completed')
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

  // Fetch behaviour flags from template items for any original template references
  const templateIds = Array.from(
    new Set(((itemsData ?? []) as any[]).map((r) => r.original_template_item_id).filter(Boolean))
  )

  let behaviourByTemplateId = new Map<string, any>()
  if (templateIds.length > 0) {
    const { data: templateFlagsData, error: templateFlagsError } = await supabaseAdmin
      .from('checklist_template_items')
      .select('id, fail_require_comment, fail_allow_photos, fail_require_photos, pass_allow_photos, photo_max_count')
      .in('id', templateIds)

    if (!templateFlagsError && templateFlagsData) {
      behaviourByTemplateId = new Map((templateFlagsData as any[]).map((t) => [t.id, t]))
    }
  }

  // Fetch photos for items
  const photosByItemId = new Map<string, Array<{ id: string; url: string; caption?: string; uploadedAt?: string }>>()
  if (itemIds.length > 0) {
    const { data: photosData, error: photosError } = await supabaseAdmin
      .from('photo_uploads')
      .select('id, inspection_item_id, storage_path, caption, uploaded_at')
      .in('inspection_item_id', itemIds)
      .order('uploaded_at', { ascending: true })

    if (!photosError && photosData) {
      const bucket = 'inspection-photos'
      // Generate signed URLs for each photo
      const signedPromises = (photosData as any[]).map(async (p) => {
        const path = p.storage_path || p.storagePath || ''
        let url = path
        try {
          const { data: signedData } = await supabaseAdmin!.storage.from(bucket).createSignedUrl(path, 60 * 60)
          url = signedData?.signedUrl ?? url
        } catch {
          // fallback to storage_path
        }
        return {
          id: p.id as string,
          inspection_item_id: p.inspection_item_id as string,
          url,
          caption: p.caption as string | null,
          uploadedAt: (p.uploaded_at as string) ?? null,
        }
      })

      const resolved = await Promise.all(signedPromises)
      for (const p of resolved) {
        const arr = photosByItemId.get(p.inspection_item_id) ?? []
        arr.push({ id: p.id, url: p.url, caption: p.caption ?? undefined, uploadedAt: p.uploadedAt ?? undefined })
        photosByItemId.set(p.inspection_item_id, arr)
      }
    }
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
      items: ((itemsData ?? []) as any[]).map((item) => {
        const flags = behaviourByTemplateId.get(item.original_template_item_id)
        return {
          id: item.id,
          displayOrder: item.display_order,
          question: item.question,
          questionType: item.question_type,
          required: item.required,
          helpText: (item.description as string | null) ?? undefined,
          answer: item.answer,
          comments: item.comments,
          completed: item.completed,
          defectId: defectByItemId.get(item.id) ?? null,
          // Behaviour flags mapped to camelCase for client
          failRequireComment: flags?.fail_require_comment ?? true,
          failAllowPhotos: flags?.fail_allow_photos ?? true,
          failRequirePhotos: flags?.fail_require_photos ?? false,
          passAllowPhotos: flags?.pass_allow_photos ?? false,
          photoMaxCount: flags?.photo_max_count ?? 10,
          photos: photosByItemId.get(item.id) ?? [],
        }
      }),
    },
  })
}

export async function PATCH(request: Request, context: RouteContext) {
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
    | {
        type: 'cancel'
        reason?: string
      }

  const { data: inspectionData, error: inspectionError } = await supabaseAdmin
    .from('inspections')
    .select('id, machine_id, template_id, status, schedule_id')
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
      .select('id, question, original_template_item_id')
      .eq('id', itemId)
      .eq('inspection_id', inspectionId)
      .maybeSingle()

    if (existingItemError) {
      return NextResponse.json({ error: existingItemError.message }, { status: 500 })
    }

    if (!existingItem) {
      return NextResponse.json({ error: 'Inspection item not found.' }, { status: 404 })
    }

    // Enforce required comment or photos on FAIL based on the original template item behaviour
    if ((answer as string | null) === 'fail' && existingItem.original_template_item_id) {
      const { data: templateItem } = await supabaseAdmin
        .from('checklist_template_items')
        .select('id, fail_require_comment, fail_require_photos')
        .eq('id', existingItem.original_template_item_id)
        .maybeSingle()

      if (templateItem?.fail_require_comment && !comments) {
        return NextResponse.json(
          { error: 'Comment is required for failed items.', fieldErrors: { comments: 'Comment required for failed item.' } },
          { status: 400 }
        )
      }

      if (templateItem?.fail_require_photos) {
        const { data: photosForItem, error: photosError } = await supabaseAdmin
          .from('photo_uploads')
          .select('id')
          .eq('inspection_item_id', itemId)
          .limit(1)

        if (photosError) {
          return NextResponse.json({ error: photosError.message }, { status: 500 })
        }

        if (!photosForItem || (photosForItem as any[]).length === 0) {
          return NextResponse.json(
            { error: 'At least one photo is required for failed items.', fieldErrors: { photos: 'Photo required for failed item.' } },
            { status: 400 }
          )
        }
      }
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
    try {
      const result = await completeInspectionWorkflow({ inspectionId, userId: auth.userId })

      return NextResponse.json({
        inspection: {
          id: inspectionId,
          status: result.status,
          completedAt: result.completedAt,
          archiveStatus: result.archiveStatus,
        },
        scheduleAdvanceResult: result.scheduleAdvanceResult,
      })
    } catch (error) {
      if (error instanceof InspectionCompletionError) {
        return NextResponse.json(
          {
            error: error.message,
            stage: error.stage,
            ...(error.details ?? {}),
          },
          { status: error.status }
        )
      }

      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Inspection completion failed.',
          stage: 'rollback',
        },
        { status: 500 }
      )
    }
  }

  if (body.type === 'cancel') {
    const { error: cancelError } = await supabaseAdmin
      .from('inspections')
      .update({ status: 'Cancelled' })
      .eq('id', inspectionId)

    if (cancelError) {
      return NextResponse.json({ error: cancelError.message }, { status: 500 })
    }

    await trackInspectionEvent({
      eventType: 'cancelled',
      inspectionId,
      machineId: inspectionData.machine_id as string,
      scheduleId: (inspectionData.schedule_id as string | null) ?? null,
      userId: auth.userId,
      details: { reason: body.reason ?? null },
    }).catch(() => undefined)

    return NextResponse.json({
      inspection: {
        id: inspectionId,
        status: 'Cancelled',
      },
    })
  }

  return NextResponse.json({ error: 'Unsupported patch payload.' }, { status: 400 })
}
