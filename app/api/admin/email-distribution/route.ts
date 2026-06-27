import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import {
  createEmailRecipient,
  deleteEmailRecipient,
  listEmailRecipients,
  updateEmailRecipient,
} from '@/lib/services/emailDistribution'
import type { EmailDeliveryScope, EmailRecipientType } from '@/lib/types/release1'

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const recipients = await listEmailRecipients()
    return NextResponse.json({ recipients })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load recipients.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json()) as {
    name?: string
    email?: string
    recipientType?: EmailRecipientType
    enabled?: boolean
    deliveryScope?: EmailDeliveryScope
    departmentFilter?: string | null
    machineFilter?: string | null
  }

  if (!body.name?.trim() || !body.email?.trim() || !body.recipientType || !body.deliveryScope) {
    return NextResponse.json({ error: 'name, email, recipientType, and deliveryScope are required.' }, { status: 400 })
  }

  try {
    const recipient = await createEmailRecipient({
      name: body.name,
      email: body.email,
      recipientType: body.recipientType,
      enabled: body.enabled,
      deliveryScope: body.deliveryScope,
      departmentFilter: body.departmentFilter,
      machineFilter: body.machineFilter,
    })

    return NextResponse.json({ recipient })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create recipient.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json()) as {
    id?: string
    name?: string
    email?: string
    recipientType?: EmailRecipientType
    enabled?: boolean
    deliveryScope?: EmailDeliveryScope
    departmentFilter?: string | null
    machineFilter?: string | null
  }

  const recipientId = body.id?.trim() ?? ''
  if (!recipientId) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  }

  try {
    const recipient = await updateEmailRecipient(recipientId, {
      name: body.name,
      email: body.email,
      recipientType: body.recipientType,
      enabled: body.enabled,
      deliveryScope: body.deliveryScope,
      departmentFilter: body.departmentFilter,
      machineFilter: body.machineFilter,
    })

    return NextResponse.json({ recipient })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update recipient.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json()) as { id?: string }
  const recipientId = body.id?.trim() ?? ''

  if (!recipientId) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  }

  try {
    await deleteEmailRecipient(recipientId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete recipient.' }, { status: 500 })
  }
}
