'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { setCurrentUser, useCurrentUser } from '@/lib/store'
import { supabaseClient } from '@/lib/supabase'
import MachineCard from '@/components/MachineCard'
import type { Machine } from '@/lib/data/machines'

export default function DashboardPage() {
  const router = useRouter()
  const currentUser = useCurrentUser()
  const [machines, setMachines] = useState<Machine[]>([])
  const [defectWidgets, setDefectWidgets] = useState({
    openDefects: 0,
    criticalDefects: 0,
    recentlyClosed: 0,
    machinesWithActiveDefects: 0,
  })
  const [scheduleWidgets, setScheduleWidgets] = useState({
    dueToday: 0,
    dueTomorrow: 0,
    overdue: 0,
    upcomingThisWeek: 0,
    completedToday: 0,
    failedInspections: 0,
    passRate: 100,
    totalOutstanding: 0,
    compliancePercentage: 100,
    failedInspectionStarts: 0,
    duplicateInspectionAttemptsBlocked: 0,
    successfulStarts: 0,
    successfulCompletions: 0,
    cancelledInspections: 0,
    lockDenials: 0,
  })
  const [scheduleBoard, setScheduleBoard] = useState<{
    dueToday: Array<{
      scheduleId: string
      machineId: string
      machineName: string
      templateName: string
      nextDue: string
      status: string
      openInspectionId: string | null
    }>
    dueThisWeek: Array<{
      scheduleId: string
      machineId: string
      machineName: string
      templateName: string
      nextDue: string
      status: string
      openInspectionId: string | null
    }>
    overdue: Array<{
      scheduleId: string
      machineId: string
      machineName: string
      templateName: string
      nextDue: string
      status: string
      openInspectionId: string | null
    }>
    upcoming: Array<{
      scheduleId: string
      machineId: string
      machineName: string
      templateName: string
      nextDue: string
      status: string
      openInspectionId: string | null
    }>
  }>({ dueToday: [], dueThisWeek: [], overdue: [], upcoming: [] })
  const [isLoading, setIsLoading] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    let isActive = true

    const restoreCurrentUser = async () => {
      if (currentUser) {
        setAuthChecked(true)
        return
      }

      const { data } = await supabaseClient.auth.getSession()
      const session = data.session

      if (!isActive) {
        return
      }

      if (!session?.user) {
        setAuthChecked(true)
        return
      }

      const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('full_name')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (!isActive) {
        return
      }

      if (error) {
        setAuthChecked(true)
        return
      }

      setCurrentUser({
        id: session.user.id,
        name: profile?.full_name || session.user.email || '',
      })
      setAuthChecked(true)
    }

    void restoreCurrentUser()

    return () => {
      isActive = false
    }
  }, [currentUser])

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

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) return
      const data = await response.json()
      setMachines(data.machines ?? [])
    } finally {
      setIsLoading(false)
    }
  }, [currentUser])

  const loadDefectWidgets = useCallback(async () => {
    if (!currentUser) return

    const { data: sessionData } = await supabaseClient.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) return

    const response = await fetch('/api/defects/stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return

    const data = await response.json()
    setDefectWidgets(
      data.widgets ?? {
        openDefects: 0,
        criticalDefects: 0,
        recentlyClosed: 0,
        machinesWithActiveDefects: 0,
      }
    )
  }, [currentUser])

  const loadSchedulingData = useCallback(async () => {
    if (!currentUser) return

    const { data: sessionData } = await supabaseClient.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) return

    const response = await fetch('/api/schedules', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return

    const payload = await response.json()
    setScheduleWidgets(
      payload.widgets ?? {
        dueToday: 0,
        dueTomorrow: 0,
        overdue: 0,
        upcomingThisWeek: 0,
        completedToday: 0,
        failedInspections: 0,
        passRate: 100,
        totalOutstanding: 0,
        compliancePercentage: 100,
        failedInspectionStarts: 0,
        duplicateInspectionAttemptsBlocked: 0,
        successfulStarts: 0,
        successfulCompletions: 0,
        cancelledInspections: 0,
        lockDenials: 0,
      }
    )
    setScheduleBoard(
      payload.board ?? {
        dueToday: [],
        dueThisWeek: [],
        overdue: [],
        upcoming: [],
      }
    )
  }, [currentUser])

  const handleLogout = async () => {
    await supabaseClient.auth.signOut()
    setCurrentUser(null)
    router.replace('/')
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMachines()
    void loadDefectWidgets()
    void loadSchedulingData()

    const timer = setInterval(() => {
      void loadMachines()
      void loadDefectWidgets()
      void loadSchedulingData()
    }, 60_000)

    return () => clearInterval(timer)
  }, [loadDefectWidgets, loadMachines, loadSchedulingData])

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <p className="text-lg font-semibold">Restoring your session...</p>
          <Link href="/" className="mt-6 inline-flex rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500">
            Back to Login
          </Link>
        </div>
      </main>
    )
  }

  if (!currentUser) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <p className="text-lg font-semibold">Please login before viewing your dashboard.</p>
          <Link href="/" className="mt-6 inline-flex rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500">
            Back to Login
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-md px-4 pt-6 pb-24">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button type="button" onClick={handleLogout} className="rounded-3xl bg-slate-900/90 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-800">
            {'\u2190'} Logout
          </button>
          <Link href="/admin" className="rounded-3xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500">
            Admin
          </Link>
        </div>

        <header className="rounded-[32px] bg-slate-900/90 p-5 shadow-[0_25px_60px_rgba(0,0,0,0.25)] backdrop-blur-sm">
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">MGMT Inspect</p>
          <h1 className="mt-2 text-3xl font-semibold">Good Morning {currentUser.name}</h1>
          <p className="mt-3 text-sm text-slate-400">Your inspection overview is ready. Select a machine to begin.</p>
        </header>

        <section className="mt-6 rounded-[28px] bg-slate-900/80 px-5 py-4 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Section</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">Assigned Machines</h2>
            </div>
          </div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3">
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Due Soon</p>
            <p className="mt-2 text-2xl font-semibold text-amber-300">{scheduleWidgets.dueToday}</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Due Tomorrow</p>
            <p className="mt-2 text-2xl font-semibold text-amber-200">{scheduleWidgets.dueTomorrow}</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Overdue Inspections</p>
            <p className="mt-2 text-2xl font-semibold text-rose-300">{scheduleWidgets.overdue}</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">On Time</p>
            <p className="mt-2 text-2xl font-semibold text-sky-300">{scheduleWidgets.upcomingThisWeek}</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Completed Today</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-300">{scheduleWidgets.completedToday}</p>
          </article>
          <article className="col-span-2 rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Compliance Percentage</p>
            <p className="mt-2 text-2xl font-semibold text-white">{scheduleWidgets.compliancePercentage}%</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Failed Inspections</p>
            <p className="mt-2 text-2xl font-semibold text-rose-300">{scheduleWidgets.failedInspections}</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Pass Rate</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-300">{scheduleWidgets.passRate}%</p>
          </article>
          <article className="col-span-2 rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Total Outstanding</p>
            <p className="mt-2 text-2xl font-semibold text-white">{scheduleWidgets.totalOutstanding}</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Successful Starts</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-300">{scheduleWidgets.successfulStarts}</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Successful Completions</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-200">{scheduleWidgets.successfulCompletions}</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Failed Starts</p>
            <p className="mt-2 text-2xl font-semibold text-rose-300">{scheduleWidgets.failedInspectionStarts}</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Duplicate Blocked</p>
            <p className="mt-2 text-2xl font-semibold text-amber-300">{scheduleWidgets.duplicateInspectionAttemptsBlocked}</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Lock Denials</p>
            <p className="mt-2 text-2xl font-semibold text-amber-200">{scheduleWidgets.lockDenials}</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Cancelled</p>
            <p className="mt-2 text-2xl font-semibold text-slate-200">{scheduleWidgets.cancelledInspections}</p>
          </article>

          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Open Defects</p>
            <p className="mt-2 text-2xl font-semibold text-white">{defectWidgets.openDefects}</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Critical</p>
            <p className="mt-2 text-2xl font-semibold text-rose-300">{defectWidgets.criticalDefects}</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Recently Closed</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-300">{defectWidgets.recentlyClosed}</p>
          </article>
          <article className="rounded-[24px] bg-slate-900/90 p-4 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Machines With Active</p>
            <p className="mt-2 text-2xl font-semibold text-amber-300">{defectWidgets.machinesWithActiveDefects}</p>
          </article>
        </section>

        <section className="mt-6 rounded-[28px] bg-slate-900/80 px-5 py-4 shadow-xl shadow-black/20">
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Inspection Schedule</h2>

          <div className="mt-4 space-y-4">
            {[
              { key: 'dueToday', title: 'Due Soon', items: scheduleBoard.dueToday },
              { key: 'dueThisWeek', title: 'Due Soon (Extended)', items: scheduleBoard.dueThisWeek },
              { key: 'overdue', title: 'Overdue', items: scheduleBoard.overdue },
              { key: 'upcoming', title: 'On Time', items: scheduleBoard.upcoming },
            ].map((group) => (
              <div key={group.key}>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{group.title}</p>
                <div className="mt-2 space-y-2">
                  {group.items.slice(0, 4).map((item) => (
                    <article key={item.scheduleId} className="rounded-3xl bg-slate-950/80 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white">{item.machineName}</p>
                          <p className="mt-1 text-xs text-slate-400">Template: {item.templateName}</p>
                          <p className="mt-1 text-xs text-slate-400">Due Date: {new Date(item.nextDue).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              item.status === 'Overdue'
                                ? 'bg-rose-600/15 text-rose-300'
                                : item.status === 'Due Soon'
                                  ? 'bg-amber-500/15 text-amber-300'
                                  : item.status === 'On Time'
                                    ? 'bg-emerald-600/15 text-emerald-300'
                                    : 'bg-emerald-600/15 text-emerald-300'
                            }`}
                          >
                            {item.status}
                          </span>
                          <div className="mt-2">
                            <Link
                              href={item.openInspectionId ? `/inspection/executions/${item.openInspectionId}` : `/inspection/${item.machineId}`}
                              className="rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-700"
                            >
                              Open Inspection
                            </Link>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                  {group.items.length === 0 ? (
                    <div className="rounded-3xl bg-slate-950/80 px-4 py-3 text-xs text-slate-400">No schedules.</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-5 space-y-4">
          {isLoading ? (
            <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-center text-slate-300 shadow-xl shadow-black/20">
              <p className="text-sm">Loading machines...</p>
            </div>
          ) : machines.length > 0 ? (
            machines.map((machine) => (
              <MachineCard
                key={machine.id}
                machine={machine}
                primaryAction={{ label: 'Start Inspection', href: `/inspection/${machine.id}` }}
              />
            ))
          ) : (
            <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-center text-slate-300 shadow-xl shadow-black/20">
              <p className="text-sm">No assigned machines are available right now.</p>
              <p className="mt-2 text-xs text-slate-500">Check back after the next scheduling update.</p>
            </div>
          )}
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 text-xs font-medium text-slate-400">
          <Link href="/dashboard" className="flex flex-col items-center gap-1 text-emerald-400">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            Dashboard
          </Link>
          <Link href="/admin/machines" className="flex flex-col items-center gap-1 hover:text-slate-100">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            Machines
          </Link>
          <Link href="/admin/reports" className="flex flex-col items-center gap-1 hover:text-slate-100">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            Reports
          </Link>
          <Link href="/" className="flex flex-col items-center gap-1 hover:text-slate-100">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            Profile
          </Link>
        </div>
      </nav>
    </main>
  )
}
