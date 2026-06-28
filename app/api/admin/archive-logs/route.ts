import { NextResponse } from 'next/server'
import { requireAdmin, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!supabaseAdmin) return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })

  const url = new URL(request.url)
  const inspectionId = url.searchParams.get('inspection_id')?.trim() ?? ''

  let query = supabaseAdmin
    .from('archive_delivery_logs')
    .select('id, inspection_id, archive_id, pdf_generated, email_sent, archived, status, failure_reason, retry_count, recipient_snapshot, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (inspectionId) {
    query = query.eq('inspection_id', inspectionId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const logs = data ?? []
  const inspectionIds = Array.from(new Set(logs.map((row) => String(row.inspection_id)).filter(Boolean)))

  let inspectionsById = new Map<string, { machine_id: string | null; completed_at: string | null; operator_name: string | null }>()
  if (inspectionIds.length > 0) {
    const inspections = await supabaseAdmin
      .from('inspections')
      .select('id, machine_id, completed_at, operator_name')
      .in('id', inspectionIds)

    if (!inspections.error) {
      inspectionsById = new Map(
        (inspections.data ?? []).map((row) => [
          String(row.id),
          {
            machine_id: (row.machine_id as string | null) ?? null,
            completed_at: (row.completed_at as string | null) ?? null,
            operator_name: (row.operator_name as string | null) ?? null,
          },
        ])
      )
    }
  }

  const machineIds = Array.from(
    new Set(Array.from(inspectionsById.values()).map((row) => row.machine_id).filter((value): value is string => Boolean(value)))
  )

  let machinesById = new Map<string, { name: string | null }>()
  if (machineIds.length > 0) {
    const machines = await supabaseAdmin.from('machines').select('id, name').in('id', machineIds)
    if (!machines.error) {
      machinesById = new Map(
        (machines.data ?? []).map((row) => [String(row.id), { name: (row.name as string | null) ?? null }])
      )
    }
  }

  const mapped = logs.map((row) => {
    const inspection = inspectionsById.get(String(row.inspection_id))
    const machine = inspection?.machine_id ? machinesById.get(inspection.machine_id) : null
    const recipients = Array.isArray(row.recipient_snapshot) ? row.recipient_snapshot : []
    const firstRecipient = recipients[0] as { email?: string } | undefined

    return {
      ...row,
      recipient: firstRecipient?.email ?? null,
      recipientCount: recipients.length,
      sent_time: row.email_sent ? row.created_at : null,
      delivery_status: row.status,
      machine_name: machine?.name ?? null,
      inspector: inspection?.operator_name ?? null,
      completed_at: inspection?.completed_at ?? null,
    }
  })

  return NextResponse.json({ logs: mapped })
}
