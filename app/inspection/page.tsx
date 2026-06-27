'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useCurrentUser } from '@/lib/store'
import { supabaseClient } from '@/lib/supabase'
import MachineCard from '@/components/MachineCard'
import type { Machine } from '@/lib/data/machines'

export default function InspectionPage() {
  const currentUser = useCurrentUser()
  const [machines, setMachines] = useState<Machine[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadMachines = useCallback(async () => {
    if (!currentUser) return
    setIsLoading(true)
    try {
      const { data: sessionData } = await supabaseClient.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) return

      const isAdmin = ['Admin', 'admin', 'super_admin'].includes(currentUser.name ?? '')
      const url = isAdmin
        ? '/api/machines'
        : `/api/machines?assigned_to=${encodeURIComponent(currentUser.id ?? '')}`

      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) return
      const data = await response.json()
      setMachines(data.machines ?? [])
    } finally {
      setIsLoading(false)
    }
  }, [currentUser])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMachines()
  }, [loadMachines])

  if (!currentUser) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <p className="text-lg font-semibold">Please login to see your assigned inspections.</p>
          <Link href="/" className="mt-6 inline-flex rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500">
            Back to Login
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-24 pt-6">
        <div className="mb-6 flex items-center justify-between rounded-[30px] bg-slate-900/90 p-4 shadow-[0_26px_60px_rgba(0,0,0,0.25)]">
          <Link href="/dashboard" className="rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700">
            ← Back
          </Link>
          <div className="rounded-3xl bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-300">
            Inspection list
          </div>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-center text-slate-300 shadow-xl shadow-black/20">
              <p className="text-sm">Loading machines...</p>
            </div>
          ) : machines.length > 0 ? (
            machines.map((machine) => (
              <MachineCard
                key={machine.id}
                machine={machine}
                primaryAction={{ label: 'Inspect', href: `/inspection/${machine.id}` }}
              />
            ))
          ) : (
            <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-center text-slate-300 shadow-xl shadow-black/20">
              <p className="text-sm">No assigned machines are available at the moment.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
