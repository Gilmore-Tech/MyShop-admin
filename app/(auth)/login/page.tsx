'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, ArrowRight, ShieldCheck, BarChart3, Users, Zap } from 'lucide-react'
import { adminLogin } from '@/lib/api'
import { ApiError } from '@/lib/api-client'

const STATS = [
  { icon: Users,      value: '5,200+',  label: 'Platform users'     },
  { icon: BarChart3,  value: 'GHS 84k', label: 'Revenue (30 days)'  },
  { icon: Zap,        value: '99.4%',   label: 'Uptime this month'  },
  { icon: ShieldCheck,value: '0',       label: 'Open incidents'     },
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) { setError('Please enter your email and password.'); return }
    setError('')
    setLoading(true)
    try {
      await adminLogin(email.trim(), password)
      router.push('/dashboard')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('Incorrect email or password. Please try again.')
        } else if (err.status === 504) {
          setError('Server is warming up — please wait 30 seconds and try again.')
        } else {
          setError(err.message)
        }
      } else {
        setError('Connection error. Check your network and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel — brand ─────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[52%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #0f1923 0%, #161d28 60%, #1a2030 100%)' }}
      >
        {/* Subtle grid background */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(#F5A623 1px, transparent 1px), linear-gradient(90deg, #F5A623 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Glow */}
        <div
          className="absolute top-0 left-0 w-[480px] h-[480px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(245,166,35,0.07) 0%, transparent 70%)',
            transform: 'translate(-30%, -30%)',
          }}
        />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="MyShop" className="w-10 h-10 rounded-xl shadow-lg" />
          <div>
            <p className="text-white font-semibold text-sm leading-none">MyShop</p>
            <p className="text-xs mt-0.5" style={{ color: '#4A6070' }}>Admin Console</p>
          </div>
        </div>

        {/* Headline */}
        <div className="relative">
          <p className="text-xs font-medium tracking-widest uppercase mb-4" style={{ color: '#F5A623' }}>
            Ashanti Region Pilot · 2026
          </p>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            One dashboard.<br />Full control.
          </h1>
          <p className="text-base leading-relaxed" style={{ color: '#4A6070' }}>
            Manage verifications, resolve disputes, track revenue,
            and keep the platform running smoothly — all from one place.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mt-10">
            {STATS.map(({ icon: Icon, value, label }) => (
              <div
                key={label}
                className="rounded-xl p-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-3.5 w-3.5" style={{ color: '#F5A623' }} />
                  <span className="text-xs" style={{ color: '#3D5060' }}>{label}</span>
                </div>
                <p className="text-xl font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative">
          <p className="text-xs" style={{ color: '#263545' }}>
            © 2026 Gilmore Technologies · MyShop Platform
          </p>
        </div>
      </div>

      {/* ── Right panel — form ─────────────────────────────────────────────── */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 py-12"
        style={{ backgroundColor: '#0B1017' }}
      >
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="MyShop" className="w-9 h-9 rounded-lg" />
          <span className="text-white font-semibold">MyShop Admin</span>
        </div>

        <div className="w-full max-w-[380px]">

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-1.5">Welcome back</h2>
            <p className="text-sm" style={{ color: '#3D5060' }}>
              Sign in to your admin account to continue.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#8A9BAB' }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@myshop.com.gh"
                autoComplete="email"
                className="w-full rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-[#2A3A4A] focus:outline-none transition-all"
                style={{
                  backgroundColor: '#111820',
                  border: '1px solid #1E2D3D',
                  caretColor: '#F5A623',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#F5A62360')}
                onBlur={e  => (e.currentTarget.style.borderColor = '#1E2D3D')}
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium" style={{ color: '#8A9BAB' }}>
                  Password
                </label>
                <button
                  type="button"
                  className="text-xs transition-colors"
                  style={{ color: '#F5A62380' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#F5A623')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#F5A62380')}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full rounded-lg px-3.5 py-2.5 pr-10 text-sm text-white placeholder:text-[#2A3A4A] focus:outline-none transition-all"
                  style={{
                    backgroundColor: '#111820',
                    border: '1px solid #1E2D3D',
                    caretColor: '#F5A623',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#F5A62360')}
                  onBlur={e  => (e.currentTarget.style.borderColor = '#1E2D3D')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#2D4050' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#8A9BAB')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#2D4050')}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="rounded-lg px-3.5 py-2.5 text-sm flex items-start gap-2"
                style={{ backgroundColor: 'rgba(229,87,87,0.08)', border: '1px solid rgba(229,87,87,0.2)', color: '#E57373' }}
              >
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              style={{ backgroundColor: '#F5A623' }}
              onMouseEnter={e => { if (!loading) (e.currentTarget.style.backgroundColor = '#e09510') }}
              onMouseLeave={e => { if (!loading) (e.currentTarget.style.backgroundColor = '#F5A623') }}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Security note */}
          <div className="mt-8 flex items-center gap-2" style={{ color: '#2A3A4A' }}>
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <p className="text-xs">
              Protected by JWT authentication · Sessions expire in 8 hours
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
