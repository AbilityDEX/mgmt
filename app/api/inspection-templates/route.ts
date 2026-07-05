import { NextResponse } from 'next/server'
import { requireAdmin, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'

type TemplateRow = {
  id: string
  name: string
  description: string | null
  updated_at: string
}

type TemplateItemRow = {
  id: string
  template_id: string
  question: string
  description: string | null
  question_type: string
  required: boolean
  display_order: number
  created_at: string
  fail_require_comment?: boolean
  fail_allow_photos?: boolean
  fail_require_photos?: boolean
  pass_allow_photos?: boolean
  photo_max_count?: number
}

type InspectionQuestionType =
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

const defaultQuestionType: InspectionQuestionType = 'pass_fail'

type CreateTemplateBody = {
  name?: string
  items?: Array<{
    question?: string
    description?: string | null
    question_type?: InspectionQuestionType
    required?: boolean
    fail_require_comment?: boolean
    fail_allow_photos?: boolean
    fail_require_photos?: boolean
    pass_allow_photos?: boolean
    photo_max_count?: number
  }>
}

type UpdateTemplateBody = {
  name?: string
  description?: string | null
  items?: Array<{
    id?: string
    question?: string
    description?: string | null
    question_type?: InspectionQuestionType
    required?: boolean
    display_order?: number
    fail_require_comment?: boolean
    fail_allow_photos?: boolean
    fail_require_photos?: boolean
    pass_allow_photos?: boolean
    photo_max_count?: number
  }>
}

type AssignedMachine = {
  id?: string
  name?: string
}

type MachineAssignmentRow = {
  machine_id: string
  machines?: AssignedMachine | AssignedMachine[] | null
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  // Check if this is a request for a specific template
  const url = new URL(request.url)
  const templateId = url.searchParams.get('template_id')

  if (templateId) {
    // Fetch single template with items
    const { data: templateData, error: templateError } = await supabaseAdmin
      .from('checklist_templates')
      .select('id, name, description, updated_at')
      .eq('id', templateId)
      .single()

    if (templateError || !templateData) {
      return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
    }

    const { data: itemsData, error: itemsError } = await supabaseAdmin
      .from('checklist_template_items')
      .select(
        'id, template_id, question, description, question_type, required, display_order, created_at, fail_require_comment, fail_allow_photos, fail_require_photos, pass_allow_photos, photo_max_count'
      )
      .eq('template_id', templateId)
      .order('display_order', { ascending: true })

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    return NextResponse.json({
      template: {
        id: templateData.id,
        name: templateData.name,
        description: templateData.description,
        updatedAt: templateData.updated_at,
      },
      items: (itemsData ?? []) as TemplateItemRow[],
    })
  }

  // Fetch all templates (original behavior)
  const { data: templatesData, error: templatesError } = await supabaseAdmin
    .from('checklist_templates')
    .select('id, name, description, updated_at')
    .order('updated_at', { ascending: false })

  if (templatesError) {
    return NextResponse.json({ error: templatesError.message }, { status: 500 })
  }

  const templates = (templatesData ?? []) as TemplateRow[]

  const { data: itemsData, error: itemsError } = await supabaseAdmin
    .from('checklist_template_items')
    .select('template_id')

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  const itemCounts = new Map<string, number>()
  for (const item of (itemsData ?? []) as TemplateItemRow[]) {
    itemCounts.set(item.template_id, (itemCounts.get(item.template_id) ?? 0) + 1)
  }

  // Get machine counts for each template
  const { data: machineCountsData, error: machineCountsError } = await supabaseAdmin
    .from('machine_inspection_templates')
    .select('template_id', { count: 'exact' })
    .eq('active', true)

  if (machineCountsError) {
    return NextResponse.json({ error: machineCountsError.message }, { status: 500 })
  }

  const machineCounts = new Map<string, number>()
  for (const row of (machineCountsData ?? []) as Array<{ template_id: string }>) {
    machineCounts.set(row.template_id, (machineCounts.get(row.template_id) ?? 0) + 1)
  }

  return NextResponse.json({
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      itemCount: itemCounts.get(template.id) ?? 0,
      machineCount: machineCounts.get(template.id) ?? 0,
      lastUpdated: template.updated_at,
    })),
  })
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const body = (await request.json()) as CreateTemplateBody
  const name = body.name?.trim() ?? ''
  const rawItems = Array.isArray(body.items) ? body.items : []
  const normalizedItems = rawItems
    .map((item) => {
      const desc = typeof item.description === 'string' ? item.description.trim() : null
      return {
        question: item.question?.trim() ?? '',
        description: desc || null,
        questionType: (item.question_type ?? item.questionType) ?? defaultQuestionType,
        required: item.required ?? true,
        failRequireComment: typeof item.fail_require_comment === 'boolean' ? item.fail_require_comment : (typeof item.failRequireComment === 'boolean' ? item.failRequireComment : true),
        failAllowPhotos: typeof item.fail_allow_photos === 'boolean' ? item.fail_allow_photos : (typeof item.failAllowPhotos === 'boolean' ? item.failAllowPhotos : true),
        failRequirePhotos: typeof item.fail_require_photos === 'boolean' ? item.fail_require_photos : (typeof item.failRequirePhotos === 'boolean' ? item.failRequirePhotos : false),
        passAllowPhotos: typeof item.pass_allow_photos === 'boolean' ? item.pass_allow_photos : (typeof item.passAllowPhotos === 'boolean' ? item.passAllowPhotos : false),
        photoMaxCount: typeof item.photo_max_count === 'number' ? item.photo_max_count : (typeof item.photoMaxCount === 'number' ? item.photoMaxCount : 10),
      }
    })
    .filter((item) => item.question)

  if (!name) {
    return NextResponse.json({ error: 'Template name is required.' }, { status: 400 })
  }

  // Validate description lengths
  for (const it of normalizedItems) {
    if (it.description && it.description.length > 1000) {
      return NextResponse.json({ error: 'Description must be 1000 characters or fewer.' }, { status: 400 })
    }
  }

  if (normalizedItems.length === 0) {
    return NextResponse.json({ error: 'At least one inspection item is required.' }, { status: 400 })
  }

  const { data: templateData, error: templateError } = await supabaseAdmin
    .from('checklist_templates')
    .insert([
      {
        name,
        description: null,
      },
    ])
    .select('id, name, description, updated_at')
    .single()

  if (templateError || !templateData) {
    return NextResponse.json(
      { error: templateError?.message || 'Failed to create inspection template.' },
      { status: 500 }
    )
  }

  const templateId = templateData.id as string

  const { error: itemsError } = await supabaseAdmin
    .from('checklist_template_items')
    .insert(
      normalizedItems.map((item, index) => ({
        template_id: templateId,
        display_order: index + 1,
        question: item.question,
        description: item.description || null,
        question_type: item.questionType,
        required: item.required,
        fail_require_comment: item.failRequireComment,
        fail_allow_photos: item.failAllowPhotos,
        fail_require_photos: item.failRequirePhotos,
        pass_allow_photos: item.passAllowPhotos,
        photo_max_count: item.photoMaxCount,
      }))
    )

  if (itemsError) {
    await supabaseAdmin.from('checklist_templates').delete().eq('id', templateId)
    return NextResponse.json(
      { error: itemsError.message || 'Failed to create inspection template items.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    template: {
      id: templateId,
      name: templateData.name as string,
      description: templateData.description as string | null,
      itemCount: normalizedItems.length,
      lastUpdated: templateData.updated_at as string,
    },
  })
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const url = new URL(request.url)
  const templateId = url.searchParams.get('template_id')

  if (!templateId) {
    return NextResponse.json({ error: 'template_id is required.' }, { status: 400 })
  }

  const body = (await request.json()) as UpdateTemplateBody
  const name = body.name?.trim() ?? ''
  const description = body.description ?? null
  const rawItems = Array.isArray(body.items) ? body.items : []

  if (!name) {
    return NextResponse.json({ error: 'Template name is required.' }, { status: 400 })
  }

  if (rawItems.length === 0) {
    return NextResponse.json({ error: 'At least one inspection item is required.' }, { status: 400 })
  }

  // Normalize items
  const normalizedItems = rawItems
    .map((item, index) => {
      const desc = typeof item.description === 'string' ? item.description.trim() : null
      return {
        id: item.id,
        question: item.question?.trim() ?? '',
        description: desc || null,
        questionType: (item.question_type ?? item.questionType) ?? defaultQuestionType,
        required: item.required ?? true,
        displayOrder: item.display_order ?? index + 1,
        failRequireComment: typeof item.fail_require_comment === 'boolean' ? item.fail_require_comment : (typeof item.failRequireComment === 'boolean' ? item.failRequireComment : true),
        failAllowPhotos: typeof item.fail_allow_photos === 'boolean' ? item.fail_allow_photos : (typeof item.failAllowPhotos === 'boolean' ? item.failAllowPhotos : true),
        failRequirePhotos: typeof item.fail_require_photos === 'boolean' ? item.fail_require_photos : (typeof item.failRequirePhotos === 'boolean' ? item.failRequirePhotos : false),
        passAllowPhotos: typeof item.pass_allow_photos === 'boolean' ? item.pass_allow_photos : (typeof item.passAllowPhotos === 'boolean' ? item.passAllowPhotos : false),
        photoMaxCount: typeof item.photo_max_count === 'number' ? item.photo_max_count : (typeof item.photoMaxCount === 'number' ? item.photoMaxCount : 10),
      }
    })
    .filter((item) => item.question)

  if (normalizedItems.length === 0) {
    return NextResponse.json({ error: 'At least one valid inspection item is required.' }, { status: 400 })
  }

  for (const it of normalizedItems) {
    if (it.description && it.description.length > 1000) {
      return NextResponse.json({ error: 'Description must be 1000 characters or fewer.' }, { status: 400 })
    }
  }

  // Update template
  const { error: templateError } = await supabaseAdmin
    .from('checklist_templates')
    .update({
      name,
      description,
    })
    .eq('id', templateId)

  if (templateError) {
    return NextResponse.json({ error: templateError.message }, { status: 500 })
  }

  // Get existing items
  const { data: existingItems, error: fetchError } = await supabaseAdmin
    .from('checklist_template_items')
    .select('id')
    .eq('template_id', templateId)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const existingIds = new Set((existingItems ?? []).map((item) => item.id))
  const incomingIds = new Set(normalizedItems.filter((item) => item.id).map((item) => item.id!))

  // Delete items not in the incoming list
  const idsToDelete = Array.from(existingIds).filter((id) => !incomingIds.has(id))
  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from('checklist_template_items')
      .delete()
      .in('id', idsToDelete)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }
  }

  // Insert or update items
  for (const item of normalizedItems) {
    if (item.id && existingIds.has(item.id)) {
      // Update existing item
      const { error: updateError } = await supabaseAdmin
        .from('checklist_template_items')
        .update({
          question: item.question,
          description: item.description || null,
          question_type: item.questionType,
          required: item.required,
          display_order: item.displayOrder,
          fail_require_comment: item.failRequireComment,
          fail_allow_photos: item.failAllowPhotos,
          fail_require_photos: item.failRequirePhotos,
          pass_allow_photos: item.passAllowPhotos,
          photo_max_count: item.photoMaxCount,
        })
        .eq('id', item.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    } else {
      // Insert new item
      const { error: insertError } = await supabaseAdmin
        .from('checklist_template_items')
        .insert([
          {
            template_id: templateId,
            question: item.question,
            description: item.description || null,
            question_type: item.questionType,
            required: item.required,
            display_order: item.displayOrder,
            fail_require_comment: item.failRequireComment,
            fail_allow_photos: item.failAllowPhotos,
            fail_require_photos: item.failRequirePhotos,
            pass_allow_photos: item.passAllowPhotos,
            photo_max_count: item.photoMaxCount,
          },
        ])

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json({
    template: {
      id: templateId,
      name,
      description,
      itemCount: normalizedItems.length,
    },
  })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const url = new URL(request.url)
  const templateId = url.searchParams.get('template_id')

  if (!templateId) {
    return NextResponse.json({ error: 'template_id is required.' }, { status: 400 })
  }

  // Check if any machines are using this template
  const { data: machineAssignments, error: assignmentError } = await supabaseAdmin
    .from('machine_inspection_templates')
    .select('machine_id, machines(id, name)')
    .eq('template_id', templateId)
    .eq('active', true)

  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 500 })
  }

  if (machineAssignments && machineAssignments.length > 0) {
    const assignments = machineAssignments as MachineAssignmentRow[]
    const machineNames = assignments
      .map((row) => {
        const machinesData = row.machines
        const machine = Array.isArray(machinesData) ? machinesData[0] : machinesData
        return machine?.name
      })
      .filter(Boolean)
      .join(', ')
    return NextResponse.json(
      {
        error: `Cannot delete template - it is currently assigned to ${machineAssignments.length} machine(s): ${machineNames}. Please reassign or remove these machines first.`,
        affectedMachines: assignments.map((row) => {
          const machinesData = row.machines
          const machine = Array.isArray(machinesData) ? machinesData[0] : machinesData
          return {
            id: row.machine_id,
            name: (machine?.name as string) || 'Unknown',
          }
        }),
      },
      { status: 409 }
    )
  }

  // Delete items first (cascade)
  const { error: itemsError } = await supabaseAdmin
    .from('checklist_template_items')
    .delete()
    .eq('template_id', templateId)

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  // Delete template
  const { error: templateError } = await supabaseAdmin
    .from('checklist_templates')
    .delete()
    .eq('id', templateId)

  if (templateError) {
    return NextResponse.json({ error: templateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
