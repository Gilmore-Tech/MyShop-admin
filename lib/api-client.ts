/**
 * MyShop Admin API Client
 * Base URL: https://myshop-api-2hy2.onrender.com/v1
 * Auth: Bearer JWT (admin-jwt strategy)
 */
import type { Permission, Role, CategoryScope } from './roles'

// In the browser during local dev, route through the Next.js rewrite proxy to avoid CORS.

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

// Returns the JWT `exp` claim (Unix seconds) for the current access token, or null if absent/unparsable.
export function getTokenExpiresAt(): number | null {
  const token = getToken()
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

export type DeployEnv = 'LOCAL' | 'STAGING' | 'PROD'

// Resolves the deploy environment for the topbar badge.
// Override priority: NEXT_PUBLIC_ENV > URL inference from NEXT_PUBLIC_API_URL.
export function getDeployEnv(): DeployEnv {
  const explicit = process.env.NEXT_PUBLIC_ENV?.toUpperCase()
  if (explicit === 'LOCAL' || explicit === 'STAGING' || explicit === 'PROD') return explicit
  const url = process.env.NEXT_PUBLIC_API_URL ?? ''
  if (/localhost|127\.0\.0\.1/.test(url)) return 'LOCAL'
  if (/staging/i.test(url)) return 'STAGING'
  return 'PROD'
}

export interface AdminUser {
  id: string
  email: string
  fullName: string
  permissions: Permission[]
  // Named role + data scope (mirrors the backend). `role` null = legacy/custom
  // admin; `regionId`/`categoryScope` null = global (owner/director/accountant).
  role: Role | null
  regionId: string | null
  regionName: string | null
  categoryScope: CategoryScope | null
  // Legacy free-text region marker, superseded by regionId.
  regionScope: string | null
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

interface ApiOptions extends RequestInit {
  skipAuth?: boolean
  // Skip the API_BASE prefix and call the path as-is. Use for Next.js route
  // handlers like /api/sms that live on this same origin and aren't part of
  // the NestJS backend.
  localRoute?: boolean
}

// Feature flags resolved from public env vars at build time. Default false so
// the dashboard hides any UI tied to a backend endpoint that isn't shipped yet.
export const FEATURES = {
  highBidReview: process.env.NEXT_PUBLIC_FEATURE_HIGH_BID_REVIEW === 'true',
  // Best-effort interim distance annotation on the manual-assignment page
  // using /admin/live-map as the artisan-location source. See
  // docs/backend-spec-nearby-artisan-search.md (Option C). Drop this once the
  // backend ships first-class distance on /admin/artisans/search.
  nearbyArtisanHaversine: process.env.NEXT_PUBLIC_FEATURE_NEARBY_ARTISAN_HAVERSINE === 'true',
} as const


export async function apiFetch<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { skipAuth, localRoute, ...init } = options
  const token = getToken()

  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (!skipAuth && token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const url = localRoute ? path : `${API_BASE}${path}`
  const res = await fetch(url, { ...init, headers })

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
