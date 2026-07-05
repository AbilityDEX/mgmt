'use client'

import { useState, useRef } from 'react'
import { supabaseClient } from '@/lib/supabase'
import type { InspectionItem, QuestionType, ChoiceOption } from '@/lib/data/inspections'

type InspectionQuestionProps = {
  item: InspectionItem
  isReadOnly?: boolean
  onAnswerChange?: (itemId: string, answer: string | null, comments?: string | null) => void
  onPhotoUpload?: (itemId: string, file: File) => void
  onSignatureCapture?: (itemId: string, signatureData: string) => void
  onPhotosChanged?: (itemId: string) => void
}

export default function InspectionQuestion({
  item,
  isReadOnly = false,
  onAnswerChange,
  onPhotoUpload,
  onSignatureCapture,
  onPhotosChanged,
}: InspectionQuestionProps) {
  const [localAnswer, setLocalAnswer] = useState<string | null>(item.answer)
  const [localComments, setLocalComments] = useState<string | null>(item.comments)
  const [showComments, setShowComments] = useState(item.answer === 'fail')
  const [isCapturingSignature, setIsCapturingSignature] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)

  const inputClass =
    'mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20'

  const handleAnswerChange = (answer: string | null) => {
    setLocalAnswer(answer)
    onAnswerChange?.(item.id, answer, localComments ?? undefined)

    // Show comments for fail/no answers
    if (answer === 'fail' || answer === 'no') {
      setShowComments(true)
    } else {
      setShowComments(false)
      setLocalComments(null)
    }
  }

  const handleCommentsChange = (comments: string) => {
    setLocalComments(comments || null)
    onAnswerChange?.(item.id, localAnswer, comments || undefined)
  }

  const renderQuestion = () => {
    const baseQuestion = (
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-100">{item.question}</p>
            {item.helpText && <p className="mt-1 text-xs text-slate-400">{item.helpText}</p>}
          </div>
          {item.required && <span className="text-xs font-semibold text-rose-400">Required</span>}
        </div>
      </div>
    )

    switch (item.questionType) {
      case 'pass_fail':
        return (
          <div className="space-y-3">
            {baseQuestion}
            <div className="flex flex-wrap gap-3 sm:flex-nowrap">
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => handleAnswerChange('pass')}
                className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isReadOnly
                    ? 'cursor-not-allowed bg-slate-800 text-slate-400'
                    : localAnswer === 'pass'
                      ? 'bg-emerald-600 text-white shadow-[0_10px_20px_rgba(16,185,129,0.25)]'
                      : 'bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/25'
                }`}
              >
                ✓ PASS
              </button>
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => handleAnswerChange('fail')}
                className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isReadOnly
                    ? 'cursor-not-allowed bg-slate-800 text-slate-400'
                    : localAnswer === 'fail'
                      ? 'bg-rose-600 text-white shadow-[0_10px_20px_rgba(244,63,94,0.25)]'
                      : 'bg-rose-600/15 text-rose-200 hover:bg-rose-600/25'
                }`}
              >
                ✗ FAIL
              </button>
            </div>
            {showComments && !isReadOnly && (
              <div className="mt-4 space-y-3 rounded-3xl border border-rose-500/20 bg-rose-500/5 p-4">
                <label className="block">
                  <span className="text-sm font-semibold text-rose-300">Issue Description</span>
                  <textarea
                    rows={3}
                    value={localComments ?? ''}
                    onChange={(e) => handleCommentsChange(e.target.value)}
                    placeholder="Describe the issue..."
                    className={`${inputClass} mt-2 resize-none`}
                  />
                </label>
              </div>
            )}
          </div>
        )

      case 'yes_no':
        return (
          <div className="space-y-3">
            {baseQuestion}
            <div className="flex flex-wrap gap-3 sm:flex-nowrap">
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => handleAnswerChange('yes')}
                className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isReadOnly
                    ? 'cursor-not-allowed bg-slate-800 text-slate-400'
                    : localAnswer === 'yes'
                      ? 'bg-emerald-600 text-white shadow-[0_10px_20px_rgba(16,185,129,0.25)]'
                      : 'bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/25'
                }`}
              >
                ✓ YES
              </button>
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => handleAnswerChange('no')}
                className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isReadOnly
                    ? 'cursor-not-allowed bg-slate-800 text-slate-400'
                    : localAnswer === 'no'
                      ? 'bg-rose-600 text-white shadow-[0_10px_20px_rgba(244,63,94,0.25)]'
                      : 'bg-rose-600/15 text-rose-200 hover:bg-rose-600/25'
                }`}
              >
                ✗ NO
              </button>
            </div>
            {showComments && !isReadOnly && (
              <div className="mt-4 space-y-3 rounded-3xl border border-rose-500/20 bg-rose-500/5 p-4">
                <label className="block">
                  <span className="text-sm font-semibold text-rose-300">Details</span>
                  <textarea
                    rows={3}
                    value={localComments ?? ''}
                    onChange={(e) => handleCommentsChange(e.target.value)}
                    placeholder="Provide details..."
                    className={`${inputClass} mt-2 resize-none`}
                  />
                </label>
              </div>
            )}
          </div>
        )

      case 'text':
        return (
          <div className="space-y-3">
            {baseQuestion}
            <input
              type="text"
              disabled={isReadOnly}
              value={localAnswer ?? ''}
              onChange={(e) => handleAnswerChange(e.target.value || null)}
              placeholder={item.placeholderText || 'Enter text...'}
              className={`${inputClass} ${isReadOnly ? 'bg-slate-900 text-slate-400' : ''}`}
            />
          </div>
        )

      case 'number':
        return (
          <div className="space-y-3">
            {baseQuestion}
            <input
              type="number"
              disabled={isReadOnly}
              value={localAnswer ?? ''}
              onChange={(e) => handleAnswerChange(e.target.value || null)}
              placeholder={item.placeholderText || 'Enter number...'}
              min={item.validationRules?.min}
              max={item.validationRules?.max}
              step="1"
              className={`${inputClass} ${isReadOnly ? 'bg-slate-900 text-slate-400' : ''}`}
            />
          </div>
        )

      case 'decimal':
        return (
          <div className="space-y-3">
            {baseQuestion}
            <input
              type="number"
              disabled={isReadOnly}
              value={localAnswer ?? ''}
              onChange={(e) => handleAnswerChange(e.target.value || null)}
              placeholder={item.placeholderText || 'Enter decimal number...'}
              min={item.validationRules?.min}
              max={item.validationRules?.max}
              step={item.validationRules?.step || '0.01'}
              className={`${inputClass} ${isReadOnly ? 'bg-slate-900 text-slate-400' : ''}`}
            />
          </div>
        )

      case 'long_notes':
        return (
          <div className="space-y-3">
            {baseQuestion}
            <textarea
              disabled={isReadOnly}
              value={localAnswer ?? ''}
              onChange={(e) => handleAnswerChange(e.target.value || null)}
              placeholder={item.placeholderText || 'Enter detailed notes...'}
              rows={5}
              className={`${inputClass} resize-none ${isReadOnly ? 'bg-slate-900 text-slate-400' : ''}`}
            />
          </div>
        )

      case 'multiple_choice':
        return (
          <div className="space-y-3">
            {baseQuestion}
            <div className="space-y-2">
              {(item.options ?? []).map((option: ChoiceOption) => (
                <label key={option.value} className="flex items-center gap-3 rounded-2xl border border-slate-800 p-3 cursor-pointer hover:bg-slate-900/50">
                  <input
                    type="radio"
                    disabled={isReadOnly}
                    checked={localAnswer === option.value}
                    onChange={() => handleAnswerChange(option.value)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  <span className="text-sm text-slate-100">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        )

      case 'dropdown':
        return (
          <div className="space-y-3">
            {baseQuestion}
            <select
              disabled={isReadOnly}
              value={localAnswer ?? ''}
              onChange={(e) => handleAnswerChange(e.target.value || null)}
              className={`${inputClass} ${isReadOnly ? 'bg-slate-900 text-slate-400' : ''}`}
            >
              <option value="">Select an option...</option>
              {(item.options ?? []).map((option: ChoiceOption) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )

      case 'photo':
        return (
          <div className="space-y-3">
            {baseQuestion}
            {item.photoRequired && <p className="text-xs text-amber-400">Photo required</p>}
            <div className="rounded-3xl border-2 border-dashed border-slate-700 bg-slate-950/50 p-6 text-center">
              {(item.photos ?? []).length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-emerald-400">
                    {(item.photos ?? []).length} photo(s) uploaded
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-2xl bg-emerald-600/15 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-600/25"
                      >
                        Add Photo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setViewerIndex(0)
                        setViewerOpen(true)
                      }}
                      className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
                    >
                      View Photos
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {(item.photos ?? []).map((p, idx) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setViewerIndex(idx)
                          setViewerOpen(true)
                        }}
                        className="h-20 w-full overflow-hidden rounded-lg bg-slate-800"
                      >
                        <img src={p.url} alt={p.caption ?? 'Photo'} className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  📸 Tap to upload photo
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    onPhotoUpload?.(item.id, file)
                    handleAnswerChange('captured')
                  }
                }}
              />
              {/* Viewer modal */}
              {viewerOpen && (item.photos ?? [])[viewerIndex] && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                  <div className="relative max-h-full max-w-full">
                    <button
                      type="button"
                      onClick={() => setViewerOpen(false)}
                      className="absolute right-2 top-2 rounded-full bg-slate-900/70 px-3 py-2 text-sm"
                    >
                      Close
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setViewerIndex((i) => Math.max(0, i - 1))}
                        className="rounded-lg bg-slate-800 px-3 py-2 text-white"
                      >
                        ◀
                      </button>
                      <img src={(item.photos ?? [])[viewerIndex].url} alt={(item.photos ?? [])[viewerIndex].caption ?? 'Photo'} className="max-h-[80vh] max-w-[80vw] object-contain" />
                      <button
                        type="button"
                        onClick={() => setViewerIndex((i) => Math.min((item.photos ?? []).length - 1, i + 1))}
                        className="rounded-lg bg-slate-800 px-3 py-2 text-white"
                      >
                        ▶
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <a href={(item.photos ?? [])[viewerIndex].url} target="_blank" rel="noreferrer" className="text-sm text-slate-200 underline">Download</a>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const { data } = await supabaseClient.auth.getSession()
                              const token = data.session?.access_token
                              if (!token) throw new Error('Authentication required')
                              const pid = (item.photos ?? [])[viewerIndex].id
                              const resp = await fetch(`/api/inspection-photos/${pid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
                              const payload = await resp.json()
                              if (!resp.ok) throw new Error(payload.error || 'Failed to delete')
                              onPhotosChanged?.(item.id)
                              setViewerOpen(false)
                            } catch (e) {
                              // ignore for now
                            }
                          }}
                          className="rounded-2xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )

      case 'signature':
        return (
          <div className="space-y-3">
            {baseQuestion}
            {item.signatureRequired && <p className="text-xs text-amber-400">Signature required</p>}
            <div className="rounded-3xl border-2 border-dashed border-slate-700 bg-slate-950/50 p-6">
              {localAnswer === 'signed' ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm font-semibold text-emerald-400">✓ Signature captured</p>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setLocalAnswer(null)
                        setIsCapturingSignature(false)
                      }}
                      className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
                    >
                      Clear Signature
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => setIsCapturingSignature(!isCapturingSignature)}
                  className="w-full rounded-2xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ✍️ {isCapturingSignature ? 'Drawing...' : 'Tap to add signature'}
                </button>
              )}
              {isCapturingSignature && (
                <div className="mt-4 space-y-3">
                  <canvas
                    ref={canvasRef}
                    className="w-full border border-slate-600 rounded-2xl bg-white h-32"
                    onMouseDown={(e) => {
                      const canvas = canvasRef.current
                      if (!canvas) return
                      const ctx = canvas.getContext('2d')
                      if (!ctx) return
                      ctx.beginPath()
                      ctx.moveTo(
                        e.clientX - canvas.getBoundingClientRect().left,
                        e.clientY - canvas.getBoundingClientRect().top
                      )
                    }}
                    onMouseMove={(e) => {
                      if (e.buttons === 0) return
                      const canvas = canvasRef.current
                      if (!canvas) return
                      const ctx = canvas.getContext('2d')
                      if (!ctx) return
                      ctx.lineTo(
                        e.clientX - canvas.getBoundingClientRect().left,
                        e.clientY - canvas.getBoundingClientRect().top
                      )
                      ctx.stroke()
                    }}
                  />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const canvas = canvasRef.current
                        if (canvas) {
                          const ctx = canvas.getContext('2d')
                          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
                        }
                      }}
                      className="flex-1 rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const canvas = canvasRef.current
                        if (canvas) {
                          const signatureData = canvas.toDataURL()
                          onSignatureCapture?.(item.id, signatureData)
                          handleAnswerChange('signed')
                          setIsCapturingSignature(false)
                        }
                      }}
                      className="flex-1 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )

      default:
        return (
          <div className="space-y-3">
            {baseQuestion}
            <p className="text-sm text-slate-400">Unknown question type: {item.questionType}</p>
          </div>
        )
    }
  }

  return (
    <div className="rounded-[24px] border border-slate-800 bg-slate-900/95 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
      {renderQuestion()}
    </div>
  )
}
