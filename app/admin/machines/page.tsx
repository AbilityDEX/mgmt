'use client'

import { useCallback, useEffect, useState } from 'react'
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
  assetId: string
  templateId?: string | null
  inspectionFrequency?: string
  reminderDaysBeforeDue?: number
  gracePeriod?: number
  autoGenerateInspection?: boolean
}

const emptyNew = {
  name: '',
  area: '',
  assignedUser: '',
  inspectionTime: '09:30',
  assetId: '',
  templateId: '',
  inspectionFrequency: 'Monthly',
  reminderDaysBeforeDue: 7,
  gracePeriod: 3,
  autoGenerateInspection: true,
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
  const [newMachine, setNewMachine] = useState(emptyNew)
  const [saving, setSaving] = useState(false)

  const [editState, setEditState] = useState<EditState | null>(null)

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3000)
  }

  const filteredMachines = machines.filter((machine) => {
    if (nameSearch.trim() && !machine.name.toLowerCase().includes(nameSearch.trim().toLowerCase())) return false
    if (assetSearch.trim() && !(machine.assetId ?? '').toLowerCase().includes(assetSearch.trim().toLowerCase())) return false
    return true
  })

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const [machinesResponse, templatesResponse] = await Promise.all([
        fetch('/api/machines', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/machine-inspection-templates?available_only=true', { headers: { Authorization: `Bearer ${token}` } }),
      ])

      const machinesData = await machinesResponse.json()
      const templatesData = await templatesResponse.json()

      if (!machinesResponse.ok) {
        setError(machinesData.error || 'Failed to load machines.')
        return
      }

      if (!templatesResponse.ok) {
        setError(templatesData.error || 'Failed to load templates.')
        return
      }

      setMachines(machinesData.machines ?? [])
      setTemplates(templatesData.templates ?? [])
    } catch {
      setError('Failed to load data.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const handleAdd = async () => {
    if (!newMachine.name.trim()) {
      setError('Machine name is required.')
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

      const res = await fetch('/api/machines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newMachine.name.trim(),
          area: newMachine.area,
          assigned_user: newMachine.assignedUser,
          inspection_deadline: newMachine.inspectionTime,
          asset_id: newMachine.assetId,
          template_id: newMachine.templateId?.trim() ? newMachine.templateId.trim() : null,
          inspection_frequency: newMachine.inspectionFrequency || 'Monthly',
          reminder_days_before_due: newMachine.reminderDaysBeforeDue ?? 7,
          grace_period: newMachine.gracePeriod ?? 3,
          auto_generate_inspection: newMachine.autoGenerateInspection ?? true,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create machine.')
        return
      }

      setMachines((prev) => [...prev, data.machine])
      setNewMachine(emptyNew)
      setIsAddOpen(false)
      showSuccess('Machine created.')
    } catch {
      setError('Failed to create machine.')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
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
          reminder_days_before_due: editState.reminderDaysBeforeDue ?? 7,
          grace_period: editState.gracePeriod ?? 3,
          auto_generate_inspection: editState.autoGenerateInspection ?? true,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to update machine.')
        return
      }
      setMachines((prev) => prev.map((m) => (m.id === editState.id ? data.machine : m)))
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

  const inputClass = 'mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20'

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
              setIsAddOpen(true)
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
                    onClick: () =>
                      setEditState({
                        id: machine.id,
                        name: machine.name,
                        area: machine.area,
                        assignedUser: machine.assignedUser,
                        inspectionDeadline: machine.inspectionDeadline,
                        assetId: machine.assetId ?? '',
                        templateId: machine.templateId ?? '',
                        reminderDaysBeforeDue: machine.reminderDaysBeforeDue ?? 7,
                        gracePeriod: machine.gracePeriod ?? 3,
                        autoGenerateInspection: machine.autoGenerateInspection ?? true,
                      }),
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

      {isAddOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-lg rounded-[28px] bg-slate-900 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-xl font-semibold text-white">Add Machine</h2>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm text-slate-300">Machine Name</span>
                <input type="text" value={newMachine.name} onChange={(e) => setNewMachine((p) => ({ ...p, name: e.target.value }))} placeholder="Enter machine name" className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Work Area</span>
                <input type="text" value={newMachine.area} onChange={(e) => setNewMachine((p) => ({ ...p, area: e.target.value }))} placeholder="Enter work area" className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Assigned User (username)</span>
                <input type="text" value={newMachine.assignedUser} onChange={(e) => setNewMachine((p) => ({ ...p, assignedUser: e.target.value }))} placeholder="Enter username" className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Inspection Time</span>
                <input type="time" value={newMachine.inspectionTime} onChange={(e) => setNewMachine((p) => ({ ...p, inspectionTime: e.target.value }))} className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Asset ID (optional)</span>
                <input type="text" value={newMachine.assetId} onChange={(e) => setNewMachine((p) => ({ ...p, assetId: e.target.value }))} className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Inspection Template (optional)</span>
                <select value={newMachine.templateId} onChange={(e) => setNewMachine((p) => ({ ...p, templateId: e.target.value }))} className={inputClass}>
                  <option value="">Select a template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Inspection Frequency</span>
                <select value={newMachine.inspectionFrequency} onChange={(e) => setNewMachine((p) => ({ ...p, inspectionFrequency: e.target.value }))} className={inputClass}>
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Fortnightly">Fortnightly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Six Monthly">Six Monthly</option>
                  <option value="Annually">Annually</option>
                  <option value="Custom">Custom</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Reminder Days Before Due</span>
                <input type="number" min="0" value={newMachine.reminderDaysBeforeDue ?? 7} onChange={(e) => setNewMachine((p) => ({ ...p, reminderDaysBeforeDue: parseInt(e.target.value) || 0 }))} className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Grace Period (days)</span>
                <input type="number" min="0" value={newMachine.gracePeriod ?? 3} onChange={(e) => setNewMachine((p) => ({ ...p, gracePeriod: parseInt(e.target.value) || 0 }))} className={inputClass} />
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={newMachine.autoGenerateInspection ?? true} onChange={(e) => setNewMachine((p) => ({ ...p, autoGenerateInspection: e.target.checked }))} className="rounded border border-slate-700" />
                <span className="text-sm text-slate-300">Auto Generate Next Inspection</span>
              </label>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setIsAddOpen(false)} className="rounded-3xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800">Cancel</button>
              <button type="button" onClick={() => { void handleAdd() }} disabled={saving} className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-lg rounded-[28px] bg-slate-900 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-xl font-semibold text-white">Edit Machine</h2>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm text-slate-300">Machine Name</span>
                <input type="text" value={editState.name} onChange={(e) => setEditState((p) => (p ? { ...p, name: e.target.value } : p))} className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Work Area</span>
                <input type="text" value={editState.area} onChange={(e) => setEditState((p) => (p ? { ...p, area: e.target.value } : p))} className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Assigned User (username)</span>
                <input type="text" value={editState.assignedUser} onChange={(e) => setEditState((p) => (p ? { ...p, assignedUser: e.target.value } : p))} className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Inspection Time</span>
                <input type="time" value={editState.inspectionDeadline} onChange={(e) => setEditState((p) => (p ? { ...p, inspectionDeadline: e.target.value } : p))} className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Asset ID (optional)</span>
                <input type="text" value={editState.assetId} onChange={(e) => setEditState((p) => (p ? { ...p, assetId: e.target.value } : p))} className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Inspection Template (optional)</span>
                <select value={editState.templateId ?? ''} onChange={(e) => setEditState((p) => (p ? { ...p, templateId: e.target.value } : p))} className={inputClass}>
                  <option value="">Select a template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Inspection Frequency</span>
                <select value={editState.inspectionFrequency ?? 'Monthly'} onChange={(e) => setEditState((p) => (p ? { ...p, inspectionFrequency: e.target.value } : p))} className={inputClass}>
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Fortnightly">Fortnightly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Six Monthly">Six Monthly</option>
                  <option value="Annually">Annually</option>
                  <option value="Custom">Custom</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Reminder Days Before Due</span>
                <input type="number" min="0" value={editState.reminderDaysBeforeDue ?? 7} onChange={(e) => setEditState((p) => (p ? { ...p, reminderDaysBeforeDue: parseInt(e.target.value) || 0 } : p))} className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Grace Period (days)</span>
                <input type="number" min="0" value={editState.gracePeriod ?? 3} onChange={(e) => setEditState((p) => (p ? { ...p, gracePeriod: parseInt(e.target.value) || 0 } : p))} className={inputClass} />
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={editState.autoGenerateInspection ?? true} onChange={(e) => setEditState((p) => (p ? { ...p, autoGenerateInspection: e.target.checked } : p))} className="rounded border border-slate-700" />
                <span className="text-sm text-slate-300">Auto Generate Next Inspection</span>
              </label>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setEditState(null)} className="rounded-3xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800">Cancel</button>
              <button type="button" onClick={() => { void handleEdit() }} disabled={saving} className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
