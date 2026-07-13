type SummaryCardProps = {
  title: string
  icon?: React.ReactNode
  value: string | null
  sub?: string | null
}

export default function SummaryCard({ title, icon, value, sub }: SummaryCardProps) {
  return (
    <div className="rounded-[20px] bg-slate-900/90 px-5 py-5 shadow-[0_14px_40px_rgba(2,6,23,0.6)]">
      <p className="flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-slate-400">
        {icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-emerald-300 text-lg">{icon}</span>
        ) : null}
        <span className="font-medium">{title}</span>
      </p>
      <p className="mt-3 text-2xl font-semibold text-white leading-tight">{value ?? '—'}</p>
      {sub ? <p className="mt-1 text-xs text-slate-400">{sub}</p> : null}
    </div>
  )
}
