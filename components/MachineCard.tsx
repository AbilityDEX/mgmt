import Link from 'next/link'
import type { Machine, MachineStatus } from '@/lib/data/machines'
import StatusBadge from './StatusBadge'

type ButtonAction = {
  label: string
  href?: string
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
}

type MachineCardProps = {
  machine: Machine
  titleHref?: string
  primaryAction?: ButtonAction
  secondaryAction?: ButtonAction
}

const statusVariant: Record<MachineStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  'Not Started': 'warning',
  Completed: 'success',
  Overdue: 'danger',
  'In Progress': 'warning',
  Due: 'danger',
  'Due Soon': 'warning',
}

function actionClasses(variant: ButtonAction['variant']) {
  switch (variant) {
    case 'danger':
      return 'bg-rose-600/10 text-rose-300 hover:bg-rose-600/15'
    case 'secondary':
      return 'border border-slate-700 bg-slate-800 text-slate-100 hover:border-slate-600 hover:bg-slate-700'
    default:
      return 'bg-emerald-600 text-white hover:bg-emerald-500'
  }
}

function ActionButton({ action }: { action: ButtonAction }) {
  const classes = `rounded-2xl px-4 py-2 text-sm font-semibold transition ${actionClasses(action.variant)}`

  if (action.href) {
    return (
      <Link href={action.href} className={classes}>
        {action.label}
      </Link>
    )
  }

  return (
    <button type="button" onClick={action.onClick} className={classes}>
      {action.label}
    </button>
  )
}

export default function MachineCard({ machine, titleHref, primaryAction, secondaryAction }: MachineCardProps) {
  return (
    <article className="rounded-[20px] bg-slate-900/95 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.6)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {titleHref ? (
            <Link href={titleHref} className="text-lg font-semibold text-white transition hover:text-emerald-300 truncate">
              {machine.name}
            </Link>
          ) : (
            <p className="text-lg font-semibold text-white truncate">{machine.name}</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-slate-400">Work Area</p>
              <p className="text-sm text-slate-200">{machine.area}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Asset ID</p>
              <p className="text-sm text-slate-200">{machine.assetId ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Template</p>
              <p className="text-sm text-slate-200">{machine.templateName ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Assigned</p>
              <p className="text-sm text-slate-200">{machine.assignedUser ?? '—'}</p>
            </div>
          </div>
        </div>
        <div className="shrink-0">
          <StatusBadge label={machine.status} variant={statusVariant[machine.status]} />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-800 pt-4">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Inspection</p>
            <div className="mt-1 text-sm text-slate-200">
              <div className="text-xs text-slate-400">Due</div>
              <div className="font-medium text-white">{machine.inspectionDeadline ?? 'N/A'}</div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {secondaryAction ? <ActionButton action={secondaryAction} /> : null}
          {primaryAction ? <ActionButton action={primaryAction} /> : null}
        </div>
      </div>
    </article>
  )
}
