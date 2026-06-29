import { NextResponse } from 'next/server'
import { requireAdmin, requireAuthContext, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { addLondonDays, getLondonDateKey } from '@/lib/inspectionTime'
import {
  ensureScheduleForMachineTemplate,
  getScheduleOverview,
  runInspectionScheduler,
  scheduleFrequencies,
  ScheduleFrequency,
} from '@/lib/services/inspectionScheduling'
import { canAccessMachine } from '@/lib/services/inspectionAccess'
import { userActivityFallback } from '@/lib/services/userActivityFallback'

const frequencies = scheduleFrequencies

function isFrequency(value: string): value is ScheduleFrequency {
  return frequencies.includes(value as ScheduleFrequency)
}

export async function GET(request: Request) {
  const auth = await requireAuthContext(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  // Ensure daily maintenance has completed
  await userActivityFallback.triggerMaintenanceFallbackIfNeeded(supabaseAdmin, false)

  const url = new URL(request.url)
  const machineId = url.searchParams.get('machine_id')?.trim() ?? ''

  try {
    const overview = await getScheduleOverview()

    if (machineId) {
      if (!auth.isAdmin) {
        const access = await canAccessMachine(auth, machineId)
        if (!access.allowed) {
          return NextResponse.json({ error: access.reason === 'not_found' ? 'Machine not found.' : 'Forbidden' }, { status: access.reason === 'not_found' ? 404 : 403 })
        }
      }

      const schedules = overview.rows.filter((row) => row.machineId === machineId)
      return NextResponse.json({ frequencies, schedules })
    }

    const allowedMachineIds = auth.isAdmin
      ? null
      : new Set(
          (await supabaseAdmin
            .from('machines')
            .select('id')
            .eq('assigned_user', auth.username ?? ''))
            .data?.map((row) => row.id as string) ?? []
        )

    const scopedRows = allowedMachineIds
      ? overview.rows.filter((row) => allowedMachineIds.has(row.machineId))
      : overview.rows

    const tomorrowKey = getLondonDateKey(addLondonDays(new Date(), 1))

    const scopedBuckets = {
      dueToday: overview.dueBuckets.dueToday.filter((row) => !allowedMachineIds || allowedMachineIds.has(row.machineId)),
      dueThisWeek: overview.dueBuckets.dueThisWeek.filter((row) => !allowedMachineIds || allowedMachineIds.has(row.machineId)),
      overdue: overview.dueBuckets.overdue.filter((row) => !allowedMachineIds || allowedMachineIds.has(row.machineId)),
      upcoming: overview.dueBuckets.upcoming.filter((row) => !allowedMachineIds || allowedMachineIds.has(row.machineId)),
    }

    return NextResponse.json({
      frequencies,
      board: scopedBuckets,
      widgets: {
        ...overview.widgets,
        dueToday: scopedBuckets.dueToday.length,
        dueTomorrow: scopedRows.filter((row) => getLondonDateKey(new Date(row.nextDue)) === tomorrowKey).length,
        overdue: scopedBuckets.overdue.length,
        upcomingThisWeek: scopedBuckets.dueThisWeek.length,
        totalOutstanding: scopedBuckets.dueToday.length + scopedBuckets.dueThisWeek.length + scopedBuckets.overdue.length,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load schedules.',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const body = (await request.json()) as {
    machine_template_id?: string
    frequency?: string
    interval_value?: number
    custom_cron?: string | null
    active?: boolean
  }

  const machineTemplateId = body.machine_template_id?.trim() ?? ''
  const frequency = body.frequency?.trim() ?? ''

  if (!machineTemplateId || !frequency) {
    return NextResponse.json(
      { error: 'machine_template_id and frequency are required.' },
      { status: 400 }
    )
  }

  if (!isFrequency(frequency)) {
    return NextResponse.json({ error: 'Invalid frequency.' }, { status: 400 })
  }

  if (frequency === 'Custom' && !body.custom_cron?.trim()) {
    return NextResponse.json({ error: 'custom_cron is required for Custom schedules.' }, { status: 400 })
  }

  try {
    const schedule = await ensureScheduleForMachineTemplate({
      machineTemplateId: machineTemplateId,
      frequency,
      intervalValue: body.interval_value,
      customCron: body.custom_cron ?? null,
      active: body.active ?? true,
    })

    return NextResponse.json({
      scheduleId: schedule.scheduleId,
      created: schedule.created,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create schedule.',
      },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const body = (await request.json()) as {
    schedule_id?: string
    frequency?: string
    interval_value?: number
    custom_cron?: string | null
    active?: boolean
  }

  const scheduleId = body.schedule_id?.trim() ?? ''
  if (!scheduleId) {
    return NextResponse.json({ error: 'schedule_id is required.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if (body.frequency !== undefined) {
    const frequency = body.frequency.trim()
    if (!isFrequency(frequency)) {
      return NextResponse.json({ error: 'Invalid frequency.' }, { status: 400 })
    }
    updates.frequency = frequency
  }

  if (body.interval_value !== undefined) {
    if (!Number.isFinite(body.interval_value) || body.interval_value < 1) {
      return NextResponse.json({ error: 'interval_value must be >= 1.' }, { status: 400 })
    }
    updates.interval_value = Math.floor(body.interval_value)
  }

  if (body.custom_cron !== undefined) {
    updates.custom_cron = body.custom_cron?.trim() || null
  }

  if (body.active !== undefined) {
    updates.active = body.active
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('inspection_schedules')
    .select('id, machine_template_id, frequency, interval_value, custom_cron')
    .eq('id', scheduleId)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  if (!existing) {
    return NextResponse.json({ error: 'Schedule not found.' }, { status: 404 })
  }

  const nextFrequency = (updates.frequency as ScheduleFrequency | undefined) ??
    (existing.frequency as ScheduleFrequency)
  const nextInterval = (updates.interval_value as number | undefined) ??
    (existing.interval_value as number)
  const nextCron = (updates.custom_cron as string | null | undefined) ??
    ((existing.custom_cron as string | null) ?? null)

  if (nextFrequency === 'Custom' && !nextCron) {
    return NextResponse.json({ error: 'custom_cron is required for Custom schedules.' }, { status: 400 })
  }

  try {
    const refreshed = await ensureScheduleForMachineTemplate({
      machineTemplateId: existing.machine_template_id as string,
      frequency: nextFrequency,
      intervalValue: nextInterval,
      customCron: nextCron,
      active: body.active ?? true,
    })

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('inspection_schedules')
      .update(updates)
      .eq('id', refreshed.scheduleId)
      .select('id, next_due, active')
      .single()

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message || 'Failed to update schedule.' }, { status: 500 })
    }

    return NextResponse.json({
      schedule: {
        id: updated.id as string,
        nextDue: updated.next_due as string,
        active: Boolean(updated.active),
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to update schedule.',
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  const body = (await request.json()) as { schedule_id?: string }
  const scheduleId = body.schedule_id?.trim() ?? ''
  if (!scheduleId) {
    return NextResponse.json({ error: 'schedule_id is required.' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('inspection_schedules')
    .delete()
    .eq('id', scheduleId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
