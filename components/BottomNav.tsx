import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { label: 'Inspections', href: '/inspection', icon: '✓' },
  { label: 'Admin', href: '/admin', icon: '⚙️' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="rounded-t-3xl bg-slate-950/95 px-4 py-3 shadow-[0_-10px_30px_rgba(0,0,0,0.25)]">
      <div className="flex justify-around gap-2">
        {navItems.map((item) => {
          const isActive = pathname?.startsWith(item.href) ?? false
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-xs">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
