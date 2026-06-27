import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const authStorageKey = 'mgmt-auth-token'
const authStorageModeKey = 'mgmt-auth-storage-mode'

type AuthStorageMode = 'local' | 'session'

function getWindowStorage(mode: AuthStorageMode) {
	if (typeof window === 'undefined') {
		return null
	}

	return mode === 'session' ? window.sessionStorage : window.localStorage
}

function getAuthStorageMode(): AuthStorageMode {
	if (typeof window === 'undefined') {
		return 'local'
	}

	const storedMode = window.localStorage.getItem(authStorageModeKey)
	return storedMode === 'session' ? 'session' : 'local'
}

const authStorage = {
	getItem(key: string) {
		return getWindowStorage(getAuthStorageMode())?.getItem(key) ?? null
	},
	setItem(key: string, value: string) {
		getWindowStorage(getAuthStorageMode())?.setItem(key, value)
	},
	removeItem(key: string) {
		if (typeof window === 'undefined') {
			return
		}

		window.localStorage.removeItem(key)
		window.sessionStorage.removeItem(key)
	},
}

export function setRememberMe(rememberMe: boolean) {
	if (typeof window === 'undefined') {
		return
	}

	window.localStorage.setItem(authStorageModeKey, rememberMe ? 'local' : 'session')
}

export function clearAuthSession() {
	if (typeof window === 'undefined') {
		return
	}

	window.localStorage.removeItem(authStorageKey)
	window.sessionStorage.removeItem(authStorageKey)
}

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		autoRefreshToken: true,
		detectSessionInUrl: true,
		persistSession: true,
		storage: authStorage,
		storageKey: authStorageKey,
	},
})
