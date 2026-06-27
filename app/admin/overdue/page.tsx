'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabaseClient } from '@/lib/supabase'
import StatusBadge from '@/components/StatusBadge'
import type { Machine } from '@/lib/data/machines'

export default function AdminOverduePage() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data: sessionData } = await supabaseClient.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) { setError('Authentication required.'); return }
      const res = await fetch('/api/machines', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to load.'); return }
      setMachines((data.machines ?? []).filter((m: Machine) => m.status === 'Overdue'))
    } catch {
      setError('Failed to load machines.')
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
        <div className="mb-6 flex items-center justify-between rounded-[32px] bg-slate-900/95 p-5 shadow-[0_25px_60px_rgba(0,0,0,0.25)]">
          <div>
            <Link href="/admin" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700">
              ← Back
            </Link>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Admin Reports</p>
            <h1 className="mt-2 text-2xl font-semibold">Overdue Machines</h1>
          </div>
          <StatusBadge label="Overdue" variant="danger" />
        </div>

        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm text-rose-300">{error}</div> : null}

        <div className="space-y-4">
          {isLoading ? (
            <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-center text-slate-400 shadow-xl shadow-black/20">
              <p className="text-sm">Loading...</p>
            </div>
          ) : machines.length > 0 ? (
            machines.map((machine) => (
              <article key={machine.id} className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Machine</p>
                    <p className="mt-1 text-lg font-semibold text-white">{machine.name}</p>
                    <p className="mt-2 text-sm text-slate-500">Assigned: {machine.assignedUser}</p>
                    <p className="text-sm text-slate-500">Deadline: {machine.inspectionDeadline}</p>
                  </div>
                  <StatusBadge label="Overdue" variant="danger" />
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-center text-slate-300 shadow-xl shadow-black/20">
              <p className="text-sm">No machines are currently overdue.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
