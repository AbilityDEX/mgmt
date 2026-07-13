'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { INSPECTION_TIMEZONE } from '@/lib/inspectionTime'
import { supabaseClient } from '@/lib/supabase'

type CompanySettings = {
  companyName: string
  logoUrl: string | null
  address: string | null
  telephone: string | null
  email: string | null
  archiveEmail?: string | null
  supportEmail?: string | null
  timezone?: string | null
  dateFormat?: string | null
  timeFormat?: string | null
  defaultReplyTo?: string | null
  dailyReminderSendTime?: string | null
  dueSoonWarningDays?: number | null
  enableDueSoon?: boolean | null
  enableEmployeeReminderEmails?: boolean | null
  enableManagementOverdueNotifications?: boolean | null
  website: string | null
  reportFooter: string | null
  reportPrimaryColor: string
  reportAccentColor: string
}

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
  orgSettings?: {
    archiveEmail?: string | null
    supportEmail?: string | null
    timezone?: string | null
    dateFormat?: string | null
    timeFormat?: string | null
    dailyReminderSendTime?: string | null
    dueSoonWarningDays?: number | null
    enableDueSoon?: boolean | null
    enableEmployeeReminderEmails?: boolean | null
    enableManagementOverdueNotifications?: boolean | null
  }
}

async function getToken() {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function AdminCompanySettingsPage() {
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [smtp, setSmtp] = useState<SmtpConfig | null>(null)
  const [smtpPassword, setSmtpPassword] = useState('')
  const [isTestingSmtp, setIsTestingSmtp] = useState(false)
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

      const smtpResponse = await fetch('/api/admin/smtp-config', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const smtpPayload = await smtpResponse.json()
      if (smtpResponse.ok && smtpPayload.config) {
        const smtpConfig = smtpPayload.config as SmtpConfig
        setSmtp(smtpConfig)
        setSettings((prev) => prev
          ? {
              ...prev,
              archiveEmail: smtpConfig.orgSettings?.archiveEmail ?? prev.archiveEmail ?? null,
              supportEmail: smtpConfig.orgSettings?.supportEmail ?? prev.supportEmail ?? null,
              timezone: smtpConfig.orgSettings?.timezone ?? prev.timezone ?? INSPECTION_TIMEZONE,
              dateFormat: smtpConfig.orgSettings?.dateFormat ?? prev.dateFormat ?? null,
              timeFormat: smtpConfig.orgSettings?.timeFormat ?? prev.timeFormat ?? null,
              defaultReplyTo: smtpConfig.replyToEmail ?? prev.defaultReplyTo ?? null,
              dailyReminderSendTime: smtpConfig.orgSettings?.dailyReminderSendTime ?? prev.dailyReminderSendTime ?? '07:00',
              dueSoonWarningDays: smtpConfig.orgSettings?.dueSoonWarningDays ?? prev.dueSoonWarningDays ?? 2,
              enableDueSoon: smtpConfig.orgSettings?.enableDueSoon ?? prev.enableDueSoon ?? true,
              enableEmployeeReminderEmails:
                smtpConfig.orgSettings?.enableEmployeeReminderEmails ?? prev.enableEmployeeReminderEmails ?? true,
              enableManagementOverdueNotifications:
                smtpConfig.orgSettings?.enableManagementOverdueNotifications ?? prev.enableManagementOverdueNotifications ?? true,
            }
          : prev)
      }
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
    if (!settings || !smtp) return

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

      const smtpResponse = await fetch('/api/admin/smtp-config', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: smtp.host,
          port: Number(smtp.port),
          username: smtp.username,
          password: smtpPassword,
          encryption: smtp.encryption,
          fromName: smtp.fromName,
          fromEmail: smtp.fromEmail,
          replyToEmail: settings.defaultReplyTo || smtp.replyToEmail || null,
          archiveEmail: settings.archiveEmail || null,
          supportEmail: settings.supportEmail || null,
          timezone: INSPECTION_TIMEZONE,
          dateFormat: settings.dateFormat || null,
          timeFormat: settings.timeFormat || null,
          dailyReminderSendTime: settings.dailyReminderSendTime || '07:00',
          dueSoonWarningDays: Number(settings.dueSoonWarningDays ?? 2),
          enableDueSoon: Boolean(settings.enableDueSoon ?? true),
          enableEmployeeReminderEmails: Boolean(settings.enableEmployeeReminderEmails ?? true),
          enableManagementOverdueNotifications: Boolean(settings.enableManagementOverdueNotifications ?? true),
        }),
      })

      const smtpPayload = await smtpResponse.json()
      if (!smtpResponse.ok) {
        setError(smtpPayload.error || 'Failed to save SMTP/organization settings.')
        return
      }

      setSettings(payload.settings)
      setSmtp(smtpPayload.config as SmtpConfig)
      setSmtpPassword('')
      setMessage('Company settings updated.')
    } catch {
      setError('Failed to save settings.')
    } finally {
      setIsSaving(false)
    }
  }

  const uploadLogo = async (file: File | null) => {
    if (!file || !settings) return
    const reader = new FileReader()
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : null
      if (!value) return
      setSettings((prev) => (prev ? { ...prev, logoUrl: value } : prev))
    }
    reader.readAsDataURL(file)
  }

  const sendSmtpTest = async () => {
    setIsTestingSmtp(true)
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
      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'SMTP test email failed.')
        return
      }
      setMessage(payload.message || 'SMTP test email sent successfully.')
    } catch {
      setError('SMTP test email failed.')
    } finally {
      setIsTestingSmtp(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
        <div className="mb-6">
          <Link href="/admin" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700">
            ← Back
          </Link>
          <Header title="Company Settings" subtitle="Administration" />
        </div>

        {message ? <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">{message}</div> : null}
        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        {isLoading || !settings || !smtp ? (
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
                <input className={inputClass} type="file" accept="image/*" onChange={(e) => { void uploadLogo(e.target.files?.[0] ?? null) }} />
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
              <label className="block">
                <span className="text-sm text-slate-300">Archive Email Address</span>
                <input className={inputClass} value={settings.archiveEmail ?? ''} onChange={(e) => setSettings((p) => (p ? { ...p, archiveEmail: e.target.value } : p))} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Support Email</span>
                <input className={inputClass} value={settings.supportEmail ?? ''} onChange={(e) => setSettings((p) => (p ? { ...p, supportEmail: e.target.value } : p))} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Default Reply-To</span>
                <input className={inputClass} value={settings.defaultReplyTo ?? ''} onChange={(e) => setSettings((p) => (p ? { ...p, defaultReplyTo: e.target.value } : p))} />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-300">Website</span>
                <input className={inputClass} value={settings.website ?? ''} onChange={(e) => setSettings((p) => (p ? { ...p, website: e.target.value } : p))} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Timezone</span>
                <input className={inputClass} value={settings.timezone ?? INSPECTION_TIMEZONE} readOnly placeholder={INSPECTION_TIMEZONE} />
                <p className="mt-2 text-xs text-slate-500">Scheduling is fixed to Europe/London so GMT/BST daylight saving is handled automatically.</p>
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Date Format</span>
                <input className={inputClass} value={settings.dateFormat ?? ''} onChange={(e) => setSettings((p) => (p ? { ...p, dateFormat: e.target.value } : p))} placeholder="DD/MM/YYYY" />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Time Format</span>
                <input className={inputClass} value={settings.timeFormat ?? ''} onChange={(e) => setSettings((p) => (p ? { ...p, timeFormat: e.target.value } : p))} placeholder="HH:mm" />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Daily Reminder Send Time</span>
                <input
                  type="time"
                  className={inputClass}
                  value={settings.dailyReminderSendTime ?? '07:00'}
                  onChange={(e) => setSettings((p) => (p ? { ...p, dailyReminderSendTime: e.target.value } : p))}
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Due Soon Warning Days</span>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={settings.dueSoonWarningDays ?? 2}
                  onChange={(e) => {
                    const value = Number(e.target.value)
                    setSettings((p) => (p ? { ...p, dueSoonWarningDays: Number.isFinite(value) ? Math.max(0, value) : 2 } : p))
                  }}
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Enable Due Soon</span>
                <div className="mt-3">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.enableDueSoon ?? true)}
                    onChange={(e) => setSettings((p) => (p ? { ...p, enableDueSoon: e.target.checked } : p))}
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Enable Employee Reminder Emails</span>
                <div className="mt-3">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.enableEmployeeReminderEmails ?? true)}
                    onChange={(e) => setSettings((p) => (p ? { ...p, enableEmployeeReminderEmails: e.target.checked } : p))}
                  />
                </div>
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-300">Enable Management Overdue Notifications</span>
                <div className="mt-3">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.enableManagementOverdueNotifications ?? true)}
                    onChange={(e) =>
                      setSettings((p) => (p ? { ...p, enableManagementOverdueNotifications: e.target.checked } : p))
                    }
                  />
                </div>
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

              <div className="md:col-span-2 mt-2 rounded-2xl border border-slate-800 p-4">
                <p className="text-sm font-semibold text-slate-200">SMTP Settings</p>
                <div className="grid gap-4 md:grid-cols-2 mt-3">
                  <label className="block">
                    <span className="text-sm text-slate-300">SMTP Host</span>
                    <input className={inputClass} value={smtp.host} onChange={(e) => setSmtp((p) => (p ? { ...p, host: e.target.value } : p))} />
                  </label>
                  <label className="block">
                    <span className="text-sm text-slate-300">SMTP Port</span>
                    <input className={inputClass} type="number" value={smtp.port} onChange={(e) => setSmtp((p) => (p ? { ...p, port: Number(e.target.value) } : p))} />
                  </label>
                  <label className="block">
                    <span className="text-sm text-slate-300">SMTP Username</span>
                    <input className={inputClass} value={smtp.username} onChange={(e) => setSmtp((p) => (p ? { ...p, username: e.target.value } : p))} />
                  </label>
                  <label className="block">
                    <span className="text-sm text-slate-300">SMTP Password</span>
                    <input className={inputClass} type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder={smtp.hasPassword ? 'Enter new password to rotate' : 'Enter SMTP password'} />
                  </label>
                  <label className="block">
                    <span className="text-sm text-slate-300">Encryption</span>
                    <select className={inputClass} value={smtp.encryption} onChange={(e) => setSmtp((p) => (p ? { ...p, encryption: e.target.value as SmtpConfig['encryption'] } : p))}>
                      <option value="SSL/TLS">SSL/TLS</option>
                      <option value="STARTTLS">STARTTLS</option>
                      <option value="NONE">None</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm text-slate-300">From Name</span>
                    <input className={inputClass} value={smtp.fromName} onChange={(e) => setSmtp((p) => (p ? { ...p, fromName: e.target.value } : p))} />
                  </label>
                  <label className="block">
                    <span className="text-sm text-slate-300">From Email</span>
                    <input className={inputClass} value={smtp.fromEmail} onChange={(e) => setSmtp((p) => (p ? { ...p, fromEmail: e.target.value } : p))} />
                  </label>
                </div>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => { void sendSmtpTest() }} disabled={isTestingSmtp} className="rounded-3xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(14,165,233,0.25)] transition hover:bg-sky-500 disabled:opacity-60">
                    {isTestingSmtp ? 'Sending Test Email...' : 'Send Test Email'}
                  </button>
                </div>
              </div>
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
