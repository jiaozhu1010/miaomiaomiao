import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'
import { login } from '@/lib/auth-api'
import { setSession } from '@/lib/auth-store'

interface LoginFormProps {
  onSuccess: (username: string) => void
  onSwitchToRegister: () => void
}

export default function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const [formData, setFormData] = useState({ username: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [focused, setFocused] = useState<string | null>(null)

  function handleChange(f: string, v: string) {
    setFormData((p) => ({ ...p, [f]: v }))
    if (error) setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!formData.username.trim() || !formData.password) {
      setError('请填写用户名和密码喵~'); return
    }
    setLoading(true); setError('')
    try {
      const data = await login({ username: formData.username.trim(), password: formData.password })
      setSession(data.token, data.user)
      onSuccess(data.user.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败喵~')
    } finally { setLoading(false) }
  }

  const ic = "absolute left-5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] stroke-[1.5] pointer-events-none z-10 transition-colors duration-200"
  const has = (f: string) => !!(formData as Record<string, string>)[f]

  return (
    <div className="glass-card py-12 px-10 w-full">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center mb-8"
      >
        <h2 className="text-[22px] font-bold text-[#111] tracking-[-0.03em]">欢迎回来</h2>
        <p className="text-sm text-[#999] mt-1.5">登录你的喵码账户</p>
      </motion.div>

      <form onSubmit={handleSubmit} className="auth-form-stack">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="px-4 py-3 rounded-xl bg-red-50 text-red-600 text-[13px]"
          >{error}</motion.div>
        )}

        {/* Username */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.35 }}
          className="auth-field"
        >
          <Mail className={`${ic} ${focused === 'username' || has('username') ? 'text-[#111]' : 'text-[#b0b7c0]'}`} />
          <input
            name="username" autoComplete="username" title="用户名或邮箱"
            value={formData.username}
            onChange={(e) => handleChange('username', e.target.value)}
            onFocus={() => setFocused('username')} onBlur={() => setFocused(null)}
            className="input-field" placeholder=" " required
          />
          <label className={`floating-label ${focused === 'username' || has('username') ? 'focused' : ''} ${has('username') ? 'has-value' : ''}`}>
            用户名或邮箱
          </label>
        </motion.div>

        {/* Password */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35 }}
          className="auth-field"
        >
          <Lock className={`${ic} ${focused === 'password' || has('password') ? 'text-[#111]' : 'text-[#b0b7c0]'}`} />
          <input
            type={showPw ? 'text' : 'password'}
            name="password" autoComplete="current-password" title="密码"
            value={formData.password}
            onChange={(e) => handleChange('password', e.target.value)}
            onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
            className="input-field !pr-11" placeholder=" " required
          />
          <label className={`floating-label ${focused === 'password' || has('password') ? 'focused' : ''} ${has('password') ? 'has-value' : ''}`}>
            密码
          </label>
          <button type="button" onClick={() => setShowPw(!showPw)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#b0b7c0] hover:text-[#666] transition-colors">
            {showPw ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
          </button>
        </motion.div>

        {/* Submit */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.35 }}
          className="pt-3"
        >
          <motion.button type="submit" disabled={loading}
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
            className="w-full h-12 bg-[#111] text-white font-semibold rounded-xl text-[15px] tracking-[-0.01em] hover:bg-[#333] transition-colors duration-200 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
            ) : null}
            <span>{loading ? '登录中...' : '登录'}</span>
          </motion.button>
        </motion.div>

        {/* Switch link */}
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.3 }}
          className="text-center text-[13px] text-[#aaa] pt-2"
        >
          还没有账号？{' '}
          <button type="button" onClick={onSwitchToRegister}
            className="font-semibold text-[#111] hover:underline underline-offset-4 transition-colors">
            注册
          </button>
        </motion.p>
      </form>
    </div>
  )
}
