/**
 * Typed API methods for MyShop Admin Panel
 * All endpoints map directly to the NestJS backend (v1 prefix).
 */
import {
  api,
  apiFetch,
  ApiError,
  AdminUser,
  setTokens,
  setAdminUser,
  clearTokens,
  API_BASE,
  getToken,
  apiErrorFromResponse,
} from './api-client'
import type { Permission, Role, CategoryScope } from './roles'
import type { ReportGroupBy } from './format-date'
import {
  normaliseProviderRequestRestriction,
  type ProviderRequestRestrictionListItem,
  type ProviderRequestRestrictionListResponse,
  type ProviderRequestRestrictionType,
} from './provider-cancellation-restriction-contract'
import {
  normaliseAnnouncementHistory,
  normaliseAnnouncementPreview,
  type AnnouncementDraft,
  type AnnouncementPublishResult,
} from './announcement-campaign-contract'
export {
  type AnnouncementAudience,
  type AnnouncementChannel,
  type AnnouncementClassification,
  type AnnouncementDestination,
  type AnnouncementDraft,
  type AnnouncementHistoryItem,
  type AnnouncementPreview,
  type AnnouncementPreviewCounts,
  type AnnouncementPublishResult,
} from './announcement-campaign-contract'
export {
  normaliseProviderRequestRestriction,
  type ProviderRequestRestrictionListItem,
  type ProviderRequestRestrictionListResponse,
  type ProviderRequestRestrictionPolicyKind,
  type ProviderRequestRestrictionStatus,
  type ProviderRequestRestrictionType,
  normaliseProviderCancellationRestriction,
  type ProviderCancellationRestrictionListItem,
  type ProviderCancellationRestrictionListResponse,
  type ProviderCancellationRestrictionStatus,
  type ProviderCancellationRestrictionType,
} from './provider-cancellation-restriction-contract'
import { normaliseRevenueReport, type RevenueReport, type RevenueGroupBy } from './revenue-report-contract'
import { normaliseBookingOutcomesReport, type BookingOutcomesReport, type OutcomeVertical } from './booking-outcomes-contract'
import { normaliseCommissionLedger, type CommissionLedgerReport, type LedgerGroupBy } from './commission-ledger-contract'
import {
  normaliseProviderLeaderboard,
  normaliseTopClients,
  type ProviderLeaderboardReport,
  type ProviderLeaderboardVertical,
  type TopClientsReport,
  type ClientLeaderboardVertical,
} from './leaderboard-contract'
import {
  normaliseOnlineProviders,
  normaliseOnlineProviderCounts,
  type OnlineProvidersResponse,
  type OnlineProviderCounts,
} from './online-providers-contract'
import {
  normaliseRideGpsTrail,
  normaliseRideGpsTrailMeta,
  type RideGpsPoint,
  type RideGpsTrailMeta,
} from './ride-gps-trail-contract'
import {
  assertExactRoleAccountEnvelope,
  roleAccountPath,
  type ExactRoleAccountRole,
} from './role-account-contract'
import {
  normalisePlatformReferralCodeInput,
  normalisePlatformReferralCodeItem,
  normalisePlatformReferralCodeListResponse,
  type PlatformReferralCodeItem,
  type PlatformReferralCodeListResponse,
} from './platform-referral-code-contract'
import {
  normalisePromoCampaign,
  normalisePromoCampaignDetail,
  normalisePromoCampaignListResponse,
  normalisePromoCampaignSanityLimits,
  validatePromoBannerFile,
  type PromoCampaign,
  type PromoCampaignAudience,
  type PromoCampaignDetail,
  type PromoCampaignListResponse,
  type PromoCampaignSanityLimits,
  type PromoCampaignScope,
  type PromoCampaignStatus,
  type PromoCampaignType,
} from './promo-campaign-contract'
import {
  normaliseRidePricing,
  type RidePricingSummary,
} from './ride-pricing-contract'
import {
  normaliseDistanceSafeguardPreview,
  normaliseDistanceSafeguardState,
  type DistanceSafeguardFloorInput,
  type DistanceSafeguardPreview,
  type DistanceSafeguardState,
  type SaveDistanceSafeguardDraftInput,
} from './ride-distance-safeguard-contract'
import {
  normaliseRideTollPolicyPreview,
  normaliseRideTollPolicyState,
  type RideTollPolicyPreview,
  type RideTollPolicyState,
  type SaveRideTollPolicyDraftInput,
} from './ride-toll-policy-contract'
import {
  normaliseAdminRideListResponse,
  type AdminRideListResponse as NormalisedAdminRideListResponse,
} from './admin-ride-contract'
import {
  normaliseDriverPriorityDriverList,
  normaliseDriverPriorityHistory,
  normaliseDriverPriorityMetrics,
  normaliseDriverPriorityPolicy,
  type DriverPriorityDriverList,
  type DriverPriorityHistory,
  type DriverPriorityMetrics,
  type DriverPriorityPolicyResponse,
  type DriverPriorityPolicyUpdate,
  type DriverPriorityTier,
} from './driver-priority-contract'
export type { AdminRide, AdminRideListResponse } from './admin-ride-contract'
export type {
  DriverPriorityDriverList,
  DriverPriorityDriverRow,
  DriverPriorityHistory,
  DriverPriorityHistoryItem,
  DriverPriorityMetrics,
  DriverPriorityPolicyResponse,
  DriverPriorityPolicyUpdate,
  DriverPriorityTier,
  EffectiveDriverPriorityTier,
} from './driver-priority-contract'

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AdminLoginResponse {
  accessToken: string
  refreshToken: string
  admin: AdminUser
}

export async function adminLogin(email: string, password: string): Promise<AdminLoginResponse> {
  const res = await api.post<AdminLoginResponse>(
    '/auth/admin/login',
    { email, password },
    { skipAuth: true }
  )
  if (!res?.accessToken || !res?.refreshToken || !res?.admin) {
    throw new Error(`Unexpected login response shape: ${JSON.stringify(res)}`)
  }
  setTokens(res.accessToken, res.refreshToken)
  setAdminUser(res.admin)
  return res
}

export function adminLogout() {
  clearTokens()
}

// ── Overview / Dashboard ──────────────────────────────────────────────────────

export interface OverviewReport {
  activeRides: number
  activeJobs: number
  pendingVerifications: number
  openDisputes: number
  registeredClients: number
  registeredDrivers: number
  registeredArtisans: number
  commissionRevenue: { todayGhs: number; weekGhs: number; monthGhs: number }
  paymentSuccessRatePct: number | null
  period: {
    from: string
    to: string
    timeZone: 'Africa/Accra'
    ridesCreated: number
    jobsCreated: number
    totalPayments: number
    successfulPayments: number
    paymentSuccessRatePct: number | null
    commissionRevenueGhs: number
  } | null
  generatedAt: string
}

export async function getOverviewReport(params?: {
  from?: string
  to?: string
}): Promise<OverviewReport> {
  const query = new URLSearchParams()
  if (params?.from) query.set('from', params.from)
  if (params?.to) query.set('to', params.to)
  const raw = await api.get<any>(`/admin/reports/overview${query.size ? `?${query}` : ''}`)
  const rev = raw.commissionRevenue ?? raw.commission_revenue ?? {}
  const period = raw.period ?? null
  return {
    activeRides: raw.activeRides ?? raw.active_rides ?? 0,
    activeJobs: raw.activeJobs ?? raw.active_jobs ?? 0,
    pendingVerifications: raw.pendingVerifications ?? raw.pending_verifications ?? 0,
    openDisputes: raw.openDisputes ?? raw.open_disputes ?? 0,
    registeredClients: raw.registeredClients ?? raw.registered_clients ?? 0,
    registeredDrivers: raw.registeredDrivers ?? raw.registered_drivers ?? 0,
    registeredArtisans: raw.registeredArtisans ?? raw.registered_artisans ?? 0,
    commissionRevenue: {
      todayGhs: rev.todayGhs ?? rev.today_ghs ?? 0,
      weekGhs: rev.weekGhs ?? rev.week_ghs ?? 0,
      monthGhs: rev.monthGhs ?? rev.month_ghs ?? 0,
    },
    paymentSuccessRatePct: raw.paymentSuccessRatePct ?? raw.payment_success_rate_pct ?? null,
    period: period
      ? {
          from: period.from ?? params?.from ?? '',
          to: period.to ?? params?.to ?? '',
          timeZone: period.timeZone ?? period.time_zone ?? 'Africa/Accra',
          ridesCreated: Number(period.ridesCreated ?? period.rides_created ?? 0),
          jobsCreated: Number(period.jobsCreated ?? period.jobs_created ?? 0),
          totalPayments: Number(period.totalPayments ?? period.total_payments ?? 0),
          successfulPayments: Number(period.successfulPayments ?? period.successful_payments ?? 0),
          paymentSuccessRatePct:
            period.paymentSuccessRatePct ?? period.payment_success_rate_pct ?? null,
          commissionRevenueGhs: Number(
            period.commissionRevenueGhs ?? period.commission_revenue_ghs ?? 0,
          ),
        }
      : null,
    generatedAt: raw.generatedAt ?? raw.generated_at ?? new Date().toISOString(),
  }
}

// ── Revenue Report ────────────────────────────────────────────────────────────
// Shapes + tolerant parsing live in lib/revenue-report-contract.ts (tested).

export type { RevenueDataPoint, VerticalRevenue, RevenueReport, RevenueGroupBy } from './revenue-report-contract'

export async function getRevenueReport(params?: {
  from?: string
  to?: string
  groupBy?: RevenueGroupBy
}): Promise<RevenueReport> {
  const groupBy = params?.groupBy ?? 'day'
  const defaultDays = groupBy === 'year' ? 730 : groupBy === 'month' ? 365 : groupBy === 'week' ? 90 : 30
  const from =
    params?.from ??
    (() => {
      const d = new Date()
      d.setDate(d.getDate() - defaultDays)
      return d.toISOString().split('T')[0]
    })()
  const to = params?.to ?? new Date().toISOString().split('T')[0]
  const qs = '?' + new URLSearchParams({ from, to, groupBy }).toString()
  const raw = await api.get<unknown>(`/admin/reports/revenue${qs}`)
  return normaliseRevenueReport(raw, groupBy)
}

// ── Booking outcomes (Trip Outcomes page + dashboard mini-table) ──────────────

export type { BookingOutcomesReport, BookingOutcomePeriod, BookingOutcomeCounters, OutcomeVertical } from './booking-outcomes-contract'

export async function getBookingOutcomesReport(params: {
  from?: string
  to?: string
  groupBy?: ReportGroupBy
  vertical?: OutcomeVertical
}): Promise<BookingOutcomesReport> {
  const query = new URLSearchParams()
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  query.set('groupBy', params.groupBy ?? 'day')
  query.set('vertical', params.vertical ?? 'all')
  const raw = await api.get<unknown>(`/admin/reports/bookings/outcomes?${query}`)
  return normaliseBookingOutcomesReport(raw, { groupBy: params.groupBy ?? 'day', vertical: params.vertical ?? 'all' })
}

// ── Commission ledger (Payments → Commission Ledger) ──────────────────────────

export type { CommissionLedgerReport, CommissionLedgerRow, CommissionLedgerMoney, LedgerGroupBy } from './commission-ledger-contract'

export async function getCommissionLedger(params: {
  from?: string
  to?: string
  groupBy?: LedgerGroupBy
  providerId?: string
  providerType?: 'driver' | 'artisan'
  page?: number
  limit?: number
}): Promise<CommissionLedgerReport> {
  const groupBy = params.groupBy ?? 'provider'
  const query = new URLSearchParams()
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  query.set('groupBy', groupBy)
  if (params.providerId) query.set('providerId', params.providerId)
  if (params.providerType) query.set('providerType', params.providerType)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  const raw = await api.get<unknown>(`/admin/reports/commission-ledger?${query}`)
  return normaliseCommissionLedger(raw, { groupBy, page: params.page, limit: params.limit })
}

// ── Leaderboards (Insights → Leaderboards) ────────────────────────────────────

export type {
  ProviderLeaderboardReport, ProviderLeaderboardRow, ProviderLeaderboardVertical,
  TopClientsReport, TopClientRow, ClientLeaderboardVertical,
} from './leaderboard-contract'

export async function getProviderLeaderboard(params: {
  from?: string
  to?: string
  vertical?: ProviderLeaderboardVertical
  page?: number
  limit?: number
}): Promise<ProviderLeaderboardReport> {
  const vertical = params.vertical ?? 'all'
  const query = new URLSearchParams()
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  query.set('vertical', vertical)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  const raw = await api.get<unknown>(`/admin/reports/providers/leaderboard?${query}`)
  return normaliseProviderLeaderboard(raw, { vertical, page: params.page, limit: params.limit })
}

export async function getTopClientsReport(params: {
  from?: string
  to?: string
  vertical?: ClientLeaderboardVertical
  limit?: number
}): Promise<TopClientsReport> {
  const vertical = params.vertical ?? 'all'
  const query = new URLSearchParams()
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  query.set('vertical', vertical)
  if (params.limit) query.set('limit', String(params.limit))
  const raw = await api.get<unknown>(`/admin/reports/clients/top?${query}`)
  return normaliseTopClients(raw, { vertical, limit: params.limit })
}

// ── Online providers (Operations → Online Providers, dashboard live strip) ────

export type { OnlineProviderCounts, OnlineProviderRow, OnlineProvidersResponse } from './online-providers-contract'

export async function getOnlineProviders(params: {
  role?: 'driver' | 'artisan' | 'all'
  page?: number
  limit?: number
} = {}): Promise<OnlineProvidersResponse> {
  const query = new URLSearchParams()
  query.set('role', params.role ?? 'all')
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  const raw = await api.get<unknown>(`/admin/providers/online?${query}`)
  return normaliseOnlineProviders(raw, { page: params.page, limit: params.limit })
}

export async function getOnlineProviderCounts(): Promise<OnlineProviderCounts> {
  const raw = await api.get<unknown>('/admin/providers/online/counts')
  return normaliseOnlineProviderCounts(raw)
}

// ── Provider Report ───────────────────────────────────────────────────────────

export interface ProviderReport {
  flagThreshold: number
  drivers: Array<{
    driverId: string
    name: string
    phone: string
    verificationStatus: string
    cancellationCount30d: number
    totalEarningsGhs: number
    avgRating: number | null
    ratingCount: number
  }>
  artisans: Array<{
    artisanId: string
    name: string
    phone: string
    verificationStatus: string
    categories: string[]
    supplementCount: number
    completedJobsCount: number
    cancellationCount30d: number
    supplementRatePct: number | null
    flagged: boolean
    avgRating: number | null
    ratingCount: number
  }>
}

export async function getProviderReport(): Promise<ProviderReport> {
  const raw = await api.get<any>('/admin/reports/providers')
  const num = (v: any): number | null => (v == null ? null : Number(v))
  const drivers = (raw?.drivers ?? []).map((d: any) => ({
    driverId: d.driverId ?? d.driver_id ?? d.id ?? '',
    name: d.name ?? d.fullName ?? d.full_name ?? '',
    phone: d.phone ?? '',
    verificationStatus: d.verificationStatus ?? d.verification_status ?? '',
    cancellationCount30d: d.cancellationCount30d ?? d.cancellation_count_30d ?? 0,
    totalEarningsGhs: Number(d.totalEarningsGhs ?? d.total_earnings_ghs ?? 0),
    avgRating: num(d.avgRating ?? d.avg_rating),
    ratingCount: d.ratingCount ?? d.rating_count ?? 0,
  }))
  const artisans = (raw?.artisans ?? []).map((a: any) => ({
    artisanId: a.artisanId ?? a.artisan_id ?? a.id ?? '',
    name: a.name ?? a.fullName ?? a.full_name ?? '',
    phone: a.phone ?? '',
    verificationStatus: a.verificationStatus ?? a.verification_status ?? '',
    categories: a.categories ?? [],
    supplementCount: a.supplementCount ?? a.supplement_count ?? 0,
    completedJobsCount: a.completedJobsCount ?? a.completed_jobs_count ?? 0,
    cancellationCount30d: a.cancellationCount30d ?? a.cancellation_count_30d ?? 0,
    supplementRatePct: num(a.supplementRatePct ?? a.supplement_rate_pct),
    flagged: Boolean(a.flagged),
    avgRating: num(a.avgRating ?? a.avg_rating),
    ratingCount: a.ratingCount ?? a.rating_count ?? 0,
  }))
  return {
    flagThreshold: raw?.flagThreshold ?? raw?.flag_threshold ?? 0,
    drivers,
    artisans,
  }
}

// ── Pilot Report ──────────────────────────────────────────────────────────────

export interface PilotMetric {
  label: string
  key: string
  target: number
  actual: number
  unit: string
}

export async function getPilotReport(): Promise<PilotMetric[]> {
  const raw = await api.get<any>('/admin/reports/pilot')
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw?.metrics)) return raw.metrics
  if (Array.isArray(raw?.items)) return raw.items
  return []
}

// ── Live Map ──────────────────────────────────────────────────────────────────

export interface LiveMapMarker {
  type: 'ride' | 'job'
  bookingId: string
  providerName: string | null
  clientName: string | null
  status: string
  lat: number
  lng: number
  markerColor: 'blue' | 'orange'
}

// Normalise raw DB status names to the values the frontend expects
function normaliseMarkerStatus(status: string): string {
  switch (status) {
    case 'driver_en_route':
    case 'artisan_en_route':
      return 'en_route'
    case 'arrived_at_pickup':
    case 'artisan_arrived':
      return 'arrived'
    default:
      return status
  }
}

export async function getLiveMapData(): Promise<LiveMapMarker[]> {
  const raw = await api.get<any>('/admin/live-map')
  // Backend returns { rides: [...], jobs: [...] } — flatten into a single array
  const rides: LiveMapMarker[] = (Array.isArray(raw) ? [] : (raw.rides ?? [])).map((m: any) => ({
    ...m,
    status: normaliseMarkerStatus(m.status),
  }))
  const jobs: LiveMapMarker[] = (Array.isArray(raw) ? raw : (raw.jobs ?? [])).map((m: any) => ({
    ...m,
    status: normaliseMarkerStatus(m.status),
  }))
  return [...rides, ...jobs]
}

export interface RideMarkerDetail {
  id: string
  status: string
  pickupAddress: string | null
  dropoffAddress: string | null
  estimatedFarePesewas: number | null
  finalFarePesewas: number | null
  pricing: RidePricingSummary | null
  distanceKm: string | number | null
  durationMins: string | number | null
  driver: {
    fullName: string
    displayName: string | null
    phone: string
    vehicleMake: string | null
    vehicleModel: string | null
    vehiclePlate: string | null
    vehicleColor: string | null
  } | null
  client: { fullName: string; displayName: string | null; phone: string }
}

export async function getRideMarkerDetail(rideId: string): Promise<RideMarkerDetail> {
  const raw = await api.get<Omit<RideMarkerDetail, 'pricing'> & { pricing?: unknown }>(
    `/admin/live-map/rides/${rideId}`,
  )
  return { ...raw, pricing: normaliseRidePricing(raw?.pricing) }
}

export interface JobMarkerDetail {
  id: string
  status: string
  description: string
  addressText: string | null
  agreedPricePesewas: number | null
  category: { name: string }
  artisan: { fullName: string; displayName: string | null; phone: string } | null
  client: { fullName: string; displayName: string | null; phone: string }
}

export function getJobMarkerDetail(jobId: string) {
  return api.get<JobMarkerDetail>(`/admin/live-map/jobs/${jobId}`)
}

// ── Verification Queue ────────────────────────────────────────────────────────

// Maps raw document_type strings (snake_case DB values) to human-readable labels.
const DOC_TYPE_LABELS: Record<string, string> = {
  national_id: 'National ID',
  ghana_card: 'Ghana Card',
  passport: 'Passport',
  drivers_license: "Driver's License",
  drivers_licence: "Driver's Licence",
  vehicle_registration: 'Vehicle Registration',
  vehicle_insurance: 'Vehicle Insurance',
  roadworthy: 'Roadworthy Certificate',
  roadworthiness_certificate: 'Roadworthiness Certificate',
  profile_photo: 'Profile Photo',
  certificate: 'Certificate / Qualification',
  trade_license: 'Trade License',
  trade_certificate: 'Trade Certificate',
  tin_certificate: 'TIN Certificate',
  business_registration: 'Business Registration',
}

function docTypeLabel(raw: string): string {
  return DOC_TYPE_LABELS[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Resolves a storage key (e.g. "documents/driver/uuid/ghana_card/abc.pdf") to a full Cloudinary
// delivery URL. Falls back to the raw key unchanged if NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME isn't set.
function resolveCloudinaryUrl(fileUrl: string, mimeType: string | null): string {
  if (fileUrl.startsWith('http')) return fileUrl
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  if (!cloudName) return fileUrl
  const lk = fileUrl.toLowerCase()
  const resourceType = mimeType === 'application/pdf' || lk.endsWith('.pdf') ? 'raw' : 'image'
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${fileUrl}`
}

// Provider evidence is private. The API must return a short-lived signed URL;
// never turn a bare storage key into a public Cloudinary `/upload/` URL.
function resolvedAdminDocumentUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') return ''
  return /^https?:\/\//i.test(raw) ? raw : ''
}

// A provider profile photo is always an image; resolve a bare Cloudinary storage
// key to a delivery URL, pass through full URLs, and normalise empty/missing to null.
function resolveProfilePhoto(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  return resolveCloudinaryUrl(raw, 'image/jpeg')
}

export interface ProviderDocument {
  id: string
  type: string // raw document_type from DB (e.g. "national_id")
  label: string // human-readable label (e.g. "National ID")
  status:
    | 'uploaded'
    | 'pending_review'
    | 'confirmed'
    | 'coordinator_validated'
    | 'approved'
    | 'rejected'
    | 'superseded'
    | 'expired'
  file_url: string // Cloudinary URL
  mime_type: string | null
  uploaded_at: string // ISO string
  expires_at: string | null
  version: number
  rejection_reason: string | null // set when status === 'rejected'
  // True when this is the latest version of the document. Re-uploads supersede
  // the previous version, and only the current version is reviewable — the
  // backend rejects a review of a non-current id with DOCUMENT_NOT_FOUND.
  // Defaults to true until the backend populates is_current on the queue.
  isCurrent: boolean
  isReplacement: boolean
}

// Pipeline stage of a provider in the verification queue.
export type VerificationStage =
  | 'pending_documents' // awaiting admin per-document authenticity checks
  | 'docs_verified' // admin done; awaiting coordinator validation
  | 'coordinator_validated' // coordinator done; awaiting RM final decision
  | 'online' // RM approved/eligible (leaves queue; availability remains provider-controlled)
  | 'rejected' // RM rejected; provider must replace the selected documents

export interface VerificationItem {
  provider_type: string
  provider_id: string
  provider_name: string | null
  verification_stage: VerificationStage | null
  document_review_only: boolean
  region_id: string | null
  region_name: string | null
  docs_pending: number
  docs_incomplete: number
  docs_approved: number
  docs_rejected: number
  total_docs: number
  first_upload_at: string
  documents: ProviderDocument[]
}

// Handles both raw SQL (snake_case keys) and Prisma/camelCase responses.
function normaliseDoc(d: any): ProviderDocument {
  const rawType = d.document_type ?? d.documentType ?? d.type ?? ''
  const mimeType = d.mime_type ?? d.mimeType ?? null
  const rawUrl = d.file_url ?? d.fileUrl ?? ''
  return {
    id: String(d.id ?? ''),
    type: rawType,
    label: d.label ?? docTypeLabel(rawType),
    status: d.status ?? 'pending_review',
    file_url: resolvedAdminDocumentUrl(rawUrl),
    mime_type: mimeType,
    uploaded_at: d.uploaded_at ?? d.uploadedAt ?? d.created_at ?? d.createdAt ?? '',
    expires_at: d.expires_at ?? d.expiresAt ?? null,
    version: Number(d.version ?? 1),
    rejection_reason: d.rejection_reason ?? d.rejectionReason ?? null,
    isCurrent: (d.is_current ?? d.isCurrent ?? true) !== false,
    isReplacement: Boolean(
      d.is_replacement ?? d.isReplacement ?? d.replaces_document_id ?? d.replacesDocumentId,
    ),
  }
}

// Prisma $queryRaw sometimes returns json_agg results as a JSON string instead of
// a parsed array. This helper handles both.
function parseDocuments(raw: any): any[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return []
    }
  }
  return []
}

// Normalise a raw queue item from the API to our VerificationItem shape.
function normaliseItem(v: any): VerificationItem {
  const rawDocs = parseDocuments(v.documents ?? v.providerDocuments)
  return {
    provider_type: v.provider_type ?? v.providerType ?? '',
    provider_id: v.provider_id ?? v.providerId ?? '',
    verification_stage: (v.verification_stage ??
      v.verificationStage ??
      null) as VerificationStage | null,
    document_review_only: Boolean(v.document_review_only ?? v.documentReviewOnly ?? false),
    region_id: v.region_id ?? v.regionId ?? null,
    region_name: v.region_name ?? v.regionName ?? null,
    provider_name: v.provider_name ?? v.providerName ?? null,
    docs_pending: Number(v.docs_pending ?? v.docsPending ?? 0),
    docs_incomplete: Number(v.docs_incomplete ?? v.docsIncomplete ?? 0),
    docs_approved: Number(v.docs_approved ?? v.docsApproved ?? 0),
    docs_rejected: Number(v.docs_rejected ?? v.docsRejected ?? 0),
    total_docs: Number(v.total_docs ?? v.totalDocs ?? rawDocs.length),
    first_upload_at: v.first_upload_at ?? v.firstUploadAt ?? v.createdAt ?? '',
    documents: rawDocs.map(normaliseDoc),
  }
}

export async function getVerificationQueue(opts?: {
  stage?: VerificationStage
}): Promise<VerificationItem[]> {
  const qs = opts?.stage ? `?stage=${encodeURIComponent(opts.stage)}` : ''
  const raw = await api.get<any>(`/admin/verifications${qs}`)
  const arr: any[] = Array.isArray(raw) ? raw : ((raw as any)?.items ?? [])
  return arr.map(normaliseItem)
}

type VerificationDocumentAccessCacheEntry = {
  fileUrl: string
  refreshAt: number
}

const verificationDocumentAccessCache = new Map<string, VerificationDocumentAccessCacheEntry>()

// Queue responses deliberately contain no private storage references. Resolve
// one scoped, short-lived URL only when an operator opens that document. Cache
// it for less than the backend's 15-minute lifetime so moving back and forth in
// the drawer does not repeat a Cloudinary Admin API lookup.
export async function getVerificationDocumentAccess(
  documentId: string,
  opts?: { refresh?: boolean }
): Promise<string> {
  const cached = verificationDocumentAccessCache.get(documentId)
  if (!opts?.refresh && cached && cached.refreshAt > Date.now()) return cached.fileUrl

  const raw = await api.get<unknown>(
    `/admin/verifications/documents/${encodeURIComponent(documentId)}/access`
  )
  if (!raw || typeof raw !== 'object' || typeof (raw as Record<string, unknown>).fileUrl !== 'string') {
    throw new Error('The document access response was incomplete.')
  }
  const fileUrl = (raw as { fileUrl: string }).fileUrl
  if (!/^https:\/\//i.test(fileUrl)) throw new Error('The document access URL was invalid.')

  verificationDocumentAccessCache.set(documentId, {
    fileUrl,
    refreshAt: Date.now() + 10 * 60 * 1000,
  })
  return fileUrl
}

// Refetch a single provider's queue row so document ids reflect the latest
// versions. Reuses the deployed queue endpoint (no per-provider route needed).
// Used to self-heal stale document ids after a re-upload supersedes a version.
export async function getVerificationItem(
  providerId: string,
  providerType: string
): Promise<VerificationItem | null> {
  const queue = await getVerificationQueue()
  return queue.find((v) => v.provider_id === providerId && v.provider_type === providerType) ?? null
}

// ── 3-stage verification pipeline (Admin → Coordinator → RM) ──────────────────

// Stage 1→2 (Admin). After every current document has been approved/rejected,
// submit the provider to the category coordinator. POST /admin/verifications/:id/submit
export function submitVerification(providerId: string, providerType: 'driver' | 'artisan') {
  return api.post(`/admin/verifications/${providerId}/submit`, {
    providerType,
  })
}

// Stage 2→3 (Coordinator). Validate the admin-approved set for your category, or
// bounce it back. PATCH /admin/verifications/:id/validate
export function validateVerification(
  providerId: string,
  providerType: 'driver' | 'artisan',
  action: 'approve' | 'reject',
  reason: string
) {
  return api.patch(`/admin/verifications/${providerId}/validate`, {
    action,
    providerType,
    reason,
  })
}

// Stage 3 (Regional Manager). Final provider eligibility decision. This must
// not change the provider's separate online/offline availability state.
export function finalizeVerification(
  providerId: string,
  providerType: 'driver' | 'artisan',
  action: 'approve' | 'reject',
  reason: string,
  rejectedDocumentIds?: readonly string[]
) {
  return api.patch(`/admin/verifications/${providerId}/finalize`, {
    action,
    providerType,
    reason,
    ...(action === 'reject' ? { rejectedDocumentIds: [...(rejectedDocumentIds ?? [])] } : {}),
  })
}

// Who performed each verification stage (from the audit trail).
export interface StageApprover {
  by: string
  at: string
}
export interface VerificationHistory {
  stage1: StageApprover | null // Admin submitted to coordinator
  stage2: StageApprover | null // Coordinator validated
  stage3: (StageApprover & { decision: 'approved' | 'rejected' }) | null // RM finalized
}
export function getVerificationHistory(providerId: string, providerType: 'driver' | 'artisan') {
  return api.get<VerificationHistory>(
    `/admin/verifications/${providerId}/history?providerType=${providerType}`
  )
}

// ── Provider Suspensions ──────────────────────────────────────────────────────
// Admin management of the auto-suspension that fires when a provider hits the
// cancellation threshold (Driver.cancellationCount30d ≥ cancellation_suspension_count
// over the rolling window). Backed by the `provider_suspensions` table. These call
// the /admin/providers/* endpoints documented in docs/backend-requests.md §6.

// One row from the suspensions list/history, joined to the provider + user.
export interface SuspensionListItem {
  suspensionId: string
  providerType: 'driver' | 'artisan'
  providerId: string
  fullName: string | null
  phone: string | null // backend returns normalised/masked
  cancellationCount30d: number // current rolling count
  verificationStatus: string // 'suspended' while active
  reason: string | null
  triggerType: string | null // e.g. 'cancellation_limit'
  isAutomatic: boolean
  suspendedAt: string // ProviderSuspension.createdAt (ISO)
  reinstatedAt: string | null // null while active
}

export interface SuspensionListResponse {
  items: SuspensionListItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// Defensive normaliser — accepts camelCase or snake_case, and provider/user either
// flattened or nested, so the page renders regardless of the exact backend shape.
function normaliseSuspensionItem(raw: any): SuspensionListItem {
  const u = raw.user ?? null
  const p = raw.provider ?? null
  return {
    suspensionId: raw.suspensionId ?? raw.id ?? raw.suspension_id ?? '',
    providerType: (raw.providerType ?? raw.provider_type ?? 'driver') as 'driver' | 'artisan',
    providerId: raw.providerId ?? raw.provider_id ?? p?.id ?? '',
    fullName: raw.fullName ?? raw.full_name ?? raw.name ?? u?.fullName ?? u?.full_name ?? null,
    phone: raw.phone ?? u?.phone ?? null,
    cancellationCount30d: Number(
      raw.cancellationCount30d ??
        raw.cancellation_count_30d ??
        raw.cancellationCount ??
        p?.cancellationCount30d ??
        0
    ),
    verificationStatus:
      raw.verificationStatus ?? raw.verification_status ?? p?.verificationStatus ?? 'suspended',
    reason: raw.reason ?? null,
    triggerType: raw.triggerType ?? raw.trigger_type ?? raw.trigger ?? null,
    isAutomatic: Boolean(raw.isAutomatic ?? raw.is_automatic ?? false),
    suspendedAt: raw.suspendedAt ?? raw.suspended_at ?? raw.createdAt ?? raw.created_at ?? '',
    reinstatedAt: raw.reinstatedAt ?? raw.reinstated_at ?? null,
  }
}

// GET /admin/providers/suspensions — active suspensions, filterable by provider/trigger.
export async function listProviderSuspensions(params?: {
  providerType?: 'driver' | 'artisan'
  triggerType?: string
  activeOnly?: boolean
  page?: number
  limit?: number
}): Promise<SuspensionListResponse> {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : ''
  const raw = await api.get<any>(`/admin/providers/suspensions${qs}`)
  const list = Array.isArray(raw) ? raw : (raw.items ?? [])
  return {
    items: list.map(normaliseSuspensionItem),
    total: Number(raw.total ?? list.length),
    page: Number(raw.page ?? params?.page ?? 1),
    limit: Number(raw.limit ?? params?.limit ?? 50),
    totalPages: Number(raw.totalPages ?? 1),
  }
}

// GET /admin/providers/:providerId/suspensions — full history for one provider.
export async function getProviderSuspensions(providerId: string): Promise<SuspensionListItem[]> {
  const raw = await api.get<any>(`/admin/providers/${providerId}/suspensions`)
  const list = Array.isArray(raw) ? raw : (raw.items ?? [])
  return list.map(normaliseSuspensionItem)
}

// PATCH /admin/providers/:providerId/suspensions/:suspensionId/lift — reinstates the
// provider: sets reinstatedAt/reinstatedBy, verificationStatus='approved', resets the
// rolling cancellation counter. Requires `lift_verification_suspension`.
export function liftProviderSuspension(providerId: string, suspensionId: string, note?: string) {
  return api.patch(
    `/admin/providers/${providerId}/suspensions/${suspensionId}/lift`,
    note && note.trim() ? { note: note.trim() } : {}
  )
}

// ── Provider request restrictions ─────────────────────────────────────────────

export async function listProviderRequestRestrictions(params?: {
  activeOnly?: boolean
  providerType?: ProviderRequestRestrictionType
  page?: number
  limit?: number
}): Promise<ProviderRequestRestrictionListResponse> {
  const query = new URLSearchParams()
  if (params?.activeOnly != null) query.set('activeOnly', String(params.activeOnly))
  if (params?.providerType) query.set('providerType', params.providerType)
  if (params?.page != null) query.set('page', String(params.page))
  if (params?.limit != null) query.set('limit', String(params.limit))
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  // The backend deliberately retains this route while widening its rows from
  // accepted cancellations to all provider request-block policy kinds.
  const raw = await api.get<unknown>(`/admin/providers/cancellation-restrictions${suffix}`)
  const envelope = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(envelope.data)
      ? envelope.data
      : Array.isArray(envelope.items)
        ? envelope.items
      : Array.isArray(envelope.restrictions)
          ? envelope.restrictions
          : Array.isArray(envelope.blocks)
            ? envelope.blocks
          : []
  const items = list
    .map(normaliseProviderRequestRestriction)
    .filter((item): item is ProviderRequestRestrictionListItem => item !== null)
  const meta = envelope.meta && typeof envelope.meta === 'object' && !Array.isArray(envelope.meta)
    ? envelope.meta as Record<string, unknown>
    : envelope
  return {
    items,
    total: Number(meta.total ?? list.length),
    page: Number(meta.page ?? params?.page ?? 1),
    limit: Number(meta.limit ?? params?.limit ?? 50),
    totalPages: Number(meta.totalPages ?? meta.total_pages ?? 1),
  }
}

export async function liftProviderRequestRestriction(
  providerType: ProviderRequestRestrictionType,
  providerId: string,
  restrictionId: string,
  reason: string
) {
  const trimmedReason = reason.trim()
  if (!trimmedReason) throw new Error('A lift reason is required.')
  const payload = { reason: trimmedReason }
  return api.patch(
    `/admin/providers/${providerType}/${providerId}/cancellation-restrictions/${restrictionId}/lift`,
    payload,
  )
}

// Transitional aliases for pages or extensions compiled against the previous
// cancellation-only naming.
export const listProviderCancellationRestrictions = listProviderRequestRestrictions
export const liftProviderCancellationRestriction = liftProviderRequestRestriction

// ── Driver priority policy ───────────────────────────────────────────────────

const DRIVER_PRIORITY_PATH = '/admin/driver-priority'

export async function getDriverPriorityPolicy(): Promise<DriverPriorityPolicyResponse> {
  const raw = await api.get<unknown>(`${DRIVER_PRIORITY_PATH}/policy`)
  return normaliseDriverPriorityPolicy(raw)
}

export async function updateDriverPriorityPolicy(
  input: DriverPriorityPolicyUpdate,
): Promise<DriverPriorityPolicyResponse> {
  const reason = input.reason.trim()
  if (reason.length < 5) throw new Error('A policy-change reason of at least 5 characters is required.')
  const raw = await api.put<unknown>(`${DRIVER_PRIORITY_PATH}/policy`, {
    ...input,
    reason,
  })
  return normaliseDriverPriorityPolicy(raw)
}

export async function listDriverPriorityDrivers(params: {
  page?: number
  limit?: number
  search?: string
  tier?: DriverPriorityTier | 'none'
  manualOnly?: boolean
} = {}): Promise<DriverPriorityDriverList> {
  const page = params.page ?? 1
  const limit = params.limit ?? 25
  const query = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (params.search?.trim()) query.set('search', params.search.trim())
  if (params.tier) query.set('tier', params.tier)
  if (params.manualOnly != null) query.set('manualOnly', String(params.manualOnly))
  const raw = await api.get<unknown>(`${DRIVER_PRIORITY_PATH}/drivers?${query.toString()}`)
  return normaliseDriverPriorityDriverList(raw, { page, limit })
}

export async function enrollDriverPriority(
  driverId: string,
  input: {
    floorTier: DriverPriorityTier
    reason: string
    reviewAt: string
    expiresAt: string
  },
): Promise<unknown> {
  const reason = input.reason.trim()
  if (reason.length < 5) throw new Error('An enrollment reason of at least 5 characters is required.')
  if (!input.reviewAt) throw new Error('A review date is required.')
  if (!input.expiresAt) throw new Error('An expiry date is required.')
  return api.post(`${DRIVER_PRIORITY_PATH}/drivers/${driverId}/enroll`, {
    floorTier: input.floorTier,
    reason,
    reviewAt: input.reviewAt,
    expiresAt: input.expiresAt,
  })
}

export async function revokeDriverPriority(driverId: string, reason: string): Promise<unknown> {
  const trimmedReason = reason.trim()
  if (trimmedReason.length < 5) throw new Error('A revocation reason of at least 5 characters is required.')
  return api.post(`${DRIVER_PRIORITY_PATH}/drivers/${driverId}/revoke`, {
    reason: trimmedReason,
  })
}

export async function getDriverPriorityHistory(
  driverId: string,
  params: { page?: number; limit?: number } = {},
): Promise<DriverPriorityHistory> {
  const page = params.page ?? 1
  const limit = params.limit ?? 25
  const query = new URLSearchParams({ page: String(page), limit: String(limit) })
  const raw = await api.get<unknown>(
    `${DRIVER_PRIORITY_PATH}/drivers/${driverId}/history?${query.toString()}`,
  )
  return normaliseDriverPriorityHistory(raw, { page, limit })
}

export async function getDriverPriorityMetrics(params: {
  from?: string
  to?: string
} = {}): Promise<DriverPriorityMetrics> {
  const query = new URLSearchParams()
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  const suffix = query.size ? `?${query.toString()}` : ''
  const raw = await api.get<unknown>(`${DRIVER_PRIORITY_PATH}/metrics${suffix}`)
  return normaliseDriverPriorityMetrics(raw)
}

// ReviewClientKycDto: { action: 'approve'|'reject', reason (min 5 on reject) }
export function reviewClientKyc(clientId: string, action: 'approve' | 'reject', reason?: string) {
  return api.patch(`/admin/clients/${clientId}/kyc`, {
    action,
    ...(reason ? { reason } : {}),
  })
}

export interface ClientKycQueueItem {
  clientId: string
  fullName: string
  phone: string
  email: string | null
  ghanaCardImageUrl: string | null
  submittedAt: string | null
}

export async function getClientKycQueue(): Promise<ClientKycQueueItem[]> {
  const raw = await api.get<{ clients: any[]; total?: number } | any[]>('/admin/clients/kyc-queue')
  const arr: any[] = Array.isArray(raw) ? raw : ((raw as any).clients ?? [])
  return arr.map((c: any) => ({
    clientId: c.clientId ?? c.client_id ?? c.id,
    fullName: c.fullName ?? c.full_name ?? '',
    phone: c.phone ?? '',
    email: c.email ?? null,
    ghanaCardImageUrl: c.ghanaCardImageUrl ?? c.ghana_card_image_url ?? null,
    submittedAt: c.submittedAt ?? c.submitted_at ?? c.kycSubmittedAt ?? null,
  }))
}

// PATCH /admin/verifications/documents/:id
// Backend expects { action: 'approve' | 'reject', providerType: 'driver' | 'artisan', reason }.
export function reviewDocument(
  documentId: string,
  providerType: string,
  action: 'approve' | 'reject',
  reason: string
) {
  return api.patch(`/admin/verifications/documents/${documentId}`, {
    action,
    providerType,
    reason,
  })
}

// PATCH /admin/verifications/documents/:id/expiry — backfills the expiry date on a
// provider document. Writes ONLY expiresAt (and updatedBy); never changes the
// document's review status. Requires the `verify_documents` permission (same gate
// as approve/reject). `expiresAt` is an ISO date string (YYYY-MM-DD); a PAST date
// is allowed and intentionally flags the document as already-expired so the
// provider is prompted to re-upload. Only the current version of a confirmed
// document can be patched — a stale/superseded id returns 404 DOCUMENT_NOT_FOUND.
export interface SetDocumentExpiryResult {
  documentId: string
  expiresAt: string // ISO datetime the backend persisted, e.g. "2028-12-31T00:00:00.000Z"
}
export function setDocumentExpiry(
  documentId: string,
  expiresAt: string
): Promise<SetDocumentExpiryResult> {
  return api.patch<SetDocumentExpiryResult>(`/admin/verifications/documents/${documentId}/expiry`, {
    expiresAt,
  })
}

// ── Disputes ──────────────────────────────────────────────────────────────────

export interface Dispute {
  id: string
  type: string
  status: string
  clientName: string | null
  providerName: string | null
  amountPesewas: number | null
  createdAt: string
  description: string | null
}

export async function getDisputes(): Promise<Dispute[]> {
  const rows = await api.get<any[]>('/admin/disputes')
  return rows.map((row) => ({
    id: row.id ?? row.disputeId ?? row.dispute_id,
    type: row.type ?? row.bookingType ?? row.booking_type,
    status: row.status ?? row.disputeStatus ?? row.dispute_status,
    clientName: row.clientName ?? row.client_name ?? null,
    providerName: row.providerName ?? row.provider_name ?? null,
    amountPesewas: row.amountPesewas ?? row.grossAmountPesewas ?? row.gross_amount_pesewas ?? null,
    createdAt: row.createdAt ?? row.created_at,
    description: row.description ?? row.reason ?? null,
  }))
}

// Detail returned by GET /admin/disputes/:id. Most fields are optional because
// the backend payload varies by booking type and whether GPS data was captured.
// See PRD 4.8.1 for the route-excess threshold (30%) and
// docs/admin-frontend-spec-payment-panel.md §4.3.
export interface DisputeDetailGpsPoint {
  lat: number
  lng: number
  /** ISO timestamp; optional. */
  t?: string
}

export interface DisputeDetail {
  id: string
  type: 'ride' | 'job' | string
  status: string
  description: string | null
  amountPesewas: number | null
  createdAt: string

  client: { id?: string; fullName: string | null; phone: string | null } | null
  provider: {
    id?: string
    fullName: string | null
    phone: string | null
    type?: string
  } | null

  booking: {
    id: string
    type: 'ride' | 'job'
    shortRef?: string | null
    pickupAddress?: string | null
    dropoffAddress?: string | null
    farePesewas?: number | null
  } | null

  payment: {
    id: string
    grossPesewas: number
    commissionPesewas: number
    method: string
    status: string
  } | null

  /** Actual GPS trail captured during the trip (red on the map). */
  gpsTrail?: DisputeDetailGpsPoint[] | null
  /** Optimal route returned by Google Maps Directions (blue on the map). */
  optimalRoute?: DisputeDetailGpsPoint[] | null
  /** Excess distance vs optimal, expressed as a percent. PRD 4.8.1 threshold = 30. */
  routeExcessPercent?: number | null

  evidence?: Array<{
    kind: 'photo' | 'note'
    url?: string
    text?: string
  }> | null

  refundDestination?: {
    required: boolean
    verified: boolean
    method: string | null
    accountLast4: string | null
    verifiedAt: string | null
    locked: boolean
  } | null

  refund?: {
    id: string
    status: string
    amountPesewas: number
    failureReason: string | null
    destinationType: string
    destinationMethod: string | null
    destinationAccountLast4: string | null
    processedAt: string | null
  } | null
}

export async function getDisputeDetail(disputeId: string): Promise<DisputeDetail> {
  const raw = await api.get<any>(`/admin/disputes/${disputeId}`)
  const dispute = raw.dispute ?? raw
  const route = raw.routeComparison ?? null
  return {
    id: raw.id ?? dispute.id,
    type: raw.type ?? (dispute.bookingType === 'artisan_job' ? 'job' : dispute.bookingType),
    status: raw.status ?? dispute.status,
    description: raw.description ?? dispute.reason ?? null,
    amountPesewas: raw.amountPesewas ?? dispute.amountFrozenPesewas ?? null,
    createdAt: raw.createdAt ?? dispute.createdAt,
    client: raw.client ?? null,
    provider: raw.provider ?? null,
    booking:
      raw.booking ??
      (dispute.bookingId
        ? {
            id: dispute.bookingId,
            type: dispute.bookingType === 'artisan_job' ? 'job' : 'ride',
          }
        : null),
    payment: raw.payment ?? null,
    gpsTrail: raw.gpsTrail ?? null,
    optimalRoute: raw.optimalRoute ?? null,
    routeExcessPercent: raw.routeExcessPercent ?? route?.excessPercent ?? null,
    evidence:
      raw.evidence ??
      (dispute.evidenceUrls ?? []).map((url: string) => ({
        kind: 'photo' as const,
        url,
      })),
    refundDestination: raw.refundDestination ?? null,
    refund: raw.refund ?? null,
  }
}

// NOTE: the frontend payment-panel spec proposes a richer DTO
// `{ resolution: 'REFUND_FULL'|'REFUND_PARTIAL'|'REJECT', notes? }`. The
// backend currently accepts the legacy `{ decision, reason, refundAmountPesewas? }`
// shape. Until backend ships the new contract, the detail page maps the spec's
// resolution modes onto this signature:
//   REFUND_FULL    → decision='approved', refundAmountPesewas omitted
//   REFUND_PARTIAL → decision='approved', refundAmountPesewas=<amount>
//   REJECT         → decision='denied'
export interface ResolveDisputeResult {
  disputeId: string
  status: string
  refundAmountPesewas: number
  clawbackId: string | null
  clawbackAmountPesewas: number
}

export function resolveDispute(
  disputeId: string,
  decision: 'approved' | 'denied',
  reason: string,
  refundAmountPesewas?: number
) {
  return api.patch<ResolveDisputeResult>(`/admin/disputes/${disputeId}/resolve`, {
    decision,
    reason,
    ...(refundAmountPesewas != null && { refundAmountPesewas }),
  })
}

// ── User Management ───────────────────────────────────────────────────────────

// The currently-active auto/manual suspension sitting on a provider sub-profile
// (driver or artisan), sourced from the `provider_suspensions` table. Lets an
// admin see WHY a provider is suspended before lifting it. All fields are
// nullable because the backend has not shipped this on the user payload yet —
// the UI degrades to "reason unavailable" until it does. See
// docs/backend-requests.md §5.
export interface ProviderSuspension {
  // Why automatic suspension fired. Known: 'cancellation' (3 in 30 days),
  // 'rating' (rating-engine), 'background_check', 'manual' (admin). Free string
  // so new backend triggers render without a frontend change.
  triggerType: string | null
  reason: string | null
  suspendedAt: string | null // ISO
  // Rolling cancellation count captured at suspension time, when triggerType is
  // 'cancellation'. Falls back to the live driver.cancellationCount30d if absent.
  cancellationCount: number | null
}

function normaliseSuspension(raw: any): ProviderSuspension | null {
  const s = raw?.activeSuspension ?? raw?.active_suspension ?? raw?.suspension ?? null
  if (!s) return null
  return {
    triggerType: s.triggerType ?? s.trigger_type ?? s.trigger ?? null,
    reason: s.reason ?? null,
    suspendedAt: s.suspendedAt ?? s.suspended_at ?? s.createdAt ?? s.created_at ?? null,
    cancellationCount: s.cancellationCount ?? s.cancellation_count ?? null,
  }
}

export type RoleAccountRole = ExactRoleAccountRole

interface PlatformUserBase {
  /** Exact public account identity. Never contains the private phone-auth User id. */
  roleAccountId: string
  /** Internal UI alias for list keys only; always identical to roleAccountId. */
  id: string
  fullName: string
  phone: string
  email: string | null
  status: string
  createdAt: string
  // Whether the user finished the full registration/onboarding flow.
  // true = completed, false = still incomplete, null = backend hasn't shipped
  // this field yet (column degrades to "—"). See docs/backend-requests.md §4.
  registrationComplete: boolean | null
  registrationCompletedAt: string | null
}

export interface ClientRoleProfile {
  preferredPaymentMethod: string | null
  kycStatus: 'not_started' | 'pending_review' | 'verified' | 'rejected' | string
  ghanaCardImageUrl: string | null
  ghanaCardVerified: boolean
  kycSubmittedAt: string | null
  kycReviewedAt: string | null
  kycRejectionReason: string | null
}

export interface DriverRoleProfile {
  verificationStatus: string
  verificationStage: VerificationStage | null
  rejectionReason: string | null
  onlineStatus: string
  legalName: string | null
  email: string | null
  displayName: string | null
  profilePhotoUrl: string | null
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleYear: number | null
  vehiclePlate: string | null
  vehicleColor: string | null
  /** Server-computed; absent on older API builds. */
  vehicleDetailsComplete?: boolean
  licenceNumber: string | null
  licenceExpiry: string | null
  serviceRadius: number | null
  payoutPreference: string | null
  payoutMethod: string | null
  payoutLocked: boolean | null
  avgRating: number | null
  ratingCount: number
  completedRidesCount: number
  cancellationCount30d: number
  suspension: ProviderSuspension | null
}

export interface ArtisanRoleProfile {
  verificationStatus: string
  verificationStage: VerificationStage | null
  rejectionReason: string | null
  onlineStatus: string
  legalName: string | null
  email: string | null
  displayName: string | null
  profilePhotoUrl: string | null
  businessName: string | null
  businessAddress: string | null
  businessPhone: string | null
  categories: string[]
  serviceLatitude: number | null
  serviceLongitude: number | null
  serviceRadius: number | null
  shopCapacity: string | null
  maxConcurrentJobs: number | null
  payoutPreference: string | null
  payoutMethod: string | null
  payoutLocked: boolean | null
  avgRating: number | null
  ratingCount: number
  completedJobsCount: number
  cancellationCount30d: number
  suspension: ProviderSuspension | null
}

/** One exact role account and only that role's profile. */
export type PlatformUser = PlatformUserBase &
  (
    | { role: 'client'; profile: ClientRoleProfile }
    | { role: 'driver'; profile: DriverRoleProfile }
    | { role: 'artisan'; profile: ArtisanRoleProfile }
  )

export interface UserListResponse {
  items: PlatformUser[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export async function listUsers(params: {
  role: RoleAccountRole
  status?: string
  search?: string
  page?: number
  limit?: number
  // Driver role only: keep just drivers missing at least one vehicle field.
  // Enforced server-side (added in the API's region-scoped listUsers). Older API
  // builds ignore the unknown param and return all drivers.
  missingVehicleDetails?: boolean
}): Promise<UserListResponse> {
  const qs =
    '?' +
    new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)])
      )
    ).toString()
  const raw = await api.get<any>(`/admin/users${qs}`)
  const items = Array.isArray(raw?.items)
    ? raw.items.map((item: unknown) => normalisePlatformUser(item, params.role))
    : []
  return {
    items,
    total: Number(raw?.total ?? items.length),
    page: Number(raw?.page ?? params.page ?? 1),
    limit: Number(raw?.limit ?? params.limit ?? items.length),
    totalPages: Number(raw?.totalPages ?? 1),
  }
}

function normalisePlatformUser(
  raw: any,
  expectedRole: RoleAccountRole,
  expectedRoleAccountId?: string
): PlatformUser {
  assertExactRoleAccountEnvelope(raw, expectedRole, expectedRoleAccountId)
  const role = raw.role as RoleAccountRole
  const roleAccountId = raw.roleAccountId
  const legalName = raw.legalName ?? raw.legal_name ?? null
  const displayName = raw.displayName ?? raw.display_name ?? null
  const fullName = legalName ?? displayName ?? `Unnamed ${role}`
  const vehicle =
    raw.vehicle ??
    (Array.isArray(raw.vehicles)
      ? (raw.vehicles.find((v: any) => v?.isActive) ?? raw.vehicles[0])
      : null)
  const categories = Array.isArray(raw.serviceCategories)
    ? raw.serviceCategories
        .map((entry: any) => entry?.category?.name)
        .filter((name: unknown): name is string => typeof name === 'string')
    : []
  const common: PlatformUserBase = {
    roleAccountId,
    id: roleAccountId,
    fullName,
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    email: raw.email ?? null,
    status: raw.accountStatus ?? raw.account_status ?? 'pending',
    createdAt: raw.createdAt ?? raw.created_at ?? '',
    registrationComplete: null,
    registrationCompletedAt: null,
  }

  if (role === 'client') {
    return {
      ...common,
      role,
      profile: {
        preferredPaymentMethod: raw.preferredPaymentMethod ?? raw.preferred_payment_method ?? null,
        kycStatus: raw.kycStatus ?? raw.kyc_status ?? 'not_started',
        ghanaCardImageUrl: raw.ghanaCardImageUrl ?? raw.ghana_card_image_url ?? null,
        ghanaCardVerified: Boolean(raw.ghanaCardVerified ?? raw.ghana_card_verified ?? false),
        kycSubmittedAt: raw.kycSubmittedAt ?? raw.kyc_submitted_at ?? null,
        kycReviewedAt: raw.kycReviewedAt ?? raw.kyc_reviewed_at ?? null,
        kycRejectionReason: raw.kycRejectionReason ?? raw.kyc_rejection_reason ?? null,
      },
    }
  }

  if (role === 'driver') {
    return {
      ...common,
      role,
      profile: {
        verificationStatus: raw.verificationStatus ?? raw.verification_status ?? 'unverified',
        verificationStage: (raw.verificationStage ?? raw.verification_stage ?? null) as VerificationStage | null,
        rejectionReason: raw.rejectionReason ?? raw.rejection_reason ?? null,
        onlineStatus: raw.onlineStatus ?? raw.online_status ?? 'offline',
        legalName,
        email: raw.email ?? null,
        displayName,
        profilePhotoUrl: resolveProfilePhoto(raw.profilePhotoUrl ?? raw.profile_photo_url),
        vehicleMake: vehicle?.make ?? null,
        vehicleModel: vehicle?.model ?? null,
        vehicleYear: vehicle?.year ?? null,
        vehiclePlate: vehicle?.plate ?? null,
        vehicleColor: vehicle?.color ?? null,
        vehicleDetailsComplete: raw.vehicleDetailsComplete ?? raw.vehicle_details_complete,
        licenceNumber: raw.licenceNumber ?? raw.licence_number ?? null,
        licenceExpiry: raw.licenceExpiry ?? raw.licence_expiry ?? null,
        serviceRadius: raw.serviceRadiusKm != null ? Number(raw.serviceRadiusKm) : null,
        payoutPreference: raw.payoutPreference ?? raw.payout_preference ?? null,
        payoutMethod: raw.payoutMethod ?? raw.payout_method ?? null,
        payoutLocked:
          typeof (raw.payoutLocked ?? raw.payout_locked) === 'boolean'
            ? (raw.payoutLocked ?? raw.payout_locked)
            : null,
        avgRating: raw.avgRating ?? raw.avg_rating ?? null,
        ratingCount: Number(raw.ratingCount ?? raw.rating_count ?? 0),
        completedRidesCount: Number(raw.completedRidesCount ?? raw.completed_rides_count ?? 0),
        cancellationCount30d: Number(raw.cancellationCount30d ?? raw.cancellation_count_30d ?? 0),
        suspension: normaliseSuspension(raw),
      },
    }
  }

  return {
    ...common,
    role,
    profile: {
      verificationStatus: raw.verificationStatus ?? raw.verification_status ?? 'unverified',
      verificationStage: (raw.verificationStage ?? raw.verification_stage ?? null) as VerificationStage | null,
      rejectionReason: raw.rejectionReason ?? raw.rejection_reason ?? null,
      onlineStatus: raw.onlineStatus ?? raw.online_status ?? 'offline',
      legalName,
      email: raw.email ?? null,
      displayName,
      profilePhotoUrl: resolveProfilePhoto(raw.profilePhotoUrl ?? raw.profile_photo_url),
      businessName: raw.businessName ?? raw.business_name ?? null,
      businessAddress: raw.businessAddress ?? raw.business_address ?? null,
      businessPhone: raw.businessPhone ?? raw.business_phone ?? null,
      categories,
      serviceLatitude: raw.serviceLatitude != null ? Number(raw.serviceLatitude) : null,
      serviceLongitude: raw.serviceLongitude != null ? Number(raw.serviceLongitude) : null,
      serviceRadius: raw.serviceRadiusKm != null ? Number(raw.serviceRadiusKm) : null,
      shopCapacity: raw.shopCapacity ?? raw.shop_capacity ?? null,
      maxConcurrentJobs: raw.maxConcurrentJobs != null ? Number(raw.maxConcurrentJobs) : null,
      payoutPreference: raw.payoutPreference ?? raw.payout_preference ?? null,
      payoutMethod: raw.payoutMethod ?? raw.payout_method ?? null,
      payoutLocked:
        typeof (raw.payoutLocked ?? raw.payout_locked) === 'boolean'
          ? (raw.payoutLocked ?? raw.payout_locked)
          : null,
      avgRating: raw.avgRating ?? raw.avg_rating ?? null,
      ratingCount: Number(raw.ratingCount ?? raw.rating_count ?? 0),
      completedJobsCount: Number(raw.completedJobsCount ?? raw.completed_jobs_count ?? 0),
      cancellationCount30d: Number(raw.cancellationCount30d ?? raw.cancellation_count_30d ?? 0),
      suspension: normaliseSuspension(raw),
    },
  }
}

export async function getUser(role: RoleAccountRole, roleAccountId: string): Promise<PlatformUser> {
  const raw = await api.get<any>(roleAccountPath(role, roleAccountId))
  return normalisePlatformUser(raw, role, roleAccountId)
}

export function suspendUser(role: RoleAccountRole, roleAccountId: string, reason: string) {
  return api.patch(roleAccountPath(role, roleAccountId, 'suspend'), { reason })
}

export function banUser(role: RoleAccountRole, roleAccountId: string, reason: string) {
  return api.patch(roleAccountPath(role, roleAccountId, 'ban'), { reason })
}

// Soft-delete a user. Different from Ban: non-punitive, ops_admin can action,
// covers housekeeping (duplicates, test accounts) + user-requested removal.
// Backend still enforces the no-outstanding-clawbacks check (PRD edge case #51).
// 90-day retention applies — purge happens via nightly cron.
export function deleteUser(role: RoleAccountRole, roleAccountId: string, reason: string) {
  return apiFetch(roleAccountPath(role, roleAccountId), {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  })
}

export function reinstateUser(role: RoleAccountRole, roleAccountId: string, reason?: string) {
  return api.patch(
    roleAccountPath(role, roleAccountId, 'reinstate'),
    reason ? { note: reason } : {}
  )
}

// Revokes this exact role account's sessions on every device. Client, driver,
// and artisan sessions may coexist; sibling-role sessions remain active.
export function forceLogoutUser(role: RoleAccountRole, roleAccountId: string, reason: string) {
  return api.post(roleAccountPath(role, roleAccountId, 'force-logout'), {
    reason,
  })
}

export function updateUser(
  role: RoleAccountRole,
  roleAccountId: string,
  data: { fullName?: string; email?: string; reason?: string }
) {
  return api.patch(roleAccountPath(role, roleAccountId), data)
}

export function unlockPayoutMethod(
  role: Exclude<RoleAccountRole, 'client'>,
  roleAccountId: string,
  reason?: string
) {
  return api.post(
    roleAccountPath(role, roleAccountId, 'unlock-payout-method'),
    reason ? { reason } : {}
  )
}

// ── Provider profile editing ──────────────────────────────────────────────────
// Providers can no longer self-edit their profile on mobile; the dashboard is the
// only place this data is changed. Payout fields (payoutMethod / payoutAccountNumber
// / payoutPreference) are deliberately excluded — those stay on the provider's own
// OTP-gated self-service flow; reset a locked one via unlockPayoutMethod() instead.
// Permission: edit_provider_profile. The API also enforces region/category scope.

// All fields optional — send ONLY what changed so the backend doesn't reject the
// request with NO_UPDATE_FIELDS and unchanged values aren't accidentally overwritten.
export interface EditDriverProfileInput {
  legalName?: string
  email?: string
  displayName?: string
  vehicleMake?: string
  vehicleModel?: string
  vehicleYear?: number // 1990–2100
  vehiclePlate?: string
  vehicleColor?: string
  licenceNumber?: string
  licenceExpiry?: string // ISO date, e.g. "2027-12-31"
  serviceRadiusKm?: number // 1–100
  reason?: string // ≤1000 chars — recorded in the audit log
}

export interface EditArtisanProfileInput {
  legalName?: string
  displayName?: string
  businessName?: string
  email?: string
  businessAddress?: string // ≤500 chars
  businessPhone?: string // ≤32 chars
  shopCapacity?: 'solo' | 'multi'
  maxConcurrentJobs?: number // 1–3
  serviceLatitude?: number // −90…90
  serviceLongitude?: number // −180…180
  serviceRadiusKm?: number // 1–100
  reason?: string // ≤1000 chars
}

// Default-off BR-61 route. When explicitly enabled, uploads one profile image
// and lets the backend attach its own storage result directly to this exact
// role account. The URL is display-only; it is never echoed through a PATCH.
//
// Can't go through the typed `api` helper: that wrapper forces
// Content-Type: application/json and JSON-stringifies the body. For multipart we
// must NOT set Content-Type (the browser adds the boundary), so we call fetch
// directly while reusing the same base URL + bearer token. Permission and scope
// (edit_provider_profile / OUT_OF_SCOPE) are enforced by the backend.
//
// Backend contract: POST /admin/users/:role/:roleAccountId/profile-photo →
// { profilePhotoUrl, providerType, roleAccountId }. The dev proxy forwards the
// raw request body, so binary uploads pass through intact.
export async function uploadProviderPhoto(
  role: Exclude<RoleAccountRole, 'client'>,
  roleAccountId: string,
  file: File
): Promise<string> {
  const body = new FormData()
  body.append('file', file)

  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  // Intentionally no Content-Type — the browser sets the multipart boundary.

  const res = await fetch(`${API_BASE}${roleAccountPath(role, roleAccountId, 'profile-photo')}`, {
    method: 'POST',
    headers,
    body,
  })

  let json: any = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    throw apiErrorFromResponse(res, json)
  }

  // NestJS TransformInterceptor wraps successful bodies in { success, data }.
  const payload = json?.data ?? json
  if (payload?.providerType !== role || payload?.roleAccountId !== roleAccountId) {
    throw new Error('Unsafe photo response: role account did not match the request.')
  }
  if (typeof payload?.profilePhotoUrl !== 'string') {
    throw new Error('Photo upload returned no URL.')
  }
  return payload.profilePhotoUrl
}

// Document types an admin may upload on a provider's behalf. These MUST match
// the backend's canonical VALID_DOCUMENT_TYPES (apps/api/.../request-document-upload.dto.ts)
// exactly — note the British spellings (drivers_licence, roadworthiness_certificate)
// which differ from the display-only keys in DOC_TYPE_LABELS. `expiryRequired`
// mirrors the backend EXPIRY_REQUIRED guard.
export interface UploadableDocType {
  value: string
  label: string
  /** Which provider role this document applies to (null = both). */
  appliesTo: 'driver' | 'artisan' | null
  expiryRequired: boolean
}

// Document types that carry a real-world expiry an admin can backfill on a
// provider's behalf (legacy docs uploaded before expiry capture existed). These
// are the canonical BACKEND document_type values (British spellings) and mirror
// the mobile app's `DocumentType.requiresExpiry` set. NOTE: this is deliberately
// distinct from `UploadableDocType.expiryRequired` above — that gates whether an
// expiry is *required at admin upload time*, whereas this set decides which
// documents show the expiry-backfill control on the review surface.
export const EXPIRY_TRACKED_DOC_TYPES = [
  'drivers_licence',
  'roadworthiness_certificate',
  'vehicle_insurance',
] as const

export function documentTypeTracksExpiry(type: string): boolean {
  return (EXPIRY_TRACKED_DOC_TYPES as readonly string[]).includes(type)
}

export const ADMIN_UPLOADABLE_DOC_TYPES: UploadableDocType[] = [
  {
    value: 'drivers_licence',
    label: "Driver's Licence",
    appliesTo: 'driver',
    expiryRequired: true,
  },
  {
    value: 'vehicle_registration',
    label: 'Vehicle Registration',
    appliesTo: 'driver',
    expiryRequired: false,
  },
  {
    value: 'roadworthiness_certificate',
    label: 'Roadworthiness Certificate',
    appliesTo: 'driver',
    expiryRequired: true,
  },
  {
    value: 'vehicle_insurance',
    label: 'Vehicle Insurance',
    appliesTo: 'driver',
    expiryRequired: true,
  },
  {
    value: 'trade_certificate',
    label: 'Trade Certificate',
    appliesTo: 'artisan',
    expiryRequired: false,
  },
  {
    value: 'business_registration',
    label: 'Business Registration',
    appliesTo: 'artisan',
    expiryRequired: false,
  },
  {
    value: 'portfolio_photo',
    label: 'Portfolio Photo',
    appliesTo: 'artisan',
    expiryRequired: false,
  },
  {
    value: 'ghana_card',
    label: 'Ghana Card',
    appliesTo: null,
    expiryRequired: false,
  },
  {
    value: 'national_id',
    label: 'National ID',
    appliesTo: null,
    expiryRequired: false,
  },
]

export interface UploadProviderDocumentResult {
  documentId: string
  providerType: 'driver' | 'artisan'
  roleAccountId: string
  documentType: string
  version: number
  status: 'pending_review'
}

// Admin (Regional Manager) uploads a replacement document on a provider's
// behalf. Multipart, so we bypass the JSON apiFetch wrapper and build the
// request by hand (mirrors uploadProviderPhoto). `expiresAt` is an ISO date
// string (yyyy-mm-dd) and is required by the backend for expiring document
// types. POST /admin/users/:role/:roleAccountId/documents.
export async function uploadProviderDocument(
  roleAccountId: string,
  input: {
    providerType: 'driver' | 'artisan'
    documentType: string
    file: File
    expiresAt?: string
  }
): Promise<UploadProviderDocumentResult> {
  const body = new FormData()
  body.append('file', input.file)
  body.append('providerType', input.providerType)
  body.append('documentType', input.documentType)
  if (input.expiresAt) body.append('expiresAt', input.expiresAt)

  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  // Intentionally no Content-Type — the browser sets the multipart boundary.

  const res = await fetch(
    `${API_BASE}${roleAccountPath(input.providerType, roleAccountId, 'documents')}`,
    {
      method: 'POST',
      headers,
      body,
    }
  )

  let json: any = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    throw apiErrorFromResponse(res, json)
  }

  const payload = json?.data ?? json
  const exposesPrivateIdentity =
    payload &&
    typeof payload === 'object' &&
    ['userId', 'providerId', 'client', 'driver', 'artisan', 'roles'].some((key) => key in payload)
  if (
    typeof payload?.documentId !== 'string' ||
    !payload.documentId ||
    exposesPrivateIdentity ||
    payload?.providerType !== input.providerType ||
    payload?.roleAccountId !== roleAccountId ||
    payload?.documentType !== input.documentType ||
    payload?.status !== 'pending_review' ||
    !Number.isInteger(payload?.version) ||
    payload.version < 1
  ) {
    throw new Error('Unsafe provider-document response: exact role account mismatch')
  }
  return {
    documentId: payload.documentId,
    providerType: payload.providerType,
    roleAccountId: payload.roleAccountId,
    documentType: payload.documentType,
    version: payload.version,
    status: payload.status,
  }
}

export async function editDriverProfile(
  roleAccountId: string,
  data: EditDriverProfileInput
): Promise<void> {
  await api.patch<unknown>(roleAccountPath('driver', roleAccountId, 'driver-profile'), data)
}

export async function editArtisanProfile(
  roleAccountId: string,
  data: EditArtisanProfileInput
): Promise<void> {
  await api.patch<unknown>(roleAccountPath('artisan', roleAccountId, 'artisan-profile'), data)
}

export interface UserProviderDocument {
  id: string
  documentType: string
  label: string // human-readable, derived client-side
  fileUrl: string
  mimeType: string | null
  status:
    | 'uploaded'
    | 'pending_review'
    | 'confirmed'
    | 'coordinator_validated'
    | 'approved'
    | 'rejected'
  rejectionReason: string | null
  expiresAt: string | null
  version: number
  isCurrent: boolean
  createdAt: string
}

export interface RoleAccountDocuments {
  role: 'driver' | 'artisan'
  roleAccountId: string
  documents: UserProviderDocument[]
}

function parseDoc(d: any): UserProviderDocument {
  const mimeType = d.mimeType ?? d.mime_type ?? null
  const rawFileUrl = d.fileUrl ?? d.file_url ?? ''
  return {
    id: d.id,
    documentType: d.documentType ?? d.document_type ?? '',
    label:
      DOC_TYPE_LABELS[d.documentType ?? d.document_type ?? ''] ??
      (d.documentType ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    fileUrl: resolvedAdminDocumentUrl(rawFileUrl),
    mimeType,
    status: d.status ?? 'uploaded',
    rejectionReason: d.rejectionReason ?? d.rejection_reason ?? null,
    expiresAt: d.expiresAt ?? d.expires_at ?? null,
    version: Number(d.version ?? 1),
    isCurrent: Boolean(d.isCurrent ?? d.is_current ?? true),
    createdAt: d.createdAt ?? d.created_at ?? '',
  }
}

export async function getProviderDocuments(
  role: Exclude<RoleAccountRole, 'client'>,
  roleAccountId: string
): Promise<RoleAccountDocuments> {
  const raw = await api.get<any>(roleAccountPath(role, roleAccountId, 'documents'))
  assertExactRoleAccountEnvelope(raw, role, roleAccountId)
  return {
    role,
    roleAccountId,
    documents: Array.isArray(raw.documents) ? raw.documents.map(parseDoc) : [],
  }
}

// ── Audit Logs ────────────────────────────────────────────────────────────────

export interface AuditLogAdmin {
  id: string
  fullName: string
  email: string
  // Legacy field — the backend no longer assigns admins a single role. Kept
  // optional for backward compatibility with old audit entries.
  role?: string
}

export interface AuditLogEntry {
  id: string
  action: string
  targetType: string
  targetId: string
  details: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
  admin: AuditLogAdmin
}

export interface AuditLogResponse {
  items: AuditLogEntry[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface AuditLogParams {
  page?: number
  limit?: number
  adminId?: string
  action?: string
  targetType?: string
  from?: string
  to?: string
}

export async function getAuditLogs(params?: AuditLogParams): Promise<AuditLogResponse> {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : ''
  return api.get<AuditLogResponse>(`/admin/audit-logs${qs}`)
}

// ── Comprehensive System Audit (exact Super Administrator only) ─────────────

export interface SystemAuditEvent {
  id: string
  occurredAt: string
  recordedAt: string
  actorType: string
  actorId: string | null
  actorRole: string | null
  actorLabel: string | null
  category: string
  action: string
  outcome: string
  severity: string
  targetType: string | null
  targetId: string | null
  source: string
  environment: string
  requestReference: string | null
  correlationId: string | null
  ipAddressMasked: string | null
  appVersion: string | null
  metadata: Record<string, unknown> | null
  eventHash: string
  retentionUntil: string
  legalHold: boolean
  actorAttribution?: 'authenticated' | 'unauthenticated_request' | 'integration' | 'runtime' | 'database' | 'deployment'
  actorDisplayLabel?: string
  origin?: {
    source: string
    environment: string
    route: string | null
    method: string | null
    requestReference: string | null
    correlationId: string | null
  }
  diagnostic?: {
    status: number | null
    errorCode: string | null
    durationMs: number | null
  }
  reportedClient?: {
    app: 'client' | 'provider' | null
    platform: 'android' | 'ios' | null
    build: number | null
    version: string | null
  }
}

export interface SystemAuditPage {
  data: SystemAuditEvent[]
  nextCursor: string | null
  timeZone: 'GMT'
  timestampPrecision: 'milliseconds'
}

export interface SystemTelemetryEvent {
  id: string
  occurredAt: string
  recordedAt: string
  deviceOccurredAt: string | null
  actorType: string
  actorId: string | null
  actorRole: string | null
  category: string
  action: string
  outcome: string
  source: string
  environment: string
  correlationId: string | null
  appVersion: string | null
  metadata: Record<string, unknown> | null
  expiresAt: string
  reportedClient?: {
    app: 'client' | 'provider' | null
    platform: 'android' | 'ios' | null
    build: number | null
    version: string | null
  }
}

export interface SystemTelemetryPage {
  data: SystemTelemetryEvent[]
  nextCursor: string | null
  timeZone: 'GMT'
  timestampPrecision: 'milliseconds'
  retentionDays: 90
  deliverySemantics?: 'best_effort_at_least_once'
  countingUnit?: 'event_rows'
}

export interface SystemAuditSummary {
  total: number
  telemetryTotal: number | null
  failures: number
  critical: number
  openAlerts: number
  categories: Array<{ category: string; _count: { _all: number } }>
  windowFrom?: string
  windowTo?: string
  timeZone: 'GMT'
  scope?: 'filtered'
  filtersApplied?: string[]
  openAlertsScope?: 'global'
  telemetryFilterScope?: 'filtered' | 'not_comparable_audit_only_filters'
  telemetryUnsupportedFilters?: string[]
  telemetryDeliverySemantics?: 'best_effort_at_least_once'
  telemetryCountingUnit?: 'event_rows'
}

export interface SystemAuditAlert {
  id: string
  type: string
  severity: string
  title: string
  summary: string
  eventId: string | null
  acknowledgedAt: string | null
  createdAt: string
}

export interface SystemAuditFilters {
  category?: string
  action?: string
  actorType?: string
  actorRole?: string
  actorId?: string
  targetType?: string
  targetId?: string
  outcome?: string
  severity?: string
  source?: string
  environment?: string
  correlationId?: string
  requestReference?: string
  from?: string
  to?: string
  search?: string
  cursor?: string
  limit?: number
}

function queryString(values: object): string {
  const params = new URLSearchParams()
  Object.entries(values as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  })
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function getSystemAuditEvents(filters: SystemAuditFilters = {}): Promise<SystemAuditPage> {
  return api.get<SystemAuditPage>(`/system-audit/events${queryString(filters)}`)
}

export function getSystemTelemetryEvents(filters: SystemAuditFilters = {}): Promise<SystemTelemetryPage> {
  return api.get<SystemTelemetryPage>(`/system-audit/telemetry${queryString(filters)}`)
}

export function getSystemAuditSummary(filters: SystemAuditFilters = {}): Promise<SystemAuditSummary> {
  return api.get<SystemAuditSummary>(`/system-audit/summary${queryString(filters)}`)
}

export function getSystemAuditAlerts(openOnly = true): Promise<SystemAuditAlert[]> {
  return api.get<SystemAuditAlert[]>(`/system-audit/alerts?openOnly=${openOnly}`)
}

export function acknowledgeSystemAuditAlert(id: string): Promise<{ acknowledged: true }> {
  return api.patch<{ acknowledged: true }>(`/system-audit/alerts/${id}/acknowledge`, {})
}

export function setSystemAuditLegalHold(id: string, enabled: boolean): Promise<{ legalHold: boolean }> {
  return api.patch<{ legalHold: boolean }>(`/system-audit/events/${id}/legal-hold`, { enabled })
}

export function verifySystemAuditIntegrity(): Promise<{ checked: number; invalid: number; valid: boolean; verifiedAt: string }> {
  return api.post('/system-audit/integrity/verify', {})
}

export function systemAuditExportUrl(filters: SystemAuditFilters, format: 'csv' | 'json'): string {
  return `${API_BASE}/system-audit/export${queryString({ ...filters, format })}`
}

// ── Admin Account Management ──────────────────────────────────────────────────

export interface Region {
  id: string
  name: string
  code: string
}

export interface AdminAccount {
  id: string
  email: string
  fullName: string
  role: Role | null
  permissions: Permission[]
  regionId: string | null
  categoryScope: CategoryScope | null
  region: Region | null
  regionScope: string | null
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

// GET /admin/regions — active operational regions for the account picker.
export function listRegions() {
  return api.get<Region[]>('/admin/regions')
}

export function listAdmins() {
  return api.get<AdminAccount[]>('/admin/admins')
}

export function getAdmin(adminId: string) {
  return api.get<AdminAccount>(`/admin/admins/${adminId}`)
}

// Role-first create. Supply `role` (+ `regionId` for region-scoped roles); the
// backend derives permissions + category scope. `permissions` is an optional
// advanced override.
export function createAdmin(data: {
  email: string
  fullName: string
  password: string
  role?: Role
  regionId?: string
  permissions?: Permission[]
}) {
  return api.post<AdminAccount>('/admin/admins', data)
}

// Update an admin's role/scope (re-derives permissions) or replace permissions
// directly. Backend rejects editing your own permissions and removing
// manage_admins from the last holder.
export function updateAdminPermissions(
  adminId: string,
  data: { role?: Role; regionId?: string; permissions?: Permission[] }
) {
  return api.patch<AdminAccount>(`/admin/admins/${adminId}/permissions`, data)
}

export function deactivateAdmin(adminId: string) {
  return api.patch<AdminAccount>(`/admin/admins/${adminId}/deactivate`, {})
}

export function reactivateAdmin(adminId: string) {
  return api.patch<AdminAccount>(`/admin/admins/${adminId}/reactivate`, {})
}

export function resetAdminPassword(adminId: string, newPassword: string) {
  return api.patch(`/admin/admins/${adminId}/reset-password`, { newPassword })
}

// An admin changes their OWN password (verifies the current one server-side).
export function changeOwnPassword(currentPassword: string, newPassword: string) {
  return api.patch('/admin/me/password', { currentPassword, newPassword })
}

export function deleteAdmin(adminId: string) {
  return api.delete(`/admin/admins/${adminId}`)
}

// ── Announcements ─────────────────────────────────────────────────────────────

export async function previewAnnouncement(draft: AnnouncementDraft) {
  const raw = await api.post<unknown>('/admin/announcements/preview', draft)
  return normaliseAnnouncementPreview(raw, draft)
}

export function publishAnnouncement(
  draft: AnnouncementDraft,
  previewToken: string,
  idempotencyKey: string,
) {
  return api.post<AnnouncementPublishResult>(
    '/admin/announcements/publish',
    { ...draft, previewToken },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  )
}

// ── Analytics chart endpoints ─────────────────────────────────────────────────

export interface RideStatusBreakdown {
  completed: number
  cancelled: number
  disputed: number
  inProgress: number
}
export async function getRideStatusReport(params?: {
  from?: string
  to?: string
}): Promise<RideStatusBreakdown> {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
  const raw = await api.get<any>(`/admin/reports/rides/status${qs}`)
  return {
    completed: raw?.completed ?? 0,
    cancelled: raw?.cancelled ?? 0,
    disputed: raw?.disputed ?? 0,
    inProgress: raw?.inProgress ?? raw?.in_progress ?? 0,
  }
}

export interface JobCategoryCount {
  category: string
  jobs: number
}
export async function getJobCategoryReport(params?: {
  from?: string
  to?: string
}): Promise<JobCategoryCount[]> {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
  const raw = await api.get<any>(`/admin/reports/jobs/categories${qs}`)
  const list: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.categories)
      ? raw.categories
      : Array.isArray(raw?.items)
        ? raw.items
        : []
  return list.map((d) => ({
    category: d.category ?? d.name ?? '',
    jobs: d.jobs ?? d.count ?? d.total ?? 0,
  }))
}

export interface PaymentMethodShare {
  name: string
  percent: number
}
export interface DailyPaymentRate {
  date: string
  successRate: number
  failureRate: number
}
export interface PaymentReport {
  methods: PaymentMethodShare[]
  dailyRates: DailyPaymentRate[]
}
export async function getPaymentReport(params?: {
  from?: string
  to?: string
}): Promise<PaymentReport> {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
  const raw = await api.get<any>(`/admin/reports/payments${qs}`)
  const methods: any[] = Array.isArray(raw?.methods) ? raw.methods : []
  const dailyRates: any[] = Array.isArray(raw?.dailyRates)
    ? raw.dailyRates
    : Array.isArray(raw?.daily_rates)
      ? raw.daily_rates
      : []
  return {
    methods: methods.map((m) => ({
      name: m.name ?? m.method ?? '',
      percent: m.percent ?? m.share ?? m.percentage ?? 0,
    })),
    dailyRates: dailyRates.map((d) => ({
      date: d.date ?? '',
      successRate: d.successRate ?? d.success_rate ?? 0,
      failureRate: d.failureRate ?? d.failure_rate ?? 0,
    })),
  }
}

export interface DisputeRatePoint {
  date: string
  rate: number
}
export async function getDisputeRateReport(params?: {
  from?: string
  to?: string
}): Promise<DisputeRatePoint[]> {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
  const raw = await api.get<any>(`/admin/reports/disputes/rate${qs}`)
  const list: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.points)
      ? raw.points
      : Array.isArray(raw?.items)
        ? raw.items
        : []
  return list.map((d) => ({
    date: d.date ?? '',
    rate: d.rate ?? d.dispute_rate ?? d.disputeRate ?? 0,
  }))
}

// ── Admin Notifications ───────────────────────────────────────────────────────

export type AdminNotificationType =
  | 'emergency'
  | 'verification'
  | 'dispute'
  | 'flagged'
  | 'payout_failed'
  | 'welfare_check'
  | 'system'

export interface AdminNotification {
  id: string
  type: AdminNotificationType
  title: string
  body: string
  readAt: string | null
  createdAt: string
  linkPath: string | null
}

export function getAdminNotifications() {
  return api.get<AdminNotification[]>('/admin/notifications')
}

export function markAdminNotificationRead(notificationId: string) {
  return api.patch(`/admin/notifications/${notificationId}/read`, {})
}

export function markAllAdminNotificationsRead() {
  return api.patch('/admin/notifications/read-all', {})
}

// ── Recent Activity ───────────────────────────────────────────────────────────

export type ActivityEventType =
  | 'ride_completed'
  | 'ride_cancelled'
  | 'ride_disputed'
  | 'job_completed'
  | 'job_disputed'
  | 'escrow_released'
  | 'sos_triggered'
  | 'kyc_submitted'
  | 'dispute_resolved'
  | 'emergency'
  | 'dispute'
  | 'verification'
  | 'ride'
  | 'job'
  | 'payout'

export interface ActivityItem {
  id: string
  eventType: ActivityEventType
  actorName: string | null
  actorRole: 'client' | 'driver' | 'artisan' | 'system'
  secondaryActorName: string | null
  description: string
  amountPesewas: number | null
  bookingId: string | null
  bookingType: 'ride' | 'job' | null
  occurredAt: string
}

export async function getRecentActivity(
  options: number | { limit?: number; from?: string; to?: string } = 10,
): Promise<ActivityItem[]> {
  const params = typeof options === 'number' ? { limit: options } : options
  const query = new URLSearchParams()
  query.set('limit', String(params.limit ?? 10))
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  const raw = await api.get<any>(`/admin/activity?${query}`)
  const arr: any[] = Array.isArray(raw) ? raw : (raw?.items ?? [])
  return arr
    .filter((r: any) => r?.id)
    .map(
      (r: any): ActivityItem => ({
        id: r.id,
        eventType: r.eventType ?? r.event_type ?? r.type ?? 'unknown',
        actorName:
          r.actorName ?? r.actor_name ?? r.userName ?? r.user_name ?? r.actor?.name ?? null,
        actorRole: r.actorRole ?? r.actor_role ?? r.role ?? 'system',
        secondaryActorName: r.secondaryActorName ?? r.secondary_actor_name ?? null,
        description: r.summary ?? r.description ?? '',
        amountPesewas: r.amountPesewas ?? r.amount_pesewas ?? null,
        bookingId:
          r.bookingId ?? r.booking_id ?? r.rideId ?? r.ride_id ?? r.jobId ?? r.job_id ?? null,
        bookingType: r.bookingType ?? r.booking_type ?? null,
        occurredAt: r.occurredAt ?? r.occurred_at ?? r.createdAt ?? '',
      })
    )
}

// ── Categories ────────────────────────────────────────────────────────────────

export interface Category {
  id: string
  parentId: string | null
  name: string
  slug: string
  iconUrl: string | null
  // Material icon identifier (snake_case) rendered by the mobile client.
  // E.g. 'handyman', 'laptop_mac', 'kitchen'. Backend validates against
  // /^[a-z0-9]+(?:_[a-z0-9]+)*$/.
  iconName: string | null
  minBidPesewas: number
  highBidFlagPesewas: number
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  children?: Category[]
}

export function getCategories() {
  return api.get<Category[]>('/admin/categories')
}

export function createCategory(data: {
  name: string
  slug: string
  minBidPesewas: number
  highBidFlagPesewas?: number
  parentId?: string
  iconName?: string
  iconUrl?: string
  sortOrder?: number
}) {
  return api.post<Category>('/admin/categories', {
    name: data.name,
    slug: data.slug,
    minBidPesewas: data.minBidPesewas,
    ...(data.highBidFlagPesewas != null && {
      highBidFlagPesewas: data.highBidFlagPesewas,
    }),
    ...(data.parentId && { parentId: data.parentId }),
    ...(data.iconName && { iconName: data.iconName }),
    ...(data.iconUrl && { iconUrl: data.iconUrl }),
    ...(data.sortOrder != null && { sortOrder: data.sortOrder }),
  })
}

export function updateCategory(
  categoryId: string,
  data: Partial<{
    name: string
    slug: string
    isActive: boolean
    minBidPesewas: number
    highBidFlagPesewas: number
    // Backend UpdateCategoryDto does NOT accept parentId — categories can't be
    // moved between parents after creation.
    iconName: string
    iconUrl: string
    sortOrder: number
  }>
) {
  return api.patch<Category>(`/admin/categories/${categoryId}`, data)
}

// Conflict body shape returned by DELETE /admin/categories/:id on 409.
// Frontend reads this to surface usage counts in the confirmation dialog.
export interface CategoryDeleteConflict {
  code: 'CATEGORY_IN_USE' | 'CATEGORY_HAS_JOBS'
  artisansCount: number
  jobsCount: number
  subcategoryCount: number
}

// Hard-delete a service category.
//   - Default: backend refuses (409 CATEGORY_IN_USE) if any artisans or
//     subcategories reference it; refuses (409 CATEGORY_HAS_JOBS) if any
//     historical jobs do — that one is not bypassable.
//   - force=true: super_admin can override the artisans/subcategories check.
//     Subcategories cascade-delete (recursively, with the same job-block rule).
//     Historical jobs still block regardless of force.
//
// Reason is audit-logged.
export function deleteCategory(categoryId: string, opts: { reason: string; force?: boolean }) {
  const qs = opts.force ? '?force=true' : ''
  return apiFetch<{ deleted: true }>(`/admin/categories/${categoryId}${qs}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason: opts.reason }),
  })
}

// ── Ride Categories (tiers) ─────────────────────────────────────────────────────
// Tiered rides: each tier (seeded Regular + Comfort) carries its own fare rates.
// All rates are integer PESEWAS on the wire (GHS 26.00 = 2600) — never floats.
// See docs/ride-categories-admin-integration.md. Endpoints:
//   GET   /admin/ride-categories             (perm view_ride_categories) — incl. inactive
//   POST  /admin/ride-categories             (perm edit_ride_categories)
//   PATCH /admin/ride-categories/:id         (perm edit_ride_categories) — edit / (de)activate
// There is no DELETE — tiers are deactivated, never hard-deleted.

export interface RideCategory {
  id: string
  name: string
  slug: string
  description: string | null
  baseFarePesewas: number
  perKmPesewas: number
  perMinPesewas: number
  minimumFarePesewas: number
  capacityPersons: number
  iconUrl: string | null
  isActive: boolean
  sortOrder: number
}

// Defensive normaliser — accepts camelCase or snake_case so the page renders
// regardless of the exact backend serialisation.
function normaliseRideCategory(raw: any): RideCategory {
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    slug: raw.slug ?? '',
    description: raw.description ?? null,
    baseFarePesewas: Number(raw.baseFarePesewas ?? raw.base_fare_pesewas ?? 0),
    perKmPesewas: Number(raw.perKmPesewas ?? raw.per_km_pesewas ?? 0),
    perMinPesewas: Number(raw.perMinPesewas ?? raw.per_min_pesewas ?? 0),
    minimumFarePesewas: Number(raw.minimumFarePesewas ?? raw.minimum_fare_pesewas ?? 0),
    capacityPersons: Number(raw.capacityPersons ?? raw.capacity_persons ?? 4),
    iconUrl: raw.iconUrl ?? raw.icon_url ?? null,
    isActive: Boolean(raw.isActive ?? raw.is_active ?? false),
    sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0),
  }
}

// GET /admin/ride-categories — all tiers, including inactive, ordered by sortOrder.
// The api-client unwrap() already peels the { success, data } envelope; we also
// tolerate a bare array in case the interceptor shape differs (see §3 of the spec).
export async function getRideCategories(): Promise<RideCategory[]> {
  const raw = await api.get<any>('/admin/ride-categories')
  const list: any[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.items ?? [])
  return list.map(normaliseRideCategory).sort((a, b) => a.sortOrder - b.sortOrder)
}

export interface RideCategoryInput {
  name: string
  slug: string
  baseFarePesewas: number
  perKmPesewas: number
  perMinPesewas: number
  minimumFarePesewas: number
  description?: string
  capacityPersons?: number
  iconUrl?: string
  sortOrder?: number
}

// POST /admin/ride-categories — create a tier.
// Errors: 409 SLUG_ALREADY_EXISTS, 400 INVALID_SLUG, 400 INVALID_RATE_<field>.
export async function createRideCategory(data: RideCategoryInput): Promise<RideCategory> {
  const raw = await api.post<any>('/admin/ride-categories', {
    name: data.name,
    slug: data.slug,
    baseFarePesewas: data.baseFarePesewas,
    perKmPesewas: data.perKmPesewas,
    perMinPesewas: data.perMinPesewas,
    minimumFarePesewas: data.minimumFarePesewas,
    ...(data.description != null && { description: data.description }),
    ...(data.capacityPersons != null && {
      capacityPersons: data.capacityPersons,
    }),
    ...(data.iconUrl && { iconUrl: data.iconUrl }),
    ...(data.sortOrder != null && { sortOrder: data.sortOrder }),
  })
  return normaliseRideCategory(raw?.data ?? raw)
}

// PATCH /admin/ride-categories/:id — update / activate / deactivate (any subset).
// Deactivate = { isActive: false }; Reactivate = { isActive: true }.
// Errors: 404 RIDE_CATEGORY_NOT_FOUND, 409 SLUG_ALREADY_EXISTS, 400 INVALID_SLUG / INVALID_RATE_*.
export async function updateRideCategory(
  id: string,
  data: Partial<RideCategoryInput & { isActive: boolean }>
): Promise<RideCategory> {
  const raw = await api.patch<any>(`/admin/ride-categories/${id}`, data)
  return normaliseRideCategory(raw?.data ?? raw)
}

// ── Distance fare safeguard policy ───────────────────────────────────────────
// Exact-Super-Admin-only backend workflow. The UI deliberately never exposes
// the underlying writer-version implementation: it manages immutable policy
// revisions through save draft -> server preview -> activate/deactivate.

const DISTANCE_SAFEGUARD_PATH = '/admin/ride-fare-policy/distance-safeguard'

export async function getDistanceSafeguardState(): Promise<DistanceSafeguardState> {
  return normaliseDistanceSafeguardState(await api.get<unknown>(DISTANCE_SAFEGUARD_PATH))
}

export async function saveDistanceSafeguardDraft(
  input: SaveDistanceSafeguardDraftInput,
): Promise<DistanceSafeguardState> {
  const raw = await api.put<unknown>(`${DISTANCE_SAFEGUARD_PATH}/draft`, {
    expectedRevision: input.expectedRevision,
    includedDistanceMeters: input.includedDistanceMeters,
    categoryFloors: input.categoryFloors.map((floor: DistanceSafeguardFloorInput) => ({
      rideCategoryId: floor.rideCategoryId,
      mode: floor.mode,
      customFloorPesewas: floor.customFloorPesewas,
    })),
    reason: input.reason.trim(),
  })
  return normaliseDistanceSafeguardState(raw)
}

export async function previewDistanceSafeguardDraft(
  expectedRevision: number,
): Promise<DistanceSafeguardPreview> {
  const raw = await api.post<unknown>(`${DISTANCE_SAFEGUARD_PATH}/preview`, {
    expectedRevision,
  })
  return normaliseDistanceSafeguardPreview(raw)
}

export async function activateDistanceSafeguard(input: {
  expectedRevision: number
  previewToken: string
  reason: string
}): Promise<DistanceSafeguardState> {
  const raw = await api.post<unknown>(`${DISTANCE_SAFEGUARD_PATH}/activate`, {
    expectedRevision: input.expectedRevision,
    previewToken: input.previewToken,
    reason: input.reason.trim(),
  })
  return normaliseDistanceSafeguardState(raw)
}

export async function deactivateDistanceSafeguard(input: {
  expectedRevision: number
  reason: string
}): Promise<DistanceSafeguardState> {
  const raw = await api.post<unknown>(`${DISTANCE_SAFEGUARD_PATH}/deactivate`, {
    expectedRevision: input.expectedRevision,
    reason: input.reason.trim(),
  })
  return normaliseDistanceSafeguardState(raw)
}

// ── Ride toll policy ─────────────────────────────────────────────────────────
// Exact-Super-Admin-only complete-revision workflow. Publishing is always
// bound to a server preview token; there is deliberately no direct enable or
// disable endpoint.

const RIDE_TOLL_POLICY_PATH = '/admin/ride-toll-policy'

export async function getRideTollPolicyState(): Promise<RideTollPolicyState> {
  return normaliseRideTollPolicyState(await api.get<unknown>(RIDE_TOLL_POLICY_PATH))
}

export async function saveRideTollPolicyDraft(
  input: SaveRideTollPolicyDraftInput,
): Promise<RideTollPolicyState> {
  const raw = await api.put<unknown>(`${RIDE_TOLL_POLICY_PATH}/draft`, {
    expectedRevision: input.expectedRevision,
    enabled: input.enabled,
    effectiveFrom: input.effectiveFrom,
    reason: input.reason.trim(),
    zones: input.zones.map((zone) => ({
      stableKey: zone.stableKey,
      label: zone.label.trim(),
      amountPesewas: zone.amountPesewas,
      applicationMode: zone.applicationMode,
      boundary: zone.boundary,
    })),
  })
  return normaliseRideTollPolicyState(raw)
}

export async function previewRideTollPolicyDraft(
  expectedRevision: number,
): Promise<RideTollPolicyPreview> {
  const raw = await api.post<unknown>(`${RIDE_TOLL_POLICY_PATH}/preview`, {
    expectedRevision,
  })
  return normaliseRideTollPolicyPreview(raw)
}

export async function publishRideTollPolicy(input: {
  expectedRevision: number
  previewToken: string
  reason: string
}): Promise<RideTollPolicyState> {
  const raw = await api.post<unknown>(`${RIDE_TOLL_POLICY_PATH}/publish`, {
    expectedRevision: input.expectedRevision,
    previewToken: input.previewToken,
    reason: input.reason.trim(),
  })
  return normaliseRideTollPolicyState(raw)
}

// ── Driver tier verification ──────────────────────────────────────────────────
// Per-driver, per-tier approve/reject. Matching is mutually exclusive: a driver
// only receives a tier's requests once an admin approves them for it.
//   GET   /admin/drivers/:driverId/ride-categories                  (perm view_verifications)
//   PATCH /admin/drivers/:driverId/ride-categories/:rideCategoryId  (perm review_verification)

export type DriverRideCategoryStatus = 'pending' | 'approved' | 'rejected'

export interface DriverRideCategory {
  // Row id of the driver↔tier link (null when the driver has no row yet).
  id: string | null
  status: DriverRideCategoryStatus
  rejectionReason: string | null
  reviewedAt: string | null
  rideCategory: {
    id: string
    name: string
    slug: string
    isActive: boolean
  }
}

function normaliseDriverRideCategory(raw: any): DriverRideCategory {
  const rc = raw.rideCategory ?? raw.ride_category ?? {}
  return {
    id: raw.id != null ? String(raw.id) : null,
    status: (raw.status ?? 'pending') as DriverRideCategoryStatus,
    rejectionReason: raw.rejectionReason ?? raw.rejection_reason ?? null,
    reviewedAt: raw.reviewedAt ?? raw.reviewed_at ?? null,
    rideCategory: {
      id: String(rc.id ?? ''),
      name: rc.name ?? '',
      slug: rc.slug ?? '',
      isActive: Boolean(rc.isActive ?? rc.is_active ?? true),
    },
  }
}

// GET /admin/drivers/:driverId/ride-categories — a driver's per-tier statuses.
// Only includes tiers the driver requested (or an admin granted). Error: 404 PROVIDER_NOT_FOUND.
export async function getDriverRideCategories(driverId: string): Promise<DriverRideCategory[]> {
  const raw = await api.get<any>(`/admin/drivers/${driverId}/ride-categories`)
  const list: any[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.items ?? [])
  return list.map(normaliseDriverRideCategory)
}

// Bare response (no envelope): { driverId, rideCategoryId, status }.
export interface DriverRideCategoryReviewResult {
  driverId: string
  rideCategoryId: string
  status: DriverRideCategoryStatus
}

// PATCH /admin/drivers/:driverId/ride-categories/:rideCategoryId — approve/reject.
// Approving makes the driver matchable for that tier immediately. Rejecting
// requires a reason (≥5 chars). Upserts: an admin can grant a tier the driver
// never requested. Errors: 404 PROVIDER_NOT_FOUND, 404 RIDE_CATEGORY_NOT_FOUND, 400 REASON_REQUIRED.
export async function reviewDriverRideCategory(
  driverId: string,
  rideCategoryId: string,
  action: 'approve' | 'reject',
  reason?: string
): Promise<DriverRideCategoryReviewResult> {
  const raw = await api.patch<any>(`/admin/drivers/${driverId}/ride-categories/${rideCategoryId}`, {
    action,
    ...(action === 'reject' && reason ? { reason } : {}),
  })
  const body = raw?.data ?? raw
  return {
    driverId: body?.driverId ?? body?.driver_id ?? driverId,
    rideCategoryId: body?.rideCategoryId ?? body?.ride_category_id ?? rideCategoryId,
    status: (body?.status ??
      (action === 'approve' ? 'approved' : 'rejected')) as DriverRideCategoryStatus,
  }
}

// ── Platform Config ───────────────────────────────────────────────────────────

export interface PlatformConfig {
  key: string
  value: string
}

export function getAllConfig() {
  return api.get<PlatformConfig[]>('/config')
}

export function updateConfig(key: string, value: string) {
  return api.patch(`/config/${key}`, { value })
}

// ── Artisan Jobs (manual assignment) ─────────────────────────────────────────

export interface UnassignedJob {
  id: string
  status: string
  description: string
  addressText: string | null
  createdAt: string
  scheduledFor: string | null
  categoryId: string
  categoryName: string
  minBidPesewas: number
  clientName: string | null
  clientPhone: string | null
  bidCount: number
  hoursInQueue: number
  adminLock: { lockedBy: string; expiresAt: string } | null
  // Job pin coordinates. See docs/backend-spec-nearby-artisan-search.md §2.1.
  // Null when the job has no recorded location (legacy/USSD-pinless).
  lat: number | null
  lng: number | null
}

export async function getUnassignedJobs(): Promise<{
  total: number
  jobs: UnassignedJob[]
}> {
  const raw = await api.get<any>('/admin/jobs/unassigned')
  const arr: any[] = Array.isArray(raw) ? raw : (raw?.jobs ?? [])
  return {
    total: raw?.total ?? arr.length,
    jobs: arr.map((j) => ({
      id: j.id,
      status: j.status ?? 'queued',
      description: j.description ?? '',
      addressText: j.addressText ?? j.address_text ?? null,
      createdAt: j.createdAt ?? j.created_at ?? '',
      scheduledFor: j.scheduledFor ?? j.scheduled_for ?? null,
      categoryId: j.categoryId ?? j.category?.id ?? '',
      categoryName: j.categoryName ?? j.category?.name ?? '—',
      minBidPesewas: j.minBidPesewas ?? j.category?.minBidPesewas ?? 0,
      clientName: j.clientName ?? null,
      clientPhone: j.clientPhone ?? null,
      bidCount: j.bidCount ?? j._count?.bids ?? 0,
      hoursInQueue: j.hoursInQueue ?? 0,
      adminLock: j.adminLock ?? null,
      lat: j.lat != null ? Number(j.lat) : (j.location?.lat ?? null),
      lng: j.lng != null ? Number(j.lng) : (j.location?.lng ?? null),
    })),
  }
}

export interface ArtisanSearchResult {
  id: string
  fullName: string
  phone: string | null
  displayName: string | null
  onlineStatus: string | null
  rating: number | null
  completedJobsCount: number
  verificationStatus: string
  categories: { id: string; name: string }[]
  // Last-known coordinates (online or stale). Null if the artisan has never
  // broadcast a location. See docs/backend-spec-nearby-artisan-search.md §2.2.
  lat: number | null
  lng: number | null
  lastLocationAt: string | null
  // Set only when the search is called with `lat`+`lng`; the backend computes
  // it server-side via PostGIS. Frontend may also fill it in via the Option C
  // live-map fallback (see lib/distance.ts).
  distanceKm: number | null
}

export async function searchArtisans(params: {
  categoryId?: string
  q?: string
  limit?: number
  lat?: number
  lng?: number
  maxKm?: number
  sort?: 'nearest' | 'name'
}): Promise<ArtisanSearchResult[]> {
  const qs = new URLSearchParams()
  if (params.categoryId) qs.set('categoryId', params.categoryId)
  if (params.q) qs.set('q', params.q)
  if (params.limit) qs.set('limit', String(params.limit))
  if (params.lat != null && params.lng != null) {
    qs.set('lat', String(params.lat))
    qs.set('lng', String(params.lng))
  }
  if (params.maxKm != null) qs.set('maxKm', String(params.maxKm))
  if (params.sort) qs.set('sort', params.sort)
  const raw = await api.get<any[]>(`/admin/artisans/search?${qs}`)
  if (!Array.isArray(raw)) return []
  return raw.map((a) => ({
    id: a.id,
    fullName: a.fullName,
    phone: a.phone ?? null,
    displayName: a.displayName ?? null,
    onlineStatus: a.onlineStatus ?? null,
    rating: a.rating != null ? Number(a.rating) : null,
    completedJobsCount: a.completedJobsCount ?? 0,
    verificationStatus: a.verificationStatus,
    categories: a.categories ?? [],
    lat: a.lat != null ? Number(a.lat) : null,
    lng: a.lng != null ? Number(a.lng) : null,
    lastLocationAt: a.lastLocationAt ?? a.last_location_at ?? null,
    distanceKm: a.distanceKm != null ? Number(a.distanceKm) : null,
  }))
}

// ── High Bid Review ───────────────────────────────────────────────────────────

export interface FlaggedBid {
  id: string
  jobId: string
  artisanId: string
  artisanName: string
  clientName: string
  categoryName: string
  amountPesewas: number
  flagThresholdPesewas: number
  submittedAt: string
  status: 'admin_review'
}

export async function getHighBidQueue(): Promise<FlaggedBid[]> {
  const raw = await api.get<any>('/admin/bids/flagged')
  const arr: any[] = Array.isArray(raw) ? raw : ((raw as any)?.items ?? [])
  return arr.map((b) => ({
    id: b.id,
    jobId: b.jobId ?? b.job_id ?? '',
    artisanId: b.artisanId ?? b.artisan_id ?? '',
    artisanName: b.artisanName ?? b.artisan_name ?? b.artisan?.fullName ?? '—',
    clientName: b.clientName ?? b.client_name ?? b.job?.clientName ?? '—',
    categoryName: b.categoryName ?? b.category_name ?? b.job?.categoryName ?? '—',
    amountPesewas: b.amountPesewas ?? b.amount_pesewas ?? 0,
    flagThresholdPesewas:
      b.flagThresholdPesewas ?? b.flag_threshold_pesewas ?? b.highBidFlagPesewas ?? 500000,
    submittedAt: b.submittedAt ?? b.submitted_at ?? b.createdAt ?? '',
    status: 'admin_review' as const,
  }))
}

export function reviewHighBid(bidId: string, decision: 'approved' | 'rejected', reason: string) {
  return api.patch(`/admin/bids/${bidId}/review`, { decision, reason })
}

export function unexpireBid(bidId: string) {
  return api.patch(`/admin/bids/${bidId}/unexpire`, {})
}

// ── Rides (admin listing) ─────────────────────────────────────────────────────

export async function listRides(params?: {
  status?: string
  search?: string
  page?: number
  limit?: number
  from?: string
  to?: string
  /**
   * Which timestamp `from`/`to` filter on. `created` (the backend default) is
   * the booking date; `completed` is when the ride finished — the date it
   * settled and, for cash, incurred its clawback. Use `completed` alongside
   * `status=completed` so the result lines up with a date-filtered
   * Payments → Money Owed view instead of silently dropping rides booked
   * before midnight and finished after it.
   */
  dateBasis?: 'created' | 'completed'
}): Promise<NormalisedAdminRideListResponse> {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : ''
  const raw = await api.get<unknown>(`/admin/rides${qs}`)
  return normaliseAdminRideListResponse(raw)
}

export interface RideDetail {
  id: string
  status: string
  pickupAddress: string | null
  dropoffAddress: string | null
  estimatedFarePesewas: number | null
  finalFarePesewas: number | null
  pricing: RidePricingSummary | null
  paymentStatus: string
  paymentMethod: string | null
  amountPaidPesewas: number | null
  paidAt: string | null
  surgeMultiplier: string | number
  distanceKm: string | number | null
  durationMins: string | number | null
  cancellationReason: string | null
  cancelledBy: string | null
  cancelledAt: string | null
  acceptedAt: string | null
  driverEnRouteAt: string | null
  arrivedAtPickupAt: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  stops: { stopOrder: number; addressText: string | null }[]
  gpsTrail: RideGpsPoint[]
  /** Point count / distance / pickup & dropoff coordinates when the backend returns them. */
  gpsTrailMeta: RideGpsTrailMeta
  client: { id: string; fullName: string; phone: string } | null
  driver: {
    id: string
    fullName: string
    phone: string
    vehicleMake: string | null
    vehicleModel: string | null
    vehiclePlate: string | null
    vehicleColor: string | null
  } | null
}

export type { RideGpsPoint, RideGpsTrailMeta } from './ride-gps-trail-contract'

export async function getRideDetail(rideId: string): Promise<RideDetail> {
  const raw = await api.get<any>(`/admin/rides/${rideId}`)
  // Trail parsing (array of points or GeoJSON LineString) lives in
  // lib/ride-gps-trail-contract.ts so it is unit-tested.
  const gpsTrail = normaliseRideGpsTrail(
    raw?.gpsTrail ?? raw?.gps_trail ?? raw?.routeHistory ?? raw?.route_history ?? [],
  )
  return {
    ...raw,
    pricing: normaliseRidePricing(raw?.pricing),
    stops: Array.isArray(raw?.stops) ? raw.stops : [],
    gpsTrail,
    gpsTrailMeta: normaliseRideGpsTrailMeta(raw, gpsTrail),
  }
}

export function cancelRide(rideId: string, reason: string) {
  return api.patch(`/admin/rides/${rideId}/cancel`, { reason })
}

export function forceCompleteRide(rideId: string, reason: string) {
  return api.patch(`/admin/rides/${rideId}/force-complete`, { reason })
}

export function cancelJob(jobId: string, reason: string) {
  return api.patch(`/admin/jobs/${jobId}/cancel`, { reason })
}

// Soft-delete a job. Backend only allows this in terminal or pre-acceptance
// states (queued, pending_admin, completed, cancelled, expired). Active or
// in-progress jobs return 400 JOB_NOT_DELETABLE; use force-complete or cancel
// first. Reason is passed as a query param per the backend signature.
export function deleteJob(jobId: string, reason: string) {
  return api.delete(`/admin/jobs/${jobId}?reason=${encodeURIComponent(reason)}`)
}

// ── Artisan Jobs (admin listing) ──────────────────────────────────────────────

export interface AdminJob {
  id: string
  clientName: string | null
  artisanName: string | null
  categoryName: string | null
  status: string
  agreedPricePesewas: number | null
  supplementPesewas: number | null
  paymentStatus: string | null
  paymentMethod: string | null
  amountPaidPesewas: number | null
  paidAt: string | null
  createdAt: string
  lastActivityAt: string | null
  staleHours: number
  region: string | null
  bidCount?: number
  scheduledFor?: string | null
  bidWindowEndsAt?: string | null
}

export interface AdminJobListResponse {
  items: AdminJob[]
  total: number
  page: number
  limit?: number
  totalPages: number
}

export async function listArtisanJobs(params?: {
  status?: string
  search?: string
  page?: number
  limit?: number
  region?: string
  from?: string
  to?: string
}): Promise<AdminJobListResponse> {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : ''
  const raw = await api.get<any>(`/admin/jobs${qs}`)
  return {
    total: raw.total ?? 0,
    page: raw.page ?? 1,
    totalPages: raw.totalPages ?? 1,
    items: (raw.items ?? []).map(
      (j: any): AdminJob => ({
        id: j.id,
        clientName: j.clientName ?? null,
        artisanName: j.artisanName ?? null,
        categoryName: j.categoryName ?? null,
        status: j.status,
        agreedPricePesewas: j.agreedPricePesewas ?? null,
        supplementPesewas: j.supplementPesewas ?? null,
        paymentStatus: j.paymentStatus ?? j.payment_status ?? j.paymentState ?? null,
        paymentMethod: j.paymentMethod ?? j.payment_method ?? null,
        amountPaidPesewas: j.amountPaidPesewas ?? j.amount_paid_pesewas ?? null,
        paidAt: j.paidAt ?? j.paid_at ?? null,
        createdAt: j.createdAt,
        lastActivityAt: j.lastActivityAt ?? null,
        staleHours: j.hoursInactive ?? j.staleHours ?? 0,
        region: j.region ?? j.locationRegion ?? null,
        bidCount: j.bidCount ?? 0,
        scheduledFor: j.scheduledFor ?? null,
        bidWindowEndsAt: j.bidWindowEndsAt ?? null,
      })
    ),
  }
}

// ── Job Detail ────────────────────────────────────────────────────────────────

export interface JobBid {
  id: string
  amountPesewas: number
  message: string | null
  status: string
  expiresAt: string
  createdAt: string
  artisanId: string
  artisanName: string | null
  artisanPhone: string | null
}

export interface JobDetail {
  id: string
  status: string
  description: string
  addressText: string | null
  photos: string[]
  agreedPricePesewas: number | null
  originalBidPesewas: number | null
  paymentStatus: string | null
  paymentMethod: string | null
  amountPaidPesewas: number | null
  paidAt: string | null
  scheduledFor: string | null
  createdAt: string
  confirmedAt: string | null
  artisanEnRouteAt: string | null
  arrivedAt: string | null
  startedAt: string | null
  artisanMarkedCompleteAt: string | null
  clientConfirmedCompleteAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  lastActivityAt: string
  hoursInactive: number
  assignedByAdmin: string | null
  assignedAt: string | null
  category: {
    id: string
    name: string
    minBidPesewas: number
    highBidFlagPesewas: number
  }
  client: { id: string; name: string | null; phone: string | null }
  artisan: {
    id: string
    name: string | null
    phone: string | null
    verificationStatus: string
  } | null
  bids: JobBid[]
  supplementRequest: {
    id: string
    additionalAmountPesewas: number
    reason: string
    status: string
    respondedAt: string | null
    createdAt: string
  } | null
  adminLock: { lockedBy: string; expiresAt: string } | null
}

export async function getJobDetail(jobId: string): Promise<JobDetail> {
  const raw = await api.get<any>(`/admin/jobs/${jobId}`)
  return {
    ...raw,
    photos: raw.photos ?? [],
    paymentStatus: raw.paymentStatus ?? raw.payment_status ?? null,
    paymentMethod: raw.paymentMethod ?? raw.payment_method ?? null,
    amountPaidPesewas: raw.amountPaidPesewas ?? raw.amount_paid_pesewas ?? null,
    paidAt: raw.paidAt ?? raw.paid_at ?? null,
    client: {
      id: raw.client?.id ?? '',
      name: raw.client?.fullName ?? raw.client?.displayName ?? null,
      phone: raw.client?.phone ?? null,
    },
    artisan: raw.artisan
      ? {
          id: raw.artisan.id,
          name: raw.artisan.fullName ?? raw.artisan.displayName ?? null,
          phone: raw.artisan.phone ?? null,
          verificationStatus: raw.artisan.verificationStatus ?? 'unknown',
        }
      : null,
    bids: (raw.bids ?? []).map(
      (b: any): JobBid => ({
        id: b.id,
        amountPesewas: b.amountPesewas,
        message: b.message ?? null,
        status: b.status,
        expiresAt: b.expiresAt,
        createdAt: b.createdAt,
        artisanId: b.artisan?.id ?? '',
        artisanName: b.artisan?.fullName ?? null,
        artisanPhone: b.artisan?.phone ?? null,
      })
    ),
  }
}

export function lockJob(jobId: string) {
  return api.post<{ locked: boolean; expiresAt: string }>(`/admin/jobs/${jobId}/lock`, {})
}

export function assignJob(
  jobId: string,
  data: {
    artisanId: string
    mode?: 'confirm' | 'request_quote'
    agreedPricePesewas?: number
  }
) {
  return api.post<{
    assigned: boolean
    mode: 'confirm' | 'request_quote'
    status: 'admin_assigned' | 'confirmed'
    artisanId: string
    agreedPricePesewas: number | null
    assignedAt: string
    assignment?: {
      attemptId: string
      revision: number
      phase: 'awaiting_quote' | 'awaiting_admin_review' | 'awaiting_client_accept'
      quoteDeadlineAt: string | null
      acceptDeadlineAt: string | null
    }
  }>(`/admin/jobs/${jobId}/assign`, data)
}

export function forceCompleteJob(jobId: string, reason: string) {
  return api.patch<{ forced: boolean }>(`/admin/jobs/${jobId}/force-complete`, {
    reason,
  })
}

// ── Emergency ─────────────────────────────────────────────────────────────────

export type EmergencyType = 'sos' | 'welfare_check'

export type WelfareCheckStatus = 'pending' | 'escalated' | 'responded' | 'resolved'

export interface WelfareCheckInfo {
  notificationSentAt: string
  responseReceivedAt: string | null
  adminAlertedAt: string | null
  isResolved: boolean
  status: WelfareCheckStatus
}

export interface EmergencyAlert {
  id: string
  type: EmergencyType
  actorName: string | null
  actorRole: 'client' | 'driver' | 'artisan'
  bookingId: string | null
  bookingType: 'ride' | 'job' | null
  locationDescription: string | null
  lat: number | null
  lng: number | null
  recordingUrl: string | null
  acknowledgedAt: string | null
  occurredAt: string
  // Present on welfare_check rows only; null for sos. Schema added when backend
  // unioned welfare_checks into /admin/emergency.
  welfareCheck: WelfareCheckInfo | null
}

export function getEmergencyAlerts(params?: { from?: string; to?: string }) {
  const query = new URLSearchParams()
  if (params?.from) query.set('from', params.from)
  if (params?.to) query.set('to', params.to)
  return api.get<EmergencyAlert[]>(`/admin/emergency${query.size ? `?${query}` : ''}`)
}

// SOS-only — acknowledges an emergency_event row.
export function acknowledgeEmergency(emergencyId: string) {
  return api.patch(`/admin/emergency/${emergencyId}/acknowledge`)
}

export type WelfareContactMethod = 'phone' | 'in_person' | 'auto'

// Welfare-check resolution. Admin confirms the artisan is okay and records how
// they verified. Note ≥10 chars (audit-logged).
export function resolveWelfareCheck(
  welfareCheckId: string,
  body: { note: string; contactMethod: WelfareContactMethod }
) {
  return api.patch<{ id: string; isResolved: true; resolvedAt: string }>(
    `/admin/welfare-checks/${welfareCheckId}/resolve`,
    body
  )
}

// ── Transactions ─────────────────────────────────────────────────────────────

export type TransactionType = 'collection' | 'payout' | 'refund' | 'clawback' | 'tip' | 'remittance'

export interface AdminTransaction {
  id: string
  type: TransactionType
  amountPesewas: number
  method: string
  status: string
  bookingId: string | null
  bookingType: 'ride' | 'job' | null
  party: string | null
  createdAt: string
}

export interface TransactionListResponse {
  items: AdminTransaction[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// `from`/`to` deliberately omitted: the backend currently rejects unknown query
// params via class-validator's `forbidNonWhitelisted`. Re-add them here once
// the backend DTO accepts ISO date filters — see
// docs/backend-spec-payment-panel.md.
export function listTransactions(params?: {
  type?: string
  status?: string
  search?: string
  page?: number
  limit?: number
  from?: string
  to?: string
}) {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : ''
  return api.get<TransactionListResponse>(`/admin/payments/transactions${qs}`)
}

// ── Webhook reconciliation failures ─────────────────────────────────────────

export interface WebhookFailure {
  id: string
  eventType: string
  status: 'dead_letter'
  attemptCount: number
  lastErrorCode: string | null
  receivedAt: string
  adminAlertedAt: string | null
  adminAlertAttempts: number
  adminAlertLastAttemptAt: string | null
  adminAlertLastError: string | null
}

export interface WebhookFailureListResponse {
  items: WebhookFailure[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export function listWebhookFailures(params?: { page?: number; limit?: number }) {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : ''
  return api.get<WebhookFailureListResponse>(`/admin/payments/webhook-failures${qs}`)
}

// ── Batch Payouts ─────────────────────────────────────────────────────────────

export interface BatchPayoutRetry {
  time: string
  status: string
}

export interface BatchPayoutRun {
  id: string
  date: string
  primaryRun: string
  status: string
  providerCount: number
  totalPesewas: number
  failureReason: string | null
  retries: BatchPayoutRetry[]
}

export interface BatchPayoutListResponse {
  items: BatchPayoutRun[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export async function listBatchPayouts(params?: { page?: number; limit?: number }) {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : ''
  const raw = await api.get<any>(`/admin/payouts/batches${qs}`)
  const items: BatchPayoutRun[] = (raw?.items ?? []).map(
    (b: any): BatchPayoutRun => ({
      id: b.id,
      date: b.date ?? b.runDate ?? b.run_date ?? '',
      primaryRun: b.primaryRun ?? b.primary_run ?? '',
      status: b.status ?? 'pending',
      providerCount: b.providerCount ?? b.provider_count ?? 0,
      totalPesewas: b.totalPesewas ?? b.total_pesewas ?? 0,
      failureReason: b.failureReason ?? b.failure_reason ?? null,
      retries: (b.retries ?? []).map(
        (r: any): BatchPayoutRetry => ({
          time: r.time ?? r.at ?? '',
          status: r.status ?? '',
        })
      ),
    })
  )
  return {
    items,
    total: raw?.total ?? items.length,
    page: raw?.page ?? 1,
    limit: raw?.limit ?? items.length,
    totalPages: raw?.totalPages ?? 1,
  }
}

export function forceBatchPayoutRun() {
  return api.post('/admin/payouts/batches/force', {})
}

// ── Clawbacks ─────────────────────────────────────────────────────────────────

export interface AdminClawback {
  id: string
  providerName: string | null
  providerId: string
  providerType: string | null
  providerPhone: string | null
  source: string | null
  amountPesewas: number
  paidAmountPesewas: number
  outstandingPesewas: number
  originalDisputeId: string | null
  linkedPaymentId: string | null
  reason: string | null
  initiatedAt: string
  settledAt: string | null
  daysOutstanding: number
  status: string
}

export interface ClawbackListResponse {
  items: AdminClawback[]
  total: number
  totalOutstandingPesewas: number
}

/**
 * The only two values the backend ever writes to `clawbacks.source`:
 * `CASH_COMMISSION` (a cash ride or job settled and the provider owes the
 * platform its commission) and `DISPUTE_REFUND` (a refund clawed back from the
 * provider). Write-off and escalation are *statuses*, not sources.
 *
 * `GET /admin/clawbacks` returns every source when `source` is omitted, so the
 * page does not need to fan out per source — that only ever risked missing a
 * value the enum here got wrong.
 */
export const CLAWBACK_SOURCES = ['CASH_COMMISSION', 'DISPUTE_REFUND'] as const
export type ClawbackSource = (typeof CLAWBACK_SOURCES)[number]

export interface ClawbackQuery {
  /** Inclusive Ghana calendar dates (YYYY-MM-DD); filter `created_at`. */
  from?: string
  to?: string
  source?: ClawbackSource
  status?: string
  providerId?: string
  page?: number
  limit?: number
}

export async function listClawbacks(params?: ClawbackQuery): Promise<ClawbackListResponse> {
  const entries = Object.entries(params ?? {})
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => [key, String(value)] as [string, string])
  const qs = entries.length ? '?' + new URLSearchParams(entries).toString() : ''
  const raw = await api.get<any>(`/admin/clawbacks${qs}`)
  const items: AdminClawback[] = (raw?.items ?? []).map(
    (c: any): AdminClawback => ({
      id: c.id,
      providerName: c.providerName ?? c.provider_name ?? null,
      providerId: c.providerId ?? c.provider_id ?? '',
      providerType: c.providerType ?? c.provider_type ?? null,
      providerPhone: c.providerPhone ?? c.provider_phone ?? null,
      source: c.source ?? null,
      amountPesewas: c.amountPesewas ?? c.amount_pesewas ?? 0,
      paidAmountPesewas: c.paidAmountPesewas ?? c.paid_amount_pesewas ?? 0,
      outstandingPesewas: c.outstandingPesewas ?? c.outstanding_pesewas ?? 0,
      // Two backend docs name this field differently — accept either shape.
      originalDisputeId:
        c.originalDisputeId ?? c.original_dispute_id ?? c.linkedDisputeId ?? c.linked_dispute_id ?? null,
      linkedPaymentId: c.linkedPaymentId ?? c.linked_payment_id ?? null,
      reason: c.reason ?? c.writeOffReason ?? c.write_off_reason ?? null,
      initiatedAt: c.initiatedAt ?? c.initiated_at ?? c.createdAt ?? c.created_at ?? '',
      settledAt: c.settledAt ?? c.settled_at ?? c.writtenOffAt ?? c.written_off_at ?? null,
      daysOutstanding: c.daysOutstanding ?? c.days_outstanding ?? 0,
      status: c.status ?? 'outstanding',
    })
  )
  const summary = raw?.summary ?? raw
  return {
    items,
    total: raw?.total ?? items.length,
    totalOutstandingPesewas:
      summary?.totalOutstandingPesewas ?? summary?.total_outstanding_pesewas ?? 0,
  }
}

const CLAWBACK_PAGE_LIMIT = 100
const CLAWBACK_MAX_PAGES = 25

export interface AllClawbacksResult {
  items: AdminClawback[]
  totalOutstandingPesewas: number
  /** True when the page cap was reached before the backend ran out of records. */
  truncated: boolean
  /** False when the backend rejected the query params and returned an unfiltered list. */
  serverFiltered: boolean
}

/**
 * Loads every debt incurred in the given date range, walking pages until the
 * backend runs out, so the clawbacks page never silently shows a truncated
 * slice. The date window is applied server-side (`created_at`), which is the
 * same timestamp `GET /admin/rides?dateBasis=completed` filters on — so "debts
 * recorded today" and "rides completed today" describe the same day.
 *
 * Records are deduplicated by id, which keeps the walk correct even if the
 * backend ignores `page` and re-serves the same rows.
 */
export async function listAllClawbacks(range?: { from?: string; to?: string }): Promise<AllClawbacksResult> {
  const byId = new Map<string, AdminClawback>()
  let truncated = false
  // The backend scopes this to the same window, so it is the authoritative
  // figure for the range rather than a sum over whatever pages we managed to
  // fetch. Falls back to the walked sum if an older API omits it.
  let reportedOutstanding: number | null = null

  const collect = async (query: ClawbackQuery) => {
    for (let page = 1; page <= CLAWBACK_MAX_PAGES; page++) {
      const response = await listClawbacks({ ...query, page, limit: CLAWBACK_PAGE_LIMIT })
      if (page === 1 && response.totalOutstandingPesewas) {
        reportedOutstanding = response.totalOutstandingPesewas
      }
      const before = byId.size
      for (const item of response.items) byId.set(item.id, item)
      // A short page means the ledger is exhausted; no new ids means the backend
      // is ignoring `page` and re-serving the same rows.
      if (response.items.length < CLAWBACK_PAGE_LIMIT || byId.size === before) return
      if (page === CLAWBACK_MAX_PAGES) truncated = true
    }
  }

  try {
    // One walk over every source. Asking per source used to be the way to reach
    // dispute debts, but it also meant a single unrecognised source value made
    // the whole request 400 (the API rejects unknown query params outright) and
    // silently drop the panel back to an unfiltered first page.
    await collect({ ...range })
  } catch (err) {
    // Params rejected by an API that predates the date filter (see
    // docs/backend-requests.md §2). Fall back to the plain list; the page still
    // applies the date range itself.
    if (!(err instanceof ApiError) || err.status !== 400) throw err
    const fallback = await listClawbacks()
    return {
      items: fallback.items,
      totalOutstandingPesewas:
        fallback.totalOutstandingPesewas ||
        fallback.items.reduce((sum, item) => sum + item.outstandingPesewas, 0),
      truncated: fallback.total > fallback.items.length,
      serverFiltered: false,
    }
  }

  const items = [...byId.values()]
  return {
    items,
    totalOutstandingPesewas:
      reportedOutstanding ?? items.reduce((sum, item) => sum + item.outstandingPesewas, 0),
    truncated,
    serverFiltered: true,
  }
}

export function writeOffClawback(clawbackId: string, reason: string) {
  return api.patch(`/admin/clawbacks/${clawbackId}/write-off`, { reason })
}

export function escalateClawback(clawbackId: string) {
  return api.patch(`/admin/clawbacks/${clawbackId}/escalate`, {})
}

// ── USSD ──────────────────────────────────────────────────────────────────────

export interface UssdStats {
  totalRegistrations: number
  activeSessions: number
  bookingsToday: number
  bookingsMonth: number
  completionRate: number
  topCategories: string[]
}

export function getUssdStats() {
  return api.get<UssdStats>('/admin/ussd/stats')
}

export interface UssdSession {
  id: string
  phone: string
  timestamp: string
  flow: string
  outcome: 'completed' | 'timeout' | 'error'
  zone: string
}

export interface UssdSessionListResponse {
  items: UssdSession[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export function listUssdSessions(params?: { page?: number; limit?: number }) {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : ''
  return api.get<UssdSessionListResponse>(`/admin/ussd/sessions${qs}`)
}

export interface UssdZone {
  id: string
  name: string
  isActive: boolean
  bookingsThisMonth: number
}

export function listUssdZones() {
  return api.get<UssdZone[]>('/admin/ussd/zones')
}

export function toggleUssdZone(zoneId: string, isActive: boolean) {
  return api.patch(`/admin/ussd/zones/${zoneId}`, { isActive })
}

// ── SMS History ───────────────────────────────────────────────────────────────

export interface SmsHistoryItem {
  id: string
  body: string
  audience: string
  sentAt: string
  delivered: number
  failed: number
}

export function getSmsHistory() {
  return api.get<SmsHistoryItem[]>('/admin/sms/history')
}

// ── SMS Send (Next.js local route → Arkesel) ─────────────────────────────────

export type SmsAudience = 'all_users' | 'clients' | 'drivers' | 'artisans'

export interface SmsResult {
  success: boolean
  total: number
  sent: number
  failed: number
  reason?: string // present when failed > 0 — stable app-owned failure copy
}

export function sendSms(audience: SmsAudience, message: string) {
  return api.post<SmsResult>('/api/sms', { audience, message }, { localRoute: true })
}

export function sendDirectSms(recipient: string, message: string) {
  return api.post<SmsResult>('/api/sms', { recipient, message }, { localRoute: true })
}

// ── Announcement History ──────────────────────────────────────────────────────

export async function getAnnouncementHistory() {
  const raw = await api.get<unknown>('/admin/announcements/history')
  return normaliseAnnouncementHistory(raw)
}

// ── Help Center (CMS) ─────────────────────────────────────────────────────────

export type HelpAudience = 'client' | 'provider' | 'both'

export interface HelpCategory {
  id: string
  slug: string
  title: string
  description: string | null
  iconName: string | null
  audience: HelpAudience
  sortOrder: number
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

export interface HelpArticleSummary {
  id: string
  slug: string
  title: string
  summary: string | null
  categoryId: string
  categorySlug: string
  audience: HelpAudience
  sortOrder: number
  isPublished: boolean
  updatedAt: string
}

export interface HelpArticle extends HelpArticleSummary {
  bodyMarkdown: string
  createdAt: string
}

export function getHelpCategories() {
  return api.get<HelpCategory[]>('/admin/support/help/categories')
}

export function getHelpArticles(params?: { categorySlug?: string; audience?: HelpAudience }) {
  const qs = new URLSearchParams()
  if (params?.categorySlug) qs.set('categorySlug', params.categorySlug)
  if (params?.audience) qs.set('audience', params.audience)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return api.get<HelpArticleSummary[]>(`/admin/support/help/articles${suffix}`)
}

export function getHelpArticle(slug: string) {
  return api.get<HelpArticle>(`/admin/support/help/articles/${encodeURIComponent(slug)}`)
}

export interface CreateHelpArticleInput {
  slug: string
  title: string
  summary?: string
  bodyMarkdown: string
  categoryId: string
  audience?: HelpAudience
  sortOrder?: number
  isPublished?: boolean
}

export function createHelpArticle(data: CreateHelpArticleInput) {
  return api.post<HelpArticle>('/admin/support/help/articles', data)
}

export type UpdateHelpArticleInput = Partial<Omit<CreateHelpArticleInput, 'slug'>>

export function updateHelpArticle(articleId: string, data: UpdateHelpArticleInput) {
  return api.patch<HelpArticle>(`/admin/support/help/articles/${articleId}`, data)
}

export function deleteHelpArticle(articleId: string) {
  return api.delete<{ ok: true }>(`/admin/support/help/articles/${articleId}`)
}

// ── Session Recovery Requests ─────────────────────────────────────────────────
// Backend: GET/POST /admin/session-recovery-requests* and exact role-account force logout.
// Source of truth: apps/api/src/modules/admin/admin.controller.ts (myshop monorepo).

export type SessionRecoveryStatus = 'pending' | 'resolving' | 'resolved' | 'expired'
export type SessionRole = 'client' | 'driver' | 'artisan'
export type SessionRecoveryAction = 'revoked' | 'dismissed'

export interface SessionRecoveryRequest {
  id: string
  /** Exact public role-account id; null until the backend can resolve it safely. */
  roleAccountId: string | null
  /** Role requested by the recovery record; never inferred from another field. */
  role: SessionRole | null
  fullName: string | null
  phone: string
  requestingDeviceId: string | null
  requestingIp: string | null
  currentSessionDeviceId: string | null
  currentSessionDeviceInfo: string | null
  currentSessionLoggedInAt: string | null
  status: SessionRecoveryStatus
  resolvedAt: string | null
  resolvedByAdminId: string | null
  resolvedAction: SessionRecoveryAction | null
  resolutionReason: string | null
  resolutionOperationId: string | null
  resolutionStartedAt: string | null
  resolutionAttemptCount: number
  resolutionLastAttemptAt: string | null
  resolutionNextAttemptAt: string | null
  resolutionLastErrorCode: string | null
  createdAt: string
  actionable: boolean
}

export interface SessionRecoveryRequestDetail extends SessionRecoveryRequest {
  identity: {
    ghanaCardImageUrl: string | null
    ghanaCardVerified: boolean
    registeredAt: string
    vehicle: {
      make: string | null
      model: string | null
      plate: string | null
      color: string | null
    } | null
    completedRidesCount: number | null
    categories: string[] | null
    completedJobsCount: number | null
    verificationStatus: string | null
  } | null
}

export interface SessionRecoveryListResponse {
  total: number
  page: number
  limit: number
  totalPages: number
  items: SessionRecoveryRequest[]
}

export function listSessionRecoveryRequests(params?: {
  status?: SessionRecoveryStatus
  page?: number
  limit?: number
  search?: string
}) {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v != null && v !== '')
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : ''
  return api.get<any>(`/admin/session-recovery-requests${qs}`).then((raw) => ({
    total: Number(raw?.total ?? 0),
    page: Number(raw?.page ?? 1),
    limit: Number(raw?.limit ?? 50),
    totalPages: Number(raw?.totalPages ?? 1),
    items: (Array.isArray(raw?.items) ? raw.items : []).map(normaliseSessionRecoveryRequest),
  }))
}

function normaliseSessionRecoveryRequest(raw: any): SessionRecoveryRequest {
  const role = raw?.role
  const status = raw?.status
  return {
    id: String(raw?.id ?? ''),
    roleAccountId: typeof raw?.roleAccountId === 'string' ? raw.roleAccountId : null,
    role: role === 'client' || role === 'driver' || role === 'artisan' ? role : null,
    fullName: typeof raw?.fullName === 'string' ? raw.fullName : null,
    phone: typeof raw?.phone === 'string' ? raw.phone : '',
    requestingDeviceId: typeof raw?.requestingDeviceId === 'string' ? raw.requestingDeviceId : null,
    requestingIp: raw?.requestingIp ?? null,
    currentSessionDeviceId: raw?.currentSessionDeviceId ?? null,
    currentSessionDeviceInfo: raw?.currentSessionDeviceInfo ?? null,
    currentSessionLoggedInAt: raw?.currentSessionLoggedInAt ?? null,
    status:
      status === 'pending' ||
      status === 'resolving' ||
      status === 'resolved' ||
      status === 'expired'
        ? status
        : 'pending',
    resolvedAt: raw?.resolvedAt ?? null,
    resolvedByAdminId: raw?.resolvedByAdminId ?? null,
    resolvedAction: raw?.resolvedAction ?? null,
    resolutionReason: raw?.resolutionReason ?? null,
    resolutionOperationId:
      typeof raw?.resolutionOperationId === 'string' ? raw.resolutionOperationId : null,
    resolutionStartedAt: raw?.resolutionStartedAt ?? null,
    resolutionAttemptCount: Number(raw?.resolutionAttemptCount ?? 0),
    resolutionLastAttemptAt: raw?.resolutionLastAttemptAt ?? null,
    resolutionNextAttemptAt: raw?.resolutionNextAttemptAt ?? null,
    resolutionLastErrorCode:
      typeof raw?.resolutionLastErrorCode === 'string' ? raw.resolutionLastErrorCode : null,
    createdAt: String(raw?.createdAt ?? ''),
    actionable: raw?.actionable === true,
  }
}

export async function getSessionRecoveryRequestDetail(requestId: string) {
  const raw = await api.get<any>(`/admin/session-recovery-requests/${requestId}`)
  const base = normaliseSessionRecoveryRequest(raw)
  const identity = raw?.identity
  return {
    ...base,
    identity: identity
      ? {
          ghanaCardImageUrl: identity.ghanaCardImageUrl ?? null,
          ghanaCardVerified: Boolean(identity.ghanaCardVerified),
          registeredAt: String(identity.registeredAt ?? ''),
          vehicle: base.role === 'driver' ? (identity.vehicle ?? null) : null,
          completedRidesCount:
            base.role === 'driver' ? (identity.completedRidesCount ?? null) : null,
          categories: base.role === 'artisan' ? (identity.categories ?? null) : null,
          completedJobsCount:
            base.role === 'artisan' ? (identity.completedJobsCount ?? null) : null,
          verificationStatus:
            base.role === 'driver' || base.role === 'artisan'
              ? (identity.verificationStatus ?? null)
              : null,
        }
      : null,
  } satisfies SessionRecoveryRequestDetail
}

export function dismissSessionRecoveryRequest(requestId: string, reason?: string) {
  return api.post<{ success: true }>(
    `/admin/session-recovery-requests/${requestId}/resolve`,
    reason ? { reason } : {}
  )
}

/**
 * Approves the recovery — revokes the old device's session for the given role.
 * Pass `recoveryRequestId` to also mark that request resolved with
 * `resolvedAction='revoked'` in one call (backend handles both atomically).
 */
export function revokeUserSession(
  role: SessionRole,
  roleAccountId: string,
  body: { reason: string; recoveryRequestId?: string }
) {
  return api.post<{ success: true; operationId?: string }>(
    roleAccountPath(role, roleAccountId, 'force-logout'),
    body
  )
}

// ── Deleted Role Account Recovery (BR-63) ────────────────────────────────────
// Independent from lost-device session recovery. The backend scopes global
// Operations to clients and a named regional Admin to providers.

export type RoleAccountRecoveryStatus =
  | 'pending_operations'
  | 'pending_admin_intake'
  | 'provider_pending_verification'
  | 'approved'
  | 'expired'

export interface RoleAccountRecoveryRequest {
  requestId: string
  role: SessionRole
  roleAccountId: string
  regionId: string | null
  categoryScope: 'rides' | 'artisan' | null
  status: RoleAccountRecoveryStatus
  name: string | null
  maskedPhone: string
  recoveryDeadline: string
  otpVerifiedAt: string
  intakeAt: string | null
  resolvedAt: string | null
  requestedAt: string
}

export interface RoleAccountRecoveryListResponse {
  items: RoleAccountRecoveryRequest[]
  total: number
  page: number
  limit: number
  totalPages: number
}

function normaliseRoleAccountRecoveryRequest(raw: any): RoleAccountRecoveryRequest {
  const role = raw?.role
  const status = raw?.status
  if (role !== 'client' && role !== 'driver' && role !== 'artisan') {
    throw new Error('Invalid role-account recovery role')
  }
  if (
    status !== 'pending_operations' &&
    status !== 'pending_admin_intake' &&
    status !== 'provider_pending_verification' &&
    status !== 'approved' &&
    status !== 'expired'
  ) {
    throw new Error('Invalid role-account recovery status')
  }
  return {
    requestId: String(raw?.requestId ?? ''),
    role,
    roleAccountId: String(raw?.roleAccountId ?? ''),
    regionId: typeof raw?.regionId === 'string' ? raw.regionId : null,
    categoryScope:
      raw?.categoryScope === 'rides' || raw?.categoryScope === 'artisan'
        ? raw.categoryScope
        : null,
    status,
    name: typeof raw?.name === 'string' ? raw.name : null,
    maskedPhone: String(raw?.maskedPhone ?? ''),
    recoveryDeadline: String(raw?.recoveryDeadline ?? ''),
    otpVerifiedAt: String(raw?.otpVerifiedAt ?? ''),
    intakeAt: typeof raw?.intakeAt === 'string' ? raw.intakeAt : null,
    resolvedAt: typeof raw?.resolvedAt === 'string' ? raw.resolvedAt : null,
    requestedAt: String(raw?.requestedAt ?? ''),
  }
}

export function listRoleAccountRecoveryRequests(params?: {
  status?: RoleAccountRecoveryStatus
  page?: number
  limit?: number
}) {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.page) query.set('page', String(params.page))
  if (params?.limit) query.set('limit', String(params.limit))
  const suffix = query.size ? `?${query.toString()}` : ''
  return api
    .get<any>(`/admin/role-account-recovery-requests${suffix}`)
    .then((raw): RoleAccountRecoveryListResponse => ({
      items: (Array.isArray(raw?.items) ? raw.items : []).map(
        normaliseRoleAccountRecoveryRequest
      ),
      total: Number(raw?.total ?? 0),
      page: Number(raw?.page ?? 1),
      limit: Number(raw?.limit ?? 25),
      totalPages: Number(raw?.totalPages ?? 0),
    }))
}

export function getRoleAccountRecoveryRequest(requestId: string) {
  return api
    .get<any>(`/admin/role-account-recovery-requests/${requestId}`)
    .then(normaliseRoleAccountRecoveryRequest)
}

export function approveClientRoleAccountRecovery(requestId: string, note?: string) {
  return api.post<{ requestId: string; role: 'client'; status: 'approved' }>(
    `/admin/role-account-recovery-requests/${requestId}/approve-client`,
    note ? { note } : {}
  )
}

export function acceptProviderRoleAccountRecovery(requestId: string, note?: string) {
  return api.post<{
    requestId: string
    role: 'driver' | 'artisan'
    status: 'provider_pending_verification'
    documentsQueuedForRevalidation: number
  }>(`/admin/role-account-recovery-requests/${requestId}/intake-provider`, note ? { note } : {})
}

// ── Promotions ────────────────────────────────────────────────────────────────
// Backend: GET/POST/PATCH /admin/promos*. See docs/backend-spec-promotions.md
// (Phase 1 backend spec).

export type PromoType = 'PERCENTAGE_DISCOUNT' | 'FIXED_DISCOUNT' | 'FREE_RIDE' | 'BONUS_POINTS'
export type PromoScope = 'ride' | 'job' | 'both'
export type PromoStatus = 'active' | 'expired' | 'scheduled' | 'inactive'

export interface Promo {
  id: string
  code: string
  promoType: PromoType
  promoScope: PromoScope
  discountValue: number
  maxDiscountPesewas: number | null
  minBookingPesewas: number
  maxUsesTotal: number | null
  maxUsesPerUser: number
  currentUses: number
  isActive: boolean
  startsAt: string
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
  status: PromoStatus
}

export interface PromoDetail extends Promo {
  stats: {
    totalDiscountedPesewas: number
    uniqueRedeemerCount: number
    rideRedemptions: number
    jobRedemptions: number
  }
}

export interface PromoListResponse {
  items: Promo[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface PromoRedemptionItem {
  id: string
  promoCodeId: string
  clientId: string
  clientName: string | null
  bookingType: 'ride' | 'job'
  bookingId: string
  bookingShortRef: string | null
  discountPesewas: number
  createdAt: string
}

export interface PromoRedemptionListResponse {
  items: PromoRedemptionItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export function listPromos(params?: {
  status?: PromoStatus
  promoType?: PromoType
  promoScope?: PromoScope
  search?: string
  page?: number
  limit?: number
}) {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v != null && v !== '')
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : ''
  return api.get<PromoListResponse>(`/admin/promos${qs}`)
}

export function getPromo(promoId: string) {
  return api.get<PromoDetail>(`/admin/promos/${promoId}`)
}

export interface CreatePromoInput {
  code: string
  promoType: PromoType
  promoScope: PromoScope
  discountValue: number
  maxDiscountPesewas?: number
  minBookingPesewas?: number
  maxUsesTotal?: number
  maxUsesPerUser?: number
  startsAt?: string
  expiresAt?: string
  isActive?: boolean
}

export function createPromo(data: CreatePromoInput) {
  return api.post<Promo>('/admin/promos', data)
}

// Frozen on the backend: code, promoType, promoScope, discountValue.
export type UpdatePromoInput = Partial<{
  isActive: boolean
  expiresAt: string | null
  maxUsesTotal: number
  maxUsesPerUser: number
  minBookingPesewas: number
  maxDiscountPesewas: number
}>

export function updatePromo(promoId: string, data: UpdatePromoInput) {
  return api.patch<Promo>(`/admin/promos/${promoId}`, data)
}

export function listPromoRedemptions(promoId: string, params?: { page?: number; limit?: number }) {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : ''
  return api.get<PromoRedemptionListResponse>(`/admin/promos/${promoId}/redemptions${qs}`)
}

// ── Promo campaigns ───────────────────────────────────────────────────────────
// Admin-managed auto-apply campaigns — distinct from the typed promo codes
// above. Backend: /admin/promo-campaigns* with a maker-checker approval flow
// (approve_promotions may never approve the creator's own campaign) and
// super_admin-only sanity-limit writes. Types + normalisers live in
// lib/promo-campaign-contract.ts so they stay unit-testable.

export type {
  PromoCampaign,
  PromoCampaignAudience,
  PromoCampaignDetail,
  PromoCampaignListResponse,
  PromoCampaignSanityLimits,
  PromoCampaignScope,
  PromoCampaignStatus,
  PromoCampaignType,
} from './promo-campaign-contract'

export async function listPromoCampaigns(params?: {
  status?: PromoCampaignStatus
  audience?: PromoCampaignAudience
  page?: number
  limit?: number
}): Promise<PromoCampaignListResponse> {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : ''
  const raw = await api.get<unknown>(`/admin/promo-campaigns${qs}`)
  return normalisePromoCampaignListResponse(raw, params)
}

export async function getPromoCampaign(campaignId: string): Promise<PromoCampaignDetail> {
  const raw = await api.get<unknown>(`/admin/promo-campaigns/${encodeURIComponent(campaignId)}`)
  return normalisePromoCampaignDetail(raw)
}

export interface CreatePromoCampaignInput {
  name: string
  description?: string
  termsText?: string
  /**
   * commission_relief is ONLY valid for driver/artisan audiences; client
   * campaigns keep percentage_discount/fixed_discount (the backend answers
   * PROMO_AUDIENCE_TYPE_MISMATCH for any other pairing).
   */
  campaignType: PromoCampaignType
  /** Defaults to 'client' on the backend when omitted. */
  audience?: PromoCampaignAudience
  discountValue: number
  /**
   * REQUIRED by the backend for percentage_discount (PROMO_CAP_REQUIRED).
   * Optional for commission_relief: absolute cap on forgone commission per booking.
   */
  maxDiscountPesewas?: number
  minBookingPesewas?: number
  /**
   * Client audience only. Provider audiences derive their scope server-side
   * (driver→ride, artisan→artisan_job) — do NOT send promoScope for them.
   */
  promoScope?: PromoCampaignScope
  /** Driver or ride-scoped client campaigns only — never with an artisan audience. */
  rideCategoryIds?: string[]
  /** Artisan or job-scoped client campaigns only — never with a driver audience. */
  serviceCategoryIds?: string[]
  /** For provider audiences this means "new providers only". */
  newClientsOnly?: boolean
  maxUsesPerUser?: number
  maxUsesPerUserPerDay?: number
  budgetCapPesewas?: number
  startsAt: string // ISO
  endsAt: string // ISO
  bannerPriority?: number
}

export async function createPromoCampaign(data: CreatePromoCampaignInput): Promise<PromoCampaign> {
  const raw = await api.post<unknown>('/admin/promo-campaigns', data)
  return normalisePromoCampaign(raw)
}

// Full edit is allowed while draft/pending_approval (editing a pending campaign
// returns it to draft). Once approved/paused only budgetCapPesewas (raise only),
// endsAt (extend only) and bannerPriority may change — anything else is a 409
// PROMO_CAMPAIGN_TERMS_LOCKED.
export type UpdatePromoCampaignInput = Partial<CreatePromoCampaignInput>

export async function updatePromoCampaign(
  campaignId: string,
  data: UpdatePromoCampaignInput,
): Promise<PromoCampaign> {
  const raw = await api.patch<unknown>(
    `/admin/promo-campaigns/${encodeURIComponent(campaignId)}`,
    data,
  )
  return normalisePromoCampaign(raw)
}

export async function submitPromoCampaign(campaignId: string): Promise<PromoCampaign> {
  const raw = await api.post<unknown>(
    `/admin/promo-campaigns/${encodeURIComponent(campaignId)}/submit`,
    {},
  )
  return normalisePromoCampaign(raw)
}

// 403 PROMO_MAKER_CHECKER_VIOLATION when the approver is the campaign creator.
export async function approvePromoCampaign(campaignId: string): Promise<PromoCampaign> {
  const raw = await api.post<unknown>(
    `/admin/promo-campaigns/${encodeURIComponent(campaignId)}/approve`,
    {},
  )
  return normalisePromoCampaign(raw)
}

export async function rejectPromoCampaign(
  campaignId: string,
  reason: string,
): Promise<PromoCampaign> {
  const raw = await api.post<unknown>(
    `/admin/promo-campaigns/${encodeURIComponent(campaignId)}/reject`,
    { reason: reason.trim() },
  )
  return normalisePromoCampaign(raw)
}

export async function pausePromoCampaign(campaignId: string): Promise<PromoCampaign> {
  const raw = await api.post<unknown>(
    `/admin/promo-campaigns/${encodeURIComponent(campaignId)}/pause`,
    {},
  )
  return normalisePromoCampaign(raw)
}

export async function resumePromoCampaign(campaignId: string): Promise<PromoCampaign> {
  const raw = await api.post<unknown>(
    `/admin/promo-campaigns/${encodeURIComponent(campaignId)}/resume`,
    {},
  )
  return normalisePromoCampaign(raw)
}

export async function endPromoCampaign(campaignId: string): Promise<PromoCampaign> {
  const raw = await api.post<unknown>(
    `/admin/promo-campaigns/${encodeURIComponent(campaignId)}/end`,
    {},
  )
  return normalisePromoCampaign(raw)
}

// Multipart banner upload (JPEG/PNG/WebP ≤ 5MB, recommended 1200×480). Like
// uploadProviderPhoto above, this cannot use the typed `api` helper — for
// multipart we must NOT set Content-Type (the browser adds the boundary), so we
// call fetch directly while reusing the same base URL + bearer token.
export async function uploadPromoCampaignBanner(
  campaignId: string,
  file: File,
): Promise<{ campaignId: string; bannerUrl: string }> {
  const clientError = validatePromoBannerFile(file)
  if (clientError) throw new Error(clientError)

  const body = new FormData()
  body.append('file', file)

  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  // Intentionally no Content-Type — the browser sets the multipart boundary.

  const res = await fetch(
    `${API_BASE}/admin/promo-campaigns/${encodeURIComponent(campaignId)}/banner`,
    { method: 'POST', headers, body },
  )

  let json: any = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    throw apiErrorFromResponse(res, json)
  }

  // NestJS TransformInterceptor wraps successful bodies in { success, data }.
  const payload = json?.data ?? json
  if (payload?.campaignId !== campaignId || typeof payload?.bannerUrl !== 'string') {
    throw new Error('Banner upload returned an unexpected response.')
  }
  return { campaignId: payload.campaignId, bannerUrl: payload.bannerUrl }
}

export async function getPromoCampaignSanityLimits(): Promise<PromoCampaignSanityLimits> {
  const raw = await api.get<unknown>('/admin/promo-campaigns/sanity-limits')
  return normalisePromoCampaignSanityLimits(raw)
}

// super_admin role only — the backend answers 403 SUPER_ADMIN_REQUIRED for
// everyone else, including admins holding manage_promotions.
export async function updatePromoCampaignSanityLimits(
  data: Partial<PromoCampaignSanityLimits>,
): Promise<PromoCampaignSanityLimits> {
  const raw = await api.patch<unknown>('/admin/promo-campaigns/sanity-limits', data)
  return normalisePromoCampaignSanityLimits(raw)
}

// ── Health ────────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: string
  database: string
  redis: string
}

export function getHealth() {
  return api.get<HealthStatus>('/health')
}

// ── Referrals ─────────────────────────────────────────────────────────────────
// Role-account referrals. The admin parser fails closed unless each party has an
// exact role + roleAccountId; private phone-auth User ids are never accepted.
// Endpoints (see docs/backend-requests.md §7):
//   GET   /admin/referrals                 (perm view_referrals)   — paginated ledger
//   GET   /admin/referrals/metrics         (perm view_referrals)   — KPI cards + byDay trend
//   GET   /admin/users/:role/:roleAccountId/referrals (perm view_referrals)
//   PATCH /admin/referrals/:id/void        (perm manage_referrals) — reverse an awarded bonus
//   POST  /admin/referrals/:id/award       (perm manage_referrals) — manually award a pending one

export type ReferralStatusFilter = 'pending' | 'awarded' | 'all'

export interface ReferralUserRef {
  role: RoleAccountRole
  roleAccountId: string
  fullName: string | null
}

export interface ReferralListItem {
  id: string
  referralCode: string
  referrer: ReferralUserRef
  referee: ReferralUserRef
  firstBookingCompleted: boolean
  bonusAwarded: boolean
  bonusPoints: number | null // null until awarded (or after a void)
  createdAt: string
}

export interface ReferralListResponse {
  items: ReferralListItem[]
  total: number
  page: number
  limit: number
}

// Defensive normaliser — tolerates camelCase or snake_case, and referrer/referee
// either nested or flattened, so the page renders regardless of the exact shape.
function normaliseReferralUserRef(raw: any): ReferralUserRef {
  const r = raw ?? {}
  const role = r.role
  const roleAccountId = r.roleAccountId ?? r.role_account_id
  if (
    (role !== 'client' && role !== 'driver' && role !== 'artisan') ||
    typeof roleAccountId !== 'string'
  ) {
    throw new Error('Unsafe referral response: exact role-account ownership is required.')
  }
  return {
    role,
    roleAccountId,
    fullName: r.fullName ?? r.full_name ?? r.name ?? null,
  }
}

function normaliseReferralItem(raw: any): ReferralListItem {
  return {
    id: String(raw.id ?? ''),
    referralCode: raw.referralCode ?? raw.referral_code ?? '',
    referrer: normaliseReferralUserRef(raw.referrer),
    referee: normaliseReferralUserRef(raw.referee),
    firstBookingCompleted: Boolean(
      raw.firstBookingCompleted ?? raw.first_booking_completed ?? false
    ),
    bonusAwarded: Boolean(raw.bonusAwarded ?? raw.bonus_awarded ?? false),
    bonusPoints: raw.bonusPoints ?? raw.bonus_points ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? '',
  }
}

export interface ListReferralsParams {
  page?: number
  limit?: number
  status?: ReferralStatusFilter
  search?: string
  from?: string
  to?: string
}

export async function listReferrals(params?: ListReferralsParams): Promise<ReferralListResponse> {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v != null && v !== '')
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : ''
  const raw = await api.get<any>(`/admin/referrals${qs}`)
  const list = Array.isArray(raw) ? raw : (raw.items ?? [])
  return {
    items: list.map(normaliseReferralItem),
    total: Number(raw.total ?? list.length),
    page: Number(raw.page ?? params?.page ?? 1),
    limit: Number(raw.limit ?? params?.limit ?? 20),
  }
}

export interface ReferralByDayPoint {
  date: string // yyyy-mm-dd
  created: number
  awarded: number
}

export interface ReferralMetrics {
  totalReferrals: number
  awardedCount: number
  pendingCount: number
  conversionRatePct: number // awarded / total, 0–100
  totalBonusPointsAwarded: number
  totalBonusValuePesewas: number
  byDay: ReferralByDayPoint[]
}

export async function getReferralMetrics(params?: {
  from?: string
  to?: string
}): Promise<ReferralMetrics> {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v != null && v !== '')
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : ''
  const raw = await api.get<any>(`/admin/referrals/metrics${qs}`)
  const byDayRaw: any[] = Array.isArray(raw?.byDay)
    ? raw.byDay
    : Array.isArray(raw?.by_day)
      ? raw.by_day
      : []
  return {
    totalReferrals: Number(raw?.totalReferrals ?? raw?.total_referrals ?? 0),
    awardedCount: Number(raw?.awardedCount ?? raw?.awarded_count ?? 0),
    pendingCount: Number(raw?.pendingCount ?? raw?.pending_count ?? 0),
    conversionRatePct: Number(raw?.conversionRatePct ?? raw?.conversion_rate_pct ?? 0),
    totalBonusPointsAwarded: Number(
      raw?.totalBonusPointsAwarded ?? raw?.total_bonus_points_awarded ?? 0
    ),
    totalBonusValuePesewas: Number(
      raw?.totalBonusValuePesewas ?? raw?.total_bonus_value_pesewas ?? 0
    ),
    byDay: byDayRaw.map((d) => ({
      date: d.date ?? '',
      created: Number(d.created ?? 0),
      awarded: Number(d.awarded ?? 0),
    })),
  }
}

export interface UserReferralFunnel {
  referralCode: string | null
  referralsMade: ReferralListItem[]
  referralReceived: ReferralListItem | null
  loyaltyPointsBalance: number | null
}

export async function getUserReferrals(
  role: RoleAccountRole,
  roleAccountId: string
): Promise<UserReferralFunnel> {
  const raw = await api.get<any>(roleAccountPath(role, roleAccountId, 'referrals'))
  if (raw?.role !== role || raw?.roleAccountId !== roleAccountId) {
    throw new Error('Unsafe referral response: role account did not match the request.')
  }
  const made: any[] = Array.isArray(raw?.referralsMade)
    ? raw.referralsMade
    : Array.isArray(raw?.referrals_made)
      ? raw.referrals_made
      : []
  const received = raw?.referralReceived ?? raw?.referral_received ?? null
  return {
    referralCode: raw?.referralCode ?? raw?.referral_code ?? null,
    referralsMade: made.map(normaliseReferralItem),
    referralReceived: received ? normaliseReferralItem(received) : null,
    loyaltyPointsBalance:
      typeof raw?.loyaltyPointsBalance === 'number' ? raw.loyaltyPointsBalance : null,
  }
}

// PATCH /admin/referrals/:id/void — reverse an awarded bonus. Deducts bonusPoints
// from the referrer's balance (floor 0), writes a compensating `adjusted` loyalty
// transaction, sets bonus_awarded=false. Idempotent: 409 if not awarded.
export function voidReferralBonus(referralId: string, reason: string) {
  return api.patch<ReferralListItem>(`/admin/referrals/${referralId}/void`, {
    reason,
  })
}

// POST /admin/referrals/:id/award — manually award a still-pending referral,
// bypassing the first-activity check. Idempotent: 409 if already awarded.
export function awardReferral(referralId: string) {
  return api.post<ReferralListItem>(`/admin/referrals/${referralId}/award`, {})
}

// ── Platform attribution codes ───────────────────────────────────────────────
// Platform promo attribution is deliberately separate from the exact-role
// referral ledger above. It records aggregate signup attribution only: no role
// account owns a platform code and no digital reward is created.

export type {
  PlatformReferralCodeItem,
  PlatformReferralCodeListResponse,
} from './platform-referral-code-contract'

export async function listPlatformReferralCodes(params?: {
  page?: number
  limit?: number
}): Promise<PlatformReferralCodeListResponse> {
  const query = new URLSearchParams()
  if (params?.page !== undefined) query.set('page', String(params.page))
  if (params?.limit !== undefined) query.set('limit', String(params.limit))
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  const raw = await api.get<unknown>(`/admin/platform-referral-codes${suffix}`)
  return normalisePlatformReferralCodeListResponse(raw)
}

export async function createPlatformReferralCode(input: {
  code: string
  campaignName: string
}): Promise<PlatformReferralCodeItem> {
  const raw = await api.post<unknown>('/admin/platform-referral-codes', {
    code: normalisePlatformReferralCodeInput(input.code),
    campaignName: input.campaignName.trim(),
  })
  return normalisePlatformReferralCodeItem(raw)
}

export async function deactivatePlatformReferralCode(
  platformReferralCodeId: string,
  reason: string,
): Promise<PlatformReferralCodeItem> {
  const raw = await api.patch<unknown>(
    `/admin/platform-referral-codes/${encodeURIComponent(platformReferralCodeId)}/deactivate`,
    { reason: reason.trim() },
  )
  return normalisePlatformReferralCodeItem(raw)
}
