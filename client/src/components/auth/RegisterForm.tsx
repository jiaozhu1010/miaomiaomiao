import { useState, useEffect, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Mail, Lock, User, Check, X } from 'lucide-react'
import { register } from '@/lib/auth-api'
import { setSession } from '@/lib/auth-store'

interface RegisterFormProps {
  onSuccess: (username: string) => void
  onSwitchToLogin: () => void
}

function calcStrength(pw: string) {
  let s = 0
  if (pw.length >= 8) s++
  if (/[a-z]/.test(pw)) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return s
}

const CHECKS = [
  { key: 'len', label: '至少 8 个字符', test: (pw: string) => pw.length >= 8 },
  { key: 'lower', label: '包含小写字母', test: (pw: string) => /[a-z]/.test(pw) },
  { key: 'upper', label: '包含大写字母', test: (pw: string) => /[A-Z]/.test(pw) },
  { key: 'digit', label: '包含数字', test: (pw: string) => /[0-9]/.test(pw) },
  { key: 'special', label: '包含特殊字符', test: (pw: string) => /[^A-Za-z0-9]/.test(pw) },
] as const

export default function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const [formData, setFormData] = useState({ username: '', email: '', password: '' })
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [focused, setFocused] = useState<string | null>(null)
  const [strength, setStrength] = useState(0)

  useEffect(() => { setStrength(formData.password ? calcStrength(formData.password) : 0) }, [formData.password])

  function handleChange(f: string, v: string) {
    setFormData((p) => ({ ...p, [f]: v }))
    if (error) setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!formData.username.trim() || !formData.email.trim() || !formData.password) {
      setError('请填写所有必填字段喵~'); return
    }
    if (formData.password !== confirmPw) { setError('两次密码不一致喵~'); return }
    if (formData.password.length < 6) { setError('密码至少需要6位喵~'); return }
    setLoading(true); setError('')
    try {
      const data = await register({ username: formData.username.trim(), email: formData.email.trim(), password: formData.password })
      setSession(data.token, data.user)
      onSuccess(data.user.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败喵~')
    } finally { setLoading(false) }
  }

  const ic = "absolute left-5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] stroke-[1.5] pointer-events-none z-10 transition-colors duration-200"
  const has = (f: string) => !!(formData as Record<string, string>)[f]
  const pwMatch = confirmPw && formData.password === confirmPw

  return (
    <div className="glass-card py-12 px-10 w-full">
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center mb-8"
      >
        <h2 className="text-[22px] font-bold text-[#111] tracking-[-0.03em]">创建账户</h2>
        <p className="text-sm text-[#999] mt-1.5">加入喵码，开始使用</p>
      </motion.div>

      <form onSubmit={handleSubmit} className="auth-form-stack">
        {error && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="px-4 py-3 rounded-xl bg-red-50 text-red-600 text-[13px]">{error}</motion.div>
        )}

        {/* Username */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.35 }} className="auth-field">
          <User className={`${ic} ${focused === 'username' || has('username') ? 'text-[#111]' : 'text-[#b0b7c0]'}`} />
          <input name="username" autoComplete="username" title="用户名" value={formData.username}
            onChange={(e) => handleChange('username', e.target.value)}
            onFocus={() => setFocused('username')} onBlur={() => setFocused(null)}
            className="input-field" placeholder=" " required />
          <label className={`floating-label ${focused === 'username' || has('username') ? 'focused' : ''} ${has('username') ? 'has-value' : ''}`}>用户名</label>
        </motion.div>

        {/* Email */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14, duration: 0.35 }} className="auth-field">
          <Mail className={`${ic} ${focused === 'email' || has('email') ? 'text-[#111]' : 'text-[#b0b7c0]'}`} />
          <input type="email" name="email" autoComplete="email" title="邮箱地址" value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
            className="input-field" placeholder=" " required />
          <label className={`floating-label ${focused === 'email' || has('email') ? 'focused' : ''} ${has('email') ? 'has-value' : ''}`}>邮箱地址</label>
        </motion.div>

        {/* Password */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.35 }} className="auth-field">
          <Lock className={`${ic} ${focused === 'password' || has('password') ? 'text-[#111]' : 'text-[#b0b7c0]'}`} />
          <input type={showPw ? 'text' : 'password'} name="password" autoComplete="new-password" title="密码"
            value={formData.password}
            onChange={(e) => handleChange('password', e.target.value)}
            onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
            className="input-field !pr-11" placeholder=" " required />
          <label className={`floating-label ${focused === 'password' || has('password') ? 'focused' : ''} ${has('password') ? 'has-value' : ''}`}>密码</label>
          <button type="button" onClick={() => setShowPw(!showPw)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#b0b7c0] hover:text-[#666] transition-colors">
            {showPw ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
          </button>

          {formData.password && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="auth-password-meta">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#aaa]">密码强度</span>
                <span className={`font-semibold ${strength <= 2 ? 'text-red-400' : strength <= 3 ? 'text-yellow-500' : 'text-green-500'}`}>
                  {strength <= 2 ? '弱' : strength <= 3 ? '中等' : '强'}
                </span>
              </div>
              <div className="w-full bg-[#eee] rounded-full h-1">
                <div className={`h-full rounded-full transition-all duration-300 ${
                  strength <= 2 ? 'bg-red-400 w-1/4' : strength <= 3 ? 'bg-yellow-400 w-3/5' : 'bg-green-400 w-full'
                }`} />
              </div>
              <div className="auth-password-checks">
                {CHECKS.map((c) => {
                  const ok = c.test(formData.password)
                  return (
                    <div key={c.key} className="flex items-center gap-1.5 text-xs">
                      {ok ? <Check className="w-3 h-3 text-green-500" /> : <X className="w-3 h-3 text-[#ddd]" />}
                      <span className={ok ? 'text-green-600' : 'text-[#b0b7c0]'}>{c.label}</span>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Confirm password */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26, duration: 0.35 }} className="auth-field">
          <Lock className={`${ic} ${focused === 'confirm' || confirmPw ? 'text-[#111]' : 'text-[#b0b7c0]'}`} />
          <input type={showConfirm ? 'text' : 'password'} name="confirmPassword" autoComplete="new-password" title="确认密码"
            value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
            onFocus={() => setFocused('confirm')} onBlur={() => setFocused(null)}
            className={`input-field !pr-11 ${confirmPw ? (pwMatch ? '!border-green-400' : '!border-red-400') : ''}`}
            placeholder=" " required />
          <label className={`floating-label ${focused === 'confirm' || confirmPw ? 'focused' : ''} ${confirmPw ? 'has-value' : ''}`}>确认密码</label>
          <button type="button" onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#b0b7c0] hover:text-[#666] transition-colors">
            {showConfirm ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
          </button>
          {confirmPw && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1.5 flex items-center gap-1.5 text-xs">
              {pwMatch ? (
                <><Check className="w-3.5 h-3.5 text-green-500" /><span className="text-green-600">密码匹配</span></>
              ) : (
                <><X className="w-3.5 h-3.5 text-red-400" /><span className="text-red-400">密码不匹配</span></>
              )}
            </motion.div>
          )}
        </motion.div>

        {/* Submit */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32, duration: 0.35 }} className="pt-3">
          <motion.button type="submit" disabled={loading || (!!confirmPw && !pwMatch)}
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
            className="w-full h-12 bg-[#111] text-white font-semibold rounded-xl text-[15px] tracking-[-0.01em] hover:bg-[#333] transition-colors duration-200 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
            ) : null}
            <span>{loading ? '注册中...' : '创建账户'}</span>
          </motion.button>
        </motion.div>

        {/* Switch link */}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.3 }}
          className="text-center text-[13px] text-[#aaa] pt-2">
          已有账号？{' '}
          <button type="button" onClick={onSwitchToLogin}
            className="font-semibold text-[#111] hover:underline underline-offset-4 transition-colors">
            登录
          </button>
        </motion.p>
      </form>
    </div>
  )
}
