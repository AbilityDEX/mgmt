'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabaseClient } from '@/lib/supabase'

type CompanySettings = {
  companyName: string
  logoUrl: string | null
  address: string | null
  telephone: string | null
  email: string | null
  website: string | null
  reportFooter: string | null
  reportPrimaryColor: string
  reportAccentColor: string
}

async function getToken() {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function AdminCompanySettingsPage() {
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

      const response = await fetch('/api/admin/company-settings', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to load settings.')
        return
      }

      setSettings(payload.settings)
    } catch {
      setError('Failed to load settings.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!settings) return

    setIsSaving(true)
    setError(null)
    setMessage(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/company-settings', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      })

      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'Failed to save settings.')
        return
      }

      setSettings(payload.settings)
      setMessage('Company settings updated.')
    } catch {
      setError('Failed to save settings.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
        <div className="mb-6 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)]">
          <Link href="/admin" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700">
            ← Back
          </Link>
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Administration</p>
          <h1 className="mt-2 text-2xl font-semibold">Company Settings</h1>
        </div>

        {message ? <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">{message}</div> : null}
        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        {isLoading || !settings ? (
          <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-sm text-slate-400">Loading company settings...</div>
        ) : (
          <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-300">Company Name</span>
                <input className={inputClass} value={settings.companyName} onChange={(e) => setSettings((p) => (p ? { ...p, companyName: e.target.value } : p))} />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-300">Logo URL</span>
                <input className={inputClass} value={settings.logoUrl ?? ''} onChange={(e) => setSettings((p) => (p ? { ...p, logoUrl: e.target.value } : p))} />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-300">Address</span>
                <textarea className={inputClass} rows={3} value={settings.address ?? ''} onChange={(e) => setSettings((p) => (p ? { ...p, address: e.target.value } : p))} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Telephone</span>
                <input className={inputClass} value={settings.telephone ?? ''} onChange={(e) => setSettings((p) => (p ? { ...p, telephone: e.target.value } : p))} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Email</span>
                <input className={inputClass} value={settings.email ?? ''} onChange={(e) => setSettings((p) => (p ? { ...p, email: e.target.value } : p))} />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-300">Website</span>
                <input className={inputClass} value={settings.website ?? ''} onChange={(e) => setSettings((p) => (p ? { ...p, website: e.target.value } : p))} />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-300">Report Footer</span>
                <textarea className={inputClass} rows={3} value={settings.reportFooter ?? ''} onChange={(e) => setSettings((p) => (p ? { ...p, reportFooter: e.target.value } : p))} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Primary Color</span>
                <input type="color" className={inputClass} value={settings.reportPrimaryColor} onChange={(e) => setSettings((p) => (p ? { ...p, reportPrimaryColor: e.target.value } : p))} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Accent Color</span>
                <input type="color" className={inputClass} value={settings.reportAccentColor} onChange={(e) => setSettings((p) => (p ? { ...p, reportAccentColor: e.target.value } : p))} />
              </label>
            </div>

            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => { void save() }} disabled={isSaving} className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60">
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
