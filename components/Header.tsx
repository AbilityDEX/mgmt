import Image from 'next/image'
import type { ReactNode } from 'react'

type HeaderProps = {
  title: string
  subtitle?: string
  right?: ReactNode
}

export default function Header({ title, subtitle, right }: HeaderProps) {
  return (
    <header className="rounded-3xl bg-slate-900/95 p-5 text-white shadow-lg">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Image src="/images/mgpc-logo.png" alt="MGPC Logo" width={64} height={48} className="h-12 w-auto object-contain" />
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">MGPC Inspect</p>
            <h2 className="mt-1 text-3xl font-semibold leading-tight">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
          </div>
        </div>
        {right ? <div className="flex items-center gap-3">{right}</div> : null}
      </div>
    </header>
  )
}
