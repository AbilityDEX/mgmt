'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { formatInspectionDateTime } from '@/lib/inspectionTime'
import { supabaseClient } from '@/lib/supabase'

type MachineDetails = {
  id: string
  name: string
  area: string
  status: string
}

type AssignmentFrequency =
  | 'Daily'
  | 'Weekly'
  | 'Fortnightly'
  | 'Monthly'
  | 'Quarterly'
  | 'Six Monthly'
  | 'Annually'
  | 'Custom'

type TemplateAssignment = {
  id: string
  machineId: string
  templateId: string
  templateName: string
  inspectionFrequency: AssignmentFrequency
  active: boolean
  createdAt: string
}

type TemplateOption = {
  id: string
  name: string
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

type OpenDefectEntry = {
  id: string
  title: string
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  status: 'Open' | 'In Progress' | 'Awaiting Parts' | 'Resolved' | 'Closed'
  createdAt: string
}

type AssignedTemplateForStart = {
  templateId: string
  templateName: string
  inspectionFrequency: string
  active: boolean
  nextDue: string | null
  isLocked: boolean
  lockMessage: string | null
}

function formatDisplayDate(value: string | null) {
  return formatInspectionDateTime(value)
}

const defaultFrequency: AssignmentFrequency = 'Monthly'

async function getToken(): Promise<string | null> {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function AdminMachineDetailsPage() {
  const params = useParams<{ machineId: string }>()
  const machineId = params.machineId

  const [activeTab, setActiveTab] = useState<'templates' | 'inspections' | 'schedules'>('templates')

  const [machine, setMachine] = useState<MachineDetails | null>(null)
  const [assignments, setAssignments] = useState<TemplateAssignment[]>([])
  const [availableTemplates, setAvailableTemplates] = useState<TemplateOption[]>([])
  const [frequencies, setFrequencies] = useState<AssignmentFrequency[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [selectedFrequency, setSelectedFrequency] = useState<AssignmentFrequency>(defaultFrequency)

  const [inspectionHistory, setInspectionHistory] = useState<InspectionHistoryEntry[]>([])
  const [templatesForStart, setTemplatesForStart] = useState<AssignedTemplateForStart[]>([])
  const [selectedStartTemplateId, setSelectedStartTemplateId] = useState('')
  const [openDefects, setOpenDefects] = useState<OpenDefectEntry[]>([])

  const [schedules, setSchedules] = useState<
    Array<{
      scheduleId: string
      machineTemplateId: string
      templateName: string
      frequency: AssignmentFrequency
      intervalValue: number
      customCron: string | null
      nextDue: string
      lastGenerated: string | null
      lastInspectionCompletedAt: string | null
      openInspectionId: string | null
      status: 'Overdue' | 'Due Soon' | 'Due' | 'Completed'
      active: boolean
      diagnostics: {
        currentTime: string
        inspectionTime: string
        currentStatus: string
        dueSoonTime: string | null
        dueTime: string
        overdueTime: string
        lockUntil: string
        schedulerDecision: string
        apiDecision: string
        dbDecision: string
      }
    }>
  >([])
  const [expandedDiagnosticScheduleId, setExpandedDiagnosticScheduleId] = useState<string | null>(null)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleDeletingId, setScheduleDeletingId] = useState<string | null>(null)
  const [scheduleMachineTemplateId, setScheduleMachineTemplateId] = useState('')
  const [scheduleFrequency, setScheduleFrequency] = useState<AssignmentFrequency>('Monthly')
  const [scheduleIntervalValue, setScheduleIntervalValue] = useState(1)
  const [scheduleCustomCron, setScheduleCustomCron] = useState('')

  const [isLoading, setIsLoading] = useState(true)
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [isStartModalOpen, setIsStartModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const selectedStartTemplate = useMemo(
    () => templatesForStart.find((template) => template.templateId === selectedStartTemplateId) ?? templatesForStart[0] ?? null,
    [selectedStartTemplateId, templatesForStart]
  )
  const hasStartableTemplate = templatesForStart.some((template) => !template.isLocked)
  const allTemplatesLocked = templatesForStart.length > 0 && !hasStartableTemplate
  const startLockMessage =
    allTemplatesLocked && selectedStartTemplate
      ? selectedStartTemplate.lockMessage ??
        (selectedStartTemplate.nextDue ? `Next inspection ${formatDisplayDate(selectedStartTemplate.nextDue)}` : null)
      : null

  const inputClass =
    'mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20'

  const showSuccess = (message: string) => {
    setSuccess(message)
    setTimeout(() => setSuccess(null), 3000)
  }

  const loadTemplateAssignments = useCallback(async () => {
    const token = await getToken()
    if (!token) throw new Error('Authentication required.')

    const response = await fetch(`/api/machine-inspection-templates?machine_id=${encodeURIComponent(machineId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load machine details.')
    }

    setMachine(payload.machine ?? null)
    setAssignments(payload.assignments ?? [])
    setAvailableTemplates(payload.availableTemplates ?? [])
    setFrequencies(payload.frequencies ?? [])

    const defaultTemplateId = payload.availableTemplates?.[0]?.id ?? ''
    if (!selectedTemplateId && defaultTemplateId) {
      setSelectedTemplateId(defaultTemplateId)
    }
  }, [machineId, selectedTemplateId])

  const loadInspectionHistory = useCallback(async () => {
    const token = await getToken()
    if (!token) throw new Error('Authentication required.')

    const response = await fetch(`/api/inspection-executions?machine_id=${encodeURIComponent(machineId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load inspection history.')
    }

    setInspectionHistory(payload.inspections ?? [])
    setTemplatesForStart(
      (payload.assignedTemplates ?? []).map((template: AssignedTemplateForStart) => ({
        ...template,
        nextDue: template.nextDue ?? null,
        isLocked: Boolean(template.isLocked),
        lockMessage: template.lockMessage ?? null,
      }))
    )

    const defaultStartTemplate = payload.assignedTemplates?.[0]?.templateId ?? ''
    if (!selectedStartTemplateId && defaultStartTemplate) {
      setSelectedStartTemplateId(defaultStartTemplate)
    }
  }, [machineId, selectedStartTemplateId])

  const loadOpenDefects = useCallback(async () => {
    const token = await getToken()
    if (!token) throw new Error('Authentication required.')

    const response = await fetch(
      `/api/defects?machine_id=${encodeURIComponent(machineId)}&open_only=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load machine defects.')
    }

    setOpenDefects(payload.defects ?? [])
  }, [machineId])

  const loadSchedules = useCallback(async () => {
    const token = await getToken()
    if (!token) throw new Error('Authentication required.')

    const response = await fetch(`/api/schedules?machine_id=${encodeURIComponent(machineId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load schedules.')
    }

    setSchedules((payload.schedules ?? []).map((row: Record<string, unknown>) => ({
      scheduleId: row.scheduleId as string,
      machineTemplateId: row.machineTemplateId as string,
      templateName: (row.templateName as string) || 'Unnamed Template',
      frequency: row.frequency as AssignmentFrequency,
      intervalValue: (row.intervalValue as number) ?? 1,
      customCron: (row.customCron as string | null) ?? null,
      nextDue: row.nextDue as string,
      lastGenerated: (row.lastGenerated as string | null) ?? null,
      lastInspectionCompletedAt: (row.lastInspectionCompletedAt as string | null) ?? null,
      openInspectionId: (row.openInspectionId as string | null) ?? null,
      status: row.status as 'Overdue' | 'Due Soon' | 'Due' | 'Completed',
      active: Boolean(row.active),
      diagnostics: {
        currentTime: String((row.diagnostics as Record<string, unknown> | undefined)?.currentTime ?? ''),
        inspectionTime: String((row.diagnostics as Record<string, unknown> | undefined)?.inspectionTime ?? ''),
        currentStatus: String((row.diagnostics as Record<string, unknown> | undefined)?.currentStatus ?? ''),
        dueSoonTime: ((row.diagnostics as Record<string, unknown> | undefined)?.dueSoonTime as string | null) ?? null,
        dueTime: String((row.diagnostics as Record<string, unknown> | undefined)?.dueTime ?? ''),
        overdueTime: String((row.diagnostics as Record<string, unknown> | undefined)?.overdueTime ?? ''),
        lockUntil: String((row.diagnostics as Record<string, unknown> | undefined)?.lockUntil ?? ''),
        schedulerDecision: String((row.diagnostics as Record<string, unknown> | undefined)?.schedulerDecision ?? ''),
        apiDecision: String((row.diagnostics as Record<string, unknown> | undefined)?.apiDecision ?? ''),
        dbDecision: String((row.diagnostics as Record<string, unknown> | undefined)?.dbDecision ?? ''),
      },
    })))

    const defaultMachineTemplateId = (payload.schedules ?? [])[0]?.machineTemplateId as string | undefined
    if (!scheduleMachineTemplateId && defaultMachineTemplateId) {
      setScheduleMachineTemplateId(defaultMachineTemplateId)
    }
  }, [machineId, scheduleMachineTemplateId])

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      await Promise.all([
        loadTemplateAssignments(),
        loadInspectionHistory(),
        loadOpenDefects(),
        loadSchedules(),
      ])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load machine details.')
    } finally {
      setIsLoading(false)
    }
  }, [loadInspectionHistory, loadOpenDefects, loadSchedules, loadTemplateAssignments])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const canAssign = useMemo(
    () => Boolean(selectedTemplateId) && Boolean(selectedFrequency) && !saving,
    [saving, selectedFrequency, selectedTemplateId]
  )

  const handleAssign = async () => {
    if (!selectedTemplateId) {
      setError('Please select a template.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/machine-inspection-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          machine_id: machineId,
          template_id: selectedTemplateId,
          inspection_frequency: selectedFrequency,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to assign inspection template.')
        return
      }

      setIsAssignModalOpen(false)
      showSuccess('Template assigned successfully.')
      await load()
    } catch {
      setError('Failed to assign inspection template.')
    } finally {
      setSaving(false)
    }
  }

  const handleStartInspection = async (templateId?: string) => {
    if (starting) return

    setStarting(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/inspection-executions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          machine_id: machineId,
          ...(templateId ? { template_id: templateId } : {}),
        }),
      })

      const payload = await response.json()

      if (!response.ok || !payload.inspection?.id) {
        if (response.status === 409) {
          await loadInspectionHistory()
          const lockError = payload.nextDue
            ? `Next inspection ${formatDisplayDate(payload.nextDue as string)}`
            : payload.error
          setError(lockError || 'Failed to start inspection.')
          return
        }
        setError(payload.error || 'Failed to start inspection.')
        return
      }

      showSuccess('Inspection started.')
      setIsStartModalOpen(false)
      window.location.href = `/inspection/executions/${payload.inspection.id}`
    } catch {
      setError('Failed to start inspection.')
    } finally {
      setStarting(false)
    }
  }

  const handleStartInspectionClick = () => {
    if (templatesForStart.length === 0) {
      setError('No inspection templates assigned.')
      return
    }

    if (templatesForStart.length === 1) {
      void handleStartInspection(templatesForStart[0].templateId)
      return
    }

    setIsStartModalOpen(true)
  }

  const handleRemove = async (assignment: TemplateAssignment) => {
    const confirmed = window.confirm(
      `Remove template "${assignment.templateName}" from ${machine?.name || 'this machine'}?`
    )

    if (!confirmed) return

    setRemovingId(assignment.id)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/machine-inspection-templates', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ assignment_id: assignment.id }),
      })

      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to remove inspection template.')
        return
      }

      showSuccess('Template removed successfully.')
      await load()
    } catch {
      setError('Failed to remove inspection template.')
    } finally {
      setRemovingId(null)
    }
  }

  const openCreateScheduleModal = () => {
    const availableAssignment = assignments.find(
      (assignment) => !schedules.some((schedule) => schedule.machineTemplateId === assignment.id)
    )

    setEditingScheduleId(null)
    setScheduleMachineTemplateId(availableAssignment?.id ?? assignments[0]?.id ?? '')
    setScheduleFrequency((availableAssignment?.inspectionFrequency as AssignmentFrequency | undefined) ?? 'Monthly')
    setScheduleIntervalValue(1)
    setScheduleCustomCron('')
    setIsScheduleModalOpen(true)
  }

  const openEditScheduleModal = (scheduleId: string) => {
    const schedule = schedules.find((row) => row.scheduleId === scheduleId)
    if (!schedule) return

    setEditingScheduleId(schedule.scheduleId)
    setScheduleMachineTemplateId(schedule.machineTemplateId)
    setScheduleFrequency(schedule.frequency)
    setScheduleIntervalValue(schedule.intervalValue)
    setScheduleCustomCron(schedule.customCron ?? '')
    setIsScheduleModalOpen(true)
  }

  const saveSchedule = async () => {
    if (!scheduleMachineTemplateId) {
      setError('Please select a template assignment.')
      return
    }

    if (scheduleFrequency === 'Custom' && !scheduleCustomCron.trim()) {
      setError('Custom cron is required for Custom frequency.')
      return
    }

    setScheduleSaving(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/schedules', {
        method: editingScheduleId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          editingScheduleId
            ? {
                schedule_id: editingScheduleId,
                frequency: scheduleFrequency,
                interval_value: Math.max(1, Math.floor(scheduleIntervalValue || 1)),
                custom_cron: scheduleFrequency === 'Custom' ? scheduleCustomCron.trim() : null,
                active: true,
              }
            : {
                machine_template_id: scheduleMachineTemplateId,
                frequency: scheduleFrequency,
                interval_value: Math.max(1, Math.floor(scheduleIntervalValue || 1)),
                custom_cron: scheduleFrequency === 'Custom' ? scheduleCustomCron.trim() : null,
                active: true,
              }
        ),
      })

      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'Failed to save schedule.')
        return
      }

      setIsScheduleModalOpen(false)
      showSuccess(editingScheduleId ? 'Schedule updated.' : 'Schedule created.')
      await loadSchedules()
    } catch {
      setError('Failed to save schedule.')
    } finally {
      setScheduleSaving(false)
    }
  }

  const setScheduleActiveState = async (scheduleId: string, active: boolean) => {
    setScheduleSaving(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/schedules', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ schedule_id: scheduleId, active }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'Failed to update schedule.')
        return
      }

      showSuccess(active ? 'Schedule resumed.' : 'Schedule paused.')
      await loadSchedules()
    } catch {
      setError('Failed to update schedule.')
    } finally {
      setScheduleSaving(false)
    }
  }

  const deleteSchedule = async (scheduleId: string) => {
    const confirmed = window.confirm('Delete this schedule?')
    if (!confirmed) return

    setScheduleDeletingId(scheduleId)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/schedules', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ schedule_id: scheduleId }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'Failed to delete schedule.')
        return
      }

      showSuccess('Schedule deleted.')
      await loadSchedules()
    } catch {
      setError('Failed to delete schedule.')
    } finally {
      setScheduleDeletingId(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        <div className="mb-6 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)]">
          <Link href="/admin/machines" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700">
            ← Back
          </Link>
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Machine Details</p>
          <h1 className="mt-2 text-2xl font-semibold">{machine?.name ?? 'Machine'}</h1>
          {machine?.area ? <p className="mt-2 text-sm text-slate-400">Work Area: {machine.area}</p> : null}
        </div>

        {success ? <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">{success}</div> : null}
        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        <div className="mb-4 flex gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`rounded-3xl px-4 py-3 text-sm font-semibold transition ${
              activeTab === 'templates'
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
            }`}
          >
            Templates
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('inspections')}
            className={`rounded-3xl px-4 py-3 text-sm font-semibold transition ${
              activeTab === 'inspections'
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
            }`}
          >
            Inspections
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schedules')}
            className={`rounded-3xl px-4 py-3 text-sm font-semibold transition ${
              activeTab === 'schedules'
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
            }`}
          >
            Schedules
          </button>
        </div>

        {activeTab === 'templates' ? (
          <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Inspection Templates</h2>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setIsAssignModalOpen(true)
                }}
                className="rounded-3xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500"
                disabled={isLoading}
              >
                Assign Template
              </button>
            </div>

            {isLoading ? (
              <div className="rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-400">Loading templates...</div>
            ) : assignments.length > 0 ? (
              <div className="space-y-3">
                {assignments.map((assignment) => (
                  <article key={assignment.id} className="rounded-3xl bg-slate-950/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-white">{assignment.templateName}</h3>
                        <p className="mt-1 text-sm text-slate-300">Frequency: {assignment.inspectionFrequency}</p>
                        <span
                          className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            assignment.active
                              ? 'bg-emerald-600/15 text-emerald-300'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {assignment.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void handleRemove(assignment)
                        }}
                        disabled={removingId === assignment.id}
                        className="rounded-2xl bg-rose-600/10 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-600/15 disabled:opacity-60"
                      >
                        {removingId === assignment.id ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl bg-slate-950/80 px-4 py-8 text-center text-slate-300">
                <p className="text-sm">No inspection templates assigned.</p>
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setIsAssignModalOpen(true)
                  }}
                  className="mt-4 rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500"
                >
                  Assign Template
                </button>
              </div>
            )}
          </section>
        ) : activeTab === 'inspections' ? (
          <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Inspections</h2>
              <button
                type="button"
                onClick={handleStartInspectionClick}
                className="rounded-3xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
                disabled={starting || isLoading || templatesForStart.length === 0 || !hasStartableTemplate}
              >
                {starting ? 'Starting...' : !hasStartableTemplate ? 'Locked' : 'Start Inspection'}
              </button>
            </div>

            {allTemplatesLocked && startLockMessage ? <p className="mb-4 text-sm text-amber-300">{startLockMessage}</p> : null}

            {templatesForStart.length === 0 ? (
              <div className="mb-4 rounded-3xl bg-slate-950/80 px-4 py-4 text-sm text-slate-300">
                No inspection templates assigned.
              </div>
            ) : null}

            <div className="space-y-3">
              {isLoading ? (
                <div className="rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-400">Loading inspections...</div>
              ) : inspectionHistory.length > 0 ? (
                inspectionHistory.map((inspection) => (
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

            <div className="mt-6 border-t border-slate-800 pt-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Open Defects</h3>
              <div className="mt-3 space-y-3">
                {isLoading ? (
                  <div className="rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-400">Loading defects...</div>
                ) : openDefects.length > 0 ? (
                  openDefects.map((defect) => (
                    <Link
                      key={defect.id}
                      href={`/admin/defects/${defect.id}`}
                      className="block rounded-3xl bg-slate-950/80 p-4 transition hover:bg-slate-900"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{defect.title}</p>
                          <p className="mt-1 text-xs text-slate-400">Created: {formatDisplayDate(defect.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">
                            {defect.severity}
                          </span>
                          <span className="inline-flex rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">
                            {defect.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-300">
                    No open defects for this machine.
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Scheduled Inspections</h2>
              <button
                type="button"
                onClick={openCreateScheduleModal}
                className="rounded-3xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
                disabled={assignments.length === 0}
              >
                Create Schedule
              </button>
            </div>

            <div className="space-y-3">
              {isLoading ? (
                <div className="rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-400">Loading schedules...</div>
              ) : schedules.length > 0 ? (
                schedules.map((schedule) => (
                  <article key={schedule.scheduleId} className="rounded-3xl bg-slate-950/80 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{schedule.templateName}</p>
                        <p className="mt-1 text-xs text-slate-400">Frequency: {schedule.frequency}</p>
                        <p className="mt-1 text-xs text-slate-400">Next Due: {formatDisplayDate(schedule.nextDue)}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          Last Inspection: {formatDisplayDate(schedule.lastInspectionCompletedAt)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              schedule.status === 'Overdue'
                                ? 'bg-rose-600/15 text-rose-300'
                                : schedule.status === 'Due Soon'
                                  ? 'bg-amber-500/15 text-amber-300'
                                  : schedule.status === 'Due'
                                    ? 'bg-orange-500/15 text-orange-300'
                                    : schedule.status === 'Completed'
                                    ? 'bg-emerald-600/15 text-emerald-300'
                                    : 'bg-emerald-600/15 text-emerald-300'
                            }`}
                          >
                            {schedule.status}
                          </span>
                          {!schedule.active ? (
                            <span className="inline-flex rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">
                              Paused
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {schedule.openInspectionId ? (
                          <Link
                            href={`/inspection/executions/${schedule.openInspectionId}`}
                            className="rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-700"
                          >
                            Open Inspection
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openEditScheduleModal(schedule.scheduleId)}
                          className="rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-700"
                        >
                          Edit Schedule
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedDiagnosticScheduleId((previous) => previous === schedule.scheduleId ? null : schedule.scheduleId)
                          }}
                          className="rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-700"
                        >
                          {expandedDiagnosticScheduleId === schedule.scheduleId ? 'Hide Diagnostics' : 'Diagnostics'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void setScheduleActiveState(schedule.scheduleId, !schedule.active)
                          }}
                          className="rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-700"
                          disabled={scheduleSaving}
                        >
                          {schedule.active ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void deleteSchedule(schedule.scheduleId)
                          }}
                          className="rounded-2xl bg-rose-600/10 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-600/15 disabled:opacity-60"
                          disabled={scheduleDeletingId === schedule.scheduleId}
                        >
                          {scheduleDeletingId === schedule.scheduleId ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    {expandedDiagnosticScheduleId === schedule.scheduleId ? (
                      <div className="mt-3 grid gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-xs md:grid-cols-2">
                        <p className="text-slate-400">Current Time: <span className="text-slate-200">{schedule.diagnostics.currentTime}</span></p>
                        <p className="text-slate-400">Inspection Time: <span className="text-slate-200">{schedule.diagnostics.inspectionTime}</span></p>
                        <p className="text-slate-400">Current Status: <span className="text-slate-200">{schedule.diagnostics.currentStatus}</span></p>
                        <p className="text-slate-400">Due Soon Time: <span className="text-slate-200">{schedule.diagnostics.dueSoonTime ?? 'N/A'}</span></p>
                        <p className="text-slate-400">Due Time: <span className="text-slate-200">{schedule.diagnostics.dueTime}</span></p>
                        <p className="text-slate-400">Overdue Time: <span className="text-slate-200">{schedule.diagnostics.overdueTime}</span></p>
                        <p className="text-slate-400">Lock Until: <span className="text-slate-200">{schedule.diagnostics.lockUntil}</span></p>
                        <p className="text-slate-400">Scheduler Decision: <span className="text-slate-200">{schedule.diagnostics.schedulerDecision}</span></p>
                        <p className="text-slate-400">API Decision: <span className="text-slate-200">{schedule.diagnostics.apiDecision}</span></p>
                        <p className="text-slate-400">DB Decision: <span className="text-slate-200">{schedule.diagnostics.dbDecision}</span></p>
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-300">
                  No schedules yet for this machine.
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {isAssignModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-lg rounded-[28px] bg-slate-900 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-xl font-semibold text-white">Assign Template</h2>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm text-slate-300">Machine</span>
                <input type="text" value={machine?.name ?? ''} readOnly className={inputClass} />
              </label>

              <label className="block">
                <span className="text-sm text-slate-300">Template</span>
                <select
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                  className={inputClass}
                  disabled={saving || availableTemplates.length === 0}
                >
                  {availableTemplates.length === 0 ? (
                    <option value="">No templates available</option>
                  ) : null}
                  {availableTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm text-slate-300">Frequency</span>
                <select
                  value={selectedFrequency}
                  onChange={(event) => setSelectedFrequency(event.target.value as AssignmentFrequency)}
                  className={inputClass}
                  disabled={saving}
                >
                  {frequencies.map((frequency) => (
                    <option key={frequency} value={frequency}>
                      {frequency}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="rounded-3xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleAssign()
                }}
                disabled={!canAssign}
                className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isStartModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-lg rounded-[28px] bg-slate-900 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-xl font-semibold text-white">Choose Inspection Template</h2>

            <label className="mt-5 block">
              <span className="text-sm text-slate-300">Template</span>
              <select
                value={selectedStartTemplateId}
                onChange={(event) => setSelectedStartTemplateId(event.target.value)}
                className={inputClass}
                disabled={starting}
              >
                {templatesForStart.map((template) => (
                  <option key={template.templateId} value={template.templateId}>
                    {template.templateName}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsStartModalOpen(false)}
                className="rounded-3xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                disabled={starting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleStartInspection(selectedStartTemplateId)
                }}
                disabled={!selectedStartTemplateId || starting || templatesForStart.find((template) => template.templateId === selectedStartTemplateId)?.isLocked}
                className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {starting ? 'Starting...' : 'Start'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isScheduleModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-lg rounded-[28px] bg-slate-900 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-xl font-semibold text-white">
              {editingScheduleId ? 'Edit Schedule' : 'Create Schedule'}
            </h2>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm text-slate-300">Template Assignment</span>
                <select
                  value={scheduleMachineTemplateId}
                  onChange={(event) => setScheduleMachineTemplateId(event.target.value)}
                  className={inputClass}
                  disabled={Boolean(editingScheduleId)}
                >
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.templateName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm text-slate-300">Frequency</span>
                <select
                  value={scheduleFrequency}
                  onChange={(event) => setScheduleFrequency(event.target.value as AssignmentFrequency)}
                  className={inputClass}
                >
                  {frequencies.map((frequency) => (
                    <option key={frequency} value={frequency}>
                      {frequency}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm text-slate-300">Interval Value</span>
                <input
                  type="number"
                  min={1}
                  value={scheduleIntervalValue}
                  onChange={(event) => setScheduleIntervalValue(Number(event.target.value) || 1)}
                  className={inputClass}
                />
              </label>

              {scheduleFrequency === 'Custom' ? (
                <label className="block">
                  <span className="text-sm text-slate-300">Custom Cron</span>
                  <input
                    type="text"
                    value={scheduleCustomCron}
                    onChange={(event) => setScheduleCustomCron(event.target.value)}
                    className={inputClass}
                    placeholder="e.g. 0 9 * * 1"
                  />
                </label>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="rounded-3xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                disabled={scheduleSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveSchedule()
                }}
                className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
                disabled={scheduleSaving}
              >
                {scheduleSaving ? 'Saving...' : editingScheduleId ? 'Save Changes' : 'Create Schedule'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
