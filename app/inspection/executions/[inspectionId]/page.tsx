'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { formatInspectionDateTime, formatInspectionTime } from '@/lib/inspectionTime'
import { supabaseClient } from '@/lib/supabase'
import InspectionQuestion from '@/components/InspectionQuestion'
import type { InspectionItem, Inspection } from '@/lib/data/inspections'

async function getToken(): Promise<string | null> {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function InspectionExecutionPage() {
  const params = useParams<{ inspectionId: string }>()
  const inspectionId = params.inspectionId
  const hasInvalidInspectionId = !inspectionId || inspectionId === 'undefined'

  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [incompleteRequired, setIncompleteRequired] = useState<Array<{ id: string; question: string }>>([])
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // VALIDATION: Reject invalid inspection IDs
    if (!inspectionId || inspectionId === 'undefined' || inspectionId === '') {
      setError('Inspection ID is missing. Unable to load inspection.')
      setIsLoading(false)
      return
    }

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const url = `/api/inspection-executions/${encodeURIComponent(inspectionId)}`

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to load inspection.')
        return
      }

      setInspection(payload.inspection ?? null)
      setLastAutoSaveTime(payload.inspection?.lastAutoSavedAt ?? null)
    } catch {
      setError('Failed to load inspection.')
    } finally {
      setIsLoading(false)
    }
  }, [inspectionId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  // Setup autosave on interval
  useEffect(() => {
    if (!inspection || inspection.status !== 'In Progress' || !inspection.autoSaveEnabled) return

    autoSaveTimerRef.current = setInterval(async () => {
      if (autoSaving || savingItemId) return

      setAutoSaving(true)
      try {
        const token = await getToken()
        if (!token) return

        const response = await fetch(`/api/inspection-executions/autosave/${encodeURIComponent(inspectionId)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentQuestionIndex: 0,
            scrollPosition: window.scrollY,
          }),
        })

        if (response.ok) {
          setLastAutoSaveTime(new Date().toISOString())
        }
      } catch {
        // Silently fail autosave
      } finally {
        setAutoSaving(false)
      }
    }, 30000) // Autosave every 30 seconds

    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current)
    }
  }, [inspection, autoSaving, savingItemId, inspectionId])

  const isReadOnly = inspection?.status !== 'In Progress'

  const renderReadOnlyResult = (item: InspectionItem) => {
    if (!item.answer) {
      return (
        <span className="inline-flex rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">
          NOT ANSWERED
        </span>
      )
    }

    const isPass = item.answer === 'pass' || item.answer === 'yes' || item.answer === 'signed' || item.answer === 'captured'
    const isFail = item.answer === 'fail' || item.answer === 'no'

    return (
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
            isFail
              ? 'bg-rose-600/15 text-rose-300'
              : isPass
                ? 'bg-emerald-600/15 text-emerald-300'
                : 'bg-slate-700 text-slate-300'
          }`}
        >
          {isFail ? 'FAIL' : isPass ? 'PASS' : item.answer.toUpperCase()}
        </span>
        {item.comments ? <span className="text-xs text-slate-400">{item.comments}</span> : null}
      </div>
    )
  }

  const completedCount = useMemo(() => {
    if (!inspection) return 0
    return inspection.items.filter((item) => item.completed).length
  }, [inspection])

  const totalCount = inspection?.items.length ?? 0
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const updateItem = async (itemId: string, answer: string | null, comments?: string | null) => {
    if (!inspection || isReadOnly) return

    setSavingItemId(itemId)
    setError(null)
    setValidationErrors({})

    const previousItems = inspection.items

    setInspection({
      ...inspection,
      items: inspection.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              answer,
              comments: comments ?? item.comments,
              completed: Boolean(answer),
            }
          : item
      ),
    })

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        setInspection({ ...inspection, items: previousItems })
        return
      }

      const response = await fetch(`/api/inspection-executions/${encodeURIComponent(inspectionId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'item',
          item_id: itemId,
          answer,
          comments,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'Failed to save inspection response.')
        setValidationErrors(payload.fieldErrors ?? {})
        setInspection({ ...inspection, items: previousItems })
      } else if (payload.item?.id) {
        setInspection((current) =>
          current
            ? {
                ...current,
                items: current.items.map((row) =>
                  row.id === payload.item.id
                    ? {
                        ...row,
                        answer: payload.item.answer ?? null,
                        comments: payload.item.comments ?? null,
                        completed: Boolean(payload.item.completed),
                        defectId: payload.item.defectId ?? row.defectId ?? null,
                      }
                    : row
                ),
              }
            : current
        )
      }
    } catch {
      setError('Failed to save inspection response.')
      setInspection({ ...inspection, items: previousItems })
    } finally {
      setSavingItemId(null)
    }
  }

  const handleComplete = async () => {
    if (!inspection || isReadOnly || completing) return

    setCompleting(true)
    setError(null)
    setValidationErrors({})
    setIncompleteRequired([])

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch(`/api/inspection-executions/${encodeURIComponent(inspectionId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: 'complete' }),
      })

      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to complete inspection.')
        setIncompleteRequired(payload.incompleteItems ?? [])
        setValidationErrors(payload.fieldErrors ?? {})
        return
      }

      await load()
    } catch {
      setError('Failed to complete inspection.')
    } finally {
      setCompleting(false)
    }
  }

  if (hasInvalidInspectionId) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
          <div className="rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">
            Invalid inspection ID. Please start an inspection from the machine page.
          </div>
          <Link href="/inspection" className="mt-4 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700">
            ← Back to Machines
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        {/* Header */}
        <div className="mb-6 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)]">
          <Link
            href={`/inspection/${inspection?.machineId ?? ''}`}
            className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700"
          >
            ← Back
          </Link>
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Inspection Execution</p>
          <h1 className="mt-2 text-2xl font-semibold">{inspection?.machineName ?? 'Inspection'}</h1>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
            <div className="rounded-2xl bg-slate-800 px-3 py-2 text-xs sm:text-sm">
              <span className="text-slate-400">Template:</span>
              <span className="ml-1 font-semibold text-slate-100">{inspection?.templateName ?? 'Loading...'}</span>
            </div>
            <div className="rounded-2xl bg-slate-800 px-3 py-2 text-xs sm:text-sm">
              <span className="text-slate-400">Status:</span>
              <span className="ml-1 font-semibold text-slate-100">{inspection?.status ?? 'Loading...'}</span>
            </div>
            {inspection?.startedAt && (
              <div className="rounded-2xl bg-slate-800 px-3 py-2 text-xs sm:text-sm sm:col-span-2">
                <span className="text-slate-400">Started:</span>
                <span className="ml-1 font-semibold text-slate-100">
                  {formatInspectionDateTime(inspection.startedAt)}
                </span>
              </div>
            )}
          </div>

          {/* Autosave indicator */}
          {inspection?.autoSaveEnabled && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              <span className={`h-2 w-2 rounded-full ${autoSaving ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              {autoSaving ? (
                <span>Saving...</span>
              ) : lastAutoSaveTime ? (
                <span>Autosaved {formatInspectionTime(lastAutoSaveTime)}</span>
              ) : (
                <span>Autosave enabled</span>
              )}
            </div>
          )}
        </div>

        {/* Error messages */}
        {error && (
          <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">
            {error}
          </div>
        )}

        {/* Incomplete required items */}
        {incompleteRequired.length > 0 && (
          <div className="mb-4 rounded-[20px] bg-amber-500/15 px-5 py-3 text-sm font-medium text-amber-300">
            <p className="mb-2 font-semibold">Required items still incomplete:</p>
            <ul className="list-disc space-y-1 pl-5">
              {incompleteRequired.map((item) => (
                <li key={item.id}>{item.question}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Progress bar */}
        <section className="mb-6 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <div className="mb-2 flex items-center justify-between gap-3 text-sm text-slate-300">
            <span>
              {completedCount} / {totalCount} Completed
            </span>
            <span className="font-semibold">{progressPercent}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
        </section>

        {/* Completion Summary - Show when completed */}
        {isReadOnly && inspection?.completedAt && (
          <section className="mb-6 rounded-[28px] bg-emerald-950/40 border border-emerald-900/50 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">✓ Inspection Completed</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-emerald-300">Completed</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatInspectionDateTime(inspection.completedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-emerald-300">Duration</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {inspection.startedAt && inspection.completedAt
                    ? (() => {
                        const start = new Date(inspection.startedAt).getTime()
                        const end = new Date(inspection.completedAt).getTime()
                        const totalMinutes = Math.round((end - start) / 60000)
                        const hours = Math.floor(totalMinutes / 60)
                        const minutes = totalMinutes % 60
                        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
                      })()
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-emerald-300">Passed</p>
                <p className="mt-1 text-sm font-semibold text-emerald-300">{completedCount}</p>
              </div>
              <div>
                <p className="text-xs text-emerald-300">Result</p>
                <p className={`mt-1 text-sm font-semibold ${
                  inspection.items.some((item) => item.answer === 'fail')
                    ? 'text-rose-300'
                    : 'text-emerald-300'
                }`}>
                  {inspection.items.some((item) => item.answer === 'fail') ? 'FAIL' : 'PASS'}
                </p>
              </div>
            </div>
            {!error && (
              <div className="mt-4 rounded-2xl bg-emerald-900/20 px-3 py-2 text-xs text-emerald-300">
                <p>✓ Inspection completed successfully.</p>
                {inspection.items.some((item) => item.answer === 'fail') && (
                  <p className="mt-1">⚠ Review generated defects before closing.</p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Inspection items */}
        <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Inspection Items</h2>

          <div className="mt-4 space-y-4">
            {isLoading ? (
              <div className="rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-400">Loading inspection items...</div>
            ) : inspection && inspection.items.length > 0 ? (
              inspection.items.map((item) =>
                isReadOnly ? (
                  <article key={item.id} className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{item.question}</p>
                        {item.helpText ? <p className="mt-1 text-xs text-slate-400">{item.helpText}</p> : null}
                        <p className="mt-1 text-xs text-slate-400">Type: {item.questionType}</p>
                      </div>
                      {renderReadOnlyResult(item)}
                    </div>
                  </article>
                ) : (
                  <div key={item.id}>
                    <InspectionQuestion
                      item={item}
                      isReadOnly={false}
                      onAnswerChange={(itemId, answer, comments) => {
                        void updateItem(itemId, answer, comments)
                      }}
                    />
                    {validationErrors[item.id] && (
                      <p className="mt-2 text-xs text-rose-400">{validationErrors[item.id]}</p>
                    )}
                  </div>
                )
              )
            ) : (
              <div className="rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-300">
                No inspection items found for this inspection.
              </div>
            )}
          </div>
        </section>

        {/* Action buttons */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/inspection/${inspection?.machineId ?? ''}`}
            className="flex-1 rounded-3xl border border-slate-700 bg-slate-800 px-5 py-4 text-center text-base font-semibold text-slate-100 transition hover:bg-slate-700"
          >
            Save & Exit
          </Link>
          <button
            type="button"
            onClick={() => {
              void handleComplete()
            }}
            disabled={isReadOnly || completing || isLoading}
            className="flex-1 rounded-3xl bg-emerald-600 px-5 py-4 text-base font-semibold text-white shadow-[0_18px_40px_rgba(16,185,129,0.28)] transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isReadOnly ? '✓ Completed' : completing ? 'Completing...' : 'Complete Inspection'}
          </button>
        </div>
      </div>
    </main>
  )
}
