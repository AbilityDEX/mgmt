type SummaryCardProps = {
  title: string
  icon?: React.ReactNode
  value: string | null
  sub?: string | null
}

export default function SummaryCard({ title, icon, value, sub }: SummaryCardProps) {
  return (
    <div className="rounded-2xl bg-slate-950/80 px-4 py-4">
      <p className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-slate-500">
        {icon ? <span className="text-lg">{icon}</span> : null}
        <span>{title}</span>
      </p>
      <p className="mt-2 text-sm font-semibold text-white">{value ?? '—'}</p>
      {sub ? <p className="mt-1 text-xs text-slate-400">{sub}</p> : null}
    </div>
  )
}
