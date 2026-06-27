'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase'
import type { DraftInspection } from '@/lib/data/inspections'

async function getToken(): Promise<string | null> {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function DraftInspectionsPage() {
  const router = useRouter()
  const [drafts, setDrafts] = useState<DraftInspection[]>([])
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

      const response = await fetch('/api/inspection-executions/drafts', {
        headers: { Authorization: `Bearer ${token}` },
      })

      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to load drafts.')
        return
      }

      setDrafts(payload.drafts ?? [])
    } catch {
      setError('Failed to load draft inspections.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const handleResume = (inspectionId: string) => {
    router.push(`/inspection/executions/${inspectionId}`)
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        {/* Header */}
        <div className="mb-6 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)]">
          <Link
            href="/dashboard"
            className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700"
          >
            ← Back
          </Link>
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Incomplete Inspections</p>
          <h1 className="mt-2 text-3xl font-semibold">Resume Inspections</h1>
          <p className="mt-2 text-sm text-slate-400">
            You have {drafts.length} incomplete inspection{drafts.length !== 1 ? 's' : ''} saved
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
            <div className="text-center text-slate-400">Loading incomplete inspections...</div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && drafts.length === 0 && (
          <div className="rounded-[28px] bg-slate-900/90 p-8 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <div className="text-center">
              <p className="mb-2 text-lg font-semibold text-slate-200">No incomplete inspections</p>
              <p className="text-sm text-slate-400">All your inspections are complete!</p>
              <Link
                href="/inspection"
                className="mt-4 inline-flex rounded-3xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Start New Inspection
              </Link>
            </div>
          </div>
        )}

        {/* Draft list */}
        {!isLoading && drafts.length > 0 && (
          <section className="space-y-3 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-100">{draft.machineName}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Template: <span className="font-semibold text-slate-300">{draft.templateName}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="rounded-full bg-slate-800 px-2.5 py-1">
                      Started: {new Date(draft.started).toLocaleString()}
                    </span>
                    <span className="rounded-full bg-slate-800 px-2.5 py-1">
                      Last edited: {new Date(draft.lastEdited).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-400">Progress</span>
                      <span className="font-semibold text-emerald-400">{draft.progressPercent}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${draft.progressPercent}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-400">
                      {draft.remainingQuestions} of {draft.totalQuestions} questions remaining
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleResume(draft.id)}
                  className="rounded-3xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 sm:whitespace-nowrap"
                >
                  Resume Inspection
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}
