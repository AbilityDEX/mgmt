'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase'
import type { InspectionHistory } from '@/lib/data/inspections'

async function getToken(): Promise<string | null> {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

function formatDateTime(value: string | null) {
  if (!value) return 'N/A'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleString()
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

export default function InspectionHistoryListPage() {
  const params = useParams<{ machineId: string }>()
  const router = useRouter()
  const machineId = params.machineId

  const [machine, setMachine] = useState<{ id: string; name: string } | null>(null)
  const [inspections, setInspections] = useState<InspectionHistory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch(`/api/inspection-executions?machine_id=${encodeURIComponent(machineId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to load inspection history.')
        return
      }

      setMachine(payload.machine ?? null)
      setInspections((payload.inspections ?? []).filter((i: InspectionHistory) => i.status === 'Completed'))
    } catch {
      setError('Failed to load inspection history.')
    } finally {
      setIsLoading(false)
    }
  }, [machineId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        {/* Header */}
        <div className="mb-6 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)]">
          <Link
            href={`/inspection/${machineId}`}
            className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700"
          >
            ← Back
          </Link>
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Inspection History</p>
          <h1 className="mt-2 text-3xl font-semibold">{machine?.name ?? 'Machine'}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {inspections.length} completed inspection{inspections.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">
            {error}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <div className="text-center text-slate-400">Loading inspection history...</div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && inspections.length === 0 && (
          <div className="rounded-[28px] bg-slate-900/90 p-8 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <div className="text-center">
              <p className="mb-2 text-lg font-semibold text-slate-200">No completed inspections yet</p>
              <p className="text-sm text-slate-400">Start a new inspection to see history here.</p>
              <Link
                href={`/inspection/${machineId}`}
                className="mt-4 inline-flex rounded-3xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Start Inspection
              </Link>
            </div>
          </div>
        )}

        {/* Inspection list */}
        {!isLoading && inspections.length > 0 && (
          <section className="space-y-3 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            {inspections.map((inspection) => (
              <div
                key={inspection.id}
                className="flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-100">{inspection.templateName}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                    <div className="rounded-xl bg-slate-900/60 px-2.5 py-2">
                      <p className="text-slate-500">Started</p>
                      <p className="mt-1 font-semibold text-slate-200">{formatDateTime(inspection.startedAt)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-900/60 px-2.5 py-2">
                      <p className="text-slate-500">Completed</p>
                      <p className="mt-1 font-semibold text-slate-200">{formatDateTime(inspection.completedAt)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-900/60 px-2.5 py-2">
                      <p className="text-slate-500">Duration</p>
                      <p className="mt-1 font-semibold text-slate-200">{formatDuration(inspection.startedAt, inspection.completedAt)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-900/60 px-2.5 py-2">
                      <p className="text-slate-500">Inspector</p>
                      <p className="mt-1 font-semibold text-slate-200">{inspection.inspector}</p>
                    </div>
                    <div className="rounded-xl bg-slate-900/60 px-2.5 py-2">
                      <p className="text-slate-500">Result</p>
                      <p className={`mt-1 font-semibold ${inspection.result === 'FAIL' ? 'text-rose-300' : inspection.result === 'PASS' ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {inspection.result}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/inspection/history/${inspection.id}`)
                  }}
                  className="rounded-3xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 sm:whitespace-nowrap"
                >
                  View Report
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}
