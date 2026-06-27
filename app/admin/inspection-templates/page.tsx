'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase'

type InspectionTemplate = {
  id: string
  name: string
  description: string | null
  itemCount: number
  machineCount?: number
  lastUpdated: string
}

function AdminInspectionTemplatesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isCreated = searchParams.get('created') === '1'
  const isUpdated = searchParams.get('updated') === '1'
  const isDeleted = searchParams.get('deleted') === '1'

  const [templates, setTemplates] = useState<InspectionTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { data } = await supabaseClient.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/inspection-templates', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to load inspection templates.')
        return
      }

      setTemplates(payload.templates ?? [])
    } catch {
      setError('Failed to load inspection templates.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  useEffect(() => {
    if (!isCreated && !isUpdated && !isDeleted) {
      return
    }

    const timeout = setTimeout(() => {
      router.replace('/admin/inspection-templates')
    }, 3000)

    return () => clearTimeout(timeout)
  }, [isCreated, isUpdated, isDeleted, router])

  const deleteTemplate = async (id: string) => {
    setDeleting(true)
    setError(null)

    try {
      const { data } = await supabaseClient.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setError('Authentication required.')
        setDeleting(false)
        return
      }

      const response = await fetch(`/api/inspection-templates?template_id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to delete inspection template.')
        setDeleting(false)
        return
      }

      setDeleteConfirmId(null)
      await load()
    } catch {
      setError('Failed to delete inspection template.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        <div className="mb-6 flex flex-col gap-4 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/admin" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700 sm:mb-0">
              ← Back
            </Link>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Inspection Setup</p>
            <h1 className="mt-2 text-2xl font-semibold">Inspection Templates</h1>
          </div>
          <Link
            href="/admin/inspection-templates/create"
            className="rounded-3xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500"
          >
            + Create Template
          </Link>
        </div>

        {isCreated ? <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">Template saved successfully.</div> : null}
        {isUpdated ? <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">Template updated successfully.</div> : null}
        {isDeleted ? <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">Template deleted successfully.</div> : null}
        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        <div className="space-y-4">
          {isLoading ? (
            <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-center text-slate-400 shadow-xl shadow-black/20">
              <p className="text-sm">Loading inspection templates...</p>
            </div>
          ) : templates.length > 0 ? (
            templates.map((template) => (
              <article key={template.id} className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Link href={`/admin/inspection-templates/${template.id}`} className="text-lg font-semibold text-white transition hover:text-emerald-300">
                      {template.name}
                    </Link>
                    {template.description ? <p className="mt-2 text-sm text-slate-400">{template.description}</p> : null}
                    <p className="mt-4 text-sm text-slate-300">Inspection Items: <span className="font-semibold text-white">{template.itemCount}</span></p>
                    <p className="mt-1 text-sm text-slate-300">Assigned to Machines: <span className="font-semibold text-white">{template.machineCount ?? 0}</span></p>
                    <p className="mt-1 text-sm text-slate-400">Last Updated: {new Date(template.lastUpdated).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-3">
                    <Link
                      href={`/admin/inspection-templates/${template.id}`}
                      className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-600 hover:bg-slate-700"
                    >
                      View
                    </Link>
                    <Link
                      href={`/admin/inspection-templates/${template.id}/edit`}
                      className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-600 hover:bg-slate-700"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(template.id)}
                      disabled={deleting}
                      className="rounded-2xl bg-rose-600/10 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-600/15 disabled:opacity-70"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-center text-slate-300 shadow-xl shadow-black/20">
              <p className="text-sm">No inspection templates have been created.</p>
            </div>
          )}
        </div>

        {deleteConfirmId ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="rounded-[28px] bg-slate-900 p-6 shadow-2xl">
              <h2 className="text-xl font-semibold text-white">Delete Template?</h2>
              <p className="mt-2 text-sm text-slate-300">
                This will permanently delete this template and all its inspection items. This action cannot be undone.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  disabled={deleting}
                  className="flex-1 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void deleteTemplate(deleteConfirmId)
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

export default function AdminInspectionTemplatesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center"><p>Loading...</p></div>}>
      <AdminInspectionTemplatesContent />
    </Suspense>
  )
}
