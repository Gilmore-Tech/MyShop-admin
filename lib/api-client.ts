/**
 * MyShop Admin API Client
 * Base URL: https://myshop-api-2hy2.onrender.com/v1
 * Auth: Bearer JWT (admin-jwt strategy)
 */
import {
  effectiveAdminPermissions,
  isGlobalAdminRole,
  type Permission,
  type Role,
  type CategoryScope,
} from './roles.ts'

// In the browser during local dev, route through the Next.js rewrite proxy to avoid CORS.

export const API_BASE = typeof window !== 'undefined' ? '/api/proxy' : (process.env.NEXT_PUBLIC_API_URL ?? 'https://myshop-api-2hy2.onrender.com/v1')

const TOKEN_KEY = 'myshop_admin_token'
const REFRESH_KEY = 'myshop_admin_refresh'
const ADMIN_KEY = 'myshop_admin_user'
export const ADMIN_ACTIVITY_KEY = 'myshop_admin_last_activity'

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
  localStorage.setItem(ADMIN_ACTIVITY_KEY, String(Date.now()))
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(ADMIN_KEY)
  localStorage.removeItem(ADMIN_ACTIVITY_KEY)
}

export function getAdminUser(): AdminUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(ADMIN_KEY)
  if (!raw) return null
  try {
    const user = JSON.parse(raw) as AdminUser
    if (!user || typeof user !== 'object') return null
    const hasGlobalScope = isGlobalAdminRole(user.role)
    return {
      ...user,
      permissions: effectiveAdminPermissions(user.role, user.permissions),
      regionId: hasGlobalScope ? null : user.regionId,
      regionName: hasGlobalScope ? null : user.regionName,
      categoryScope: hasGlobalScope ? null : user.categoryScope,
      regionScope: hasGlobalScope ? null : user.regionScope,
    }
  } catch {
    return null
  }
}

export function setAdminUser(user: AdminUser) {
  localStorage.setItem(ADMIN_KEY, JSON.stringify(user))
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
  // Enable only alongside backend FF_SESSION_RECOVERY after the exact-SID
  // durability proof passes. Missing means no page, nav item or polling.
  sessionRecovery: process.env.NEXT_PUBLIC_FF_SESSION_RECOVERY === 'true',
  // BR-63 deleted-role recovery is independent from lost-device recovery and
  // stays hidden unless its backend gate is enabled for the same artifact.
  roleAccountRecovery:
    process.env.NEXT_PUBLIC_FF_ROLE_ACCOUNT_RECOVERY === 'true',
  // BR-61 containment. The backend independently defaults this writer off.
  // Do not enable until replacement lifecycle and durable cleanup are approved.
  adminProviderProfilePhoto: process.env.NEXT_PUBLIC_FF_ADMIN_PROVIDER_PROFILE_PHOTO === 'true',
  // Privileged document bytes are independently gated until real storage
  // verification and orphan-cleanup rehearsal pass end to end.
  adminProviderDocumentUpload: process.env.NEXT_PUBLIC_FF_ADMIN_PROVIDER_DOCUMENT_UPLOAD === 'true',
  // Best-effort interim distance annotation on the manual-assignment page
  // using /admin/live-map as the artisan-location source. See
  // docs/backend-spec-nearby-artisan-search.md (Option C). Drop this once the
  // backend ships first-class distance on /admin/artisans/search.
  nearbyArtisanHaversine: process.env.NEXT_PUBLIC_FEATURE_NEARBY_ARTISAN_HAVERSINE === 'true'
} as const

export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
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
  try {
    body = await res.json()
  } catch {
    body = null
  }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth:unauthorized'))
    }
    throw apiErrorFromResponse(res, body)
  }

  // NestJS TransformInterceptor wraps in { success, data, meta }
  const envelope = body && typeof body === 'object'
    ? body as Record<string, unknown>
    : null
  return (envelope?.data !== undefined ? envelope.data : body) as T
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly supportReference: string | null
  readonly details: Readonly<Record<string, unknown>> | null

  constructor(
    status: number,
    code: string,
    supportReference: string | null = null,
    details: Readonly<Record<string, unknown>> | null = null
  ) {
    super(userSafeApiErrorMessage(status, code, supportReference))
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.supportReference = supportReference
    this.details = details
  }
}

const SAFE_ERROR_CODE_RX = /^[A-Z][A-Z0-9_]{0,79}$/
const SUPPORT_REFERENCE_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const SAFE_ERROR_COPY: Readonly<Record<string, string>> = {
  INVALID_CREDENTIALS: 'Incorrect email or password. Please try again.',
  INVALID_CURRENT_PASSWORD: 'The current password is incorrect.',
  OUT_OF_SCOPE: 'You do not have access to this record.',
  ROLE_MISMATCH: 'This action does not match the selected account role.',
  TWO_PERSON_APPROVAL_REQUIRED: 'A different authorised reviewer must complete the second approval.',
  COORDINATOR_APPROVAL_REQUIRED: 'Coordinator approval is required before this action.',
  REGIONAL_MANAGER_APPROVAL_REQUIRED: 'Regional Manager approval is required before this action.',
  DOCUMENTS_REQUIRED: 'The required documents have not been uploaded.',
  DOCUMENTS_NOT_REVIEWED: 'Review every required document before continuing.',
  DOCUMENTS_NOT_APPROVED: 'Every required document must be independently approved.',
  INVALID_STAGE: 'This provider has moved to another verification stage. Reload and try again.',
  DRIVER_DOCUMENT_REQUIREMENTS_NOT_MET: 'Ghana Card, driver licence and profile photo must each be reviewed before continuing.',
  DRIVER_VEHICLE_BACKFILL_REQUIRED: 'Create or migrate the driver’s vehicle before continuing.',
  DRIVER_VEHICLE_DOCUMENT_REQUIREMENTS_NOT_MET: 'The selected vehicle needs current roadworthiness and insurance documents, each accepted by Admin.',
  ARTISAN_DOCUMENT_REQUIREMENTS_NOT_MET: 'The artisan needs an accepted Ghana Card and exactly one Business Registration or Trade Certificate.',
  DOCUMENT_EXPIRY_REQUIRED: 'Enter the required document expiry date before continuing.',
  DOCUMENT_EXPIRED: 'A required document has expired.',
  DOCUMENT_NOT_FOUND: 'This document is no longer available. Reload and try again.',
  DOCUMENT_VEHICLE_BINDING_REQUIRED: 'Bind this retained document to the exact vehicle before setting its expiry date.',
  EXPIRY_REQUIRED: 'Enter the document expiry date.',
  INVALID_EXPIRY_DATE: 'Enter a valid document expiry date.',
  FILE_TOO_LARGE: 'The selected file is too large.',
  INVALID_FILE_TYPE: 'The selected file type is not supported.',
  FILE_CONTENT_TYPE_MISMATCH: 'The file contents do not match its file type.',
  INVALID_FILE_CONTENT: 'The selected file could not be verified.',
  STORAGE_VERIFICATION_UNAVAILABLE: 'File verification is temporarily unavailable. Try again later.',
  PRIVATE_MEDIA_URL_UNAVAILABLE: 'This private document is temporarily unavailable.',
  VERIFICATION_CHANGED_RETRY: 'This verification changed. Reload the latest record and try again.',
  VERIFICATION_STAGE_CHANGED: 'This verification moved to another review stage. Reload and try again.',
  VEHICLE_CHANGED_RETRY: 'This vehicle changed. Reload the latest record and try again.',
  VEHICLE_RIDE_CATEGORY_CHANGED_RETRY: 'This vehicle category decision changed. Reload and try again.',
  PAYMENT_NOT_FOUND: 'The payment could not be found.',
  PAYMENT_NOT_RETRYABLE: 'This payment cannot be retried in its current state.',
  PAYOUT_IN_FLIGHT: 'This payout is already being processed.',
  PAYOUT_MANUAL_RECONCILIATION_REQUIRED: 'This payout requires manual reconciliation before another action.',
  AGGREGATE_BATCH_PAYOUTS_DISABLED: 'Automated batch payouts are suspended for this release.',
  CLAWBACK_ALREADY_SETTLED: 'This clawback has already been settled.',
  CLAWBACK_ALREADY_ESCALATED: 'This clawback has already been escalated.',
  RECOVERY_REQUEST_NOT_FOUND: 'This recovery request could not be found.',
  RECOVERY_REQUEST_NOT_PENDING: 'This recovery request is no longer pending.',
  RECOVERY_RESOLUTION_IN_PROGRESS: 'This recovery request is already being resolved.',
  RECOVERY_RESOLUTION_RETRY_QUEUED: 'The recovery action is queued for a safe retry.',
  SESSION_RECOVERY_DISABLED: 'Session recovery is currently unavailable.',
  CONFIG_KEY_NOT_ALLOWED: 'This configuration is not supported by the deployed API version.',
  CONFIG_KEY_NOT_FOUND: 'Deploy the required database migration before changing this setting.',
  CONFIG_VALUE_NOT_BOOLEAN: 'This setting must be enabled or disabled.',
  INVALID_PLATFORM_REFERRAL_CODE: 'Use the format MYSHOP- followed by six letters or numbers.',
  INVALID_PLATFORM_REFERRAL_CAMPAIGN_NAME: 'Enter a campaign label between 1 and 120 characters.',
  INVALID_PLATFORM_REFERRAL_DEACTIVATION_REASON: 'Enter a deactivation reason between 1 and 500 characters.',
  PLATFORM_REFERRAL_CODE_ALREADY_EXISTS: 'That platform promo code already exists. Choose another code.',
  PLATFORM_REFERRAL_CODE_NOT_FOUND: 'This platform promo code no longer exists. Refresh the list.',
  PLATFORM_REFERRAL_CODE_ALREADY_INACTIVE: 'This platform promo code is already inactive.',
  PROMO_CAP_REQUIRED: 'Percentage campaigns need a max-discount cap in GHS.',
  PROMO_EXCEEDS_SANITY_LIMIT: 'The discount exceeds the platform sanity limits. Lower it or ask the Super Admin to raise the limits.',
  PROMO_INVALID_WINDOW: 'The campaign window is invalid. The end date must be after the start date and within the maximum duration.',
  PROMO_MAKER_CHECKER_VIOLATION: 'You created this campaign, so a different authorised admin must approve it.',
  PROMO_CAMPAIGN_TERMS_LOCKED: 'Approved campaigns are locked. Only raising the budget, extending the end date, or changing the banner priority is allowed.',
  PROMO_BUDGET_CANNOT_SHRINK: 'The budget cap can only be raised, never lowered.',
  PROMO_END_CANNOT_SHRINK: 'The end date can only be extended, never brought forward.',
  PROMO_CAMPAIGN_STATE_CHANGED: 'This campaign changed state in the meantime. Reload and try again.',
  SUPER_ADMIN_REQUIRED: 'Only the Super Administrator can change the platform sanity limits.',
}

function fallbackForStatus(status: number): string {
  if (status === 400 || status === 422) return 'Check the information and try again.'
  if (status === 401) return 'Your session has expired. Sign in again.'
  if (status === 403) return 'You do not have permission to perform this action.'
  if (status === 404) return 'The requested record could not be found.'
  if (status === 409) return 'This record changed or conflicts with another action. Reload and try again.'
  if (status === 413) return 'The selected file is too large.'
  if (status === 415) return 'The selected file type is not supported.'
  if (status === 429) return 'Too many attempts. Wait a moment and try again.'
  if (status >= 500) return 'The server could not complete this request. Try again.'
  return 'The request could not be completed. Try again.'
}

function normalizeSupportReference(value: unknown): string | null {
  return typeof value === 'string' && SUPPORT_REFERENCE_RX.test(value) ? value : null
}

export function userSafeApiErrorMessage(
  status: number,
  code: string,
  supportReference: string | null = null
): string {
  const message = SAFE_ERROR_COPY[code] ?? fallbackForStatus(status)
  return supportReference ? `${message} Reference: ${supportReference}.` : message
}

export function userSafeAdminError(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

export function safeAdminErrorDiagnostic(error: unknown): Readonly<Record<string, unknown>> {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      code: error.code,
      supportReference: error.supportReference,
    }
  }
  return { kind: error instanceof Error ? error.name : typeof error }
}

export function apiErrorFromResponse(res: Response, body: unknown): ApiError {
  const envelope = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const error = envelope.error && typeof envelope.error === 'object'
    ? envelope.error as Record<string, unknown>
    : {}
  const candidateCode = error.code ?? (typeof envelope.error === 'string' ? envelope.error : null)
  const code = typeof candidateCode === 'string' && SAFE_ERROR_CODE_RX.test(candidateCode)
    ? candidateCode
    : `HTTP_${res.status}`
  const supportReference =
    normalizeSupportReference(error.supportReference) ??
    normalizeSupportReference(res.headers.get('x-support-reference'))
  const details = error.details && typeof error.details === 'object' && !Array.isArray(error.details)
    ? Object.freeze({ ...(error.details as Record<string, unknown>) })
    : null
  return new ApiError(res.status, code, supportReference, details)
}

// ── Convenience methods ───────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, opts?: ApiOptions) => apiFetch<T>(path, { method: 'GET', ...opts }),

  post: <T>(path: string, body?: unknown, opts?: ApiOptions) => apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body), ...opts }),

  patch: <T>(path: string, body?: unknown, opts?: ApiOptions) => apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body), ...opts }),

  put: <T>(path: string, body?: unknown, opts?: ApiOptions) => apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body), ...opts }),

  delete: <T>(path: string, opts?: ApiOptions) => apiFetch<T>(path, { method: 'DELETE', ...opts })
}
