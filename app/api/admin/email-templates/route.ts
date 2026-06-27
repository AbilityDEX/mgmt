import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { listEmailTemplates, updateEmailTemplate } from '@/lib/services/emailTemplates'

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const templates = await listEmailTemplates()
    return NextResponse.json({ templates })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load templates.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json()) as {
    id?: string
    subject?: string
    body?: string
    signature?: string
    active?: boolean
  }

  const templateId = body.id?.trim() ?? ''
  if (!templateId) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  }

  try {
    const template = await updateEmailTemplate(templateId, {
      subject: body.subject,
      body: body.body,
      signature: body.signature,
      active: body.active,
    })

    return NextResponse.json({ template })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update template.' }, { status: 500 })
  }
}
