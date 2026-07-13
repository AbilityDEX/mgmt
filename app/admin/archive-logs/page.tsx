'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { formatInspectionDateTime } from '@/lib/inspectionTime'
import { supabaseClient } from '@/lib/supabase'

async function getToken() {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

type ArchiveLog = {
  id: string
  inspection_id: string
  status: 'success' | 'failed' | 'retrying' | 'skipped'
  pdf_generated: boolean
  email_sent: boolean
  archived: boolean
  retry_count: number
  failure_reason: string | null
  created_at: string
  recipient: string | null
  recipientCount: number
  sent_time: string | null
  machine_name: string | null
  inspector: string | null
  completed_at: string | null
}

export default function AdminArchiveLogsPage() {
  const [logs, setLogs] = useState<ArchiveLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRetrying, setIsRetrying] = useState(false)
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

      const response = await fetch('/api/admin/archive-logs', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to load archive logs.')
        return
      }

      setLogs(payload.logs ?? [])
    } catch {
      setError('Failed to load archive logs.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const retryFailures = async () => {
    setIsRetrying(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/archive/retry', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Retry failed.')
        return
      }

      await load()
    } catch {
      setError('Retry failed.')
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        <div className="mb-6">
          <Link href="/admin" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700">
            ← Back
          </Link>
          <Header title="Archive Delivery Log" subtitle="Administration" />
        </div>

        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <div className="mb-4 flex justify-end">
            <button type="button" onClick={() => { void retryFailures() }} disabled={isRetrying} className="rounded-3xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 disabled:opacity-60">
              {isRetrying ? 'Retrying...' : 'Retry Failed Deliveries'}
            </button>
          </div>

          {isLoading ? (
            <div className="rounded-2xl bg-slate-950/80 px-4 py-6 text-sm text-slate-400">Loading archive logs...</div>
          ) : logs.length === 0 ? (
            <div className="rounded-2xl bg-slate-950/80 px-4 py-6 text-sm text-slate-300">No archive logs yet.</div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <article key={log.id} className="rounded-3xl bg-slate-950/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Inspection {log.inspection_id}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatInspectionDateTime(log.created_at)}</p>
                      {log.machine_name ? <p className="mt-1 text-xs text-slate-400">Machine: {log.machine_name}</p> : null}
                      {log.inspector ? <p className="mt-1 text-xs text-slate-400">Inspector: {log.inspector}</p> : null}
                      {log.recipient ? <p className="mt-1 text-xs text-slate-400">Recipient: {log.recipient} {log.recipientCount > 1 ? `(+${log.recipientCount - 1} more)` : ''}</p> : null}
                      {log.sent_time ? <p className="mt-1 text-xs text-slate-400">Sent: {formatInspectionDateTime(log.sent_time)}</p> : null}
                      <p className="mt-1 text-xs text-slate-400">Retries: {log.retry_count}</p>
                      {log.failure_reason ? <p className="mt-1 text-xs text-rose-300">{log.failure_reason}</p> : null}
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      log.status === 'success'
                        ? 'bg-emerald-600/15 text-emerald-300'
                        : log.status === 'retrying'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-rose-600/15 text-rose-300'
                    }`}>
                      {log.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                    <span className="rounded-full bg-slate-800 px-3 py-1">PDF: {log.pdf_generated ? 'Yes' : 'No'}</span>
                    <span className="rounded-full bg-slate-800 px-3 py-1">Email: {log.email_sent ? 'Yes' : 'No'}</span>
                    <span className="rounded-full bg-slate-800 px-3 py-1">Archived: {log.archived ? 'Yes' : 'No'}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
