'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { formatInspectionDateTime, formatInspectionDate, startOfLondonDay } from '@/lib/inspectionTime'
import StatusBanner from '@/components/StatusBanner'
import { useCurrentUser } from '@/lib/store'
import { supabaseClient } from '@/lib/supabase'

type AssignedTemplate = {
  templateId: string
  templateName: string
  inspectionFrequency: string
  active: boolean
  nextDue: string | null
  isLocked: boolean
  lockMessage: string | null
}

type InspectionHistoryEntry = {
  id: string
  templateName: string
  status: string
  result: 'PASS' | 'FAIL' | 'INCOMPLETE'
  failedItemCount: number
  defectCount: number
  isOverdue: boolean
  dueAt: string | null
  startedAt: string | null
  completedAt: string | null
  completedBy: string
}

type MachineSummary = {
  id: string
  name: string
  area: string
  status: string
  registrationNumber?: string | null
  nextScheduledAt?: string | null
  nextScheduledStatus?: string | null
}

type InspectionExecutionsResponse = {
  machine: MachineSummary | null
  assignedTemplates: AssignedTemplate[]
  inspections: InspectionHistoryEntry[]
}

function formatDisplayDate(value: string | null) {
  return formatInspectionDateTime(value)
}

async function getToken(): Promise<string | null> {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function MachineInspectionPage() {
  const params = useParams<{ machineId: string }>()
  const machineId = params.machineId
  const router = useRouter()
  const currentUser = useCurrentUser()

  const [machine, setMachine] = useState<MachineSummary | null>(null)
  const [assignedTemplates, setAssignedTemplates] = useState<AssignedTemplate[]>([])
  const [inspections, setInspections] = useState<InspectionHistoryEntry[]>([])

  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const inputClass =
    'mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20'

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    if (!machineId || machineId === 'undefined' || machineId === '') {
      setError('Machine ID is missing or invalid. Unable to load machine.')
      setIsLoading(false)
      return
    }

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const url = `/api/inspection-executions?machine_id=${encodeURIComponent(machineId)}`

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const payload = (await response.json()) as InspectionExecutionsResponse & { error?: string }

      if (!response.ok) {
        setError(payload.error || 'Failed to load inspection details.')
        return
      }

      setMachine(payload.machine ?? null)
      setAssignedTemplates(
        (payload.assignedTemplates ?? []).map((template: AssignedTemplate) => ({
          ...template,
          nextDue: template.nextDue ?? null,
          isLocked: Boolean(template.isLocked),
          lockMessage: template.lockMessage ?? null,
        }))
      )
      setInspections(payload.inspections ?? [])

      if (!selectedTemplateId && payload.assignedTemplates?.length) {
        setSelectedTemplateId(payload.assignedTemplates[0].templateId)
      }
    } catch {
      setError('Failed to load inspection details.')
    } finally {
      setIsLoading(false)
    }
  }, [machineId, selectedTemplateId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const startInspection = async (templateId?: string) => {
    if (starting) return

    setStarting(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const payload = {
        machine_id: machineId,
        ...(templateId ? { template_id: templateId } : {}),
      }

      const response = await fetch('/api/inspection-executions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const result = (await response.json()) as {
        error?: string
        nextDue?: string | null
        inspection?: { id: string }
      }

        if (!response.ok || !result.inspection?.id) {
        if (response.status === 409) {
          await load()
          const lockError = result.nextDue
            ? `Next inspection ${formatDisplayDate(result.nextDue)}`
            : result.error
          setError(lockError || 'Failed to start inspection.')
          return
        }
        setError(result.error || 'Failed to start inspection.')
        return
      }
      router.push(`/inspection/executions/${result.inspection.id}`)
    } catch {
      setError('Failed to start inspection.')
    } finally {
      setStarting(false)
    }
  }

  const handleStartClick = () => {
    if (assignedTemplates.length === 0) {
      setError('No inspection templates assigned.')
      return
    }

    if (assignedTemplates.length === 1) {
      void startInspection(assignedTemplates[0].templateId)
      return
    }

    setIsTemplateModalOpen(true)
  }

  const canStartWithSelection = useMemo(
    () => {
      if (!selectedTemplateId || starting) return false
      const selected = assignedTemplates.find((template) => template.templateId === selectedTemplateId)
      return Boolean(selected && !selected.isLocked)
    },
    [selectedTemplateId, starting, assignedTemplates]
  )

  const lastInspection = useMemo(
    () => inspections.find((inspection) => inspection.status === 'Completed') ?? inspections[0] ?? null,
    [inspections]
  )

  const primaryTemplate = assignedTemplates[0] ?? null
  const hasStartableTemplate = assignedTemplates.some((template) => !template.isLocked)
  const allTemplatesLocked = assignedTemplates.length > 0 && !hasStartableTemplate
  const lockMessage = allTemplatesLocked
      ? primaryTemplate?.lockMessage ?? (primaryTemplate?.nextDue ? `Next inspection ${formatInspectionDate(
          startOfLondonDay(new Date(primaryTemplate.nextDue)).toISOString()
        )}` : null)
      : null

  // Determine banner state and props
  function formatDurationHuman(ms: number) {
    const totalMinutes = Math.floor(ms / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const { bannerState, bannerProps } = useMemo(() => {
    let state: 'Due' | 'Overdue' | 'Completed' | 'Locked' = 'Due'
    const props: Record<string, string | null> = {}

    const open = inspections.find((i) => i.status === 'In Progress')
    if (open) {
      if (open.isOverdue) {
        state = 'Overdue'
        props.dueSince = open.dueAt ?? null
        props.deadline = open.dueAt ?? null
        // overdueBy is computed in an effect to avoid impure calls during render
      } else {
        state = 'Due'
        props.dueSince = open.dueAt ?? null
        props.deadline = open.dueAt ?? null
      }
    } else if (inspections.find((i) => i.status === 'Completed')) {
      const lastCompleted = inspections.find((i) => i.status === 'Completed')!
      state = 'Completed'
      props.completedAt = lastCompleted.completedAt ?? null
      props.nextInspection = machine?.nextScheduledAt ?? null
    } else if (primaryTemplate?.isLocked) {
      state = 'Locked'
      props.nextInspection = machine?.nextScheduledAt ?? primaryTemplate?.nextDue ?? null
    } else {
      state = 'Due'
      props.dueSince = primaryTemplate?.nextDue ? startOfLondonDay(new Date(primaryTemplate.nextDue)).toISOString() : null
      props.deadline = primaryTemplate?.nextDue ?? null
    }

    return { bannerState: state, bannerProps: props }
  }, [inspections, primaryTemplate, machine?.nextScheduledAt])

  const [overdueByState, setOverdueByState] = useState<string | null>(null)

  useEffect(() => {
    setOverdueByState(null)
    if (bannerState === 'Overdue' && bannerProps.deadline) {
      try {
        const overdueMs = Date.now() - new Date(bannerProps.deadline).getTime()
        if (overdueMs > 0) setOverdueByState(formatDurationHuman(overdueMs))
      } catch {
        setOverdueByState(null)
      }
    }
  }, [bannerState, bannerProps.deadline])

  if (!currentUser) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <p className="text-lg font-semibold">Please login to inspect machines.</p>
          <Link href="/" className="mt-6 inline-flex rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500">
            Back to Login
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        <div className="mb-6 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)]">
          <Link href="/inspection" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700">
            ← Back
          </Link>
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Machine Inspection</p>
          <h1 className="mt-2 text-2xl font-semibold">{machine?.name ?? 'Machine'}</h1>
          {machine?.area ? <p className="mt-2 text-sm text-slate-400">Area: {machine.area}</p> : null}
          {machine?.registrationNumber ? (
            <p className="mt-1 text-sm text-slate-500">Registration: {machine.registrationNumber}</p>
          ) : null}
        </div>

        <div className="mb-6">
          <StatusBanner
            state={bannerState}
            dueSince={bannerProps.dueSince ?? null}
            deadline={bannerProps.deadline ?? null}
            overdueBy={bannerProps.overdueBy ?? overdueByState}
            completedAt={bannerProps.completedAt ?? null}
            nextInspection={bannerProps.nextInspection ?? null}
          />
        </div>

        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        <section className="mb-6 grid gap-3 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)] sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl bg-slate-950/80 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Machine Status</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">{machine?.status ?? 'Unknown'}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/80 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Last Inspection</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">{formatDisplayDate(lastInspection?.completedAt ?? lastInspection?.startedAt ?? null)}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/80 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Next Scheduled</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">{formatDisplayDate(machine?.nextScheduledAt ?? null)}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/80 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Assigned Template</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">{primaryTemplate?.templateName ?? 'Unassigned'}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/80 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Frequency</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">{primaryTemplate?.inspectionFrequency ?? 'N/A'}</p>
          </div>
        </section>

        <section className="mb-6 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Inspections</h2>
            <button
              type="button"
              onClick={handleStartClick}
              disabled={starting || isLoading || assignedTemplates.length === 0 || !hasStartableTemplate}
              className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {starting ? 'Starting...' : !hasStartableTemplate ? 'Locked' : 'Start Inspection'}
            </button>
          </div>

          {allTemplatesLocked && lockMessage ? (
            <p className="mb-4 text-sm text-amber-300">{lockMessage}</p>
          ) : null}

          {isLoading ? (
            <div className="rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-400">Loading inspection setup...</div>
          ) : assignedTemplates.length > 0 ? (
            <div className="space-y-3">
              {assignedTemplates.map((template) => (
                <div key={template.templateId} className="rounded-3xl bg-slate-950/80 p-4">
                  <p className="text-sm font-semibold text-white">{template.templateName}</p>
                  <p className="mt-1 text-xs text-slate-400">Frequency: {template.inspectionFrequency}</p>
                  {template.isLocked && template.lockMessage ? (
                    <p className="mt-2 text-xs text-amber-300">{template.lockMessage}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl bg-slate-950/80 px-4 py-6 text-center text-slate-300">
              <p className="text-sm">No inspection templates assigned.</p>
            </div>
          )}
        </section>

        <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Inspection History</h2>

          <div className="mt-4 space-y-3">
            {isLoading ? (
              <div className="rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-400">Loading history...</div>
            ) : inspections.length > 0 ? (
              inspections.map((inspection) => (
                <Link
                  key={inspection.id}
                  href={`/inspection/executions/${inspection.id}`}
                  className="block rounded-3xl bg-slate-950/80 p-4 transition hover:bg-slate-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{inspection.templateName}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Inspection Date: {formatDisplayDate(inspection.completedAt ?? inspection.startedAt)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">Completed By: {inspection.completedBy}</p>
                        {inspection.status === 'In Progress' && inspection.isOverdue ? (
                          <p className="mt-1 text-xs font-semibold text-rose-300">
                            Overdue since {formatDisplayDate(inspection.dueAt)}
                          </p>
                        ) : null}
                      {inspection.status === 'Completed' ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 font-semibold ${
                              inspection.result === 'FAIL'
                                ? 'bg-rose-600/15 text-rose-300'
                                : 'bg-emerald-600/15 text-emerald-300'
                            }`}
                          >
                            {inspection.result}
                          </span>
                          {inspection.failedItemCount > 0 ? (
                            <span className="text-slate-300">Failed Items: {inspection.failedItemCount}</span>
                          ) : null}
                          {inspection.defectCount > 0 ? (
                            <span className="text-amber-300">Created Defects: {inspection.defectCount}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        inspection.status === 'Completed'
                          ? 'bg-emerald-600/15 text-emerald-300'
                          : inspection.status === 'In Progress' && inspection.isOverdue
                            ? 'bg-rose-600/15 text-rose-300'
                            : inspection.status === 'In Progress'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {inspection.status === 'In Progress' && inspection.isOverdue ? 'Overdue' : inspection.status}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-300">No inspections have been started yet.</div>
            )}
          </div>
        </section>
      </div>

      {isTemplateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-lg rounded-[28px] bg-slate-900 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-xl font-semibold text-white">Choose Inspection Template</h2>

            <label className="mt-5 block">
              <span className="text-sm text-slate-300">Template</span>
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className={inputClass}
                disabled={starting}
              >
                {assignedTemplates.map((template) => (
                  <option key={template.templateId} value={template.templateId} disabled={template.isLocked}>
                    {template.templateName}
                  </option>
                ))}
              </select>
            </label>

            {selectedTemplateId ? (
              (() => {
                const selected = assignedTemplates.find((template) => template.templateId === selectedTemplateId)
                if (!selected?.isLocked || !selected.lockMessage) return null
                return <p className="mt-3 text-sm text-amber-300">{selected.lockMessage}</p>
              })()
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="rounded-3xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                disabled={starting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void startInspection(selectedTemplateId)
                }}
                disabled={!canStartWithSelection}
                className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {starting ? 'Starting...' : 'Start'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
