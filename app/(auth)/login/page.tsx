'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react'
import { adminLogin } from '@/lib/api'
import { ApiError } from '@/lib/api-client'

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
          setError('Server is warming up - please wait 30 seconds and try again.')
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
    <div className="h-full overflow-y-auto flex items-center justify-center bg-white px-6 py-12">
      <div
        className="w-full max-w-[400px] rounded-2xl bg-white p-8 sm:p-10"
        style={{ boxShadow: '0 4px 24px rgba(22, 26, 29, 0.08), 0 1px 3px rgba(22, 26, 29, 0.04)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="MyShop" className="w-9 h-9 rounded-lg" />
          <div>
            <p className="font-semibold text-sm leading-none" style={{ color: '#161A1D' }}>MyShop</p>
            <p className="text-xs mt-0.5" style={{ color: '#8A9BAB' }}>Admin Console</p>
          </div>
        </div>

        {/* Heading */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold mb-1.5" style={{ color: '#161A1D' }}>Welcome back</h1>
          <p className="text-sm" style={{ color: '#6B7884' }}>
            Sign in to your admin account to continue.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Email */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#46535D' }}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@gilmoretechnologiesgh.com"
              autoComplete="email"
              className="w-full rounded-lg px-3.5 py-2.5 text-sm focus:outline-none transition-all"
              style={{
                backgroundColor: '#F6F7F8',
                border: '1px solid #E3E7EA',
                color: '#161A1D',
                caretColor: '#F5A623',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = '#F5A623')}
              onBlur={e  => (e.currentTarget.style.borderColor = '#E3E7EA')}
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium" style={{ color: '#46535D' }}>
                Password
              </label>
              <button
                type="button"
                className="text-xs font-medium transition-colors"
                style={{ color: '#D48E1A' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#F5A623')}
                onMouseLeave={e => (e.currentTarget.style.color = '#D48E1A')}
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
                className="w-full rounded-lg px-3.5 py-2.5 pr-10 text-sm focus:outline-none transition-all"
                style={{
                  backgroundColor: '#F6F7F8',
                  border: '1px solid #E3E7EA',
                  color: '#161A1D',
                  caretColor: '#F5A623',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#F5A623')}
                onBlur={e  => (e.currentTarget.style.borderColor = '#E3E7EA')}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: '#9AA7B2' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#46535D')}
                onMouseLeave={e => (e.currentTarget.style.color = '#9AA7B2')}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              className="rounded-lg px-3.5 py-2.5 text-sm flex items-start gap-2"
              style={{ backgroundColor: 'rgba(235,87,87,0.08)', border: '1px solid rgba(235,87,87,0.2)', color: '#EB5757' }}
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            style={{ backgroundColor: '#F5A623' }}
            onMouseEnter={e => { if (!loading) (e.currentTarget.style.backgroundColor = '#D48E1A') }}
            onMouseLeave={e => { if (!loading) (e.currentTarget.style.backgroundColor = '#F5A623') }}
          >
            {loading ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
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

        {/* Footer */}
        <div className="mt-8 pt-6 text-center" style={{ borderTop: '1px solid #EEF1F3' }}>
          <p className="text-xs" style={{ color: '#9AA7B2' }}>
            © 2026 Gilmore Technologies | v1.0.0
          </p>
        </div>
      </div>
    </div>
  )
}
