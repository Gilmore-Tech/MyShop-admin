/**
 * MyShop Admin API Client
 * Base URL: https://myshop-api-2hy2.onrender.com/v1
 * Auth: Bearer JWT (admin-jwt strategy)
 */

// In the browser during local dev, route through the Next.js rewrite proxy to avoid CORS.
// In production (or when NEXT_PUBLIC_API_URL is set), hit the API directly.
export const API_BASE =
  typeof window !== 'undefined'
    ? '/api/proxy'
    : (process.env.NEXT_PUBLIC_API_URL ?? 'https://myshop-api-2hy2.onrender.com/v1')

const TOKEN_KEY = 'myshop_admin_token'
const REFRESH_KEY = 'myshop_admin_refresh'
const ADMIN_KEY = 'myshop_admin_user'

// ── Token helpers ─────────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(ADMIN_KEY)
}

export function getAdminUser(): AdminUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(ADMIN_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function setAdminUser(user: AdminUser) {
  localStorage.setItem(ADMIN_KEY, JSON.stringify(user))
}

export interface AdminUser {
  id: string
  email: string
  fullName: string
  role: 'super_admin' | 'regional_admin' | 'ops_admin' | 'support_agent'
  regionScope: string | null
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

interface ApiOptions extends RequestInit {
  skipAuth?: boolean
}


export async function apiFetch<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { skipAuth, ...init } = options
  const token = getToken()

  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (!skipAuth && token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })

  return unwrap<T>(res)
}

async function unwrap<T>(res: Response): Promise<T> {
  let body: unknown
  try { body = await res.json() } catch { body = null }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth:unauthorized'))
    }
    const err = body as any
    const code = err?.error?.code ?? err?.error ?? err?.message ?? String(res.status)
    const msg = err?.error?.message ?? err?.message ?? 'Request failed'
    throw new ApiError(res.status, code, msg)
  }

  // NestJS TransformInterceptor wraps in { success, data, meta }
  const b = body as any
  return (b?.data !== undefined ? b.data : b) as T
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── Convenience methods ───────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, opts?: ApiOptions) =>
    apiFetch<T>(path, { method: 'GET', ...opts }),

  post: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body), ...opts }),

  patch: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body), ...opts }),

  put: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body), ...opts }),

  delete: <T>(path: string, opts?: ApiOptions) =>
    apiFetch<T>(path, { method: 'DELETE', ...opts }),
}
