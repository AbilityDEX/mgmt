'use client'

import { useState, useRef } from 'react'
import type { InspectionItem, QuestionType, ChoiceOption } from '@/lib/data/inspections'

type InspectionQuestionProps = {
  item: InspectionItem
  isReadOnly?: boolean
  onAnswerChange?: (itemId: string, answer: string | null, comments?: string | null) => void
  onPhotoUpload?: (itemId: string, photoData: { file?: File; url?: string; caption?: string }) => void
  onPhotoDelete?: (itemId: string, photoId: string) => void
  localUploads?: Array<{
    tempId: string
    previewUrl: string
    status: 'compressing' | 'uploading' | 'uploaded' | 'failed'
    serverId?: string
  }>
  onRetryLocalUpload?: (itemId: string, tempId: string) => void
  onRemoveLocalUpload?: (itemId: string, tempId: string) => void
  onSignatureCapture?: (itemId: string, signatureData: string) => void
}

export default function InspectionQuestion({
  item,
  isReadOnly = false,
  onAnswerChange,
  onPhotoUpload,
  onPhotoDelete,
  localUploads = [],
  onRetryLocalUpload,
  onRemoveLocalUpload,
  onSignatureCapture,
}: InspectionQuestionProps) {
  const [localAnswer, setLocalAnswer] = useState<string | null>(item.answer)
  const [localComments, setLocalComments] = useState<string | null>(item.comments)
  const [showComments, setShowComments] = useState(item.answer === 'fail')
  const [isCapturingSignature, setIsCapturingSignature] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number>(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

  const handleFileSelect = (file?: File | null) => {
    if (!file) return
    onPhotoUpload?.(item.id, { file })
    // Do not change the item's answer when attaching supporting evidence
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
                className={`flex-1 rounded-3xl px-4 py-3 text-sm font-semibold transition ${
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
                className={`flex-1 rounded-3xl px-4 py-3 text-sm font-semibold transition ${
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
            {/* Supporting photos for pass/fail (based on template behaviour flags) */}
            {!isReadOnly && (
              <div className="mt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    handleFileSelect(f)
                    // reset input so same file can be selected again
                    if (e.target) e.target.value = ''
                  }}
                />
                {( (localAnswer === 'fail' && (item.failAllowPhotos || item.failRequirePhotos)) || (localAnswer === 'pass' && item.passAllowPhotos) ) && (
                    <div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={(item.photos ?? []).length >= (item.photoMaxCount ?? 10)}
                        className={`mt-2 rounded-3xl px-4 py-2 text-sm font-semibold ${
                          (item.photos ?? []).length >= (item.photoMaxCount ?? 10)
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25'
                        }`}
                      >
                        Add Photo
                      </button>
                      <p className="mt-2 text-xs text-slate-400">{(item.photos ?? []).length} / {(item.photoMaxCount ?? 10)} photos</p>
                    </div>
                )}
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
            <div className="rounded-3xl border-2 border-dashed border-slate-700 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between px-3">
                <div className="flex items-center gap-4">
                  <div className="text-sm font-semibold text-emerald-400">Photos</div>
                  <div className="text-xs text-slate-400">
                    ✓ Uploaded: {(item.photos ?? []).length}
                  </div>
                  <div className="text-xs text-slate-400">⟳ Uploading: {(localUploads ?? []).filter((l) => l.status === 'uploading' || l.status === 'compressing').length}</div>
                  <div className="text-xs text-slate-400">⚠ Failed: {(localUploads ?? []).filter((l) => l.status === 'failed').length}</div>
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-2xl bg-emerald-600/15 px-3 py-1 text-sm font-semibold text-emerald-300 hover:bg-emerald-600/25"
                  >
                    Add Photo
                  </button>
                )}
              </div>
              <div className="mt-3 px-3">
                <div className="flex gap-2 overflow-x-auto pb-3 items-center">
                  {/* Render server photos */}
                  {(item.photos ?? []).map((p) => (
                    <div key={p.id} className="relative flex-shrink-0">
                      <img
                        src={p.url}
                        alt={p.caption ?? 'Inspection photo'}
                        className="h-20 w-20 rounded-md object-cover cursor-pointer"
                        onClick={() => {
                          setViewerIndex((item.photos ?? []).findIndex((x) => x.id === p.id))
                          setViewerOpen(true)
                        }}
                      />
                    </div>
                  ))}

                  {/* Render local uploads */}
                  {(localUploads ?? []).map((l) => (
                    <div key={l.tempId} className="relative flex-shrink-0">
                      <img
                        src={l.previewUrl}
                        alt={`preview-${l.tempId}`}
                        className="h-20 w-20 rounded-md object-cover"
                      />
                      <div
                        className={`absolute left-1 top-1 rounded-md px-2 py-1 text-xs text-white ${
                          l.status === 'uploaded'
                            ? 'bg-emerald-600 scale-105 opacity-100'
                            : l.status === 'failed'
                            ? 'bg-rose-600 opacity-95'
                            : 'bg-black/60 opacity-90'
                        } transition-transform duration-300 ease-out`}
                        aria-live="polite"
                      >
                        {l.status === 'compressing' ? '⟳ Compressing' : l.status === 'uploading' ? '↑ Uploading' : l.status === 'uploaded' ? '✓' : '⚠'}
                      </div>
                      <div className="absolute right-1 bottom-1 flex gap-1">
                        {l.status === 'failed' ? (
                          <button onClick={() => onRetryLocalUpload?.(item.id, l.tempId)} className="rounded-full bg-amber-600/80 p-1 text-xs">Retry</button>
                        ) : null}
                        <button onClick={() => onRemoveLocalUpload?.(item.id, l.tempId)} className="rounded-full bg-rose-600/80 p-1 text-xs">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    const f = e.target.files[0]
                    onPhotoUpload?.(item.id, { file: f })
                    handleAnswerChange('captured')
                    if (e.target) e.target.value = ''
                  }
                }}
              />
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

      {viewerOpen && (item.photos ?? []).length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="relative max-w-[90%] max-h-[90%] w-full">
            <button className="absolute right-3 top-3 z-50 rounded-full bg-slate-800/60 p-2" onClick={() => setViewerOpen(false)}>Close</button>
            <div className="flex items-center justify-center">
              <button className="mx-2 p-2 text-white" onClick={() => setViewerIndex((i) => Math.max(0, i - 1))}>◀</button>
              <img src={(item.photos ?? [])[viewerIndex]?.url} alt="photo" className="max-h-[80vh] max-w-full object-contain" />
              <button className="mx-2 p-2 text-white" onClick={() => setViewerIndex((i) => Math.min((item.photos ?? []).length - 1, i + 1))}>▶</button>
            </div>
            <div className="mt-3 flex items-center justify-center gap-3">
              <a href={(item.photos ?? [])[viewerIndex]?.url} target="_blank" rel="noreferrer" download className="rounded-2xl bg-slate-800 px-4 py-2 text-sm text-slate-100">Download</a>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={async () => {
                    const pid = (item.photos ?? [])[viewerIndex]?.id
                    if (!pid) return
                    await onPhotoDelete?.(item.id, pid)
                    setViewerOpen(false)
                  }}
                  className="rounded-2xl bg-rose-600 px-4 py-2 text-sm text-white"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
