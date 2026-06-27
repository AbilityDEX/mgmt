'use client'

import type { ChecklistResult, InspectionSeverity } from '@/lib/store'

type ChecklistItemProps = {
  item: ChecklistResult
  onChange: (update: ChecklistResult) => void
}

const statusStyles: Record<NonNullable<ChecklistResult['status']>, string> = {
  pass: 'bg-emerald-600 text-white shadow-[0_10px_20px_rgba(16,185,129,0.25)]',
  fail: 'bg-rose-600 text-white shadow-[0_10px_20px_rgba(244,63,94,0.25)]',
}

export default function ChecklistItem({ item, onChange }: ChecklistItemProps) {
  const handleStatus = (status: 'pass' | 'fail') => {
    onChange({
      ...item,
      status,
      faultDescription: status === 'fail' ? item.faultDescription : undefined,
      severity: status === 'fail' ? item.severity : undefined,
      photoUploaded: status === 'fail' ? item.photoUploaded : undefined,
    })
  }

  const handleFieldChange = (field: keyof ChecklistResult, value: string | boolean) => {
    onChange({
      ...item,
      [field]: value,
    })
  }

  return (
    <div className="rounded-[24px] border border-slate-800 bg-slate-900/95 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-200">{item.label}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleStatus('pass')}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              item.status === 'pass' ? statusStyles.pass : 'bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/25'
            }`}
          >
            ✅ PASS
          </button>
          <button
            type="button"
            onClick={() => handleStatus('fail')}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              item.status === 'fail' ? statusStyles.fail : 'bg-rose-600/15 text-rose-200 hover:bg-rose-600/25'
            }`}
          >
            ❌ FAIL
          </button>
        </div>
      </div>

      {item.status === 'fail' ? (
        <div className="mt-4 space-y-4 rounded-3xl border border-rose-500/20 bg-rose-500/5 p-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-200">Fault description</span>
            <textarea
              rows={3}
              value={item.faultDescription ?? ''}
              onChange={(event) => handleFieldChange('faultDescription', event.target.value)}
              placeholder="Describe the issue"
              className="mt-2 w-full resize-none rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20"
            />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => handleFieldChange('photoUploaded', true)}
              className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
            >
              {item.photoUploaded ? 'Photo Added' : 'Upload Photo'}
            </button>
            <label className="w-full sm:w-auto">
              <span className="text-sm font-medium text-slate-200">Severity</span>
              <select
                value={item.severity ?? 'Low'}
                onChange={(event) => handleFieldChange('severity', event.target.value as InspectionSeverity)}
                className="mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}
    </div>
  )
}
