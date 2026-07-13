'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { formatInspectionDateTime } from '@/lib/inspectionTime'
import { supabaseClient } from '@/lib/supabase'
import type { InspectionItem, Inspection } from '@/lib/data/inspections'

async function getToken(): Promise<string | null> {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function InspectionHistoryPage() {
  const params = useParams<{ inspectionId: string }>()
  const inspectionId = params.inspectionId

  const [inspection, setInspection] = useState<Inspection | null>(null)
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

      const response = await fetch(`/api/inspection-executions/${encodeURIComponent(inspectionId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to load inspection.')
        return
      }

      setInspection(payload.inspection ?? null)
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

  const passCount = inspection?.items.filter((item) => item.answer === 'pass').length ?? 0
  const failCount = inspection?.items.filter((item) => item.answer === 'fail').length ?? 0
  const incompleteCount = inspection?.items.filter((item) => !item.answer).length ?? 0

  const handlePrint = () => {
    window.print()
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 print:bg-white print:text-slate-900">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6 print:pb-0 print:pt-0">
        {/* Header */}
        <div className="mb-6 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)] print:rounded-none print:bg-white print:shadow-none">
          <div className="flex items-center justify-between gap-4 print:hidden">
            <div>
              <Link
                href={`/inspection/${inspection?.machineId ?? ''}`}
                className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700"
              >
                ← Back
              </Link>
              <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Inspection Record</p>
              <h1 className="mt-2 text-2xl font-semibold">{inspection?.machineName ?? 'Inspection'}</h1>
            </div>
            <button
              onClick={handlePrint}
              className="rounded-3xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              🖨️ Print
            </button>
          </div>
          <p className="print:mt-0 print:text-xl print:font-bold print:text-slate-900 mt-4 text-xs uppercase tracking-[0.35em] text-emerald-400">
            Inspection Record
          </p>
          <h1 className="print:mt-2 print:text-2xl print:font-bold print:text-slate-900 mt-2 text-2xl font-semibold">
            {inspection?.machineName ?? 'Inspection'}
          </h1>

          <div className="print:mt-4 print:grid print:grid-cols-2 print:gap-3 print:border-t print:border-slate-300 print:pt-4 mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
            <div className="print:text-sm print:text-slate-900 rounded-2xl bg-slate-800 px-3 py-2 text-xs sm:text-sm">
              <span className="print:text-slate-600 text-slate-400">Template:</span>
              <span className="ml-1 font-semibold text-slate-100 print:text-slate-900">{inspection?.templateName ?? 'N/A'}</span>
            </div>
            <div className="print:text-sm print:text-slate-900 rounded-2xl bg-slate-800 px-3 py-2 text-xs sm:text-sm">
              <span className="print:text-slate-600 text-slate-400">Status:</span>
              <span className="ml-1 font-semibold text-slate-100 print:text-slate-900">{inspection?.status ?? 'N/A'}</span>
            </div>
            {inspection?.startedAt && (
              <div className="print:text-sm print:text-slate-900 rounded-2xl bg-slate-800 px-3 py-2 text-xs sm:text-sm">
                <span className="print:text-slate-600 text-slate-400">Started:</span>
                <span className="ml-1 font-semibold text-slate-100 print:text-slate-900">
                  {formatInspectionDateTime(inspection.startedAt)}
                </span>
              </div>
            )}
            {inspection?.completedAt && (
              <div className="print:text-sm print:text-slate-900 rounded-2xl bg-slate-800 px-3 py-2 text-xs sm:text-sm">
                <span className="print:text-slate-600 text-slate-400">Completed:</span>
                <span className="ml-1 font-semibold text-slate-100 print:text-slate-900">
                  {formatInspectionDateTime(inspection.completedAt)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="print:hidden mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">
            {error}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="print:hidden rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <div className="text-center text-slate-400">Loading inspection details...</div>
          </div>
        )}

        {/* Summary */}
        {!isLoading && inspection && (
          <>
            <section className="mb-6 grid grid-cols-3 gap-3 sm:gap-4 print:gap-3">
              <div className="print:border print:border-green-700 print:bg-green-50 rounded-[20px] bg-emerald-600/15 p-4 text-center">
                <p className="print:text-green-700 text-emerald-400 text-xs font-semibold uppercase">PASS</p>
                <p className="print:text-green-900 mt-1 text-2xl font-bold text-emerald-100">{passCount}</p>
              </div>
              <div className="print:border print:border-red-700 print:bg-red-50 rounded-[20px] bg-rose-600/15 p-4 text-center">
                <p className="print:text-red-700 text-rose-400 text-xs font-semibold uppercase">FAIL</p>
                <p className="print:text-red-900 mt-1 text-2xl font-bold text-rose-100">{failCount}</p>
              </div>
              <div className="print:border print:border-gray-400 print:bg-gray-50 rounded-[20px] bg-slate-700/50 p-4 text-center">
                <p className="print:text-gray-700 text-slate-400 text-xs font-semibold uppercase">INCOMPLETE</p>
                <p className="print:text-gray-900 mt-1 text-2xl font-bold text-slate-200">{incompleteCount}</p>
              </div>
            </section>

            {/* Inspection items */}
            <section className="space-y-3 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)] print:rounded-none print:bg-white print:p-0 print:shadow-none">
              <h2 className="print:border-b print:border-slate-300 print:pb-4 print:text-xl print:font-bold print:text-slate-900 text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">
                Inspection Details
              </h2>

              <div className="print:space-y-4 mt-4 space-y-4">
                {inspection.items.map((item: InspectionItem, index: number) => (
                  <div
                    key={item.id}
                    className="print:border print:border-slate-300 print:p-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 print:bg-white print:rounded-none"
                  >
                    <div className="flex items-start gap-3">
                      <div className="print:text-slate-400 mt-1 text-sm font-bold text-slate-500">{index + 1}</div>
                      <div className="flex-1">
                        <p className="print:text-slate-900 text-sm font-semibold text-slate-100">{item.question}</p>
                        <p className="print:text-slate-600 mt-1 text-xs text-slate-400">
                          Type: <span className="font-semibold">{item.questionType}</span>
                          {item.required && <span className="ml-2 text-rose-400">• Required</span>}
                        </p>

                        {/* Answer */}
                        <div className="mt-2">
                          {item.answer ? (
                            <div className="flex items-center gap-2">
                              {item.answer === 'fail' ? (
                                <>
                                  <span className="inline-flex rounded-full bg-rose-600/15 px-3 py-1 text-xs font-semibold text-rose-300 print:bg-red-100 print:text-red-700">
                                    ✗ FAIL
                                  </span>
                                  {item.comments && (
                                    <span className="print:text-slate-700 text-xs text-slate-400">
                                      {item.comments}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="inline-flex rounded-full bg-emerald-600/15 px-3 py-1 text-xs font-semibold text-emerald-300 print:bg-green-100 print:text-green-700">
                                  ✓ PASS
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-300 print:bg-gray-200 print:text-gray-700">
                              NOT ANSWERED
                            </span>
                          )}
                        </div>

                        {/* Photos */}
                        {item.photos && item.photos.length > 0 && (
                          <div className="mt-2">
                            <p className="print:text-slate-700 text-xs font-semibold text-slate-400">
                              Photos ({item.photos.length})
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {item.photos.map((photo, idx) => (
                                <div key={idx} className="text-xs text-slate-400 print:text-slate-700">
                                  📸 {photo.caption || `Photo ${idx + 1}`}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Signature */}
                        {item.signature && (
                          <div className="mt-2">
                            <p className="print:text-slate-700 text-xs font-semibold text-slate-400">
                              ✍️ Signature captured on {formatInspectionDateTime(item.signature.timestamp)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Print footer */}
            <div className="print:mt-6 print:border-t print:border-slate-300 print:pt-4 print:text-center print:text-xs print:text-slate-600">
              <p>This inspection record was generated on {formatInspectionDateTime(new Date())}</p>
              <p className="print:mt-1">MGPC Inspect - Machine Inspection System</p>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
