# 登录注册翻牌卡片 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 React + Tailwind + Framer Motion 构建 3D 翻牌卡片登录/注册组件，替代现有原生 JS 模态框。

**Architecture:** `client/` 目录下新建 Vite + React + TypeScript 项目，构建产物输出到 `www/auth/`。React 组件监听自定义事件弹出翻牌卡片，直接调用现有 `/api/auth/*` 后端 API。localStorage 与现有 `miaosite-auth.js` 完全兼容。

**Tech Stack:** Vite 6, React 19, TypeScript 5, Tailwind CSS 4, Framer Motion 12, Lucide React

## Global Constraints

- 后端 server.js 零改动
- localStorage key: `miaosite_token` / `miaosite_user`（与现有保持一致）
- 暖橘主色调 `#ff9f43`（Tailwind orange-400）
- 登录/注册在同一张卡片的背面切换
- 构建产物输出到 `www/auth/`
- 所有文案使用项目现有称呼风格（「主人」「喵~」）

---

### Task 1: 项目脚手架

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/tsconfig.app.json`
- Create: `client/tsconfig.node.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/index.css`
- Create: `client/src/vite-env.d.ts`

**Interfaces:**
- Consumes: nothing
- Produces: working `npm run dev` / `npm run build`

- [ ] **Step 1: Create client/package.json**

```json
{
  "name": "miaosite-auth-react",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "framer-motion": "^12.0.0",
    "lucide-react": "^0.460.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "~5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd client && npm install`
Expected: dependencies install without errors

- [ ] **Step 3: Create client/tsconfig.json**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

- [ ] **Step 4: Create client/tsconfig.app.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create client/tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Create client/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: '../www/auth',
    emptyOutDir: true,
  },
})
```

- [ ] **Step 8: Create client/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>喵码 - 登录</title>
  </head>
  <body>
    <div id="auth-root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Create client/src/main.tsx**

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const root = document.getElementById('auth-root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
```

- [ ] **Step 10: Create client/src/index.css**

```css
@import "tailwindcss";

@theme {
  --color-mia-orange: #ff9f43;
  --color-mia-orange-dark: #f57c00;
  --color-mia-orange-light: #ffb88c;
  --color-mia-brown: #4a3428;
  --color-mia-brown-light: #6f5648;
  --color-mia-bg: #fef8f2;
}

/* 3D perspective for flip card */
.perspective-\[1200px\] {
  perspective: 1200px;
}

@media (max-width: 480px) {
  .perspective-\[1200px\] {
    perspective: 800px;
  }
}
```

- [ ] **Step 11: Create client/src/vite-env.d.ts**

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 12: Create client/src/App.tsx (placeholder)**

```typescript
export default function App() {
  return <div className="text-mia-orange">喵码 Auth Ready</div>
}
```

- [ ] **Step 13: Verify dev server starts**

Run: `cd client && npm run dev`
Expected: Vite dev server starts, opens at localhost:5173, shows "喵码 Auth Ready" in orange

- [ ] **Step 14: Commit**

```bash
cd client && git add -A && git commit -m "feat: 初始化 React + Vite + Tailwind 项目脚手架"
```

---

### Task 2: shadcn/ui 风格基础组件

**Files:**
- Create: `client/src/components/ui/button.tsx`
- Create: `client/src/components/ui/input.tsx`
- Create: `client/src/components/ui/card.tsx`
- Create: `client/src/components/ui/label.tsx`
- Create: `client/src/lib/utils.ts`

**Interfaces:**
- Consumes: Tailwind setup from Task 1
- Produces: `<Button>`, `<Input>`, `<Card>`, `<Label>` components

- [ ] **Step 1: Create client/src/lib/utils.ts**

```typescript
import { type ClassValue, clsx } from 'clsx'

// Simple cn without clsx dependency — inline implementation
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(' ')
}
```

- [ ] **Step 2: Create client/src/components/ui/button.tsx**

```typescript
import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const base = [
      'inline-flex items-center justify-center gap-2 rounded-xl font-semibold',
      'transition-all duration-200 cursor-pointer',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400',
      'disabled:opacity-50 disabled:cursor-not-allowed',
    ]

    const variants: Record<string, string> = {
      default: 'bg-orange-400 text-white hover:bg-orange-500 active:bg-orange-600 shadow-sm',
      outline: 'border border-orange-200 bg-white/60 text-stone-700 hover:bg-orange-50 active:bg-orange-100',
      ghost: 'text-stone-600 hover:bg-stone-100 active:bg-stone-200',
    }

    const sizes: Record<string, string> = {
      default: 'h-11 px-5 text-sm',
      sm: 'h-9 px-3 text-xs',
      lg: 'h-12 px-8 text-base',
    }

    return (
      <button
        ref={ref}
        className={cn(...base, variants[variant], sizes[size], className)}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'
export { Button, type ButtonProps }
```

- [ ] **Step 3: Create client/src/components/ui/input.tsx**

```typescript
import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'w-full h-11 rounded-xl border border-stone-200 bg-white/70',
          'px-4 text-sm text-stone-800 placeholder:text-stone-400',
          'transition-colors duration-200',
          'focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          className
        )}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'
export { Input, type InputProps }
```

- [ ] **Step 4: Create client/src/components/ui/card.tsx**

```typescript
import { type HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl border border-white/40 bg-white/85',
          'shadow-xl shadow-orange-100/20 backdrop-blur-xl',
          className
        )}
        {...props}
      />
    )
  }
)

Card.displayName = 'Card'

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}

const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col items-center px-4 pt-6 pb-2', className)}
        {...props}
      />
    )
  }
)

CardHeader.displayName = 'CardHeader'

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('px-6 pb-6', className)}
        {...props}
      />
    )
  }
)

CardContent.displayName = 'CardContent'

export { Card, CardHeader, CardContent }
```

- [ ] **Step 5: Create client/src/components/ui/label.tsx**

```typescript
import { type LabelHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {}

const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          'text-sm font-medium text-stone-700 mb-1.5 block',
          className
        )}
        {...props}
      />
    )
  }
)

Label.displayName = 'Label'
export { Label }
```

- [ ] **Step 6: Verify build**

Run: `cd client && npm run build`
Expected: Build succeeds, no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add client/src/components/ui/ client/src/lib/utils.ts
git commit -m "feat: 添加 shadcn/ui 风格基础组件 (Button, Input, Card, Label)"
```

---

### Task 3: 认证 API 层 + 状态管理

**Files:**
- Create: `client/src/lib/auth-api.ts`
- Create: `client/src/lib/auth-store.ts`

**Interfaces:**
- Consumes: nothing (standalone)
- Produces:
  - `login(payload: LoginPayload): Promise<User>`
  - `register(payload: RegisterPayload): Promise<User>`
  - `getMe(): Promise<User | null>`
  - `useAuthStore()` — Zustand-like store with `user`, `token`, `isLoggedIn`, `login()`, `register()`, `logout()`

- [ ] **Step 1: Create client/src/lib/auth-api.ts**

```typescript
export interface LoginPayload {
  username: string
  password: string
}

export interface RegisterPayload {
  username: string
  email: string
  password: string
}

export interface User {
  id: string
  username: string
  email: string
  role: string
  createdAt: string
  lastLoginAt: string | null
  loginCount: number
}

interface AuthResponse {
  token: string
  user: User
}

const API_BASE = ''

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || '请求失败喵~')
  }
  return data as T
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getMe(): Promise<User | null> {
  const token = localStorage.getItem('miaosite_token')
  if (!token) return null
  try {
    const response = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Create client/src/lib/auth-store.ts**

```typescript
import { useSyncExternalStore } from 'react'
import type { User } from './auth-api'

const TOKEN_KEY = 'miaosite_token'
const USER_KEY = 'miaosite_user'

interface AuthState {
  user: User | null
  token: string | null
}

let state: AuthState = {
  token: localStorage.getItem(TOKEN_KEY),
  user: (() => {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })(),
}

const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((fn) => fn())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): AuthState {
  return state
}

function setSession(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  state = { token, user }
  emit()
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  state = { token: null, user: null }
  emit()
}

export function useAuthStore() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    user: snap.user,
    token: snap.token,
    isLoggedIn: !!snap.token,
    setSession,
    clearSession,
  }
}

export { setSession, clearSession, getSnapshot }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/auth-api.ts client/src/lib/auth-store.ts
git commit -m "feat: 添加认证 API 层和状态管理"
```

---

### Task 4: FlipCard 翻牌容器组件

**Files:**
- Create: `client/src/components/auth/FlipCard.tsx`

**Interfaces:**
- Consumes: `Card` from Task 2, `framer-motion`
- Produces: `<FlipCard>` with `isFlipped`, `children` (front + back)

- [ ] **Step 1: Create client/src/components/auth/FlipCard.tsx**

```typescript
import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface FlipCardProps {
  isFlipped: boolean
  front: ReactNode
  back: ReactNode
  className?: string
}

export default function FlipCard({
  isFlipped,
  front,
  back,
  className,
}: FlipCardProps) {
  return (
    <div
      className={cn('perspective-[1200px]', className)}
      style={{ width: 400, height: 540 }}
    >
      <motion.div
        className="relative w-full h-full"
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.65, ease: [0.23, 1, 0.32, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* FRONT */}
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {front}
        </div>

        {/* BACK */}
        <div
          className="absolute inset-0"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {back}
        </div>
      </motion.div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/auth/FlipCard.tsx
git commit -m "feat: 添加 FlipCard 3D 翻牌容器组件"
```

---

### Task 5: WelcomeFace 正面欢迎页

**Files:**
- Create: `client/src/components/auth/WelcomeFace.tsx`

**Interfaces:**
- Consumes: `Card`, `CardHeader`, `CardContent` from Task 2, `Button` from Task 2, `lucide-react`
- Produces: `<WelcomeFace onFlip={() => void} />`

- [ ] **Step 1: Create client/src/components/auth/WelcomeFace.tsx**

```typescript
import { Cat, Zap, Shield, Sparkles, LogIn } from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface WelcomeFaceProps {
  onFlip: () => void
}

const features = [
  { icon: Zap, text: '快递条码秒速识别' },
  { icon: Shield, text: '安全可靠的云端存储' },
  { icon: Sparkles, text: 'AI 智能对话助手' },
]

export default function WelcomeFace({ onFlip }: WelcomeFaceProps) {
  return (
    <Card className="w-full h-full flex flex-col items-center justify-center">
      <CardHeader>
        <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-3">
          <Cat className="w-10 h-10 text-orange-500" />
        </div>
        <h2 className="text-xl font-bold text-stone-800 mt-2">
          欢迎使用喵码 🐱
        </h2>
        <p className="text-sm text-stone-500 mt-1 text-center">
          快递条码生成 + OCR 识别 + AI 聊天
        </p>
      </CardHeader>

      <CardContent className="w-full">
        <div className="space-y-3 mt-2">
          {features.map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-orange-50/60"
            >
              <Icon className="w-5 h-5 text-orange-400 flex-shrink-0" />
              <span className="text-sm text-stone-700">{text}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          <Button className="w-full" size="lg" onClick={onFlip}>
            <LogIn className="w-4 h-4" />
            登录 / 注册
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/auth/WelcomeFace.tsx
git commit -m "feat: 添加 WelcomeFace 正面欢迎页组件"
```

---

### Task 6: LoginForm 登录表单

**Files:**
- Create: `client/src/components/auth/LoginForm.tsx`

**Interfaces:**
- Consumes: `Card`, `CardHeader`, `CardContent`, `Input`, `Button`, `Label` from Task 2, `auth-api` from Task 3, `auth-store` from Task 3, `lucide-react`
- Produces: `<LoginForm onSuccess={() => void} onSwitchToRegister={() => void} />`

- [ ] **Step 1: Create client/src/components/auth/LoginForm.tsx**

```typescript
import { useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2, LogIn, UserPlus } from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { login, type LoginPayload } from '@/lib/auth-api'
import { setSession } from '@/lib/auth-store'

interface LoginFormProps {
  onSuccess: (username: string) => void
  onSwitchToRegister: () => void
}

export default function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const [formData, setFormData] = useState<LoginPayload>({
    username: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(field: keyof LoginPayload, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (error) setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!formData.username.trim() || !formData.password) {
      setError('请填写用户名和密码喵~')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await login({
        username: formData.username.trim(),
        password: formData.password,
      })
      setSession(data.token, data.user)
      onSuccess(data.user.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败喵~')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full h-full flex flex-col justify-center">
      <CardHeader>
        <h2 className="text-xl font-bold text-stone-800">登录喵~</h2>
        <p className="text-sm text-stone-500 mt-1">欢迎回来，主人</p>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm">
              {error}
            </div>
          )}

          <div>
            <Label htmlFor="login-username">用户名或邮箱</Label>
            <Input
              id="login-username"
              name="username"
              placeholder="请输入用户名或邮箱"
              autoComplete="username"
              value={formData.username}
              onChange={(e) => handleChange('username', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="login-password">密码</Label>
            <Input
              id="login-password"
              name="password"
              type="password"
              placeholder="请输入密码"
              autoComplete="current-password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            {loading ? '登录中...' : '登录喵~'}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onSwitchToRegister}
          >
            <UserPlus className="w-4 h-4" />
            没有账号？去注册
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/auth/LoginForm.tsx
git commit -m "feat: 添加 LoginForm 登录表单组件"
```

---

### Task 7: RegisterForm 注册表单

**Files:**
- Create: `client/src/components/auth/RegisterForm.tsx`

**Interfaces:**
- Consumes: Same as LoginForm from Task 6
- Produces: `<RegisterForm onSuccess={(username) => void} onSwitchToLogin={() => void} />`

- [ ] **Step 1: Create client/src/components/auth/RegisterForm.tsx**

```typescript
import { useState, type FormEvent } from 'react'
import { Loader2, UserPlus, LogIn } from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { register, type RegisterPayload } from '@/lib/auth-api'
import { setSession } from '@/lib/auth-store'

interface RegisterFormProps {
  onSuccess: (username: string) => void
  onSwitchToLogin: () => void
}

export default function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const [formData, setFormData] = useState<RegisterPayload>({
    username: '',
    email: '',
    password: '',
  })
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(field: keyof RegisterPayload, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (error) setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!formData.username.trim() || !formData.email.trim() || !formData.password) {
      setError('请填写所有必填字段喵~')
      return
    }
    if (formData.password !== confirmPassword) {
      setError('两次密码不一致喵~')
      return
    }
    if (formData.password.length < 6) {
      setError('密码至少需要6位喵~')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await register({
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
      })
      setSession(data.token, data.user)
      onSuccess(data.user.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败喵~')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full h-full flex flex-col justify-center">
      <CardHeader>
        <h2 className="text-xl font-bold text-stone-800">注册喵~</h2>
        <p className="text-sm text-stone-500 mt-1">加入喵码，解锁全部功能</p>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm">
              {error}
            </div>
          )}

          <div>
            <Label htmlFor="reg-username">用户名</Label>
            <Input
              id="reg-username"
              name="username"
              placeholder="请输入用户名"
              autoComplete="username"
              value={formData.username}
              onChange={(e) => handleChange('username', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="reg-email">邮箱</Label>
            <Input
              id="reg-email"
              name="email"
              type="email"
              placeholder="请输入邮箱地址"
              autoComplete="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="reg-password">密码</Label>
            <Input
              id="reg-password"
              name="password"
              type="password"
              placeholder="至少6位密码"
              autoComplete="new-password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="reg-confirm">确认密码</Label>
            <Input
              id="reg-confirm"
              name="confirmPassword"
              type="password"
              placeholder="再次输入密码"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            {loading ? '注册中...' : '注册喵~'}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onSwitchToLogin}
          >
            <LogIn className="w-4 h-4" />
            已有账号？去登录
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/auth/RegisterForm.tsx
git commit -m "feat: 添加 RegisterForm 注册表单组件"
```

---

### Task 8: SuccessFace 成功页

**Files:**
- Create: `client/src/components/auth/SuccessFace.tsx`

**Interfaces:**
- Consumes: `Card`, `CardHeader`, `CardContent`, `Button` from Task 2, `lucide-react`, `framer-motion`
- Produces: `<SuccessFace username={string} onClose={() => void} />`

- [ ] **Step 1: Create client/src/components/auth/SuccessFace.tsx**

```typescript
import { motion } from 'framer-motion'
import { CheckCircle, ArrowRight } from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface SuccessFaceProps {
  username: string
  onClose: () => void
}

export default function SuccessFace({ username, onClose }: SuccessFaceProps) {
  return (
    <Card className="w-full h-full flex flex-col items-center justify-center text-center">
      <CardHeader>
        <motion.div
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: 'spring',
            stiffness: 200,
            damping: 15,
            delay: 0.2,
          }}
          className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center"
        >
          <CheckCircle className="w-10 h-10 text-green-500" />
        </motion.div>
        <h2 className="text-xl font-bold text-stone-800 mt-4">
          欢迎回来喵~ 🎉
        </h2>
        <p className="text-sm text-stone-500 mt-1">
          <span className="font-semibold text-orange-500">{username}</span>{' '}
          主人，登录成功啦
        </p>
      </CardHeader>

      <CardContent className="w-full">
        <p className="text-sm text-stone-400 mb-4">
          你现在可以使用喵码的全部功能了
        </p>
        <Button className="w-full" onClick={onClose}>
          <ArrowRight className="w-4 h-4" />
          继续
        </Button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/auth/SuccessFace.tsx
git commit -m "feat: 添加 SuccessFace 登录成功页组件"
```

---

### Task 9: App.tsx 主组件集成

**Files:**
- Modify: `client/src/App.tsx`
- Create: `client/src/components/auth/AuthModal.tsx`

**Interfaces:**
- Consumes: All components from Tasks 4-8, auth-store from Task 3
- Produces: Complete working auth flow

- [ ] **Step 1: Create client/src/components/auth/AuthModal.tsx**

```typescript
import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import FlipCard from './FlipCard'
import WelcomeFace from './WelcomeFace'
import LoginForm from './LoginForm'
import RegisterForm from './RegisterForm'
import SuccessFace from './SuccessFace'

type Mode = 'welcome' | 'login' | 'register' | 'success'

export default function AuthModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('welcome')
  const [username, setUsername] = useState('')

  const open = useCallback(() => {
    setMode('welcome')
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    // Refresh page to update all UI state
    window.location.reload()
  }, [])

  // Listen for custom event from existing pages
  if (typeof window !== 'undefined') {
    // @ts-expect-error custom global listener
    window.__miaositeAuthModal = { open, close }
  }

  // Also listen for custom event
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('miaosite:show-auth', open as EventListener)
  }

  const isFlipped = mode === 'login' || mode === 'register'

  const front = mode === 'success'
    ? <SuccessFace username={username} onClose={close} />
    : <WelcomeFace onFlip={() => setMode('login')} />

  const back = mode === 'login'
    ? (
      <LoginForm
        onSuccess={(name) => { setUsername(name); setMode('success') }}
        onSwitchToRegister={() => setMode('register')}
      />
    )
    : (
      <RegisterForm
        onSuccess={(name) => { setUsername(name); setMode('success') }}
        onSwitchToLogin={() => setMode('login')}
      />
    )

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-stone-800/30 backdrop-blur-sm"
            onClick={close}
          />

          {/* Card */}
          <motion.div
            className="relative z-10"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
          >
            <FlipCard
              isFlipped={isFlipped}
              front={front}
              back={back}
              className="max-w-[400px] w-[90vw] max-h-[540px] h-[85vh]"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Rewrite client/src/App.tsx**

```typescript
import { useEffect } from 'react'
import AuthModal from './components/auth/AuthModal'

export default function App() {
  // Expose global function for existing page buttons
  useEffect(() => {
    const open = () => {
      // @ts-expect-error custom global
      if (window.__miaositeAuthModal) {
        // @ts-expect-error custom global
        window.__miaositeAuthModal.open()
      }
    }

    // @ts-expect-error custom global
    window.__miaositeOpenAuth = open

    // Listen for clicks on #btn-user in existing pages
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.id === 'btn-user' || target.closest('#btn-user')) {
        e.preventDefault()
        const token = localStorage.getItem('miaosite_token')
        if (token) {
          // Already logged in — existing account modal handles this
          return
        }
        open()
      }
    }
    document.addEventListener('click', handleClick)

    return () => {
      document.removeEventListener('click', handleClick)
      // @ts-expect-error custom global
      delete window.__miaositeOpenAuth
    }
  }, [])

  return <AuthModal />
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/components/auth/AuthModal.tsx client/src/App.tsx
git commit -m "feat: 集成 AuthModal 主组件，完成登录注册翻牌卡片"
```

---

### Task 10: 构建配置 + HTML 页面集成

**Files:**
- Modify: `client/vite.config.ts`
- Modify: `client/src/index.css` (add card responsive styles)
- The existing HTML pages (`index.html`, `tools.html`, `knowledge.html`) need minimal changes

**Interfaces:**
- Consumes: Complete React app from Task 9
- Produces: Deployable build output in `www/auth/`

- [ ] **Step 1: Verify build config**

The vite.config.ts from Task 1 already has correct build output path (`../www/auth`). No changes needed.

- [ ] **Step 2: Update index.css with card responsive styles**

In `client/src/index.css`, the perspective utility is already present from Task 1. Add card width responsiveness:

```css
/* Add to existing index.css */
@media (max-width: 480px) {
  .auth-card-responsive {
    width: 92vw !important;
    height: 88vh !important;
  }
}
```

Then update FlipCard.tsx to use `className={cn('perspective-[1200px] auth-card-responsive', className)}`.

- [ ] **Step 3: Production build**

Run: `cd client && npm run build`
Expected: Build succeeds, output in `www/auth/` with `index.html` and `assets/`

- [ ] **Step 4: Test production build locally**

Run: `cd client && npm run preview`
Expected: Preview server starts, card renders correctly

- [ ] **Step 5: Update existing HTML pages to load React auth**

In each of `index.html`, `tools.html`, `knowledge.html`, add before `</body>`:

```html
<!-- React Auth Flip Card -->
<div id="auth-root"></div>
<link rel="modulepreload" href="/www/auth/assets/index.js">
<script type="module" src="/www/auth/assets/index.js"></script>
```

Then modify the `#btn-user` click handler: when user is NOT logged in, instead of showing the old modal, it should trigger `window.__miaositeOpenAuth()`.

Actually, since we kept `miaosite-auth.js` loaded, the existing click handler on `#btn-user` will check `getToken()` — if no token, it calls `showAuth('login')`. We need the React modal to intercept this.

Simpler approach: In existing pages, just add the `#auth-root` div and script tag. Then in `miaosite-auth.js`, when `showAuth()` is called and no token exists, it dispatches a custom event that React listens to. OR, we modify the `bindEvents` click handler to check for React auth first.

**Simplest approach**: Add the React bundle to pages, and have `App.tsx` intercept clicks on `#btn-user` when user is not logged in. This is already done in Task 9 App.tsx. The only thing needed is adding the script tag to HTML pages.

- [ ] **Step 6: Commit**

```bash
git add client/vite.config.ts client/src/index.css www/auth/
git commit -m "feat: 生产构建配置，输出到 www/auth/"
```

---

### Task 11: 集成测试 + 调试

**Files:**
- Modify: `index.html` (add React auth bundle)
- Modify: `tools.html` (add React auth bundle)
- Modify: `knowledge.html` (add React auth bundle)

**Interfaces:**
- Consumes: Build output from Task 10
- Produces: Complete working login/register on all pages

- [ ] **Step 1: Add React auth bundle to index.html**

Before `</body>` in index.html, add:
```html
<div id="auth-root"></div>
<script type="module" crossorigin src="/www/auth/assets/index.js"></script>
```

- [ ] **Step 2: Add React auth bundle to tools.html**

Same as above.

- [ ] **Step 3: Add React auth bundle to knowledge.html**

Same as above.

- [ ] **Step 4: Verify TypeScript build is clean**

Run: `cd client && npm run build`
Expected: Zero errors

- [ ] **Step 5: Start full app and test manually**

Run: `node server.js`
Test:
1. Open http://localhost:3000
2. Click "登录" button
3. Flip card should appear with animation
4. Test login with valid credentials
5. Test register with new account
6. Verify success page shows
7. Test on mobile viewport (Chrome DevTools)
8. Verify localStorage has miaosite_token/miaosite_user

- [ ] **Step 6: Commit**

```bash
git add index.html tools.html knowledge.html
git commit -m "feat: 在现有页面集成 React 翻牌卡片登录"
```

---

### Task 12: 管理后台登录适配 + 旧代码清理

**Files:**
- Modify: `admin.html` (add React auth if needed, or keep native for admin)
- Note: `lib/miaosite-auth.js` stays for `authFetch`, `getToken`, account modal

**Interfaces:**
- Consumes: Task 11 complete integration
- Produces: Clean state, nothing broken

- [ ] **Step 1: Verify admin.html still works**

Admin login uses `/api/admin/login` which has its own page — no changes needed. The `adminAuthMiddleware` is separate from user auth.

- [ ] **Step 2: Verify existing auth.js functions still work**

The React auth writes to the same localStorage keys. `miaosite-auth.js` functions like `getToken()`, `authFetch()`, `headers()` should all work because they read from localStorage.

Test: Log in via React card, then reload page and verify `MiaositeAuth.isLoggedIn()` returns true.

- [ ] **Step 3: Commit (if any changes)**

```bash
git commit -m "chore: 验证管理后台和旧认证函数兼容性"
```

---

## Summary

| Task | Files | Key Deliverable |
|------|-------|----------------|
| 1 | 10 new | Vite + React + Tailwind scaffold |
| 2 | 5 new | Button, Input, Card, Label components |
| 3 | 2 new | Auth API + state store |
| 4 | 1 new | FlipCard 3D container |
| 5 | 1 new | WelcomeFace |
| 6 | 1 new | LoginForm |
| 7 | 1 new | RegisterForm |
| 8 | 1 new | SuccessFace |
| 9 | 1 new + 1 mod | AuthModal + App integration |
| 10 | 2 mod | Build config + styles |
| 11 | 3 mod | Page integration |
| 12 | verification | Compatibility check |

**Total**: ~24 files touched, 12 tasks, 12 commits
