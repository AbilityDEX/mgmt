'use client'

import PageTitle from '@/components/PageTitle'
import ChecklistItem from '@/components/ChecklistItem'
import StatusBadge from '@/components/StatusBadge'

const checklistItems = [
  'Clean floor base',
  'Floor fittings',
  'Hydraulic hoses',
  'Fire extinguisher',
  'Rollers',
  'Oil drain',
  'Screen wash / Antifreeze',
  'Brake fluid drain',
  'Air lines',
  'Visible damage',
]

export default function InspectionPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-28 pt-6">
        <div className="mb-6 flex items-center justify-between rounded-[30px] bg-slate-900/90 p-4 shadow-[0_26px_60px_rgba(0,0,0,0.25)]">
          <button className="rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700">
            ← Back
          </button>
          <StatusBadge label="Daily Inspection" variant="warning" />
        </div>

        <section className="rounded-[30px] bg-slate-900/90 p-5 shadow-[0_26px_60px_rgba(0,0,0,0.25)]">
          <PageTitle title="Ravaglioli 10663428" subtitle="Area: ELV" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="rounded-3xl bg-slate-800 px-4 py-2 text-sm text-slate-300">Machine</div>
            <div className="rounded-3xl bg-slate-800 px-4 py-2 text-sm text-slate-300">Area: ELV</div>
            <div className="rounded-3xl bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-300">Status: Daily Inspection</div>
          </div>
        </section>

        <section className="mt-6 rounded-[30px] bg-slate-900/90 p-5 shadow-[0_26px_60px_rgba(0,0,0,0.25)]">
          <h2 className="text-lg font-semibold text-white">Inspection checklist</h2>
          <div className="mt-5 space-y-4">
            {checklistItems.map((item) => (
              <ChecklistItem key={item} label={item} />
            ))}
          </div>
        </section>

        <section className="mt-6 space-y-4 rounded-[30px] bg-slate-900/90 p-5 shadow-[0_26px_60px_rgba(0,0,0,0.25)]">
          <label className="block">
            <span className="text-sm font-medium text-slate-300">Operator Name</span>
            <input
              type="text"
              placeholder="Enter operator name"
              className="mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
            />
          </label>
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/70 p-4 text-center text-sm text-slate-400">
            Digital Signature placeholder
          </div>
          <button className="w-full rounded-3xl bg-emerald-600 px-5 py-4 text-base font-semibold text-white shadow-[0_18px_40px_rgba(16,185,129,0.28)] transition hover:bg-emerald-500">
            Submit Inspection
          </button>
        </section>
      </div>
    </main>
  )
}
