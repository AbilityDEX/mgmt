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
    <article className="rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          {titleHref ? (
            <Link href={titleHref} className="text-base font-semibold text-white transition hover:text-emerald-300">
              {machine.name}
            </Link>
          ) : (
            <p className="text-base font-semibold text-white">{machine.name}</p>
          )}
          <p className="mt-3 text-sm text-slate-400">Work Area</p>
          <p className="text-sm text-slate-200">{machine.area}</p>
          {machine.assetId ? (
            <>
              <p className="mt-3 text-sm text-slate-400">Asset ID</p>
              <p className="text-sm text-slate-200">{machine.assetId}</p>
            </>
          ) : null}
          {machine.templateName ? (
            <>
              <p className="mt-3 text-sm text-slate-400">Inspection Template</p>
              <p className="text-sm text-slate-200">{machine.templateName}</p>
            </>
          ) : null}
          <p className="mt-3 text-sm text-slate-400">Assigned User</p>
          <p className="text-sm text-slate-200">{machine.assignedUser}</p>
          {machine.reminderDaysBeforeDue !== undefined ? (
            <>
              <p className="mt-3 text-sm text-slate-400">Reminder</p>
              <p className="text-sm text-slate-200">{machine.reminderDaysBeforeDue} days before due</p>
            </>
          ) : null}
        </div>
        <StatusBadge label={machine.status} variant={statusVariant[machine.status]} />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Inspection</p>
          <div className="mt-1 flex items-center gap-3">
            <StatusBadge label={machine.status} variant={statusVariant[machine.status]} />
            <div className="text-sm text-slate-200">Deadline <span className="font-medium text-white">{machine.inspectionDeadline}</span></div>
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
