'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabaseClient } from '@/lib/supabase'

type EmailTemplate = {
  id: string
  name: string
  subject: string
  body: string
  signature: string
  active: boolean
}

async function getToken() {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function AdminEmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
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

      const response = await fetch('/api/admin/email-templates', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to load templates.')
        return
      }

      setTemplates(payload.templates ?? [])
    } catch {
      setError('Failed to load templates.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (template: EmailTemplate) => {
    setIsSaving(true)
    setError(null)
    setMessage(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/email-templates', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(template),
      })

      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'Failed to update template.')
        return
      }

      setTemplates((prev) => prev.map((row) => (row.id === template.id ? payload.template : row)))
      setMessage('Template updated.')
    } catch {
      setError('Failed to update template.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        <div className="mb-6 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)]">
          <Link href="/admin" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700">
            ← Back
          </Link>
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Administration</p>
          <h1 className="mt-2 text-2xl font-semibold">Email Templates</h1>
          <p className="mt-2 text-sm text-slate-400">Supported variables: {'{{Machine}} {{Inspector}} {{Department}} {{Result}} {{Date}} {{Reference}}'}</p>
        </div>

        {message ? <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">{message}</div> : null}
        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        {isLoading ? (
          <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-sm text-slate-400">Loading templates...</div>
        ) : (
          <div className="space-y-4">
            {templates.map((template) => (
              <section key={template.id} className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-white">{template.name}</h2>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={template.active} onChange={(e) => setTemplates((prev) => prev.map((row) => row.id === template.id ? { ...row, active: e.target.checked } : row))} />
                    Active
                  </label>
                </div>
                <label className="mt-4 block">
                  <span className="text-sm text-slate-300">Subject</span>
                  <input className={inputClass} value={template.subject} onChange={(e) => setTemplates((prev) => prev.map((row) => row.id === template.id ? { ...row, subject: e.target.value } : row))} />
                </label>
                <label className="mt-4 block">
                  <span className="text-sm text-slate-300">Body</span>
                  <textarea className={inputClass} rows={7} value={template.body} onChange={(e) => setTemplates((prev) => prev.map((row) => row.id === template.id ? { ...row, body: e.target.value } : row))} />
                </label>
                <label className="mt-4 block">
                  <span className="text-sm text-slate-300">Signature</span>
                  <textarea className={inputClass} rows={3} value={template.signature} onChange={(e) => setTemplates((prev) => prev.map((row) => row.id === template.id ? { ...row, signature: e.target.value } : row))} />
                </label>

                <div className="mt-5 flex justify-end">
                  <button type="button" disabled={isSaving} onClick={() => { void save(template) }} className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60">
                    {isSaving ? 'Saving...' : 'Save Template'}
                  </button>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
