import Link from 'next/link'

export default function AdminDashboardPage() {
  const menuItems = [
    { icon: '�', title: 'Machines', description: 'Inspect and assign equipment', href: '/admin/machines' },
    { icon: '🛠️', title: 'Defects', description: 'Manage inspection defects and resolutions', href: '/admin/defects' },
    { icon: '🧩', title: 'Inspection Templates', description: 'Build reusable inspection checklists', href: '/admin/inspection-templates' },
    { icon: '📊', title: 'Reports', description: 'Review completed inspections', href: '/admin/reports' },
    { icon: '🏢', title: 'Company Settings', description: 'Manage branding and report profile', href: '/admin/company-settings' },
    { icon: '✉️', title: 'Email Distribution', description: 'Configure recipients, filters and delivery scope', href: '/admin/email-distribution' },
    { icon: '📨', title: 'SMTP Configuration', description: 'Configure outbound email server and test delivery', href: '/admin/smtp-config' },
    { icon: '📝', title: 'Email Templates', description: 'Customize archive subject, body and signature', href: '/admin/email-templates' },
    { icon: '🗂️', title: 'Retention & Cleanup', description: 'Archive retries, retention policy and cleanup runs', href: '/admin/retention' },
    { icon: '📬', title: 'Archive Logs', description: 'Track PDF/email/archive delivery outcomes', href: '/admin/archive-logs' },
    { icon: '✅', title: 'Runtime Verification', description: 'Validate scheduling, archive and retention health', href: '/admin/runtime-verification' },
    { icon: '🩺', title: 'System Health', description: 'Run full diagnostics, safe repair and release checks', href: '/admin/system-health' },
    { icon: '❌', title: 'Failed Inspections', description: 'Track issues and corrective actions', href: '/admin/failed-inspections' },
    { icon: '⏰', title: 'Overdue Machines', description: 'See late inspections at a glance', href: '/admin/overdue' },
    { icon: '👥', title: 'Users', description: 'Add, edit and remove system users', href: '/admin/users' },
  ]

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-md px-4 py-6 pb-24">
        <div className="mb-4 flex items-center gap-3">
          <Link href="/dashboard" className="rounded-3xl bg-slate-900/90 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-800">
            ← Back
          </Link>
          <h1 className="text-xl font-semibold">Admin Dashboard</h1>
        </div>

        <header className="rounded-[32px] bg-slate-900/95 p-5 shadow-[0_25px_60px_rgba(0,0,0,0.25)] backdrop-blur-sm">
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">MGMT Inspect</p>
          <h2 className="mt-3 text-3xl font-semibold">Administrator</h2>
          <p className="mt-2 text-sm text-slate-400">Access system controls, reports, and operational settings.</p>
        </header>

        <section className="mt-6 grid gap-4">
          {menuItems.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="flex items-center justify-between rounded-[28px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:bg-slate-800/95"
            >
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-3xl bg-slate-800 text-2xl">{item.icon}</span>
                <div>
                  <h3 className="text-base font-semibold text-white">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">{item.description}</p>
                </div>
              </div>
              <span className="text-2xl text-slate-500">→</span>
            </Link>
          ))}
        </section>

        <section className="mt-6 rounded-[32px] bg-slate-900/95 p-5 shadow-[0_25px_60px_rgba(0,0,0,0.25)]">
          <p className="text-sm uppercase tracking-[0.35em] text-slate-400">System Status</p>
          <div className="mt-4 space-y-3 text-sm text-slate-200">
            <div className="flex items-center justify-between rounded-3xl bg-slate-950/80 px-4 py-3">
              <span>Database</span>
              <span className="font-semibold text-emerald-300">Supabase</span>
            </div>
            <div className="flex items-center justify-between rounded-3xl bg-slate-950/80 px-4 py-3">
              <span>Version</span>
              <span className="font-semibold text-slate-100">1.0</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
