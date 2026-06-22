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
