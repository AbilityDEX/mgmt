export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-[28px] bg-white shadow-[0_30px_60px_rgba(0,0,0,0.18)] p-7 sm:p-8">
        <div className="space-y-4 text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-emerald-600">MGMT Inspect</p>
          <h1 className="text-3xl font-semibold text-slate-950 sm:text-4xl">Motor Green Mach Tech</h1>
          <p className="text-sm text-slate-500">A mobile-first inspection system built for field efficiency.</p>
        </div>

        <div className="mt-8 space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Username</span>
            <input
              type="text"
              placeholder="Enter your username"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              type="password"
              placeholder="Enter your password"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <button
            type="button"
            className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500"
          >
            Login
          </button>
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">Version 1.0</p>
      </div>
    </main>
  )
}
