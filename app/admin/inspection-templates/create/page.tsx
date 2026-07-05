'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase'

type DraftTemplateItem = {
  id: string
  question: string
  description?: string
  isEditing: boolean
  questionType: string
  required: boolean
  failRequireComment?: boolean
  failAllowPhotos?: boolean
  failRequirePhotos?: boolean
  passAllowPhotos?: boolean
  photoMaxCount?: number
}

function createItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `item-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function CreateInspectionTemplatePage() {
  const router = useRouter()
  const [templateName, setTemplateName] = useState('')
  const [itemInput, setItemInput] = useState('')
  const [items, setItems] = useState<DraftTemplateItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const itemInputRef = useRef<HTMLInputElement | null>(null)

  const inputClass =
    'mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20'

  const addItem = () => {
    const question = itemInput.trim()
    if (!question) {
      setError('Inspection item cannot be empty.')
      itemInputRef.current?.focus()
      return
    }

    setItems((prev) => [
      ...prev,
      {
        id: createItemId(),
        question,
        description: '',
        isEditing: false,
        questionType: 'pass_fail',
        required: true,
        failRequireComment: true,
        failAllowPhotos: true,
        failRequirePhotos: false,
        passAllowPhotos: false,
        photoMaxCount: 10,
      },
    ])
    setItemInput('')
    setError(null)
    itemInputRef.current?.focus()
  }

  const updateItemQuestion = (itemId: string, question: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, question } : item))
    )
  }

  const updateItemQuestionType = (itemId: string, questionType: string) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, questionType } : item)))
  }

  const updateItemRequired = (itemId: string, required: boolean) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, required } : item)))
  }

  const updateItemBehaviour = (itemId: string, changes: Partial<DraftTemplateItem>) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...changes } : item)))
  }

  const updateItemDescription = (itemId: string, description: string) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, description } : item)))
  }

  const toggleItemEdit = (itemId: string, nextValue: boolean) => {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, isEditing: nextValue } : item))
    )
  }

  const deleteItem = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId))
  }

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= items.length) {
      return
    }

    setItems((prev) => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
  }

  const saveTemplate = async () => {
    if (saving) return

    setError(null)
    setSuccess(null)

    if (!templateName.trim()) {
      setError('Template name is required.')
      return
    }

    const normalizedItems = items
      .map((item) => ({ ...item, question: item.question.trim() }))
      .filter((item) => item.question)

    if (normalizedItems.length === 0) {
      setError('At least one inspection item is required.')
      return
    }

    setSaving(true)
    try {
      const { data } = await supabaseClient.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/inspection-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: templateName.trim(),
          items: normalizedItems.map((item, index) => ({
            question: item.question,
            description: item.description && item.description.trim() ? item.description.trim() : null,
            display_order: index + 1,
            question_type: item.questionType,
            required: item.required,
            fail_require_comment: item.failRequireComment,
            fail_allow_photos: item.failAllowPhotos,
            fail_require_photos: item.failRequirePhotos,
            pass_allow_photos: item.passAllowPhotos,
            photo_max_count: item.photoMaxCount,
          })),
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to save inspection template.')
        return
      }

      setSuccess('Template saved successfully.')
      router.push('/admin/inspection-templates?created=1')
    } catch {
      setError('Failed to save inspection template.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        <div className="mb-6 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)]">
          <Link href="/admin/inspection-templates" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700">
            ← Back
          </Link>
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Inspection Setup</p>
          <h1 className="mt-2 text-2xl font-semibold">Create Template</h1>
        </div>

        {success ? <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">{success}</div> : null}
        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <label className="block">
            <span className="text-sm text-slate-300">Template Name</span>
            <input
              type="text"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              className={inputClass}
              placeholder="Enter template name"
              disabled={saving}
            />
          </label>

          <div className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Inspection Items</h2>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                ref={itemInputRef}
                type="text"
                value={itemInput}
                onChange={(event) => setItemInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addItem()
                  }
                }}
                className="w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                placeholder="Enter inspection check..."
                disabled={saving}
              />
              <button
                type="button"
                onClick={addItem}
                className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
                disabled={saving}
              >
                Add
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {items.length === 0 ? (
                <div className="rounded-3xl bg-slate-950/80 px-4 py-4 text-sm text-slate-400">
                  No inspection items added yet.
                </div>
              ) : (
                items.map((item, index) => (
                  <article key={item.id} className="rounded-3xl bg-slate-950/80 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-1 items-center gap-3">
                        <span className="text-lg text-slate-500">☰</span>
                        {item.isEditing ? (
                          <input
                            type="text"
                            value={item.question}
                            onChange={(event) => updateItemQuestion(item.id, event.target.value)}
                            className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                            disabled={saving}
                          />
                        ) : (
                          <p className="text-sm font-medium text-slate-100">{item.question}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => moveItem(index, 'up')}
                          disabled={saving || index === 0}
                          className="rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                        >
                          Move Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(index, 'down')}
                          disabled={saving || index === items.length - 1}
                          className="rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                        >
                          Move Down
                        </button>
                        {item.isEditing ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!item.question.trim()) {
                                setError('Inspection item cannot be empty.')
                                return
                              }
                              toggleItemEdit(item.id, false)
                              setError(null)
                            }}
                            disabled={saving}
                            className="rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                          >
                            Save Edit
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleItemEdit(item.id, true)}
                            disabled={saving}
                            className="rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteItem(item.id)}
                          disabled={saving}
                          className="rounded-2xl bg-rose-600/10 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-600/15 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                      <div className="flex flex-wrap gap-4 mt-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={item.required}
                            onChange={(e) => updateItemRequired(item.id, e.target.checked)}
                            disabled={saving}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-600"
                          />
                          <span className="text-slate-300">Required</span>
                        </label>
                      </div>

                      {item.isEditing ? (
                        <>
                          <label className="mt-3 block">
                            <span className="text-xs text-slate-300">Description (Optional)</span>
                            <textarea
                              rows={2}
                              value={item.description ?? ''}
                              onChange={(e) => updateItemDescription(item.id, e.target.value)}
                              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none resize-none"
                              placeholder="Describe what the inspector should be checking..."
                              disabled={saving}
                            />
                          </label>

                          <div className="mt-3 flex items-center gap-3">
                            <label className="text-xs text-slate-300">Question Type</label>
                            <select
                              value={item.questionType}
                              onChange={(e) => updateItemQuestionType(item.id, e.target.value)}
                              disabled={saving}
                              className="rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                            >
                              <option value="pass_fail">Pass / Fail</option>
                              <option value="yes_no">Yes / No</option>
                              <option value="text">Text</option>
                              <option value="number">Number</option>
                              <option value="decimal">Decimal</option>
                              <option value="long_notes">Long Notes</option>
                              <option value="multiple_choice">Multiple Choice</option>
                              <option value="dropdown">Dropdown</option>
                              <option value="signature">Signature</option>
                            </select>
                          </div>

                          <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Inspection Behaviour</p>
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={item.failRequireComment ?? true}
                                  onChange={(e) => updateItemBehaviour(item.id, { failRequireComment: e.target.checked })}
                                  disabled={saving}
                                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-600"
                                />
                                <span className="text-slate-300">Require comment on FAIL</span>
                              </label>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={item.failAllowPhotos ?? true}
                                  onChange={(e) => updateItemBehaviour(item.id, { failAllowPhotos: e.target.checked })}
                                  disabled={saving}
                                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-600"
                                />
                                <span className="text-slate-300">Allow photo uploads on FAIL</span>
                              </label>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={item.failRequirePhotos ?? false}
                                  onChange={(e) => updateItemBehaviour(item.id, { failRequirePhotos: e.target.checked })}
                                  disabled={saving}
                                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-600"
                                />
                                <span className="text-slate-300">Require photo on FAIL</span>
                              </label>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={item.passAllowPhotos ?? false}
                                  onChange={(e) => updateItemBehaviour(item.id, { passAllowPhotos: e.target.checked })}
                                  disabled={saving}
                                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-600"
                                />
                                <span className="text-slate-300">Allow photo uploads on PASS</span>
                              </label>

                              <label className="flex items-center gap-2 text-sm">
                                <span className="text-slate-300">Photo max</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={item.photoMaxCount ?? 10}
                                  onChange={(e) => updateItemBehaviour(item.id, { photoMaxCount: Number(e.target.value || 10) })}
                                  disabled={saving}
                                  className="ml-2 w-24 rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                                />
                              </label>
                            </div>
                          </div>
                        </>
                      ) : null}
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={() => {
                void saveTemplate()
              }}
              disabled={saving}
              className="w-full rounded-3xl bg-emerald-600 px-5 py-4 text-base font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? 'Saving Template...' : 'Save Template'}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
