// ============================
// 认证 API 层 — 类型与请求函数
// ============================

// --- 类型定义 ---

export interface User {
  id: string
  username: string
  email: string
  role: string
  createdAt: string
  lastLoginAt: string | null
  lastActiveAt: string | null
  loginCount: number
}

export interface AuthResponse {
  token: string
  user: User
}

export interface LoginPayload {
  username: string
  password: string
}

export interface RegisterPayload {
  username: string
  email: string
  password: string
}

export interface UpdateProfilePayload {
  username?: string
  email?: string
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}

// --- localStorage 键名 (必须与后端/原有前端一致) ---

const TOKEN_KEY = 'miaosite_token'
const USER_KEY = 'miaosite_user'

// --- Session 管理 ---

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function setSession(token: string, user: User): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

// --- 通用请求工具 ---

interface ApiError {
  error?: string
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  }
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

async function request<T>(
  url: string,
  options?: { method?: string; body?: unknown; auth?: boolean }
): Promise<T> {
  const method = options?.method ?? 'GET'
  const headers = options?.auth ? buildHeaders() : { 'Content-Type': 'application/json' }

  const res = await fetch(url, {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error((data as ApiError).error || '请求失败喵~')
  }
  return data as T
}

// --- API 函数 ---

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: payload,
  })
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: payload,
  })
}

export async function fetchCurrentUser(): Promise<User> {
  return request<User>('/api/auth/me', { auth: true })
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/profile', {
    method: 'PUT',
    body: payload,
    auth: true,
  })
}

export async function changePassword(
  payload: ChangePasswordPayload
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('/api/auth/password', {
    method: 'PUT',
    body: payload,
    auth: true,
  })
}
