'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { useParams } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase'

type TemplateDetails = {
  id: string
  name: string
  description: string | null
  lastUpdated: string
}

type TemplateMachine = {
  assignmentId: string
  machineId: string
  machineName: string
  machineArea: string
  machineAssetId: string | null
  inspectionFrequency: string
  active: boolean
}

async function getToken(): Promise<string | null> {
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token ?? null
}

export default function AdminInspectionTemplateDetailsPage() {
  const params = useParams<{ templateId: string }>()
  const templateId = params.templateId

  const [template, setTemplate] = useState<TemplateDetails | null>(null)
  const [machines, setMachines] = useState<TemplateMachine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError('Authentication required.')
        return
      }

      const response = await fetch(`/api/template-machine-assignments?template_id=${encodeURIComponent(templateId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || 'Failed to load template details.')
        return
      }

      setTemplate(payload.template ?? null)
      setMachines(payload.machines ?? [])
    } catch {
      setError('Failed to load template details.')
    } finally {
      setIsLoading(false)
    }
  }, [templateId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        <div className="mb-6">
          <Link href="/admin/inspection-templates" className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700">
            ← Back
          </Link>
          <Header title={template?.name ?? 'Template'} subtitle="Inspection Template" />
          {template?.description ? <p className="mt-2 text-sm text-slate-400">{template.description}</p> : null}
        </div>

        {error ? <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">{error}</div> : null}

        <section className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Machines Using This Template</h2>

          <div className="mt-4 space-y-3">
            {isLoading ? (
              <div className="rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-400">Loading machine assignments...</div>
            ) : machines.length > 0 ? (
              machines.map((machine) => (
                <Link
                  key={machine.assignmentId}
                  href={`/admin/machines/${machine.machineId}`}
                  className="block rounded-3xl bg-slate-950/80 p-4 transition hover:bg-slate-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-white">{machine.machineName}</h3>
                      <p className="mt-1 text-sm text-slate-300">Frequency: {machine.inspectionFrequency}</p>
                      <p className="mt-1 text-sm text-slate-400">Area: {machine.machineArea || 'N/A'}</p>
                      {machine.machineAssetId ? <p className="mt-1 text-sm text-slate-400">Asset ID: {machine.machineAssetId}</p> : null}
                    </div>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        machine.active
                          ? 'bg-emerald-600/15 text-emerald-300'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {machine.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-3xl bg-slate-950/80 px-4 py-6 text-sm text-slate-300">
                No machines are currently using this template.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
