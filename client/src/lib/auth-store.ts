import { useSyncExternalStore } from 'react'
import {
  type User,
  type LoginPayload,
  type RegisterPayload,
  login as apiLogin,
  register as apiRegister,
  getMe as apiGetMe,
  setSession,
  clearSession,
} from './auth-api'

// --- 类型 ---

export interface AuthState {
  user: User | null
  token: string | null
  isLoggedIn: boolean
  isLoading: boolean
}

// --- 内部状态 ---

const TOKEN_KEY = 'miaosite_token'
const USER_KEY = 'miaosite_user'

function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

let state: AuthState = {
  user: readStoredUser(),
  token: readToken(),
  isLoggedIn: !!readToken() && !!readStoredUser(),
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
    setState({ user: res.user, token: res.token, isLoggedIn: true, isLoading: false })
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
    setState({ user: res.user, token: res.token, isLoggedIn: true, isLoading: false })
    return res.user
  } catch (err) {
    setState({ isLoading: false })
    throw err
  }
}

export function logout(): void {
  clearSession()
  setState({ user: null, token: null, isLoggedIn: false })
}

export async function refreshUser(): Promise<User | null> {
  const token = readToken()
  if (!token) {
    setState({ user: null, token: null, isLoggedIn: false })
    return null
  }
  setState({ isLoading: true })
  try {
    const user = await apiGetMe()
    setSession(token, user)
    setState({ user, token, isLoggedIn: true, isLoading: false })
    return user
  } catch {
    clearSession()
    setState({ user: null, token: null, isLoggedIn: false, isLoading: false })
    return null
  }
}

// 重新导出以便 store 使用者统一从 auth-store 导入
export { setSession, clearSession }

// --- React Hook ---

export function useAuthStore(): AuthState & {
  login: (payload: LoginPayload) => Promise<User>
  register: (payload: RegisterPayload) => Promise<User>
  logout: () => void
  refreshUser: () => Promise<User | null>
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  return { ...snapshot, login, register, logout, refreshUser }
}
