'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabaseClient } from '@/lib/supabase'

type UserRow = {
  id: string
  username: string
  name: string
  email: string
  role: string
  workArea: string
  phone: string
  active: boolean
  isProtected: boolean
}

type UserFormState = {
  userId?: string
  username: string
  fullName: string
  email: string
  password: string
  role: string
  workArea: string
  phone: string
  active: boolean
}

const initialFormState: UserFormState = {
  userId: undefined,
  username: '',
  fullName: '',
  email: '',
  password: '',
  role: 'User',
  workArea: '',
  phone: '',
  active: true,
}

const roleOptions = ['User', 'Admin', 'Supervisor']

const isProtectedAccount = (user: { username: string; role: string }) =>
  user.username === 'admin' || user.role.toLowerCase() === 'super_admin'

const displayRole = (role: string) =>
  role.toLowerCase() === 'super_admin' ? 'Super Admin' : role

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formState, setFormState] = useState<UserFormState>(initialFormState)
  const [isEditing, setIsEditing] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [resetPwd, setResetPwd] = useState<{ userId: string; name: string } | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [pwdError, setPwdError] = useState<string | null>(null)

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [pageError, setPageError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3500)
  }

  const getToken = async () => {
    const { data } = await supabaseClient.auth.getSession()
    return data.session?.access_token ?? null
  }

  const authHeaders = async () => {
    const token = await getToken()
    if (!token) throw new Error('Authentication required.')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  }

  const getErrorFromResponse = async (response: Response, fallback: string) => {
    try {
      const payload = await response.json()
      const message = payload?.error
      if (typeof message === 'string' && message.trim()) {
        return message
      }
      return `${fallback} (HTTP ${response.status})`
    } catch {
      return `${fallback} (HTTP ${response.status})`
    }
  }

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    setPageError(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('Authentication required.')
      const usersResponse = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!usersResponse.ok) {
        throw new Error(await getErrorFromResponse(usersResponse, 'Failed to load users.'))
      }

      const usersData = await usersResponse.json()

      setUsers(
        (usersData.users ?? []).map((u: UserRow) => ({
          ...u,
          isProtected: isProtectedAccount(u),
        }))
      )
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUsers()
  }, [loadUsers])

  const resetForm = () => {
    setFormState(initialFormState)
    setIsEditing(false)
    setFormError(null)
  }

  const openEditModal = (user: UserRow) => {
    setFormState({
      userId: user.id,
      username: user.username,
      fullName: user.name,
      email: user.email,
      password: '',
      role: user.role,
      workArea: user.workArea,
      phone: user.phone,
      active: user.active,
    })
    setIsEditing(true)
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleInputChange = (field: keyof UserFormState, value: string | boolean) => {
    setFormState((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async () => {
    setFormError(null)
    if (!formState.username.trim() || !formState.fullName.trim() || !formState.email.trim()) {
      setFormError('Username, Full Name, and Email are required.')
      return
    }
    if (!isEditing && !formState.password.trim()) {
      setFormError('Password is required for new users.')
      return
    }
    setSaving(true)
    try {
      const headers = await authHeaders()
      let response: Response
      if (isEditing && formState.userId) {
        response = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            user_id: formState.userId,
            username: formState.username,
            full_name: formState.fullName,
            email: formState.email,
            role: formState.role,
            work_area: formState.workArea,
            phone: formState.phone,
            active: formState.active,
            ...(formState.password.trim() ? { password: formState.password } : {}),
          }),
        })
      } else {
        response = await fetch('/api/admin/users', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            username: formState.username,
            full_name: formState.fullName,
            email: formState.email,
            password: formState.password,
            role: formState.role,
            work_area: formState.workArea,
            phone: formState.phone,
          }),
        })
      }
      if (!response.ok) throw new Error(await getErrorFromResponse(response, 'Failed to save user.'))

      const payload = await response.json()
      const saved: UserRow = { ...payload.user, isProtected: isProtectedAccount(payload.user) }
      if (isEditing) {
        setUsers((current) => current.map((u) => (u.id === saved.id ? saved : u)))
        showSuccess('User updated successfully.')
      } else {
        setUsers((current) => [...current, saved])
        showSuccess('User created successfully.')
      }
      resetForm()
      setIsModalOpen(false)
      void loadUsers()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save user.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (user: UserRow) => {
    setPageError(null)
    try {
      const headers = await authHeaders()
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          user_id: user.id,
          username: user.username,
          full_name: user.name,
          email: user.email,
          role: user.role,
          work_area: user.workArea,
          phone: user.phone,
          active: !user.active,
        }),
      })
      if (!response.ok) throw new Error(await getErrorFromResponse(response, 'Failed to update user.'))
      setUsers((current) =>
        current.map((u) => (u.id === user.id ? { ...u, active: !user.active } : u))
      )
      showSuccess(user.active ? 'User disabled.' : 'User enabled.')
      void loadUsers()
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Unable to update user.')
    }
  }

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirmId) return
    setDeleting(true)
    setPageError(null)
    try {
      const headers = await authHeaders()
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ user_id: deleteConfirmId }),
      })
      if (!response.ok) throw new Error(await getErrorFromResponse(response, 'Failed to delete user.'))
      setUsers((current) => current.filter((u) => u.id !== deleteConfirmId))
      setDeleteConfirmId(null)
      showSuccess('User permanently deleted.')
      void loadUsers()
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Unable to delete user.')
      setDeleteConfirmId(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetPwd) return
    setPwdError(null)
    if (!newPassword.trim() || newPassword.length < 6) {
      setPwdError('Password must be at least 6 characters.')
      return
    }
    setResetting(true)
    try {
      const headers = await authHeaders()
      const response = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_id: resetPwd.userId, password: newPassword }),
      })
      if (!response.ok) throw new Error(await getErrorFromResponse(response, 'Failed to reset password.'))
      setResetPwd(null)
      setNewPassword('')
      showSuccess('Password reset successfully.')
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : 'Unable to reset password.')
    } finally {
      setResetting(false)
    }
  }

  const openResetPwd = (user: UserRow) => {
    setResetPwd({ userId: user.id, name: user.name })
    setNewPassword('')
    setPwdError(null)
  }

  const inputClass =
    'mt-2 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20'

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <div className="mb-6 flex flex-col gap-4 rounded-[32px] bg-slate-900/95 px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.25)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="mb-3 inline-flex rounded-3xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_10px_25px_rgba(0,0,0,0.2)] transition hover:bg-slate-700 sm:mb-0"
            >
              {'\u2190'} Back
            </Link>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">User Management</p>
            <h1 className="mt-2 text-2xl font-semibold">Users</h1>
          </div>
          <button
            type="button"
            onClick={() => { resetForm(); setIsModalOpen(true) }}
            className="inline-flex items-center justify-center rounded-3xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500"
          >
            + Add User
          </button>
        </div>

        {success ? (
          <div className="mb-4 rounded-[20px] bg-emerald-600/15 px-5 py-3 text-sm font-medium text-emerald-300">
            {success}
          </div>
        ) : null}
        {pageError ? (
          <div className="mb-4 rounded-[20px] bg-rose-600/15 px-5 py-3 text-sm font-medium text-rose-300">
            {pageError}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-[28px] bg-slate-900/90 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-950/90 text-slate-400">
              <tr>
                <th className="px-5 py-4 font-medium uppercase tracking-[0.25em]">Username</th>
                <th className="px-5 py-4 font-medium uppercase tracking-[0.25em]">Name</th>
                <th className="px-5 py-4 font-medium uppercase tracking-[0.25em]">Email</th>
                <th className="px-5 py-4 font-medium uppercase tracking-[0.25em]">Role</th>
                <th className="px-5 py-4 font-medium uppercase tracking-[0.25em]">Work Area</th>
                <th className="px-5 py-4 font-medium uppercase tracking-[0.25em]">Status</th>
                <th className="px-5 py-4 font-medium uppercase tracking-[0.25em]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
                    Loading users...
                  </td>
                </tr>
              ) : users.length > 0 ? (
                users.map((user) => (
                  <tr key={user.id} className="border-t border-slate-800 hover:bg-slate-950/80">
                    <td className="px-5 py-4 text-slate-300">
                      <div className="flex flex-col gap-1">
                        <span>{user.username}</span>
                        {user.isProtected ? (
                          <span className="inline-flex rounded-full bg-amber-600/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-300">
                            Protected
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-semibold text-white">{user.name}</td>
                    <td className="px-5 py-4 text-slate-300">{user.email}</td>
                    <td className="px-5 py-4 text-slate-300">{displayRole(user.role)}</td>
                    <td className="px-5 py-4 text-slate-300">{user.workArea || '\u2014'}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          user.active
                            ? 'bg-emerald-600/15 text-emerald-300'
                            : 'bg-rose-600/15 text-rose-300'
                        }`}
                      >
                        {user.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="rounded-3xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openResetPwd(user)}
                          className="rounded-3xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                        >
                          Reset Password
                        </button>
                        {!user.isProtected ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(user)}
                              className={`rounded-3xl border px-3 py-2 text-xs font-semibold transition ${
                                user.active
                                  ? 'border-amber-600 bg-amber-600/10 text-amber-300 hover:bg-amber-600/20'
                                  : 'border-emerald-600 bg-emerald-600/10 text-emerald-300 hover:bg-emerald-600/20'
                              }`}
                            >
                              {user.active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(user.id)}
                              className="rounded-3xl border border-rose-600 bg-rose-600/10 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-600/20"
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-slate-900 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.35)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">
                  {isEditing ? 'Edit user' : 'Add new user'}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {isEditing ? 'Edit user account' : 'Create user account'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => { resetForm(); setIsModalOpen(false) }}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm text-slate-300">Username</span>
                <input
                  type="text"
                  value={formState.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder="Enter username"
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-300">Full Name</span>
                <input
                  type="text"
                  value={formState.fullName}
                  onChange={(e) => handleInputChange('fullName', e.target.value)}
                  placeholder="Enter full name"
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-300">Email</span>
                <input
                  type="email"
                  value={formState.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="Enter email"
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-300">
                  {isEditing ? 'New Password (leave blank to keep)' : 'Password'}
                </span>
                <input
                  type="password"
                  value={formState.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder={isEditing ? 'Leave blank to keep current' : 'Enter password'}
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-300">Phone</span>
                <input
                  type="text"
                  value={formState.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="Enter phone number"
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-300">Role</span>
                <select
                  value={formState.role}
                  onChange={(e) => handleInputChange('role', e.target.value)}
                  className={inputClass}
                >
                  {roleOptions.map((r) => (
                    <option key={r} value={r} className="bg-slate-950 text-slate-100">
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block sm:col-span-2">
                <span className="text-sm text-slate-300">Work Area</span>
                <input
                  type="text"
                  value={formState.workArea}
                  onChange={(e) => handleInputChange('workArea', e.target.value)}
                  placeholder="Enter work area"
                  className={inputClass}
                />
              </label>

              {isEditing ? (
                <label className="block sm:col-span-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formState.active}
                      onChange={(e) => handleInputChange('active', e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
                    />
                    <span className="text-sm text-slate-300">Active</span>
                  </div>
                </label>
              ) : null}
            </div>

            {formError ? <p className="mt-4 text-sm text-rose-400">{formError}</p> : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => { resetForm(); setIsModalOpen(false) }}
                className="rounded-3xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resetPwd ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-sm rounded-[28px] bg-slate-900 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.35)]">
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Reset Password</p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Set new password for {resetPwd.name}
            </h2>

            <label className="mt-5 block">
              <span className="text-sm text-slate-300">New Password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className={inputClass}
              />
            </label>

            {pwdError ? <p className="mt-3 text-sm text-rose-400">{pwdError}</p> : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => { setResetPwd(null); setNewPassword(''); setPwdError(null) }}
                className="rounded-3xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resetting}
                className="rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resetting ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-sm rounded-[28px] bg-slate-900 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.35)]">
            <p className="text-xs uppercase tracking-[0.35em] text-rose-400">Danger Zone</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Delete User</h2>
            <p className="mt-3 text-sm text-slate-400">
              This will permanently delete the user account and all associated records. This action
              cannot be undone.
            </p>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-3xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                disabled={deleting}
                className="rounded-3xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
