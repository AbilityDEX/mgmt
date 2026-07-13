'use client'

import { useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { formatInspectionDateTime } from '@/lib/inspectionTime'
import { supabaseClient } from '@/lib/supabase'

type VerificationResult = {
  ok: boolean
  checks: Array<{ name: string; ok: boolean; details?: string }>
  generatedAt: string
}

async function getToken() {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function AdminRuntimeVerificationPage() {
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runVerification = async () => {
    setIsRunning(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/runtime-verification', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Runtime verification failed.')
        return
      }

      setResult(payload)
    } catch {
      setError('Runtime verification failed.')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
        <div className="mb-6">
          <Link href="/admin" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700">
            ← Back
          </Link>
          <Header title="Runtime Verification" subtitle="Administration" />
        </div>

        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <button type="button" onClick={() => { void runVerification() }} disabled={isRunning} className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60">
            {isRunning ? 'Running Verification...' : 'Run Verification'}
          </button>

          {result ? (
            <div className="mt-5">
              <p className={`text-sm font-semibold ${result.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                {result.ok ? 'All checks passed.' : 'Some checks failed.'}
              </p>
              <p className="mt-1 text-xs text-slate-400">Generated at {formatInspectionDateTime(result.generatedAt)}</p>
              <div className="mt-3 space-y-2">
                {result.checks.map((check) => (
                  <article key={check.name} className="rounded-2xl bg-slate-950/80 px-4 py-3 text-sm">
                    <p className={check.ok ? 'text-emerald-300' : 'text-rose-300'}>{check.name}</p>
                    {check.details ? <p className="mt-1 text-xs text-slate-400">{check.details}</p> : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
