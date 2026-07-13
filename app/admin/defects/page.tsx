'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { formatInspectionDateTime } from '@/lib/inspectionTime'
import { supabaseClient } from '@/lib/supabase'

type DefectSeverity = 'Low' | 'Medium' | 'High' | 'Critical'
type DefectStatus = 'Open' | 'In Progress' | 'Awaiting Parts' | 'Resolved' | 'Closed'

type DefectRow = {
  id: string
  machineId: string
  machineName: string
  inspectionId: string
  inspectionItemId: string
  title: string
  description: string | null
  severity: DefectSeverity
  status: DefectStatus
  assignedTo: string | null
  assignedToName: string
  createdBy: string
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

type FilterOption = {
  id: string
  name: string
}

type DefectsResponse = {
  filters: {
    statuses: DefectStatus[]
    severities: DefectSeverity[]
    machines: FilterOption[]
  }
  defects: DefectRow[]
}

async function getToken(): Promise<string | null> {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

function formatDate(value: string) {
  return formatInspectionDateTime(value)
}

export default function AdminDefectsPage() {
  const [defects, setDefects] = useState<DefectRow[]>([])
  const [statusOptions, setStatusOptions] = useState<DefectStatus[]>([])
  const [severityOptions, setSeverityOptions] = useState<DefectSeverity[]>([])
  const [machineOptions, setMachineOptions] = useState<FilterOption[]>([])

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [machineFilter, setMachineFilter] = useState('')

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (statusFilter) params.set('status', statusFilter)
      if (severityFilter) params.set('severity', severityFilter)
      if (machineFilter) params.set('machine_id', machineFilter)

      const response = await fetch(`/api/defects?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const payload = (await response.json()) as DefectsResponse & { error?: string }

      if (!response.ok) {
        setError(payload.error || 'Failed to load defects.')
        return
      }

      setDefects(payload.defects ?? [])
      setStatusOptions(payload.filters?.statuses ?? [])
      setSeverityOptions(payload.filters?.severities ?? [])
      setMachineOptions(payload.filters?.machines ?? [])
    } catch {
      setError('Failed to load defects.')
    } finally {
      setIsLoading(false)
    }
  }, [machineFilter, search, severityFilter, statusFilter])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const sortedDefects = useMemo(
    () => [...defects].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [defects]
  )

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <div className="mb-6">
          <Link href="/admin" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700">
            ← Back
          </Link>
          <Header title="Defects" subtitle="Defect Management" />
        </div>

        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        <section className="mb-5 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Filters</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <label className="block">
              <span className="text-sm text-slate-300">Search</span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search defects"
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}>
                <option value="">All</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Severity</span>
              <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} className={inputClass}>
                <option value="">All</option>
                {severityOptions.map((severity) => (
                  <option key={severity} value={severity}>{severity}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Machine</span>
              <select value={machineFilter} onChange={(event) => setMachineFilter(event.target.value)} className={inputClass}>
                <option value="">All</option>
                {machineOptions.map((machine) => (
                  <option key={machine.id} value={machine.id}>{machine.name}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="overflow-x-auto rounded-[28px] bg-slate-900/90 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-950/90 text-slate-400">
              <tr>
                <th className="px-5 py-4 font-medium uppercase tracking-[0.25em]">Status</th>
                <th className="px-5 py-4 font-medium uppercase tracking-[0.25em]">Severity</th>
                <th className="px-5 py-4 font-medium uppercase tracking-[0.25em]">Machine</th>
                <th className="px-5 py-4 font-medium uppercase tracking-[0.25em]">Defect</th>
                <th className="px-5 py-4 font-medium uppercase tracking-[0.25em]">Assigned To</th>
                <th className="px-5 py-4 font-medium uppercase tracking-[0.25em]">Created</th>
                <th className="px-5 py-4 font-medium uppercase tracking-[0.25em]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400">Loading defects...</td>
                </tr>
              ) : sortedDefects.length > 0 ? (
                sortedDefects.map((defect) => (
                  <tr key={defect.id} className="border-t border-slate-800 hover:bg-slate-950/80">
                    <td className="px-5 py-4 text-slate-300">{defect.status}</td>
                    <td className="px-5 py-4 text-slate-300">{defect.severity}</td>
                    <td className="px-5 py-4 text-slate-300">{defect.machineName}</td>
                    <td className="px-5 py-4 text-white">{defect.title}</td>
                    <td className="px-5 py-4 text-slate-300">{defect.assignedToName}</td>
                    <td className="px-5 py-4 text-slate-300">{formatDate(defect.createdAt)}</td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/defects/${defect.id}`}
                        className="rounded-3xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-300">No defects found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  )
}
