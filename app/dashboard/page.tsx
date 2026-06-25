export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-md px-4 pt-6 pb-24">
        <header className="rounded-[32px] bg-slate-900/90 p-5 shadow-[0_25px_60px_rgba(0,0,0,0.25)] backdrop-blur-sm">
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">MGMT Inspect</p>
          <h1 className="mt-2 text-3xl font-semibold">Good Morning Connor</h1>
          <p className="mt-3 text-sm text-slate-400">Your inspection overview is ready. Select a machine to begin.</p>
        </header>

        <section className="mt-6 rounded-[28px] bg-slate-900/80 px-5 py-4 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Section</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">Today's Machines</h2>
            </div>
          </div>
        </section>

        <div className="mt-5 space-y-4">
          <article className="rounded-[26px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-400">Ravaglioli 10663428</p>
                <p className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-500">Status</p>
                <p className="mt-1 text-lg font-semibold text-white">Not Started</p>
              </div>
              <button className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500">
                Start Inspection
              </button>
            </div>
          </article>

          <article className="rounded-[26px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-400">Ravaglioli 10663430</p>
                <p className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-500">Status</p>
                <p className="mt-1 text-lg font-semibold text-white">Completed</p>
              </div>
              <span className="rounded-full bg-emerald-600/15 px-4 py-2 text-sm font-semibold text-emerald-300">
                Completed
              </span>
            </div>
          </article>

          <article className="rounded-[26px] bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Depollution Ramp</p>
                <p className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-500">Status</p>
                <p className="mt-1 text-lg font-semibold text-white">Overdue</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="rounded-full bg-rose-600/15 px-4 py-2 text-sm font-semibold text-rose-300">Overdue</span>
                <button className="rounded-2xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(249,115,22,0.25)] transition hover:bg-orange-400">
                  Start Inspection
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 text-xs font-medium text-slate-400">
          <button className="flex flex-col items-center gap-1 text-emerald-400">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            Dashboard
          </button>
          <button className="flex flex-col items-center gap-1 hover:text-slate-100">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            Machines
          </button>
          <button className="flex flex-col items-center gap-1 hover:text-slate-100">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            Reports
          </button>
          <button className="flex flex-col items-center gap-1 hover:text-slate-100">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            Profile
          </button>
        </div>
      </nav>
    </main>
  )
}
