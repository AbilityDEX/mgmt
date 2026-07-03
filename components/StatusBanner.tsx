import StatusBadge from './StatusBadge'
import { formatInspectionDateTime } from '@/lib/inspectionTime'

type Props = {
  state: 'Due' | 'Overdue' | 'Completed' | 'Locked'
  dueSince?: string | null
  deadline?: string | null
  overdueBy?: string | null
  completedAt?: string | null
  nextInspection?: string | null
}

export default function StatusBanner({ state, dueSince, deadline, overdueBy, completedAt, nextInspection }: Props) {
  const renderContent = () => {
    switch (state) {
      case 'Due':
        return (
          <div className="space-y-1">
            <p className="text-sm font-medium">This inspection is due and can be started immediately.</p>
            <div className="flex flex-wrap gap-4 text-sm text-slate-200">
              {dueSince ? <div>Due since <strong className="text-white">{formatInspectionDateTime(dueSince)}</strong></div> : null}
              {deadline ? <div>Deadline <strong className="text-white">{formatInspectionDateTime(deadline)}</strong></div> : null}
            </div>
          </div>
        )
      case 'Overdue':
        return (
          <div className="space-y-1">
            <p className="text-sm font-medium">This inspection is overdue but can still be completed.</p>
            <div className="flex flex-wrap gap-4 text-sm text-slate-200">
              {dueSince ? <div>Due since <strong className="text-white">{formatInspectionDateTime(dueSince)}</strong></div> : null}
              {deadline ? <div>Deadline <strong className="text-white">{formatInspectionDateTime(deadline)}</strong></div> : null}
              {overdueBy ? <div>Overdue by <strong className="text-white">{overdueBy}</strong></div> : null}
            </div>
          </div>
        )
      case 'Completed':
        return (
          <div className="space-y-1">
            <p className="text-sm font-medium">Inspection completed successfully.</p>
            <div className="flex flex-wrap gap-4 text-sm text-slate-200">
              {completedAt ? <div>Completed <strong className="text-white">{formatInspectionDateTime(completedAt)}</strong></div> : null}
              {nextInspection ? <div>Next inspection <strong className="text-white">{formatInspectionDateTime(nextInspection)}</strong></div> : null}
            </div>
          </div>
        )
      case 'Locked':
      default:
        return (
          <div className="space-y-1">
            <p className="text-sm font-medium">This inspection is not yet due.</p>
            <div className="flex flex-wrap gap-4 text-sm text-slate-200">
              {nextInspection ? <div>Next inspection <strong className="text-white">{formatInspectionDateTime(nextInspection)}</strong></div> : null}
            </div>
          </div>
        )
    }
  }

  const badge = (
    <div className="flex items-center gap-3">
      <StatusBadge
        label={state}
        variant={state === 'Overdue' ? 'danger' : state === 'Locked' ? 'neutral' : 'success'}
      />
    </div>
  )

  return (
    <section className="rounded-2xl bg-slate-900/90 p-4 shadow-sm border border-slate-800">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {badge}
          <div className="min-w-0">{renderContent()}</div>
        </div>
      </div>
    </section>
  )
}
