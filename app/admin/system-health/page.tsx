'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { formatInspectionDateTime } from '@/lib/inspectionTime'
import { supabaseClient } from '@/lib/supabase'

type HealthCard = {
  status: 'green' | 'yellow' | 'red'
  metrics: Record<string, string | number | boolean | null>
  failures: string[]
}

type HealthResponse = {
  generatedAt: string
  cards: {
    database: HealthCard
    scheduling: HealthCard
    inspectionEngine: HealthCard
    archiveSystem: HealthCard
    emailSystem: HealthCard
    storage: HealthCard
    security: HealthCard
  }
  fullReport: Array<{ name: string; status: 'PASS' | 'WARNING' | 'FAILED'; details: string }>
  releaseValidation: Array<{ stage: string; status: 'PASS' | 'WARNING' | 'FAILED'; details: string }>
  schedulerValidation: Array<{
    frequency: string
    status: 'PASS' | 'WARNING' | 'FAILED'
    checks: {
      nextDueCalculation: boolean
      reminderCalculation: boolean
      ukTimePreserved: boolean
      lockUnlockBehaviour: boolean
    }
  }>
  schedulerDiagnostics: Array<{
    scheduleId: string
    machineId: string
    machineName: string
    templateName: string
    currentTime: string
    inspectionTime: string
    currentStatus: string
    dueSoonTime: string | null
    dueTime: string
    overdueTime: string
    lockUntil: string
    reminderQueued: boolean
    reminderSent: boolean
    nextReminderTime: string | null
    recipientCount: number
    recipientSource: string
    schedulerDecision: string
    apiDecision: string
    dbDecision: string
  }>
  pdfValidation: {
    status: 'PASS' | 'WARNING' | 'FAILED'
    details: string
    contains: Record<string, boolean>
  }
  emailValidation: {
    status: 'PASS' | 'WARNING' | 'FAILED'
    details: string
    checks: Record<string, boolean>
  }
  repairs: Record<string, number>
  repairsSkipped: Record<string, number>
  manualConfiguration: string[]
  readiness: {
    passed: number
    warnings: number
    failed: number
    percentage: number
    release1Ready: boolean
  }
}

async function getToken() {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

function statusClass(status: 'green' | 'yellow' | 'red') {
  if (status === 'green') return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
  if (status === 'yellow') return 'text-amber-200 bg-amber-500/10 border-amber-500/30'
  return 'text-rose-300 bg-rose-500/10 border-rose-500/30'
}

function checkClass(status: 'PASS' | 'WARNING' | 'FAILED') {
  if (status === 'PASS') return 'text-emerald-300'
  if (status === 'WARNING') return 'text-amber-200'
  return 'text-rose-300'
}

export default function AdminSystemHealthPage() {
  const [result, setResult] = useState<HealthResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const cards = useMemo(() => {
    if (!result) return [] as Array<{ key: string; title: string; value: HealthCard }>
    return [
      { key: 'database', title: 'Database', value: result.cards.database },
      { key: 'scheduling', title: 'Scheduling', value: result.cards.scheduling },
      { key: 'inspectionEngine', title: 'Inspection Engine', value: result.cards.inspectionEngine },
      { key: 'archiveSystem', title: 'Archive System', value: result.cards.archiveSystem },
      { key: 'emailSystem', title: 'Email System', value: result.cards.emailSystem },
      { key: 'storage', title: 'Storage', value: result.cards.storage },
      { key: 'security', title: 'Security', value: result.cards.security },
    ]
  }, [result])

  const loadStatus = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/system-health', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = (await response.json()) as HealthResponse | { error?: string }

      if (!response.ok || ('error' in payload && typeof payload.error === 'string')) {
        const apiError = 'error' in payload ? payload.error : undefined
        setError(apiError || 'Failed to load system health.')
        return
      }

      setResult(payload as HealthResponse)
    } catch {
      setError('Failed to load system health.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const runFullCheck = async () => {
    setIsRunning(true)
    setError(null)
    setMessage(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/system-health', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ attemptRepair: true }),
      })
      const payload = (await response.json()) as HealthResponse | { error?: string }

      if (!response.ok || ('error' in payload && typeof payload.error === 'string')) {
        const apiError = 'error' in payload ? payload.error : undefined
        setError(apiError || 'Full system check failed.')
        return
      }

      setResult(payload as HealthResponse)
      setMessage('Full system check completed.')
    } catch {
      setError('Full system check failed.')
    } finally {
      setIsRunning(false)
    }
  }

  const sendTestEmail = async () => {
    setIsSendingEmail(true)
    setError(null)
    setMessage(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/system-health/test-email', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const payload = (await response.json()) as { success?: boolean; error?: string }

      if (!response.ok || payload.error) {
        setError(payload.error || 'Failed to send test email.')
        return
      }

      setMessage('System health test email sent.')
    } catch {
      setError('Failed to send test email.')
    } finally {
      setIsSendingEmail(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <div className="mb-6">
          <Link href="/admin" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700">
            ← Back
          </Link>
          <Header title="System Health" subtitle="Administration" />
          <p className="mt-2 text-sm text-slate-400">Run full diagnostics, safe repairs, and release readiness checks.</p>
        </div>

        {message ? <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">{message}</div> : null}
        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        <section className="mb-6 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => { void runFullCheck() }}
              disabled={isRunning}
              className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {isRunning ? 'Running Full Check...' : 'Run Full System Check'}
            </button>
            <button
              type="button"
              onClick={() => { void sendTestEmail() }}
              disabled={isSendingEmail}
              className="rounded-3xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(14,165,233,0.25)] transition hover:bg-sky-500 disabled:opacity-60"
            >
              {isSendingEmail ? 'Sending Test Email...' : 'Send Test Email'}
            </button>
            <button
              type="button"
              onClick={() => { void loadStatus() }}
              disabled={isLoading}
              className="rounded-3xl bg-slate-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:opacity-60"
            >
              Refresh Status
            </button>
          </div>
          {result ? <p className="mt-3 text-xs text-slate-400">Generated at {formatInspectionDateTime(result.generatedAt)}</p> : null}
        </section>

        {isLoading ? (
          <section className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-sm text-slate-400">Loading system health...</section>
        ) : null}

        {!isLoading && result ? (
          <>
            <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => (
                <article key={card.key} className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-white">{card.title}</h2>
                    <span className={`rounded-2xl border px-3 py-1 text-xs font-semibold uppercase ${statusClass(card.value.status)}`}>
                      {card.value.status}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm text-slate-300">
                    {Object.entries(card.value.metrics).map(([key, value]) => (
                      <div key={key} className="flex items-start justify-between gap-3 rounded-2xl bg-slate-950/80 px-3 py-2">
                        <span className="text-slate-400">{key}</span>
                        <span className="text-right text-slate-100">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                  {card.value.failures.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-xs text-rose-300">
                      {card.value.failures.map((failure) => (
                        <li key={failure}>• {failure}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </section>

            <section className="mb-6 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
              <h2 className="text-lg font-semibold text-white">Readiness Summary</h2>
              <p className={`mt-2 text-sm font-semibold ${result.readiness.release1Ready ? 'text-emerald-300' : 'text-amber-200'}`}>
                {result.readiness.release1Ready ? 'Release 1 Ready' : 'Release 1 Not Ready'}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl bg-slate-950/80 px-4 py-3 text-sm text-slate-200">Passed: <span className="font-semibold text-emerald-300">{result.readiness.passed}</span></div>
                <div className="rounded-2xl bg-slate-950/80 px-4 py-3 text-sm text-slate-200">Warnings: <span className="font-semibold text-amber-200">{result.readiness.warnings}</span></div>
                <div className="rounded-2xl bg-slate-950/80 px-4 py-3 text-sm text-slate-200">Failed: <span className="font-semibold text-rose-300">{result.readiness.failed}</span></div>
                <div className="rounded-2xl bg-slate-950/80 px-4 py-3 text-sm text-slate-200">Score: <span className="font-semibold text-sky-300">{result.readiness.percentage}%</span></div>
              </div>
            </section>

            <section className="mb-6 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
              <h2 className="text-lg font-semibold text-white">Full System Check</h2>
              <div className="mt-3 space-y-2">
                {result.fullReport.map((item) => (
                  <article key={item.name} className="rounded-2xl bg-slate-950/80 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-medium text-slate-100">{item.name}</h3>
                      <span className={`text-xs font-semibold ${checkClass(item.status)}`}>{item.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{item.details}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="mb-6 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
              <h2 className="text-lg font-semibold text-white">Release Workflow Validation</h2>
              <div className="mt-3 space-y-2">
                {result.releaseValidation.map((item) => (
                  <article key={item.stage} className="rounded-2xl bg-slate-950/80 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-medium text-slate-100">{item.stage}</h3>
                      <span className={`text-xs font-semibold ${checkClass(item.status)}`}>{item.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{item.details}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="mb-6 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
              <h2 className="text-lg font-semibold text-white">Scheduler Frequency Validation</h2>
              <div className="mt-3 space-y-2">
                {result.schedulerValidation.map((item) => (
                  <article key={item.frequency} className="rounded-2xl bg-slate-950/80 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-medium text-slate-100">{item.frequency}</h3>
                      <span className={`text-xs font-semibold ${checkClass(item.status)}`}>{item.status}</span>
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {Object.entries(item.checks).map(([name, value]) => (
                        <p key={name} className="text-xs text-slate-400">
                          {name}: <span className={value ? 'text-emerald-300' : 'text-rose-300'}>{String(value)}</span>
                        </p>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="mb-6 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
              <h2 className="text-lg font-semibold text-white">Scheduler Diagnostics</h2>
              <div className="mt-3 space-y-2">
                {result.schedulerDiagnostics.length > 0 ? (
                  result.schedulerDiagnostics.map((item) => (
                    <article key={item.scheduleId} className="rounded-2xl bg-slate-950/80 px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-medium text-slate-100">{item.machineName} · {item.templateName}</h3>
                        <span className="text-xs text-slate-400">{item.scheduleId}</span>
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <p className="text-xs text-slate-400">currentTime: <span className="text-slate-200">{item.currentTime}</span></p>
                        <p className="text-xs text-slate-400">inspectionTime: <span className="text-slate-200">{item.inspectionTime}</span></p>
                        <p className="text-xs text-slate-400">currentStatus: <span className="text-slate-200">{item.currentStatus}</span></p>
                        <p className="text-xs text-slate-400">dueSoonTime: <span className="text-slate-200">{item.dueSoonTime ?? 'N/A'}</span></p>
                        <p className="text-xs text-slate-400">dueTime: <span className="text-slate-200">{item.dueTime}</span></p>
                        <p className="text-xs text-slate-400">overdueTime: <span className="text-slate-200">{item.overdueTime}</span></p>
                        <p className="text-xs text-slate-400">lockUntil: <span className="text-slate-200">{item.lockUntil}</span></p>
                        <p className="text-xs text-slate-400">nextReminderTime: <span className="text-slate-200">{item.nextReminderTime ?? 'N/A'}</span></p>
                        <p className="text-xs text-slate-400">reminderQueued: <span className={item.reminderQueued ? 'text-emerald-300' : 'text-slate-300'}>{String(item.reminderQueued)}</span></p>
                        <p className="text-xs text-slate-400">reminderSent: <span className={item.reminderSent ? 'text-emerald-300' : 'text-slate-300'}>{String(item.reminderSent)}</span></p>
                        <p className="text-xs text-slate-400">recipientCount: <span className="text-slate-200">{item.recipientCount}</span></p>
                        <p className="text-xs text-slate-400">recipientSource: <span className="text-slate-200">{item.recipientSource}</span></p>
                        <p className="text-xs text-slate-400">schedulerDecision: <span className="text-slate-200">{item.schedulerDecision}</span></p>
                        <p className="text-xs text-slate-400">apiDecision: <span className="text-slate-200">{item.apiDecision}</span></p>
                        <p className="text-xs text-slate-400">dbDecision: <span className="text-slate-200">{item.dbDecision}</span></p>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No scheduler diagnostics available.</p>
                )}
              </div>
            </section>

            <section className="mb-6 grid gap-4 lg:grid-cols-2">
              <article className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
                <h2 className="text-lg font-semibold text-white">PDF Validation</h2>
                <p className={`mt-2 text-sm font-semibold ${checkClass(result.pdfValidation.status)}`}>{result.pdfValidation.status}</p>
                <p className="mt-1 text-xs text-slate-400">{result.pdfValidation.details}</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {Object.entries(result.pdfValidation.contains).map(([name, value]) => (
                    <p key={name} className="text-xs text-slate-400">
                      {name}: <span className={value ? 'text-emerald-300' : 'text-rose-300'}>{String(value)}</span>
                    </p>
                  ))}
                </div>
              </article>

              <article className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
                <h2 className="text-lg font-semibold text-white">Email Validation</h2>
                <p className={`mt-2 text-sm font-semibold ${checkClass(result.emailValidation.status)}`}>{result.emailValidation.status}</p>
                <p className="mt-1 text-xs text-slate-400">{result.emailValidation.details}</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {Object.entries(result.emailValidation.checks).map(([name, value]) => (
                    <p key={name} className="text-xs text-slate-400">
                      {name}: <span className={value ? 'text-emerald-300' : 'text-rose-300'}>{String(value)}</span>
                    </p>
                  ))}
                </div>
              </article>
            </section>

            <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
              <h2 className="text-lg font-semibold text-white">Repairs And Manual Configuration</h2>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Repairs</h3>
                  <div className="mt-2 space-y-1 text-xs text-slate-300">
                    {Object.entries(result.repairs).map(([name, value]) => (
                      <p key={name}>{name}: {value}</p>
                    ))}
                    {Object.entries(result.repairsSkipped).map(([name, value]) => (
                      <p key={name}>{name}: {value}</p>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Manual Configuration</h3>
                  {result.manualConfiguration.length === 0 ? (
                    <p className="mt-2 text-xs text-emerald-300">No manual actions required.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-xs text-amber-200">
                      {result.manualConfiguration.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}
