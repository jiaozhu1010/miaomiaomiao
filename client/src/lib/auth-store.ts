import { useSyncExternalStore } from 'react'
import {
  type User,
  type LoginPayload,
  type RegisterPayload,
  login as apiLogin,
  register as apiRegister,
  fetchCurrentUser,
  getToken,
  getStoredUser,
  setSession,
  clearSession,
} from './auth-api'

// --- 类型 ---

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
}

// --- 内部状态 ---

let state: AuthState = {
  user: getStoredUser(),
  isAuthenticated: !!getToken() && !!getStoredUser(),
  isLoading: false,
}

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

function setState(partial: Partial<AuthState>): void {
  state = { ...state, ...partial }
  notify()
}

// --- useSyncExternalStore 底层 ---

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

function getSnapshot(): AuthState {
  return state
}

// --- Actions (模块级, 稳定引用) ---

export async function login(payload: LoginPayload): Promise<User> {
  setState({ isLoading: true })
  try {
    const res = await apiLogin(payload)
    setSession(res.token, res.user)
    setState({ user: res.user, isAuthenticated: true, isLoading: false })
    return res.user
  } catch (err) {
    setState({ isLoading: false })
    throw err
  }
}

export async function register(payload: RegisterPayload): Promise<User> {
  setState({ isLoading: true })
  try {
    const res = await apiRegister(payload)
    setSession(res.token, res.user)
    setState({ user: res.user, isAuthenticated: true, isLoading: false })
    return res.user
  } catch (err) {
    setState({ isLoading: false })
    throw err
  }
}

export function logout(): void {
  clearSession()
  setState({ user: null, isAuthenticated: false })
}

export async function refreshUser(): Promise<User | null> {
  const token = getToken()
  if (!token) {
    setState({ user: null, isAuthenticated: false })
    return null
  }
  setState({ isLoading: true })
  try {
    const user = await fetchCurrentUser()
    setSession(token, user)
    setState({ user, isAuthenticated: true, isLoading: false })
    return user
  } catch {
    clearSession()
    setState({ user: null, isAuthenticated: false, isLoading: false })
    return null
  }
}

// --- React Hook ---

export function useAuth(): AuthState & {
  login: (payload: LoginPayload) => Promise<User>
  register: (payload: RegisterPayload) => Promise<User>
  logout: () => void
  refreshUser: () => Promise<User | null>
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  return { ...snapshot, login, register, logout, refreshUser }
}
