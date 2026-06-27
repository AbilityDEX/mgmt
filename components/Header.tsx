type HeaderProps = {
  title: string
  subtitle?: string
}

export default function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="rounded-3xl bg-slate-900/90 p-5 text-white shadow-xl shadow-black/20">
      <p className="text-sm uppercase tracking-[0.35em] text-emerald-400">MGMT Inspect</p>
      <h1 className="mt-3 text-2xl font-semibold">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
    </header>
  )
}
