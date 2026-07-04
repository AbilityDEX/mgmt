'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import MachineCard from '@/components/MachineCard'
import { supabaseClient } from '@/lib/supabase'
import type { Machine } from '@/lib/data/machines'

type EditState = {
  id: string
  name: string
  area: string
  assignedUser: string
  inspectionDeadline: string
  unlockTime?: string
  assetId: string
  templateId?: string | null
  inspectionFrequency?: string
  reminderDaysBeforeDue?: number
  autoGenerateInspection?: boolean
  customIntervalValue?: number
  customIntervalUnit?: string | null
}

const emptyNew = {
  name: '',
  area: '',
  assignedUser: '',
  inspectionTime: '09:30',
  unlockTime: '07:00',
  assetId: '',
  templateId: '',
  inspectionFrequency: 'Monthly',
  reminderDaysBeforeDue: 7,
  autoGenerateInspection: true,
  customIntervalValue: 1,
  customIntervalUnit: 'Days',
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatSchedulePreview(
  frequency: string | undefined,
  customIntervalValue?: number,
  customIntervalUnit?: string | null
) {
  switch (frequency) {
    case 'Daily':
      return 'Next inspection is scheduled for each day and must be completed by the configured inspection time. "Due Soon" is not used for Daily schedules.'
    case 'Weekly':
      return 'Next inspection is scheduled every week.'
    case 'Fortnightly':
      return 'Next inspection is scheduled every fortnight.'
    case 'Monthly':
      return 'Next inspection is scheduled every month.'
    case 'Quarterly':
      return 'Next inspection is scheduled every quarter.'
    case 'Six Monthly':
      return 'Next inspection is scheduled every six months.'
    case 'Annually':
      return 'Next inspection is scheduled every year.'
    case 'Custom': {
      const intervalValue = customIntervalValue ?? 1
      const intervalUnit = customIntervalUnit ?? 'Days'
      const unitLabel = intervalValue === 1 ? intervalUnit.replace(/s$/, '').toLowerCase() : intervalUnit.toLowerCase()
      return `Next inspection every ${intervalValue} ${unitLabel}.`
    }
    default:
      return 'Next inspection timing updates as soon as you save this machine.'
  }
}

type ModalFrameProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  titleId: string
}

function ModalFrame({ open, title, onClose, children, footer, titleId }: ModalFrameProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [isRendered, setIsRendered] = useState(open)
  const [isEntering, setIsEntering] = useState(open)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setIsRendered(true)
      setIsEntering(true)
      setIsClosing(false)

      const animationFrame = window.requestAnimationFrame(() => {
        setIsEntering(false)
      })

      return () => {
        window.cancelAnimationFrame(animationFrame)
      }
    }

    if (isRendered) {
      setIsClosing(true)
      const timeout = window.setTimeout(() => {
        setIsRendered(false)
      }, 180)

      return () => {
        window.clearTimeout(timeout)
      }
    }

    return undefined
  }, [isRendered, open])

  useEffect(() => {
    if (!isRendered) return

    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.overscrollBehavior = 'none'

    const focusFirstControl = () => {
      const focusableElements = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      focusableElements?.[0]?.focus() ?? panelRef.current?.focus()
    }

    const animationFrame = window.requestAnimationFrame(focusFirstControl)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return

      const focusableElements = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1)

      if (focusableElements.length === 0) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement as HTMLElement | null

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll
    }
  }, [isRendered, onClose])

  if (!isRendered) return null

  return (
    <div
      className={`fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-200 ${
        isEntering || isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={onClose}
      role="presentation"
    >
      <div className="flex min-h-[100dvh] items-start justify-center px-0 py-0 sm:px-4 sm:py-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`flex w-full max-w-2xl flex-col bg-slate-900 shadow-[0_30px_80px_rgba(0,0,0,0.45)] max-h-[100dvh] overflow-x-hidden overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] transition-all duration-200 sm:max-h-[calc(100dvh-2rem)] sm:rounded-[28px] ${
            isEntering || isClosing ? 'translate-y-2 scale-[0.985] opacity-0' : 'translate-y-0 scale-100 opacity-100'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-900/95 px-4 py-4 backdrop-blur sm:px-6">
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Machine Management</p>
            <h2 id={titleId} className="mt-2 text-xl font-semibold text-white sm:text-2xl">
              {title}
            </h2>
          </div>
          {children}
          <div className="sticky bottom-0 z-20 border-t border-slate-800/80 bg-slate-900/95 px-4 py-4 backdrop-blur sm:px-6">
            {footer}
          </div>
        </div>
      </div>
    </div>
  )
}

type Template = {
  id: string
  name: string
  description: string | null
}

async function getToken(): Promise<string | null> {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function AdminMachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [nameSearch, setNameSearch] = useState('')
  const [assetSearch, setAssetSearch] = useState('')

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [newMachine, setNewMachine] = useState(emptyNew)
  const [saving, setSaving] = useState(false)

  const [editState, setEditState] = useState<EditState | null>(null)
  const [isSchedulingExpanded, setIsSchedulingExpanded] = useState(true)

  const addModalTitleId = 'add-machine-modal-title'
  const editModalTitleId = 'edit-machine-modal-title'

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3000)
  }

  const filteredMachines = machines.filter((machine) => {
    if (nameSearch.trim() && !machine.name.toLowerCase().includes(nameSearch.trim().toLowerCase())) return false
    if (assetSearch.trim() && !(machine.assetId ?? '').toLowerCase().includes(assetSearch.trim().toLowerCase())) return false
    return true
  })

  const addSchedulePreview = useMemo(
    () =>
      formatSchedulePreview(
        newMachine.inspectionFrequency,
        newMachine.customIntervalValue,
        newMachine.customIntervalUnit
      ),
    [newMachine.customIntervalUnit, newMachine.customIntervalValue, newMachine.inspectionFrequency]
  )

  const editSchedulePreview = useMemo(
    () =>
      formatSchedulePreview(
        editState?.inspectionFrequency,
        editState?.customIntervalValue,
        editState?.customIntervalUnit
      ),
    [editState?.customIntervalUnit, editState?.customIntervalValue, editState?.inspectionFrequency]
  )

  const openAddModal = useCallback(() => {
    setIsSchedulingExpanded(true)
    setIsAddOpen(true)
  }, [])

  const openEditModal = useCallback((machine: Machine) => {
    const existingDraft = editState && editState.id === machine.id ? editState : null

    setEditState(
      existingDraft ?? {
        id: machine.id,
        name: machine.name,
        area: machine.area,
        assignedUser: machine.assignedUser,
        inspectionDeadline: machine.inspectionDeadline,
        unlockTime: '07:00',
        assetId: machine.assetId ?? '',
        templateId: machine.templateId ?? '',
        inspectionFrequency: machine.inspectionFrequency ?? 'Monthly',
        reminderDaysBeforeDue: machine.reminderDaysBeforeDue ?? 7,
        autoGenerateInspection: machine.autoGenerateInspection ?? true,
        customIntervalValue: machine.customIntervalValue ?? 1,
        customIntervalUnit: machine.customIntervalUnit ?? 'Days',
      }
    )
    setIsSchedulingExpanded(true)
    setIsEditOpen(true)
  }, [editState])

  const closeAddModal = useCallback(() => {
    setIsAddOpen(false)
  }, [])

  const cancelEditModal = useCallback(() => {
    setIsEditOpen(false)
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-[16px] border border-slate-800 bg-slate-950/80 p-4">
                        <label className="block">
                          <span className="text-sm font-medium text-slate-200">📅 Frequency</span>
                          <select
                            value={editState.inspectionFrequency ?? 'Monthly'}
                            onChange={(event) =>
                              setEditState((previous) =>
                                previous
                                  ? {
                                      ...previous,
                                      inspectionFrequency: event.target.value,
                                      reminderDaysBeforeDue: event.target.value === 'Daily' ? 0 : (previous.reminderDaysBeforeDue ?? 7),
                                    }
                                  : previous
                              )
                            }
                            className={inputClass}
                          >
                            <option value="Daily">Daily</option>
                            <option value="Weekly">Weekly</option>
                            <option value="Fortnightly">Fortnightly</option>
                            <option value="Monthly">Monthly</option>
                            <option value="Quarterly">Quarterly</option>
                            <option value="Six Monthly">Six Monthly</option>
                            <option value="Annually">Annually</option>
                            <option value="Custom">Custom</option>
                          </select>
                          <p className="mt-2 text-sm text-slate-400">Controls how often inspections become due for this machine.</p>
                        </label>
                      </div>

                      <div className="rounded-[16px] border border-slate-800 bg-slate-950/80 p-4">
                        <label className="block">
                          <span className="text-sm font-medium text-slate-200">🔓 Inspection Unlock Time</span>
                          <input
                            type="time"
                            value={editState.unlockTime ?? '07:00'}
                            onChange={(event) => setEditState((previous) => (previous ? { ...previous, unlockTime: event.target.value } : previous))}
                            className={inputClass}
                          />
                          <p className="mt-2 text-sm text-slate-400">The inspection becomes available at this time for operators to start.</p>
                        </label>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-[16px] border border-slate-800 bg-slate-950/80 p-4">
                        <label className="block">
                          <span className="text-sm font-medium text-slate-200">⏰ Completion Deadline</span>
                          <input
                            type="time"
                            value={editState.inspectionDeadline}
                            onChange={(event) => setEditState((previous) => (previous ? { ...previous, inspectionDeadline: event.target.value } : previous))}
                            className={inputClass}
                          />
                          <p className="mt-2 text-sm text-slate-400">If not completed by this time the inspection becomes overdue.</p>
                        </label>
                      </div>

                      <div className="rounded-[16px] border border-slate-800 bg-slate-950/80 p-4">
                        <label className="block">
                          <span className="text-sm font-medium text-slate-200">📧 Reminder</span>
                          {editState.inspectionFrequency === 'Daily' ? (
                            <p className="mt-2 text-sm text-slate-400">Reminders are not used for Daily schedules.</p>
                          ) : (
                            <div className="mt-2">
                              <input
                                type="number"
                                min="0"
                                max="365"
                                inputMode="numeric"
                                value={editState.reminderDaysBeforeDue ?? 7}
                                onChange={(event) => {
                                  const nextValue = event.target.value === '' ? 0 : clampNumber(Number.parseInt(event.target.value, 10) || 0, 0, 365)
                                  setEditState((previous) => (previous ? { ...previous, reminderDaysBeforeDue: nextValue } : previous))
                                }}
                                className={inputClass}
                              />
                              <p className="mt-2 text-sm text-slate-400">Users receive reminders this many days before the inspection becomes due. Set to 0 to send at the deadline.</p>
                            </div>
                          )}
                        </label>
                      </div>
                    </div>

                    <div className="rounded-[16px] border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">👁</span>
                        <div>
                          <div className="font-semibold">Schedule Preview</div>
                          <div className="mt-1 text-sm text-emerald-100">
                            <div>Inspection becomes available: Every {editState.inspectionFrequency ?? '—'} at {editState.unlockTime ?? '07:00'}</div>
                            {editState.inspectionDeadline ? (
                              <div className="mt-1">Inspection becomes overdue: {editState.inspectionDeadline}</div>
                            ) : (
                              <div className="mt-1 text-slate-300">No completion deadline configured. Inspection will never become overdue.</div>
                            )}
                            {editState.inspectionDeadline && editState.inspectionFrequency !== 'Daily' ? (
                              <div className="mt-1">Reminder: {editState.reminderDaysBeforeDue} day(s) before deadline</div>
                            ) : null}
                            <div className="mt-2 text-xs text-emerald-200">Workflow: Locked ↓ Due ↓ Overdue ↓ Completed</div>
                          </div>
                        </div>
                      </div>
                    </div>
    if (!editState) return

    setSaving(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }
      const res = await fetch('/api/machines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: editState.id,
          name: editState.name,
          area: editState.area,
          assigned_user: editState.assignedUser,
          inspection_deadline: editState.inspectionDeadline,
          asset_id: editState.assetId,
          template_id: editState.templateId === undefined ? undefined : editState.templateId?.trim() ? editState.templateId.trim() : null,
          inspection_frequency: editState.inspectionFrequency || 'Monthly',
          reminder_days_before_due:
            editState.inspectionFrequency === 'Daily' ? 0 : (editState.reminderDaysBeforeDue ?? 7),
          auto_generate_inspection: editState.autoGenerateInspection ?? true,
          custom_interval_value:
            editState.inspectionFrequency === 'Custom' ? clampNumber(editState.customIntervalValue ?? 1, 1, Number.MAX_SAFE_INTEGER) : null,
          custom_interval_unit: editState.inspectionFrequency === 'Custom' ? editState.customIntervalUnit ?? 'Days' : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to update machine.')
        return
      }
      setMachines((prev) => prev.map((m) => (m.id === editState.id ? data.machine : m)))
      setIsEditOpen(false)
      setEditState(null)
      showSuccess('Machine updated.')
    } catch {
      setError('Failed to update machine.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (machineId: string) => {
    setError(null)
    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }
      const res = await fetch('/api/machines', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: machineId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to delete machine.')
        return
      }
      setMachines((prev) => prev.filter((m) => m.id !== machineId))
      showSuccess('Machine deleted.')
    } catch {
      setError('Failed to delete machine.')
    }
  }

  const inputClass =
    'mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3.5 text-[15px] text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20'

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <div className="mb-6 flex flex-col gap-4 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/admin" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700 sm:mb-0">
              ← Back
            </Link>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Machine Management</p>
            <h1 className="mt-2 text-2xl font-semibold">Machines</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              openAddModal()
              setError(null)
            }}
            className="rounded-3xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500"
          >
            + Add Machine
          </button>
        </div>

        {success ? <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">{success}</div> : null}
        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        <section className="mb-5 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Filters</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm text-slate-300">Machine Name</span>
              <input
                type="text"
                value={nameSearch}
                onChange={(event) => setNameSearch(event.target.value)}
                placeholder="Search by machine name"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm text-slate-300">Asset ID</span>
              <input
                type="text"
                value={assetSearch}
                onChange={(event) => setAssetSearch(event.target.value)}
                placeholder="Search by asset ID"
                className={inputClass}
              />
            </label>
          </div>
        </section>

        <div className="space-y-4">
          {isLoading ? (
            <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-center text-slate-400 shadow-xl shadow-black/20">
              <p className="text-sm">Loading machines...</p>
            </div>
          ) : filteredMachines.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredMachines.map((machine) => (
                <MachineCard
                  key={machine.id}
                  machine={machine}
                  titleHref={`/admin/machines/${machine.id}`}
                  primaryAction={{
                    label: 'Edit',
                    variant: 'secondary',
                    onClick: () => openEditModal(machine),
                  }}
                  secondaryAction={{
                    label: 'Delete',
                    variant: 'danger',
                    onClick: () => {
                      void handleDelete(machine.id)
                    },
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-center text-slate-300 shadow-xl shadow-black/20">
              <p className="text-sm">No machines found. Add one to get started.</p>
            </div>
          )}
        </div>
      </div>

      <ModalFrame
        open={isAddOpen}
        title="Add Machine"
        titleId={addModalTitleId}
        onClose={closeAddModal}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={closeAddModal}
              className="rounded-3xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void handleAdd()
              }}
              disabled={saving}
              className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        }
      >
        <div className="flex-1 px-4 py-5 sm:px-6">
          <div className="space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Machine Name</span>
              <input
                type="text"
                value={newMachine.name}
                onChange={(event) => setNewMachine((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="Enter machine name"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Work Area</span>
              <input
                type="text"
                value={newMachine.area}
                onChange={(event) => setNewMachine((previous) => ({ ...previous, area: event.target.value }))}
                placeholder="Enter work area"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Assigned User (username)</span>
              <input
                type="text"
                value={newMachine.assignedUser}
                onChange={(event) => setNewMachine((previous) => ({ ...previous, assignedUser: event.target.value }))}
                placeholder="Enter username"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Inspection Time</span>
              <input
                type="time"
                value={newMachine.inspectionTime}
                onChange={(event) => setNewMachine((previous) => ({ ...previous, inspectionTime: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Asset ID (optional)</span>
              <input
                type="text"
                value={newMachine.assetId}
                onChange={(event) => setNewMachine((previous) => ({ ...previous, assetId: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Inspection Template (optional)</span>
              <select
                value={newMachine.templateId}
                onChange={(event) => setNewMachine((previous) => ({ ...previous, templateId: event.target.value }))}
                className={inputClass}
              >
                <option value="">Select a template...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>

            <section className="rounded-[24px] border border-slate-800 bg-slate-950/60 p-4 sm:p-5">
              <button
                type="button"
                onClick={() => setIsSchedulingExpanded((previous) => !previous)}
                className="flex w-full items-center justify-between gap-4 text-left"
                aria-expanded={isSchedulingExpanded}
              >
                <div>
                  <p className="text-sm font-semibold text-white">Inspection Schedule</p>
                  <p className="mt-1 text-sm text-slate-400">Controls when staff can start inspections, when they're due, and when reminders are sent.</p>
                </div>
                <span className="text-sm font-semibold text-emerald-400">{isSchedulingExpanded ? '▲' : '▼'}</span>
              </button>

              {isSchedulingExpanded ? (
                <div className="mt-5 space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-[16px] border border-slate-800 bg-slate-950/80 p-4">
                      <label className="block">
                        <span className="text-sm font-medium text-slate-200">📅 Frequency</span>
                        <select
                          value={newMachine.inspectionFrequency}
                          onChange={(event) =>
                            setNewMachine((previous) => ({
                              ...previous,
                              inspectionFrequency: event.target.value,
                              reminderDaysBeforeDue: event.target.value === 'Daily' ? 0 : (previous.reminderDaysBeforeDue ?? 7),
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="Daily">Daily</option>
                          <option value="Weekly">Weekly</option>
                          <option value="Fortnightly">Fortnightly</option>
                          <option value="Monthly">Monthly</option>
                          <option value="Quarterly">Quarterly</option>
                          <option value="Six Monthly">Six Monthly</option>
                          <option value="Annually">Annually</option>
                          <option value="Custom">Custom</option>
                        </select>
                        <p className="mt-2 text-sm text-slate-400">Controls how often inspections become due for this machine.</p>
                      </label>
                    </div>

                    <div className="rounded-[16px] border border-slate-800 bg-slate-950/80 p-4">
                      <label className="block">
                        <span className="text-sm font-medium text-slate-200">🔓 Inspection Unlock Time</span>
                        <input
                          type="time"
                          value={newMachine.unlockTime}
                          onChange={(event) => setNewMachine((previous) => ({ ...previous, unlockTime: event.target.value }))}
                          className={inputClass}
                        />
                        <p className="mt-2 text-sm text-slate-400">The inspection becomes available at this time for operators to start.</p>
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-[16px] border border-slate-800 bg-slate-950/80 p-4">
                      <label className="block">
                        <span className="text-sm font-medium text-slate-200">⏰ Completion Deadline</span>
                        <input
                          type="time"
                          value={newMachine.inspectionTime}
                          onChange={(event) => setNewMachine((previous) => ({ ...previous, inspectionTime: event.target.value }))}
                          className={inputClass}
                        />
                        <p className="mt-2 text-sm text-slate-400">If not completed by this time the inspection becomes overdue.</p>
                      </label>
                    </div>

                    <div className="rounded-[16px] border border-slate-800 bg-slate-950/80 p-4">
                      <label className="block">
                        <span className="text-sm font-medium text-slate-200">📧 Reminder</span>
                        {newMachine.inspectionFrequency === 'Daily' ? (
                          <p className="mt-2 text-sm text-slate-400">Reminders are not used for Daily schedules.</p>
                        ) : (
                          <div className="mt-2">
                            <input
                              type="number"
                              min="0"
                              max="365"
                              inputMode="numeric"
                              value={newMachine.reminderDaysBeforeDue ?? 7}
                              onChange={(event) => {
                                const nextValue = event.target.value === '' ? 0 : clampNumber(Number.parseInt(event.target.value, 10) || 0, 0, 365)
                                setNewMachine((previous) => ({ ...previous, reminderDaysBeforeDue: nextValue }))
                              }}
                              className={inputClass}
                            />
                            <p className="mt-2 text-sm text-slate-400">Users receive reminders this many days before the inspection becomes due. Set to 0 to send at the deadline.</p>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">👁</span>
                      <div>
                        <div className="font-semibold">Schedule Preview</div>
                        <div className="mt-1 text-sm text-emerald-100">
                          <div>Inspection becomes available: Every {newMachine.inspectionFrequency} at {newMachine.unlockTime}</div>
                          {newMachine.inspectionTime ? (
                            <div className="mt-1">Inspection becomes overdue: {newMachine.inspectionTime}</div>
                          ) : (
                            <div className="mt-1 text-slate-300">No completion deadline configured. Inspection will never become overdue.</div>
                          )}
                          {newMachine.inspectionTime && newMachine.inspectionFrequency !== 'Daily' ? (
                            <div className="mt-1">Reminder: {newMachine.reminderDaysBeforeDue} day(s) before deadline</div>
                          ) : null}
                          <div className="mt-2 text-xs text-emerald-200">Workflow: Locked ↓ Due ↓ Overdue ↓ Completed</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </ModalFrame>

      {isEditOpen && editState ? (
        <ModalFrame
          open={isEditOpen}
          title="Edit Machine"
          titleId={editModalTitleId}
          onClose={closeEditModal}
          footer={
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={cancelEditModal}
                className="rounded-3xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleEdit()
                }}
                disabled={saving}
                className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          }
        >
          <div className="flex-1 px-4 py-5 sm:px-6">
            <div className="space-y-5">
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Machine Name</span>
                <input
                  type="text"
                  value={editState.name}
                  onChange={(event) => setEditState((previous) => (previous ? { ...previous, name: event.target.value } : previous))}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Work Area</span>
                <input
                  type="text"
                  value={editState.area}
                  onChange={(event) => setEditState((previous) => (previous ? { ...previous, area: event.target.value } : previous))}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Assigned User (username)</span>
                <input
                  type="text"
                  value={editState.assignedUser}
                  onChange={(event) => setEditState((previous) => (previous ? { ...previous, assignedUser: event.target.value } : previous))}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Inspection Time</span>
                <input
                  type="time"
                  value={editState.inspectionDeadline}
                  onChange={(event) => setEditState((previous) => (previous ? { ...previous, inspectionDeadline: event.target.value } : previous))}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Asset ID (optional)</span>
                <input
                  type="text"
                  value={editState.assetId}
                  onChange={(event) => setEditState((previous) => (previous ? { ...previous, assetId: event.target.value } : previous))}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Inspection Template (optional)</span>
                <select
                  value={editState.templateId ?? ''}
                  onChange={(event) => setEditState((previous) => (previous ? { ...previous, templateId: event.target.value } : previous))}
                  className={inputClass}
                >
                  <option value="">Select a template...</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>

              <section className="rounded-[24px] border border-slate-800 bg-slate-950/60 p-4 sm:p-5">
                <button
                  type="button"
                  onClick={() => setIsSchedulingExpanded((previous) => !previous)}
                  className="flex w-full items-center justify-between gap-4 text-left"
                  aria-expanded={isSchedulingExpanded}
                >
                  <div>
                    <p className="text-sm font-semibold text-white">Scheduling</p>
                    <p className="mt-1 text-sm text-slate-400">Controls when this machine becomes due.</p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-400">{isSchedulingExpanded ? '▲' : '▼'}</span>
                </button>

                {isSchedulingExpanded ? (
                  <div className="mt-5 space-y-5">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-200">Inspection Frequency</span>
                      <select
                        value={editState.inspectionFrequency ?? 'Monthly'}
                        onChange={(event) =>
                          setEditState((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  inspectionFrequency: event.target.value,
                                  reminderDaysBeforeDue: event.target.value === 'Daily' ? 0 : (previous.reminderDaysBeforeDue ?? 7),
                                }
                              : previous
                          )
                        }
                        className={inputClass}
                      >
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Fortnightly">Fortnightly</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Six Monthly">Six Monthly</option>
                        <option value="Annually">Annually</option>
                        <option value="Custom">Custom</option>
                      </select>
                      <p className="mt-2 text-sm text-slate-400">Controls how often inspections become due for this machine.</p>
                    </label>

                    {editState.inspectionFrequency !== 'Daily' ? (
                      <label className="block">
                        <span className="text-sm font-medium text-slate-200">Reminder Days Before Due</span>
                        <input
                          type="number"
                          min="0"
                          max="365"
                          inputMode="numeric"
                          value={editState.reminderDaysBeforeDue ?? 7}
                          onChange={(event) => {
                            const nextValue = event.target.value === '' ? 0 : clampNumber(Number.parseInt(event.target.value, 10) || 0, 0, 365)
                            setEditState((previous) => (previous ? { ...previous, reminderDaysBeforeDue: nextValue } : previous))
                          }}
                          className={inputClass}
                        />
                        <p className="mt-2 text-sm text-slate-400">Users receive reminders this many days before the inspection becomes due.</p>
                      </label>
                    ) : null}

                    <label className="flex items-start gap-3 rounded-[20px] border border-slate-800 bg-slate-950/80 px-4 py-4">
                      <input
                        type="checkbox"
                        checked={editState.autoGenerateInspection ?? true}
                        onChange={(event) =>
                          setEditState((previous) =>
                            previous ? { ...previous, autoGenerateInspection: event.target.checked } : previous
                          )
                        }
                        className="mt-1 rounded border border-slate-700"
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-200">Auto Generate Next Inspection</span>
                        <span className="mt-1 block text-sm text-slate-400">Create the next inspection automatically when the current one is completed.</span>
                      </span>
                    </label>

                    {editState.inspectionFrequency === 'Custom' ? (
                      <div className="grid gap-5 md:grid-cols-2">
                        <label className="block">
                          <span className="text-sm font-medium text-slate-200">Custom Interval Value</span>
                          <input
                            type="number"
                            min="1"
                            inputMode="numeric"
                            value={editState.customIntervalValue ?? 1}
                            onChange={(event) => {
                              const nextValue = event.target.value === '' ? 1 : Math.max(1, Number.parseInt(event.target.value, 10) || 1)
                              setEditState((previous) => (previous ? { ...previous, customIntervalValue: nextValue } : previous))
                            }}
                            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-slate-200">Custom Interval Unit</span>
                          <select
                            value={editState.customIntervalUnit ?? 'Days'}
                            onChange={(event) =>
                              setEditState((previous) => (previous ? { ...previous, customIntervalUnit: event.target.value } : previous))
                            }
                            className={inputClass}
                          >
                            <option value="Days">Days</option>
                            <option value="Weeks">Weeks</option>
                            <option value="Months">Months</option>
                          </select>
                        </label>
                      </div>
                    ) : null}

                    <div className="rounded-[20px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
                      {editSchedulePreview}
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </ModalFrame>
      ) : null}
    </main>
  )
}
