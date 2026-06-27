'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clearAuthSession, setRememberMe, supabaseClient } from '@/lib/supabase'
import { setCurrentUser } from '@/lib/store'

export default function Home() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMeChecked] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let isActive = true

    const restoreSession = async () => {
      const { data } = await supabaseClient.auth.getSession()
      const session = data.session

      if (!isActive) {
        return
      }

      if (!session?.user) {
        setCheckingSession(false)
        return
      }

      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('full_name')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (!isActive) {
        return
      }

      if (profileError) {
        setError(profileError.message)
        setCheckingSession(false)
        return
      }

      setCurrentUser({
        id: session.user.id,
        name: profile?.full_name || session.user.email || '',
      })

      router.replace('/dashboard')
    }

    void restoreSession().finally(() => {
      if (isActive) {
        setCheckingSession(false)
      }
    })

    return () => {
      isActive = false
    }
  }, [router])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const normalizedEmail = email.trim().toLowerCase()
    setRememberMe(rememberMe)
    clearAuthSession()

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (error) {
      setError('Invalid username or password.')
      return
    }

    const user = data?.user
    if (!user) {
      setError('Login failed. Please try again.')
      return
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileError) {
      setError(profileError.message)
      return
    }

    setCurrentUser({
      id: user.id,
      name: profile?.full_name || user.email || '',
    })

    router.replace('/dashboard')
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-[28px] bg-white shadow-[0_30px_60px_rgba(0,0,0,0.18)] p-7 sm:p-8">
        <div className="space-y-4 text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-emerald-600">MGMT Inspect</p>
          <h1 className="text-3xl font-semibold text-slate-950 sm:text-4xl">Motor Green Mach Tech</h1>
          <p className="text-sm text-slate-500">A mobile-first inspection system built for field efficiency.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {checkingSession ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Restoring your session...
            </div>
          ) : null}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            placeholder="Enter your email"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Enter your password"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <label className="flex items-center gap-3 text-sm text-slate-600">
            <input
              checked={rememberMe}
              onChange={(event) => setRememberMeChecked(event.target.checked)}
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
            />
            <span>Remember me</span>
          </label>

          {error ? <p className="text-sm text-rose-500">{error}</p> : null}

          <button
            type="submit"
            disabled={checkingSession}
            className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500"
          >
            Login
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-slate-400">Version 1.0</p>
      </div>
    </main>
  )
}
