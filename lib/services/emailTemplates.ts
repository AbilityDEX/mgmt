import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import type { EmailTemplate } from '@/lib/types/release1'

function mapTemplate(row: Record<string, unknown>): EmailTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    subject: row.subject as string,
    body: row.body as string,
    signature: row.signature as string,
    active: Boolean(row.active),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function listEmailTemplates() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const { data, error } = await supabaseAdmin
    .from('email_templates')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => mapTemplate(row as Record<string, unknown>))
}

export async function updateEmailTemplate(
  templateId: string,
  updates: {
    subject?: string
    body?: string
    signature?: string
    active?: boolean
  }
) {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const payload: Record<string, unknown> = {}
  if (updates.subject !== undefined) payload.subject = updates.subject
  if (updates.body !== undefined) payload.body = updates.body
  if (updates.signature !== undefined) payload.signature = updates.signature
  if (updates.active !== undefined) payload.active = updates.active

  const { data, error } = await supabaseAdmin
    .from('email_templates')
    .update(payload)
    .eq('id', templateId)
    .select('*')
    .single()

  if (error || !data) throw error ?? new Error('Failed to update template.')
  return mapTemplate(data as Record<string, unknown>)
}

export async function getDefaultInspectionTemplate() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const { data, error } = await supabaseAdmin
    .from('email_templates')
    .select('*')
    .eq('name', 'inspection_archive_default')
    .eq('active', true)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Default inspection archive email template not found.')

  return mapTemplate(data as Record<string, unknown>)
}

export function renderTemplate(input: {
  raw: string
  vars: Record<string, string>
}) {
  let output = input.raw

  for (const [key, value] of Object.entries(input.vars)) {
    output = output.split(`{{${key}}}`).join(value)
  }

  return output
}
