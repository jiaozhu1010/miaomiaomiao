import { useState, type FormEvent } from 'react'
import { Loader2, LogIn, UserPlus } from 'lucide-react'
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
