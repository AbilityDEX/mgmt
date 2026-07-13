'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { formatInspectionDateTime } from '@/lib/inspectionTime'
import { supabaseClient } from '@/lib/supabase'
import StatusBadge from '@/components/StatusBadge'

type ChecklistEntry = {
  id: string
  label: string
  status: string
  faultDescription?: string
  severity?: string
}

type Inspection = {
  id: string
  machineId: string
  machineName: string
  registrationNumber: string | null
  templateName: string
  startedAt: string | null
  completedAt: string | null
  completedBy: string
  overallResult: 'PASS' | 'FAIL' | 'INCOMPLETE'
  passCount: number
  failCount: number
  incompleteCount: number
}

function formatDateTime(value: string | null) {
  return formatInspectionDateTime(value)
}

function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return 'N/A'
  const start = new Date(startedAt).getTime()
  const end = new Date(completedAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 'N/A'

  const totalMinutes = Math.round((end - start) / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

export default function AdminReportsPage() {
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data: sessionData } = await supabaseClient.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) { setError('Authentication required.'); return }
      const res = await fetch('/api/inspections', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to load.'); return }
      setInspections(data.inspections ?? [])
    } catch {
      setError('Failed to load inspections.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-24 pt-6">
        <div className="mb-6">
          <Link href="/admin" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700">
            ← Back
          </Link>
          <Header title="Completed Inspections" subtitle="Admin Reports" right={<StatusBadge label="Live" variant="success" />} />
        </div>

        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm text-rose-300">{error}</div> : null}

        <div className="space-y-4">
          {isLoading ? (
            <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-center text-slate-400 shadow-xl shadow-black/20">
              <p className="text-sm">Loading completed inspections...</p>
            </div>
          ) : inspections.length > 0 ? (
            inspections.map((inspection) => (
              <article key={inspection.id} className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Machine</p>
                    <p className="mt-1 text-lg font-semibold text-white">{inspection.machineName}</p>
                    {inspection.registrationNumber ? (
                      <p className="mt-1 text-sm text-slate-500">Registration: {inspection.registrationNumber}</p>
                    ) : null}
                    <p className="mt-2 text-sm text-slate-400">Template: {inspection.templateName}</p>
                    <p className="mt-1 text-sm text-slate-500">Completed By: {inspection.completedBy}</p>
                    <p className="text-sm text-slate-500">Completed: {formatDateTime(inspection.completedAt)}</p>
                  </div>
                  <StatusBadge
                    label={inspection.overallResult}
                    variant={inspection.overallResult === 'FAIL' ? 'danger' : inspection.overallResult === 'INCOMPLETE' ? 'warning' : 'success'}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div className="rounded-2xl bg-slate-950/80 px-3 py-2">
                    <p className="text-xs text-slate-500">Started</p>
                    <p className="font-medium text-slate-200">{formatDateTime(inspection.startedAt)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 px-3 py-2">
                    <p className="text-xs text-slate-500">Duration</p>
                    <p className="font-medium text-slate-200">{formatDuration(inspection.startedAt, inspection.completedAt)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 px-3 py-2">
                    <p className="text-xs text-slate-500">PASS / FAIL</p>
                    <p className="font-medium text-slate-200">{inspection.passCount} / {inspection.failCount}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 px-3 py-2">
                    <p className="text-xs text-slate-500">Incomplete</p>
                    <p className="font-medium text-slate-200">{inspection.incompleteCount}</p>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-center text-slate-300 shadow-xl shadow-black/20">
              <p className="text-sm">No completed inspections yet.</p>
              <p className="mt-2 text-xs text-slate-500">Complete an inspection to generate a report entry.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
