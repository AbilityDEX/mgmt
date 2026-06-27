'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase'

type DraftTemplateItem = {
  id?: string
  question: string
  questionType: string
  required: boolean
  displayOrder: number
  isEditing: boolean
}

type TemplateItem = {
  id: string
  question: string
  question_type: string
  required: boolean
  display_order: number
  created_at: string
}

function createItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `item-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function getToken(): Promise<string | null> {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function EditInspectionTemplatePage() {
  const router = useRouter()
  const params = useParams<{ templateId: string }>()
  const templateId = params.templateId

  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [items, setItems] = useState<DraftTemplateItem[]>([])
  const [itemInput, setItemInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const itemInputRef = useRef<HTMLInputElement | null>(null)

  const inputClass =
    'mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20'

  // Load template and items
  const loadTemplate = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch(`/api/inspection-templates?template_id=${encodeURIComponent(templateId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to load template.')
        return
      }

      const template = payload.template
      const templateItems = payload.items ?? []

      setTemplateName(template.name)
      setTemplateDescription(template.description || '')

      const draftItems = templateItems.map((item: TemplateItem) => ({
        id: item.id,
        question: item.question,
        questionType: item.question_type,
        required: item.required,
        displayOrder: item.display_order,
        isEditing: false,
      }))

      setItems(draftItems)
    } catch {
      setError('Failed to load template.')
    } finally {
      setLoading(false)
    }
  }, [templateId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTemplate()
  }, [loadTemplate])

  const addItem = () => {
    const question = itemInput.trim()
    if (!question) {
      setError('Inspection item cannot be empty.')
      itemInputRef.current?.focus()
      return
    }

    const newOrder = items.length > 0 ? Math.max(...items.map((i) => i.displayOrder)) + 1 : 1

    setItems((prev) => [
      ...prev,
      {
        question,
        questionType: 'pass_fail',
        required: true,
        displayOrder: newOrder,
        isEditing: false,
      },
    ])
    setItemInput('')
    setError(null)
    itemInputRef.current?.focus()
  }

  const updateItemQuestion = (idx: number, question: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, question } : item))
    )
  }

  const updateItemRequired = (idx: number, required: boolean) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, required } : item))
    )
  }

  const toggleItemEdit = (idx: number, nextValue: boolean) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, isEditing: nextValue } : item))
    )
  }

  const deleteItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
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

      // Update display orders
      return next.map((item, i) => ({
        ...item,
        displayOrder: i + 1,
      }))
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
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch(`/api/inspection-templates?template_id=${encodeURIComponent(templateId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: templateName.trim(),
          description: templateDescription.trim() || null,
          items: normalizedItems.map((item) => ({
            id: item.id,
            question: item.question,
            question_type: item.questionType,
            required: item.required,
            display_order: item.displayOrder,
          })),
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to save inspection template.')
        return
      }

      setSuccess('Template saved successfully.')
      // Refresh the list and redirect
      setTimeout(() => {
        router.push('/admin/inspection-templates?updated=1')
      }, 1000)
    } catch {
      setError('Failed to save inspection template.')
    } finally {
      setSaving(false)
    }
  }

  const deleteTemplate = async () => {
    if (deleting) return

    setError(null)
    setDeleting(true)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch(`/api/inspection-templates?template_id=${encodeURIComponent(templateId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to delete inspection template.')
        return
      }

      // Redirect to list
      router.push('/admin/inspection-templates?deleted=1')
    } catch {
      setError('Failed to delete inspection template.')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
          <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-center text-slate-400 shadow-xl shadow-black/20">
            <p className="text-sm">Loading template...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        <div className="mb-6 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)]">
          <Link href="/admin/inspection-templates" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700">
            ← Back
          </Link>
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Inspection Setup</p>
          <h1 className="mt-2 text-2xl font-semibold">Edit Template</h1>
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
              disabled={saving || deleting}
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm text-slate-300">Description (Optional)</span>
            <textarea
              value={templateDescription}
              onChange={(event) => setTemplateDescription(event.target.value)}
              className={`${inputClass} resize-none`}
              placeholder="Enter template description"
              disabled={saving || deleting}
              rows={3}
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
                disabled={saving || deleting}
              />
              <button
                type="button"
                onClick={addItem}
                className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
                disabled={saving || deleting}
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
                  <article key={index} className="rounded-3xl bg-slate-950/80 p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-1 items-center gap-3">
                          <span className="text-lg text-slate-500">☰</span>
                          {item.isEditing ? (
                            <input
                              type="text"
                              value={item.question}
                              onChange={(event) => updateItemQuestion(index, event.target.value)}
                              className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                              disabled={saving || deleting}
                            />
                          ) : (
                            <p className="text-sm font-medium text-slate-100">{item.question}</p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => moveItem(index, 'up')}
                            disabled={saving || deleting || index === 0}
                            className="rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                          >
                            Move Up
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(index, 'down')}
                            disabled={saving || deleting || index === items.length - 1}
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
                                toggleItemEdit(index, false)
                                setError(null)
                              }}
                              disabled={saving || deleting}
                              className="rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                            >
                              Save Edit
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleItemEdit(index, true)}
                              disabled={saving || deleting}
                              className="rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                            >
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteItem(index)}
                            disabled={saving || deleting}
                            className="rounded-2xl bg-rose-600/10 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-600/15 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={item.required}
                            onChange={(event) => updateItemRequired(index, event.target.checked)}
                            disabled={saving || deleting}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-600"
                          />
                          <span className="text-slate-300">Required</span>
                        </label>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                void saveTemplate()
              }}
              disabled={saving || deleting}
              className="flex-1 rounded-3xl bg-emerald-600 px-5 py-4 text-base font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? 'Saving Template...' : 'Save Template'}
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving || deleting}
              className="rounded-3xl bg-rose-600/10 px-5 py-4 text-base font-semibold text-rose-300 transition hover:bg-rose-600/15 disabled:opacity-60"
            >
              Delete Template
            </button>
          </div>
        </section>

        {showDeleteConfirm ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="rounded-[28px] bg-slate-900 p-6 shadow-2xl">
              <h2 className="text-xl font-semibold text-white">Delete Template?</h2>
              <p className="mt-2 text-sm text-slate-300">
                This will permanently delete this template and all its inspection items. This action cannot be undone.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void deleteTemplate()
                  }}
                  disabled={deleting}
                  className="flex-1 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}
