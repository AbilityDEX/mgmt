type PageTitleProps = {
  title: string
  subtitle?: string
}

export default function PageTitle({ title, subtitle }: PageTitleProps) {
  return (
    <div className="mb-4 text-left">
      <p className="text-sm uppercase tracking-[0.35em] text-emerald-400">Machine</p>
      <h1 className="mt-2 text-3xl font-semibold text-white">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
    </div>
  )
}
