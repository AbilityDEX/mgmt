'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabaseClient } from '@/lib/supabase'

type RetentionSettings = {
  retentionDays: number
  useCustom: boolean
  customDays: number | null
  maxDeliveryRetries: number
}

type CleanupRunResult = {
  runId: string
  summary: Record<string, unknown>
}

async function getToken() {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function AdminRetentionSettingsPage() {
  const [settings, setSettings] = useState<RetentionSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRunningCleanup, setIsRunningCleanup] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<CleanupRunResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const inputClass = 'mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20'

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/retention-settings', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to load retention settings.')
        return
      }

      setSettings(payload.settings)
    } catch {
      setError('Failed to load retention settings.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!settings) return

    setIsSaving(true)
    setError(null)
    setMessage(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/retention-settings', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      })

      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'Failed to save settings.')
        return
      }

      setSettings(payload.settings)
      setMessage('Retention settings updated.')
    } catch {
      setError('Failed to save retention settings.')
    } finally {
      setIsSaving(false)
    }
  }

  const runCleanup = async () => {
    setIsRunningCleanup(true)
    setError(null)
    setMessage(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/scheduled-cleanup/run', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Cleanup failed.')
        return
      }

      setCleanupResult(payload.result)
      setMessage('Cleanup completed successfully.')
    } catch {
      setError('Cleanup failed.')
    } finally {
      setIsRunningCleanup(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
        <div className="mb-6">
          <Link href="/admin" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700">
            ← Back
          </Link>
          <Header title="Retention & Cleanup" subtitle="Administration" />
        </div>

        {message ? <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">{message}</div> : null}
        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        {isLoading || !settings ? (
          <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-sm text-slate-400">Loading retention settings...</div>
        ) : (
          <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Retention Policy</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm text-slate-300">Standard Retention (days)</span>
                <select className={inputClass} value={settings.retentionDays} onChange={(e) => setSettings((p) => (p ? { ...p, retentionDays: Number(e.target.value) } : p))}>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                  <option value={90}>90</option>
                  <option value={180}>180</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Custom Retention (days)</span>
                <input type="number" className={inputClass} value={settings.customDays ?? ''} onChange={(e) => setSettings((p) => (p ? { ...p, customDays: e.target.value ? Number(e.target.value) : null } : p))} disabled={!settings.useCustom} min={1} />
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
                <input type="checkbox" checked={settings.useCustom} onChange={(e) => setSettings((p) => (p ? { ...p, useCustom: e.target.checked } : p))} />
                Use custom retention value
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-300">Max Delivery Retries</span>
                <input type="number" min={0} className={inputClass} value={settings.maxDeliveryRetries} onChange={(e) => setSettings((p) => (p ? { ...p, maxDeliveryRetries: Number(e.target.value) || 0 } : p))} />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => { void save() }} disabled={isSaving} className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60">
                {isSaving ? 'Saving...' : 'Save Retention Settings'}
              </button>
              <button type="button" onClick={() => { void runCleanup() }} disabled={isRunningCleanup} className="rounded-3xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 disabled:opacity-60">
                {isRunningCleanup ? 'Running Cleanup...' : 'Run Cleanup Now'}
              </button>
            </div>
          </section>
        )}

        {cleanupResult ? (
          <section className="mt-5 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Last Cleanup Result</h2>
            <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950/80 p-4 text-xs text-slate-300">{JSON.stringify(cleanupResult, null, 2)}</pre>
          </section>
        ) : null}
      </div>
    </main>
  )
}
