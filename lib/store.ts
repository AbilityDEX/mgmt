import { useSyncExternalStore } from 'react'
import { type User } from './data/users'

export type InspectionOutcome = 'pass' | 'fail'
export type InspectionSeverity = 'Low' | 'Medium' | 'High'

export type ChecklistResult = {
  id: string
  label: string
  status: InspectionOutcome | null
  faultDescription?: string
  severity?: InspectionSeverity
  photoUploaded?: boolean
}

export type CompletedChecklistItem = Omit<ChecklistResult, 'status'> & {
  status: InspectionOutcome
}

export type InspectionRecord = {
  id: string
  machineId: string
  operatorName: string
  completedAt: string
  checklist: CompletedChecklistItem[]
}

type Listener = () => void

type UserCopyCacheEntry = {
  source: User
  copy: User
}

const SERVER_NULL = null as null

const store = {
  currentUser: null as User | null,
  listeners: new Set<Listener>(),
  cache: {
    currentUserSnapshot: null as UserCopyCacheEntry | null,
  },
}

function invalidateCache() {
  store.cache.currentUserSnapshot = null
}

function notify() {
  invalidateCache()
  store.listeners.forEach((listener) => listener())
}

function getCurrentUser() {
  if (!store.currentUser) {
    return null
  }

  const cached = store.cache.currentUserSnapshot
  if (cached?.source === store.currentUser) {
    return cached.copy
  }

  const copy = { ...store.currentUser }
  store.cache.currentUserSnapshot = { source: store.currentUser, copy }
  return copy
}

export function subscribe(listener: Listener) {
  store.listeners.add(listener)
  return () => store.listeners.delete(listener)
}

export function setCurrentUser(user: User | null) {
  store.currentUser = user ? { ...user } : null
  notify()
}

export function useCurrentUser() {
  return useSyncExternalStore(subscribe, getCurrentUser, () => SERVER_NULL)
}
