'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { formatInspectionDateTime } from '@/lib/inspectionTime'
import { supabaseClient } from '@/lib/supabase'

type DefectSeverity = 'Low' | 'Medium' | 'High' | 'Critical'
type DefectStatus = 'Open' | 'In Progress' | 'Awaiting Parts' | 'Resolved' | 'Closed'

type DefectDetails = {
  id: string
  title: string
  description: string | null
  severity: DefectSeverity
  status: DefectStatus
  assignedTo: string | null
  assignedToName: string
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  resolvedBy: string | null
  resolvedByName: string | null
  resolutionNotes: string | null
  machine: { id: string; name: string; area: string; assetId: string | null } | null
  inspection: { id: string; templateName: string; status: string; startedAt: string | null; completedAt: string | null } | null
  inspectionItem: { id: string; question: string; answer: string | null; comments: string | null; questionType: string } | null
  timeline: Array<{ key: string; label: string; at: string | null; by: string | null }>
}

type DefectPayload = {
  options: {
    statuses: DefectStatus[]
    severities: DefectSeverity[]
    users: Array<{ userId: string; name: string }>
  }
  defect: DefectDetails
}

async function getToken(): Promise<string | null> {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

function formatDate(value: string | null) {
  return formatInspectionDateTime(value)
}

export default function DefectDetailsPage() {
  const params = useParams<{ defectId: string }>()
  const defectId = params.defectId

  const [defect, setDefect] = useState<DefectDetails | null>(null)
  const [statuses, setStatuses] = useState<DefectStatus[]>([])
  const [severities, setSeverities] = useState<DefectSeverity[]>([])
  const [users, setUsers] = useState<Array<{ userId: string; name: string }>>([])

  const [status, setStatus] = useState<DefectStatus>('Open')
  const [severity, setSeverity] = useState<DefectSeverity>('Medium')
  const [assignedTo, setAssignedTo] = useState('')
  const [resolutionNotes, setResolutionNotes] = useState('')

  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const inputClass =
    'mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20'

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch(`/api/defects/${encodeURIComponent(defectId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = (await response.json()) as DefectPayload & { error?: string }

      if (!response.ok) {
        setError(payload.error || 'Failed to load defect details.')
        return
      }

      setDefect(payload.defect)
      setStatuses(payload.options.statuses)
      setSeverities(payload.options.severities)
      setUsers(payload.options.users)

      setStatus(payload.defect.status)
      setSeverity(payload.defect.severity)
      setAssignedTo(payload.defect.assignedTo ?? '')
      setResolutionNotes(payload.defect.resolutionNotes ?? '')
    } catch {
      setError('Failed to load defect details.')
    } finally {
      setIsLoading(false)
    }
  }, [defectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const hasChanges = useMemo(() => {
    if (!defect) return false

    return (
      status !== defect.status ||
      severity !== defect.severity ||
      assignedTo !== (defect.assignedTo ?? '') ||
      resolutionNotes !== (defect.resolutionNotes ?? '')
    )
  }, [assignedTo, defect, resolutionNotes, severity, status])

  const handleSave = async () => {
    if (!defect || !hasChanges || saving) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch(`/api/defects/${encodeURIComponent(defect.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status,
          severity,
          assigned_to: assignedTo || null,
          resolution_notes: resolutionNotes || null,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'Failed to save defect updates.')
        return
      }

      setSuccess('Defect updated successfully.')
      await load()
    } catch {
      setError('Failed to save defect updates.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-6">
        <div className="mb-6 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)]">
          <Link href="/admin/defects" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700">
            ← Back
          </Link>
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Defect Details</p>
          <h1 className="mt-2 text-2xl font-semibold">{defect?.title ?? 'Defect'}</h1>
        </div>

        {success ? <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">{success}</div> : null}
        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        {isLoading ? (
          <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-center text-slate-400 shadow-xl shadow-black/20">
            <p className="text-sm">Loading defect details...</p>
          </div>
        ) : defect ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
              <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Details</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p><span className="text-slate-500">Machine:</span> {defect.machine?.name ?? 'N/A'}</p>
                <p><span className="text-slate-500">Inspection:</span> {defect.inspection?.id ?? 'N/A'}</p>
                <p><span className="text-slate-500">Question:</span> {defect.inspectionItem?.question ?? 'N/A'}</p>
                <p><span className="text-slate-500">Comments:</span> {defect.inspectionItem?.comments || defect.description || 'N/A'}</p>
                <p><span className="text-slate-500">Photos:</span> Placeholder</p>
                <p><span className="text-slate-500">Status:</span> {defect.status}</p>
                <p><span className="text-slate-500">Severity:</span> {defect.severity}</p>
                <p><span className="text-slate-500">Assigned User:</span> {defect.assignedToName}</p>
                <p><span className="text-slate-500">Resolution Notes:</span> {defect.resolutionNotes || 'N/A'}</p>
              </div>
            </section>

            <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
              <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Edit</h2>

              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-sm text-slate-300">Status</span>
                  <select value={status} onChange={(event) => setStatus(event.target.value as DefectStatus)} className={inputClass}>
                    {statuses.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm text-slate-300">Severity</span>
                  <select value={severity} onChange={(event) => setSeverity(event.target.value as DefectSeverity)} className={inputClass}>
                    {severities.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm text-slate-300">Assigned User</span>
                  <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className={inputClass}>
                    <option value="">Unassigned</option>
                    {users.map((user) => (
                      <option key={user.userId} value={user.userId}>{user.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm text-slate-300">Resolution Notes</span>
                  <textarea
                    rows={4}
                    value={resolutionNotes}
                    onChange={(event) => setResolutionNotes(event.target.value)}
                    className={inputClass}
                    placeholder="Enter notes"
                  />
                </label>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => {
                    void handleSave()
                  }}
                  disabled={!hasChanges || saving}
                  className="w-full rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </section>

            <section className="lg:col-span-2 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
              <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Timeline</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                {defect.timeline.map((entry) => (
                  <div key={entry.key} className="rounded-3xl bg-slate-950/80 px-4 py-3">
                    <p className="font-semibold text-white">{entry.label}</p>
                    <p className="mt-1 text-slate-400">At: {formatDate(entry.at)}</p>
                    <p className="text-slate-400">By: {entry.by || 'N/A'}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  )
}
