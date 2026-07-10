'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabaseClient } from '@/lib/supabase'

type Recipient = {
  id: string
  name: string
  email: string
  recipientType: 'to' | 'cc' | 'bcc'
  enabled: boolean
  deliveryScope: 'all_inspections' | 'passed_inspections' | 'failed_inspections' | 'failed_only' | 'defects_only'
  departmentFilter: string | null
  machineFilter: string | null
}

type MachineOption = {
  id: string
  name: string
}

const deliveryOptions = [
  { value: 'all_inspections', label: 'All inspections' },
  { value: 'passed_inspections', label: 'Passed inspections' },
  { value: 'failed_inspections', label: 'Defects' },
  { value: 'failed_only', label: 'Failed only' },
  { value: 'defects_only', label: 'Defects only' },
] as const

async function getToken() {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function AdminEmailDistributionPage() {
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [machines, setMachines] = useState<MachineOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [draft, setDraft] = useState<Omit<Recipient, 'id'>>({
    name: '',
    email: '',
    recipientType: 'to',
    enabled: true,
    deliveryScope: 'all_inspections',
    departmentFilter: '',
    machineFilter: '',
  })

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

      const [recipientRes, machineRes] = await Promise.all([
        fetch('/api/admin/email-distribution', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/machines', { headers: { Authorization: `Bearer ${token}` } }),
      ])

      const recipientPayload = await recipientRes.json()
      const machinePayload = await machineRes.json()

      if (!recipientRes.ok) {
        setError(recipientPayload.error || 'Failed to load recipients.')
        return
      }

      if (!machineRes.ok) {
        setError(machinePayload.error || 'Failed to load machines.')
        return
      }

      setRecipients(recipientPayload.recipients ?? [])
      setMachines((machinePayload.machines ?? []).map((row: { id: string; name: string }) => ({ id: row.id, name: row.name })))
    } catch {
      setError('Failed to load email distribution settings.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const addRecipient = async () => {
    if (!draft.name.trim() || !draft.email.trim()) {
      setError('Recipient name and email are required.')
      return
    }

    setIsSaving(true)
    setError(null)
    setMessage(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/email-distribution', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...draft,
          departmentFilter: draft.departmentFilter || null,
          machineFilter: draft.machineFilter || null,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'Failed to create recipient.')
        return
      }

      setRecipients((prev) => [...prev, payload.recipient])
      setDraft({
        name: '',
        email: '',
        recipientType: 'to',
        enabled: true,
        deliveryScope: 'all_inspections',
        departmentFilter: '',
        machineFilter: '',
      })
      setMessage('Recipient added.')
    } catch {
      setError('Failed to create recipient.')
    } finally {
      setIsSaving(false)
    }
  }

  const updateRecipient = async (recipient: Recipient) => {
    setIsSaving(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/email-distribution', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...recipient, id: recipient.id }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'Failed to update recipient.')
        return
      }

      setRecipients((prev) => prev.map((row) => (row.id === recipient.id ? payload.recipient : row)))
      setMessage('Recipient updated.')
    } catch {
      setError('Failed to update recipient.')
    } finally {
      setIsSaving(false)
    }
  }

  const deleteRecipient = async (id: string) => {
    setError(null)
    setIsSaving(true)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch('/api/admin/email-distribution', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'Failed to delete recipient.')
        return
      }

      setRecipients((prev) => prev.filter((row) => row.id !== id))
      setMessage('Recipient deleted.')
    } catch {
      setError('Failed to delete recipient.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-6">
        <div className="mb-6 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)]">
          <Link href="/admin" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700">
            ← Back
          </Link>
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Administration</p>
          <h1 className="mt-2 text-2xl font-semibold">Email Distribution</h1>
        </div>

        {message ? <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">{message}</div> : null}
        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        <section className="mb-5 rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Add Recipient</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm text-slate-300">Name</span>
              <input className={inputClass} value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
            </label>
            <label className="block">
              <span className="text-sm text-slate-300">Email</span>
              <input className={inputClass} value={draft.email} onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))} />
            </label>
            <label className="block">
              <span className="text-sm text-slate-300">Type</span>
              <select className={inputClass} value={draft.recipientType} onChange={(e) => setDraft((p) => ({ ...p, recipientType: e.target.value as Recipient['recipientType'] }))}>
                <option value="to">To</option>
                <option value="cc">CC</option>
                <option value="bcc">BCC</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-slate-300">Delivery Option</span>
              <select className={inputClass} value={draft.deliveryScope} onChange={(e) => setDraft((p) => ({ ...p, deliveryScope: e.target.value as Recipient['deliveryScope'] }))}>
                {deliveryOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-slate-300">Department Filter</span>
              <input className={inputClass} value={draft.departmentFilter ?? ''} onChange={(e) => setDraft((p) => ({ ...p, departmentFilter: e.target.value }))} placeholder="Optional" />
            </label>
            <label className="block">
              <span className="text-sm text-slate-300">Machine Filter</span>
              <select className={inputClass} value={draft.machineFilter ?? ''} onChange={(e) => setDraft((p) => ({ ...p, machineFilter: e.target.value }))}>
                <option value="">All machines</option>
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>{machine.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-4 inline-flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((p) => ({ ...p, enabled: e.target.checked }))} />
            Enabled
          </label>
          <div className="mt-5">
            <button type="button" onClick={() => { void addRecipient() }} disabled={isSaving} className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:opacity-60">
              {isSaving ? 'Saving...' : 'Add Recipient'}
            </button>
          </div>
        </section>

        <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Recipients</h2>

          {isLoading ? (
            <div className="mt-4 rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-400">Loading recipients...</div>
          ) : recipients.length === 0 ? (
            <div className="mt-4 rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-300">No recipients configured.</div>
          ) : (
            <div className="mt-4 space-y-3">
              {recipients.map((recipient) => (
                <article key={recipient.id} className="rounded-3xl bg-slate-950/80 p-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <input className={inputClass} value={recipient.name} onChange={(e) => setRecipients((prev) => prev.map((row) => row.id === recipient.id ? { ...row, name: e.target.value } : row))} />
                    <input className={inputClass} value={recipient.email} onChange={(e) => setRecipients((prev) => prev.map((row) => row.id === recipient.id ? { ...row, email: e.target.value } : row))} />
                    <select className={inputClass} value={recipient.recipientType} onChange={(e) => setRecipients((prev) => prev.map((row) => row.id === recipient.id ? { ...row, recipientType: e.target.value as Recipient['recipientType'] } : row))}>
                      <option value="to">To</option>
                      <option value="cc">CC</option>
                      <option value="bcc">BCC</option>
                    </select>
                    <select className={inputClass} value={recipient.deliveryScope} onChange={(e) => setRecipients((prev) => prev.map((row) => row.id === recipient.id ? { ...row, deliveryScope: e.target.value as Recipient['deliveryScope'] } : row))}>
                      {deliveryOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <input className={inputClass} value={recipient.departmentFilter ?? ''} onChange={(e) => setRecipients((prev) => prev.map((row) => row.id === recipient.id ? { ...row, departmentFilter: e.target.value } : row))} placeholder="Department filter" />
                    <select className={inputClass} value={recipient.machineFilter ?? ''} onChange={(e) => setRecipients((prev) => prev.map((row) => row.id === recipient.id ? { ...row, machineFilter: e.target.value } : row))}>
                      <option value="">All machines</option>
                      {machines.map((machine) => (
                        <option key={machine.id} value={machine.id}>{machine.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked={recipient.enabled} onChange={(e) => setRecipients((prev) => prev.map((row) => row.id === recipient.id ? { ...row, enabled: e.target.checked } : row))} />
                      Enabled
                    </label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { void updateRecipient(recipient) }} disabled={isSaving} className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-700 disabled:opacity-60">
                        Save
                      </button>
                      <button type="button" onClick={() => { void deleteRecipient(recipient.id) }} disabled={isSaving} className="rounded-2xl bg-rose-600/10 px-4 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-600/15 disabled:opacity-60">
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
