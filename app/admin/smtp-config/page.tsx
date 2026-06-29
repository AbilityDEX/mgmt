'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { formatInspectionDateTime } from '@/lib/inspectionTime'
import { supabaseClient } from '@/lib/supabase'

type SmtpConfig = {
  configured: boolean
  host: string
  port: number
  username: string
  encryption: 'SSL/TLS' | 'STARTTLS' | 'NONE'
  fromName: string
  fromEmail: string
  replyToEmail: string | null
  hasPassword: boolean
  updatedAt: string | null
  migrationMissing?: boolean
  warning?: string | null
}

async function getToken() {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function AdminSmtpConfigPage() {
  const [config, setConfig] = useState<SmtpConfig | null>(null)
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const inputClass = 'mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20'

  const loadConfig = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/smtp-config', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = (await response.json()) as { config?: SmtpConfig; error?: string }

      if (!response.ok || !payload.config) {
        setError(payload.error || 'Failed to load SMTP configuration.')
        return
      }

      setConfig(payload.config)
    } catch {
      setError('Failed to load SMTP configuration.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const save = async () => {
    if (!config) return

    setIsSaving(true)
    setError(null)
    setMessage(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/smtp-config', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: config.host,
          port: Number(config.port),
          username: config.username,
          password,
          encryption: config.encryption,
          fromName: config.fromName,
          fromEmail: config.fromEmail,
          replyToEmail: config.replyToEmail,
        }),
      })

      const payload = (await response.json()) as { config?: SmtpConfig; message?: string; error?: string }
      if (!response.ok || !payload.config) {
        setError(payload.error || 'Failed to save SMTP configuration.')
        return
      }

      setConfig(payload.config)
      setPassword('')
      setMessage(payload.message || 'SMTP configuration saved.')
    } catch {
      setError('Failed to save SMTP configuration.')
    } finally {
      setIsSaving(false)
    }
  }

  const sendTestEmail = async () => {
    setIsTesting(true)
    setError(null)
    setMessage(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/smtp-config/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      const payload = (await response.json()) as { message?: string; error?: string }
      if (!response.ok) {
        setError(payload.error || 'SMTP test email failed.')
        return
      }

      setMessage(payload.message || 'SMTP test email sent successfully.')
    } catch {
      setError('SMTP test email failed.')
    } finally {
      setIsTesting(false)
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
          <h1 className="mt-2 text-2xl font-semibold">SMTP Configuration</h1>
          <p className="mt-2 text-sm text-slate-400">Configure outbound mail settings for archive emails, retries, and future reminders.</p>
        </div>

        {message ? <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">{message}</div> : null}
        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        {isLoading || !config ? (
          <div className="rounded-[28px] bg-slate-900/90 px-5 py-8 text-sm text-slate-400">Loading SMTP configuration...</div>
        ) : (
          <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            {!config.configured || config.warning ? (
              <div className="mb-4 rounded-[20px] bg-amber-600/15 px-5 py-3 text-sm font-medium text-amber-200">
                {config.warning || 'SMTP is not configured yet. Emails will remain queued until you save valid settings.'}
              </div>
            ) : null}

            <label className="mt-3 block">
              <span className="text-sm text-slate-300">SMTP Host</span>
              <input className={inputClass} value={config.host} onChange={(event) => setConfig({ ...config, host: event.target.value })} placeholder="smtp.mailprovider.com" />
            </label>

            <label className="mt-3 block">
              <span className="text-sm text-slate-300">SMTP Port</span>
              <input className={inputClass} type="number" min={1} max={65535} value={config.port} onChange={(event) => setConfig({ ...config, port: Number(event.target.value) })} />
            </label>

            <label className="mt-3 block">
              <span className="text-sm text-slate-300">Username</span>
              <input className={inputClass} value={config.username} onChange={(event) => setConfig({ ...config, username: event.target.value })} />
            </label>

            <label className="mt-3 block">
              <span className="text-sm text-slate-300">Password</span>
              <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={config.hasPassword ? 'Enter new password to rotate' : 'Enter SMTP password'} />
            </label>

            <label className="mt-3 block">
              <span className="text-sm text-slate-300">Encryption</span>
              <select className={inputClass} value={config.encryption} onChange={(event) => setConfig({ ...config, encryption: event.target.value as SmtpConfig['encryption'] })}>
                <option value="SSL/TLS">SSL/TLS</option>
                <option value="STARTTLS">STARTTLS</option>
                <option value="NONE">None</option>
              </select>
            </label>

            <label className="mt-3 block">
              <span className="text-sm text-slate-300">From Name</span>
              <input className={inputClass} value={config.fromName} onChange={(event) => setConfig({ ...config, fromName: event.target.value })} />
            </label>

            <label className="mt-3 block">
              <span className="text-sm text-slate-300">From Email</span>
              <input className={inputClass} type="email" value={config.fromEmail} onChange={(event) => setConfig({ ...config, fromEmail: event.target.value })} />
            </label>

            <label className="mt-3 block">
              <span className="text-sm text-slate-300">Reply-To Email</span>
              <input className={inputClass} type="email" value={config.replyToEmail ?? ''} onChange={(event) => setConfig({ ...config, replyToEmail: event.target.value || null })} />
            </label>

            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => { void save() }} disabled={isSaving} className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60">
                {isSaving ? 'Saving...' : 'Save SMTP Configuration'}
              </button>

              <button type="button" onClick={() => { void sendTestEmail() }} disabled={isTesting} className="rounded-3xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(14,165,233,0.25)] transition hover:bg-sky-500 disabled:opacity-60">
                {isTesting ? 'Sending Test Email...' : 'Send Test Email'}
              </button>
            </div>

            {config.updatedAt ? <p className="mt-4 text-xs text-slate-400">Last updated: {formatInspectionDateTime(config.updatedAt)}</p> : null}
          </section>
        )}
      </div>
    </main>
  )
}
