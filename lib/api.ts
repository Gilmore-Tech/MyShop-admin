/**
 * Typed API methods for MyShop Admin Panel
 * All endpoints map directly to the NestJS backend (v1 prefix).
 */
import { api, apiFetch, AdminUser, setTokens, setAdminUser, clearTokens } from './api-client'
import type { Permission, Role, CategoryScope } from './roles'

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AdminLoginResponse {
  accessToken: string
  refreshToken: string
  admin: AdminUser
}

export async function adminLogin(email: string, password: string): Promise<AdminLoginResponse> {
  const res = await api.post<AdminLoginResponse>('/auth/admin/login', { email, password }, { skipAuth: true })
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
  generatedAt: string
}

export async function getOverviewReport(): Promise<OverviewReport> {
  const raw = await api.get<any>('/admin/reports/overview')
  const rev = raw.commissionRevenue ?? raw.commission_revenue ?? {}
  return {
    activeRides:          raw.activeRides          ?? raw.active_rides          ?? 0,
    activeJobs:           raw.activeJobs           ?? raw.active_jobs           ?? 0,
    pendingVerifications: raw.pendingVerifications  ?? raw.pending_verifications ?? 0,
    openDisputes:         raw.openDisputes          ?? raw.open_disputes         ?? 0,
    registeredClients:    raw.registeredClients     ?? raw.registered_clients    ?? 0,
    registeredDrivers:    raw.registeredDrivers     ?? raw.registered_drivers    ?? 0,
    registeredArtisans:   raw.registeredArtisans    ?? raw.registered_artisans   ?? 0,
    commissionRevenue: {
      todayGhs: rev.todayGhs ?? rev.today_ghs ?? 0,
      weekGhs:  rev.weekGhs  ?? rev.week_ghs  ?? 0,
      monthGhs: rev.monthGhs ?? rev.month_ghs ?? 0,
    },
    paymentSuccessRatePct: raw.paymentSuccessRatePct ?? raw.payment_success_rate_pct ?? null,
    generatedAt: raw.generatedAt ?? raw.generated_at ?? new Date().toISOString(),
  }
}

// ── Revenue Report ────────────────────────────────────────────────────────────

export interface RevenueDataPoint {
  period: string
  collectionsGhs: number
  commissionGhs: number
  payoutsGhs: number
  tipsGhs: number
  totalPayments: number
  successfulPayments: number
  paymentSuccessRatePct: number | null
  momoCount: number
  cardCount: number
}

export interface RevenueReport {
  from: string
  to: string
  groupBy: string
  periods: RevenueDataPoint[]
}

export async function getRevenueReport(params?: { from?: string; to?: string; groupBy?: 'day' | 'week' | 'month' }) {
  const groupBy = params?.groupBy ?? 'day'
  const defaultDays = groupBy === 'month' ? 365 : groupBy === 'week' ? 90 : 30
  const from = params?.from ?? (() => {
    const d = new Date(); d.setDate(d.getDate() - defaultDays)
    return d.toISOString().split('T')[0]
  })()
  const to = params?.to ?? new Date().toISOString().split('T')[0]
  const qs = '?' + new URLSearchParams({ from, to, groupBy }).toString()
  const raw = await api.get<any>(`/admin/reports/revenue${qs}`)
  const periods: RevenueDataPoint[] = (raw.periods ?? raw.data ?? []).map((p: any) => ({
    period:               p.period               ?? p.date               ?? '',
    collectionsGhs:       p.collectionsGhs        ?? p.collections_ghs    ?? 0,
    commissionGhs:        p.commissionGhs         ?? p.commission_ghs     ?? 0,
    payoutsGhs:           p.payoutsGhs            ?? p.payouts_ghs        ?? 0,
    tipsGhs:              p.tipsGhs               ?? p.tips_ghs           ?? 0,
    totalPayments:        p.totalPayments         ?? p.total_payments     ?? 0,
    successfulPayments:   p.successfulPayments    ?? p.successful_payments ?? 0,
    paymentSuccessRatePct: p.paymentSuccessRatePct ?? p.payment_success_rate_pct ?? null,
    momoCount:            p.momoCount             ?? p.momo_count         ?? 0,
    cardCount:            p.cardCount             ?? p.card_count         ?? 0,
  }))
  return { from: raw.from ?? '', to: raw.to ?? '', groupBy: raw.groupBy ?? 'day', periods }
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
  const num = (v: any): number | null => v == null ? null : Number(v)
  const drivers = (raw?.drivers ?? []).map((d: any) => ({
    driverId:             d.driverId ?? d.driver_id ?? d.id ?? '',
    name:                 d.name ?? d.fullName ?? d.full_name ?? '',
    phone:                d.phone ?? '',
    verificationStatus:   d.verificationStatus ?? d.verification_status ?? '',
    cancellationCount30d: d.cancellationCount30d ?? d.cancellation_count_30d ?? 0,
    totalEarningsGhs:     Number(d.totalEarningsGhs ?? d.total_earnings_ghs ?? 0),
    avgRating:            num(d.avgRating ?? d.avg_rating),
    ratingCount:          d.ratingCount ?? d.rating_count ?? 0,
  }))
  const artisans = (raw?.artisans ?? []).map((a: any) => ({
    artisanId:            a.artisanId ?? a.artisan_id ?? a.id ?? '',
    name:                 a.name ?? a.fullName ?? a.full_name ?? '',
    phone:                a.phone ?? '',
    verificationStatus:   a.verificationStatus ?? a.verification_status ?? '',
    categories:           a.categories ?? [],
    supplementCount:      a.supplementCount ?? a.supplement_count ?? 0,
    completedJobsCount:   a.completedJobsCount ?? a.completed_jobs_count ?? 0,
    cancellationCount30d: a.cancellationCount30d ?? a.cancellation_count_30d ?? 0,
    supplementRatePct:    num(a.supplementRatePct ?? a.supplement_rate_pct),
    flagged:              Boolean(a.flagged),
    avgRating:            num(a.avgRating ?? a.avg_rating),
    ratingCount:          a.ratingCount ?? a.rating_count ?? 0,
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
    case 'artisan_en_route': return 'en_route'
    case 'arrived_at_pickup':
    case 'artisan_arrived':  return 'arrived'
    default:                 return status
  }
}

export async function getLiveMapData(): Promise<LiveMapMarker[]> {
  const raw = await api.get<any>('/admin/live-map')
  // Backend returns { rides: [...], jobs: [...] } — flatten into a single array
  const rides: LiveMapMarker[] = (Array.isArray(raw) ? [] : (raw.rides ?? [])).map((m: any) => ({
    ...m, status: normaliseMarkerStatus(m.status),
  }))
  const jobs: LiveMapMarker[] = (Array.isArray(raw) ? raw : (raw.jobs ?? [])).map((m: any) => ({
    ...m, status: normaliseMarkerStatus(m.status),
  }))
  return [...rides, ...jobs]
}

export interface RideMarkerDetail {
  rideId: string
  status: string
  pickupAddress: string
  dropoffAddress: string
  farePesewas: number
  driver: { name: string; phone: string; vehicle: string } | null
  client: { name: string; phone: string } | null
}

export function getRideMarkerDetail(rideId: string) {
  return api.get<RideMarkerDetail>(`/admin/live-map/rides/${rideId}`)
}

export interface JobMarkerDetail {
  jobId: string
  status: string
  description: string
  address: string
  agreedPricePesewas: number | null
  category: string
  artisan: { name: string; phone: string } | null
  client: { name: string; phone: string } | null
}

export function getJobMarkerDetail(jobId: string) {
  return api.get<JobMarkerDetail>(`/admin/live-map/jobs/${jobId}`)
}

// ── Verification Queue ────────────────────────────────────────────────────────

// Maps raw document_type strings (snake_case DB values) to human-readable labels.
const DOC_TYPE_LABELS: Record<string, string> = {
  national_id:          'National ID',
  ghana_card:           'Ghana Card',
  passport:             'Passport',
  drivers_license:      "Driver's License",
  vehicle_registration: 'Vehicle Registration',
  vehicle_insurance:    'Vehicle Insurance',
  roadworthy:           'Roadworthy Certificate',
  profile_photo:        'Profile Photo',
  certificate:          'Certificate / Qualification',
  trade_license:        'Trade License',
  tin_certificate:      'TIN Certificate',
  business_registration:'Business Registration',
}

function docTypeLabel(raw: string): string {
  return DOC_TYPE_LABELS[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Resolves a storage key (e.g. "documents/driver/uuid/ghana_card/abc.pdf") to a full Cloudinary
// delivery URL. Falls back to the raw key unchanged if NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME isn't set.
function resolveCloudinaryUrl(fileUrl: string, mimeType: string | null): string {
  if (fileUrl.startsWith('http')) return fileUrl
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  if (!cloudName) return fileUrl
  const lk = fileUrl.toLowerCase()
  const resourceType = (mimeType === 'application/pdf' || lk.endsWith('.pdf')) ? 'raw' : 'image'
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${fileUrl}`
}

export interface ProviderDocument {
  id: string
  type: string            // raw document_type from DB (e.g. "national_id")
  label: string           // human-readable label (e.g. "National ID")
  status: 'uploaded' | 'pending_review' | 'approved' | 'rejected' | 'confirmed'
  file_url: string        // Cloudinary URL
  mime_type: string | null
  uploaded_at: string     // ISO string
  expires_at: string | null
  version: number
  rejection_reason: string | null  // set when status === 'rejected'
  // True when this is the latest version of the document. Re-uploads supersede
  // the previous version, and only the current version is reviewable — the
  // backend rejects a review of a non-current id with DOCUMENT_NOT_FOUND.
  // Defaults to true until the backend populates is_current on the queue.
  isCurrent: boolean
}

// Pipeline stage of a provider in the verification queue.
export type VerificationStage =
  | 'pending_documents'      // awaiting admin per-document authenticity checks
  | 'docs_verified'          // admin done; awaiting coordinator validation
  | 'coordinator_validated'  // coordinator done; awaiting RM final decision
  | 'online'                 // RM approved + sent online (leaves the queue)

export interface VerificationItem {
  provider_type: string
  provider_id: string
  provider_name: string | null
  verification_stage: VerificationStage | null
  region_id: string | null
  region_name: string | null
  docs_pending: number
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
  const rawUrl   = d.file_url ?? d.fileUrl ?? ''
  return {
    id:               String(d.id ?? ''),
    type:             rawType,
    label:            d.label ?? docTypeLabel(rawType),
    status:           d.status ?? 'pending_review',
    file_url:         resolveCloudinaryUrl(rawUrl, mimeType),
    mime_type:        mimeType,
    uploaded_at:      d.uploaded_at ?? d.uploadedAt ?? d.created_at ?? d.createdAt ?? '',
    expires_at:       d.expires_at ?? d.expiresAt ?? null,
    version:          Number(d.version ?? 1),
    rejection_reason: d.rejection_reason ?? d.rejectionReason ?? null,
    isCurrent:        (d.is_current ?? d.isCurrent ?? true) !== false,
  }
}

// Prisma $queryRaw sometimes returns json_agg results as a JSON string instead of
// a parsed array. This helper handles both.
function parseDocuments(raw: any): any[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return [] }
  }
  return []
}

// Normalise a raw queue item from the API to our VerificationItem shape.
function normaliseItem(v: any): VerificationItem {
  const rawDocs = parseDocuments(v.documents ?? v.providerDocuments)
  return {
    provider_type:  v.provider_type  ?? v.providerType  ?? '',
    provider_id:    v.provider_id    ?? v.providerId    ?? '',
    verification_stage: (v.verification_stage ?? v.verificationStage ?? null) as VerificationStage | null,
    region_id:      v.region_id      ?? v.regionId      ?? null,
    region_name:    v.region_name    ?? v.regionName    ?? null,
    provider_name:  v.provider_name  ?? v.providerName  ?? null,
    docs_pending:   Number(v.docs_pending   ?? v.docsPending   ?? 0),
    docs_approved:  Number(v.docs_approved  ?? v.docsApproved  ?? 0),
    docs_rejected:  Number(v.docs_rejected  ?? v.docsRejected  ?? 0),
    total_docs:     Number(v.total_docs     ?? v.totalDocs     ?? rawDocs.length),
    first_upload_at: v.first_upload_at ?? v.firstUploadAt ?? v.createdAt ?? '',
    documents: rawDocs.map(normaliseDoc),
  }
}

export async function getVerificationQueue(
  opts?: { stage?: VerificationStage },
): Promise<VerificationItem[]> {
  const qs = opts?.stage ? `?stage=${encodeURIComponent(opts.stage)}` : ''
  const raw = await api.get<any>(`/admin/verifications${qs}`)
  const arr: any[] = Array.isArray(raw) ? raw : (raw as any)?.items ?? []
  return arr.map(normaliseItem)
}

// Refetch a single provider's queue row so document ids reflect the latest
// versions. Reuses the deployed queue endpoint (no per-provider route needed).
// Used to self-heal stale document ids after a re-upload supersedes a version.
export async function getVerificationItem(
  providerId: string,
  providerType: string,
): Promise<VerificationItem | null> {
  const queue = await getVerificationQueue()
  return queue.find(v => v.provider_id === providerId && v.provider_type === providerType) ?? null
}

// ── 3-stage verification pipeline (Admin → Coordinator → RM) ──────────────────

// Stage 1→2 (Admin). After every current document has been approved/rejected,
// submit the provider to the category coordinator. POST /admin/verifications/:id/submit
export function submitVerification(providerId: string, providerType: 'driver' | 'artisan') {
  return api.post(`/admin/verifications/${providerId}/submit`, { providerType })
}

// Stage 2→3 (Coordinator). Validate the admin-approved set for your category, or
// bounce it back. PATCH /admin/verifications/:id/validate
export function validateVerification(
  providerId: string,
  providerType: 'driver' | 'artisan',
  action: 'approve' | 'reject',
  reason: string,
) {
  return api.patch(`/admin/verifications/${providerId}/validate`, { action, providerType, reason })
}

// Stage 3 (Regional Manager). Final decision — the only step that sends a
// provider online. PATCH /admin/verifications/:id/finalize
export function finalizeVerification(
  providerId: string,
  providerType: 'driver' | 'artisan',
  action: 'approve' | 'reject',
  reason: string,
) {
  return api.patch(`/admin/verifications/${providerId}/finalize`, { action, providerType, reason })
}

// Lifts an auto-suspension (rating-engine or cancellation-engine triggered).
// Backend flips driver/artisan.verificationStatus back to 'approved' and updates
// the matching ProviderSuspension row with reinstatedAt/reinstatedBy.
export function liftVerificationSuspension(
  providerId: string,
  providerType: 'driver' | 'artisan',
  reason: string,
) {
  return api.post(`/admin/verifications/${providerId}/lift-suspension`, { providerType, reason })
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
  userId: string | null
  fullName: string | null
  phone: string | null               // backend returns normalised/masked
  cancellationCount30d: number       // current rolling count
  verificationStatus: string         // 'suspended' while active
  reason: string | null
  triggerType: string | null         // e.g. 'cancellation_limit'
  isAutomatic: boolean
  suspendedAt: string                // ProviderSuspension.createdAt (ISO)
  reinstatedAt: string | null        // null while active
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
    suspensionId:         raw.suspensionId ?? raw.id ?? raw.suspension_id ?? '',
    providerType:         (raw.providerType ?? raw.provider_type ?? 'driver') as 'driver' | 'artisan',
    providerId:           raw.providerId ?? raw.provider_id ?? p?.id ?? '',
    userId:               raw.userId ?? raw.user_id ?? u?.id ?? null,
    fullName:             raw.fullName ?? raw.full_name ?? raw.name ?? u?.fullName ?? u?.full_name ?? null,
    phone:                raw.phone ?? u?.phone ?? null,
    cancellationCount30d: Number(raw.cancellationCount30d ?? raw.cancellation_count_30d ?? raw.cancellationCount ?? p?.cancellationCount30d ?? 0),
    verificationStatus:   raw.verificationStatus ?? raw.verification_status ?? p?.verificationStatus ?? 'suspended',
    reason:               raw.reason ?? null,
    triggerType:          raw.triggerType ?? raw.trigger_type ?? raw.trigger ?? null,
    isAutomatic:          Boolean(raw.isAutomatic ?? raw.is_automatic ?? false),
    suspendedAt:          raw.suspendedAt ?? raw.suspended_at ?? raw.createdAt ?? raw.created_at ?? '',
    reinstatedAt:         raw.reinstatedAt ?? raw.reinstated_at ?? null,
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
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
  ).toString() : ''
  const raw = await api.get<any>(`/admin/providers/suspensions${qs}`)
  const list = Array.isArray(raw) ? raw : (raw.items ?? [])
  return {
    items:      list.map(normaliseSuspensionItem),
    total:      Number(raw.total ?? list.length),
    page:       Number(raw.page ?? params?.page ?? 1),
    limit:      Number(raw.limit ?? params?.limit ?? 50),
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
    note && note.trim() ? { note: note.trim() } : {},
  )
}

// ReviewClientKycDto: { action: 'approve'|'reject', reason (min 5 on reject) }
export function reviewClientKyc(
  clientId: string,
  action: 'approve' | 'reject',
  reason?: string,
) {
  return api.patch(`/admin/clients/${clientId}/kyc`, {
    action,
    ...(reason ? { reason } : {}),
  })
}

export interface ClientKycQueueItem {
  clientId: string
  userId: string
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
    clientId:          c.clientId ?? c.client_id ?? c.id,
    userId:            c.userId ?? c.user_id,
    fullName:          c.fullName ?? c.full_name ?? '',
    phone:             c.phone ?? '',
    email:             c.email ?? null,
    ghanaCardImageUrl: c.ghanaCardImageUrl ?? c.ghana_card_image_url ?? null,
    submittedAt:       c.submittedAt ?? c.submitted_at ?? c.kycSubmittedAt ?? null,
  }))
}

// PATCH /admin/verifications/documents/:id
// Backend expects { action: 'approve' | 'reject', providerType: 'driver' | 'artisan', reason }.
export function reviewDocument(
  documentId: string,
  providerType: string,
  action: 'approve' | 'reject',
  reason: string,
) {
  return api.patch(`/admin/verifications/documents/${documentId}`, { action, providerType, reason })
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

export function getDisputes() {
  return api.get<Dispute[]>('/admin/disputes')
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
  provider: { id?: string; fullName: string | null; phone: string | null; type?: string } | null

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

  evidence?: Array<{ kind: 'photo' | 'note'; url?: string; text?: string }> | null
}

export function getDisputeDetail(disputeId: string) {
  return api.get<DisputeDetail>(`/admin/disputes/${disputeId}`)
}

// NOTE: the frontend payment-panel spec proposes a richer DTO
// `{ resolution: 'REFUND_FULL'|'REFUND_PARTIAL'|'REJECT', notes? }`. The
// backend currently accepts the legacy `{ decision, reason, refundAmountPesewas? }`
// shape. Until backend ships the new contract, the detail page maps the spec's
// resolution modes onto this signature:
//   REFUND_FULL    → decision='approved', refundAmountPesewas omitted
//   REFUND_PARTIAL → decision='approved', refundAmountPesewas=<amount>
//   REJECT         → decision='denied'
export function resolveDispute(
  disputeId: string,
  decision: 'approved' | 'denied',
  reason: string,
  refundAmountPesewas?: number,
) {
  return api.patch(`/admin/disputes/${disputeId}/resolve`, {
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
  suspendedAt: string | null   // ISO
  // Rolling cancellation count captured at suspension time, when triggerType is
  // 'cancellation'. Falls back to the live driver.cancellationCount30d if absent.
  cancellationCount: number | null
}

function normaliseSuspension(raw: any): ProviderSuspension | null {
  const s = raw?.activeSuspension ?? raw?.active_suspension ?? raw?.suspension ?? null
  if (!s) return null
  return {
    triggerType:       s.triggerType ?? s.trigger_type ?? s.trigger ?? null,
    reason:            s.reason ?? null,
    suspendedAt:       s.suspendedAt ?? s.suspended_at ?? s.createdAt ?? s.created_at ?? null,
    cancellationCount: s.cancellationCount ?? s.cancellation_count ?? null,
  }
}

export interface PlatformUser {
  id: string
  fullName: string
  phone: string
  email: string | null
  status: string
  createdAt: string
  roles: string[]
  // Whether the user finished the full registration/onboarding flow.
  // true = completed, false = still incomplete, null = backend hasn't shipped
  // this field yet (column degrades to "—"). See docs/backend-requests.md §4.
  registrationComplete: boolean | null
  registrationCompletedAt: string | null
  client: {
    id: string
    loyaltyPointsBalance: number
    preferredPaymentMethod: string | null
    kycStatus: 'not_started' | 'pending_review' | 'verified' | 'rejected' | string
    ghanaCardImageUrl: string | null
    ghanaCardVerified: boolean
    kycSubmittedAt: string | null
    kycReviewedAt: string | null
    kycRejectionReason: string | null
  } | null
  driver: {
    id: string
    verificationStatus: string
    onlineStatus: string
    vehicleMake: string | null
    vehicleModel: string | null
    vehicleYear: number | null
    vehiclePlate: string | null
    vehicleColor: string | null
    licenceNumber: string | null
    licenceExpiry: string | null
    payoutPreference: string | null
    payoutMethod: string | null
    payoutLocked: boolean
    avgRating: number | null
    ratingCount: number
    completedRidesCount: number
    cancellationCount30d: number
    suspension: ProviderSuspension | null
  } | null
  artisan: {
    id: string
    verificationStatus: string
    onlineStatus: string
    displayName: string | null
    businessName: string | null
    categories: string[]
    serviceRadius: number | null
    shopCapacity: string | null
    maxConcurrentJobs: number | null
    payoutPreference: string | null
    payoutMethod: string | null
    payoutLocked: boolean
    avgRating: number | null
    ratingCount: number
    completedJobsCount: number
    cancellationCount30d: number
    suspension: ProviderSuspension | null
  } | null
}

export interface UserListResponse {
  items: PlatformUser[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export async function listUsers(params?: {
  role?: string
  status?: string
  search?: string
  page?: number
  limit?: number
}): Promise<UserListResponse> {
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
  ).toString() : ''
  const raw = await api.get<any>(`/admin/users${qs}`)
  return { ...raw, items: (raw.items ?? []).map(normalisePlatformUser) }
}

function normalisePlatformUser(raw: any): PlatformUser {
  const c = raw.client ?? null
  const d = raw.driver ?? null
  const a = raw.artisan ?? null
  return {
    ...raw,
    client: c ? {
      id:                     c.id,
      loyaltyPointsBalance:   Number(c.loyaltyPointsBalance ?? c.loyalty_points_balance ?? 0),
      preferredPaymentMethod: c.preferredPaymentMethod ?? c.preferred_payment_method ?? null,
      kycStatus:              c.kycStatus ?? c.kyc_status ?? 'not_started',
      ghanaCardImageUrl:      c.ghanaCardImageUrl ?? c.ghana_card_image_url ?? null,
      ghanaCardVerified:      Boolean(c.ghanaCardVerified ?? c.ghana_card_verified ?? false),
      kycSubmittedAt:         c.kycSubmittedAt ?? c.kyc_submitted_at ?? null,
      kycReviewedAt:          c.kycReviewedAt ?? c.kyc_reviewed_at ?? null,
      kycRejectionReason:     c.kycRejectionReason ?? c.kyc_rejection_reason ?? null,
    } : null,
    driver: d ? {
      id:                  d.id,
      verificationStatus:  d.verificationStatus ?? d.verification_status ?? 'unverified',
      onlineStatus:        d.onlineStatus ?? d.online_status ?? 'offline',
      vehicleMake:         d.vehicleMake ?? d.vehicle?.make ?? null,
      vehicleModel:        d.vehicleModel ?? d.vehicle?.model ?? null,
      vehicleYear:         d.vehicleYear ?? d.vehicle_year ?? d.vehicle?.year ?? null,
      vehiclePlate:        d.vehiclePlate ?? d.vehicle?.plate ?? d.vehicle?.licensePlate ?? null,
      vehicleColor:        d.vehicleColor ?? d.vehicle?.color ?? null,
      licenceNumber:       d.licenceNumber ?? d.licence_number ?? null,
      licenceExpiry:       d.licenceExpiry ?? d.licence_expiry ?? null,
      payoutPreference:    d.payoutPreference ?? d.payout_preference ?? null,
      payoutMethod:        d.payoutMethod ?? d.payout_method ?? null,
      payoutLocked:        Boolean(d.payoutLocked ?? d.payout_locked ?? false),
      avgRating:           d.avgRating ?? d.avg_rating ?? null,
      ratingCount:         Number(d.ratingCount ?? d.rating_count ?? 0),
      completedRidesCount: Number(d.completedRidesCount ?? d.completed_rides_count ?? d._count?.completedRides ?? 0),
      cancellationCount30d: Number(d.cancellationCount30d ?? d.cancellation_count_30d ?? 0),
      suspension:          normaliseSuspension(d),
    } : null,
    artisan: a ? {
      id:                  a.id,
      verificationStatus:  a.verificationStatus ?? a.verification_status ?? 'unverified',
      onlineStatus:        a.onlineStatus ?? a.online_status ?? 'offline',
      displayName:         a.displayName ?? a.display_name ?? null,
      businessName:        a.businessName ?? a.business_name ?? null,
      categories:          Array.isArray(a.categories) ? a.categories.map((c: any) => typeof c === 'string' ? c : (c.name ?? '')) : [],
      serviceRadius:       a.serviceRadius != null ? Number(a.serviceRadius) : a.service_radius_km != null ? Number(a.service_radius_km) : null,
      shopCapacity:        a.shopCapacity ?? a.shop_capacity ?? null,
      maxConcurrentJobs:   a.maxConcurrentJobs != null ? Number(a.maxConcurrentJobs) : a.max_concurrent_jobs != null ? Number(a.max_concurrent_jobs) : null,
      payoutPreference:    a.payoutPreference ?? a.payout_preference ?? null,
      payoutMethod:        a.payoutMethod ?? a.payout_method ?? null,
      payoutLocked:        Boolean(a.payoutLocked ?? a.payout_locked ?? false),
      avgRating:           a.avgRating ?? a.avg_rating ?? null,
      ratingCount:         Number(a.ratingCount ?? a.rating_count ?? 0),
      completedJobsCount:  Number(a.completedJobsCount ?? a.completed_jobs_count ?? a._count?.completedJobs ?? 0),
      cancellationCount30d: Number(a.cancellationCount30d ?? a.cancellation_count_30d ?? 0),
      suspension:          normaliseSuspension(a),
    } : null,
  }
}

export async function getUser(userId: string): Promise<PlatformUser> {
  const raw = await api.get<any>(`/admin/users/${userId}`)
  return normalisePlatformUser(raw)
}

export function suspendUser(userId: string, reason: string) {
  return api.patch(`/admin/users/${userId}/suspend`, { reason })
}

export function banUser(userId: string, reason: string) {
  return api.patch(`/admin/users/${userId}/ban`, { reason })
}

// Soft-delete a user. Different from Ban: non-punitive, ops_admin can action,
// covers housekeeping (duplicates, test accounts) + user-requested removal.
// Backend still enforces the no-outstanding-clawbacks check (PRD edge case #51).
// 90-day retention applies — purge happens via nightly cron.
export function deleteUser(userId: string, reason: string) {
  return api.patch<PlatformUser>(`/admin/users/${userId}/delete`, { reason })
}

export function reinstateUser(userId: string, reason?: string) {
  return api.patch<PlatformUser>(`/admin/users/${userId}`, { status: 'active', ...(reason ? { reason } : {}) })
}

// Revokes every refresh token for the user, ending any active session on every device.
// Used to unblock a provider/client who can't access the device that's holding the active
// session (lost phone, ported number) — admin verifies identity manually, then calls this.
export function forceLogoutUser(userId: string, reason: string) {
  return api.post(`/admin/users/${userId}/force-logout`, { reason })
}

export function updateUser(userId: string, data: { fullName?: string; email?: string }) {
  return api.patch<PlatformUser>(`/admin/users/${userId}`, data)
}

export function createUser(data: {
  fullName: string
  phone: string
  email?: string
  role: 'client' | 'driver' | 'artisan'
}) {
  return api.post<PlatformUser>('/admin/users', data)
}

export function triggerReverification(userId: string) {
  return api.post(`/admin/users/${userId}/reverification`, {})
}

export function unlockPayoutMethod(userId: string, reason?: string) {
  return api.post(`/admin/users/${userId}/unlock-payout-method`, reason ? { reason } : {})
}

export interface UserProviderDocument {
  id: string
  documentType: string
  label: string           // human-readable, derived client-side
  fileUrl: string
  mimeType: string | null
  status: 'uploaded' | 'pending_review' | 'approved' | 'rejected' | 'confirmed'
  rejectionReason: string | null
  expiresAt: string | null
  version: number
  isCurrent: boolean
  createdAt: string
}

export interface UserProviderGroup {
  providerId: string
  providerType: 'driver' | 'artisan'
  documents: UserProviderDocument[]
}

export interface UserDocumentsResponse {
  providers: UserProviderGroup[]
}

function parseDoc(d: any): UserProviderDocument {
  const mimeType = d.mimeType ?? d.mime_type ?? null
  const rawFileUrl = d.fileUrl ?? d.file_url ?? ''
  return {
    id:              d.id,
    documentType:    d.documentType ?? d.document_type ?? '',
    label:           DOC_TYPE_LABELS[d.documentType ?? d.document_type ?? '']
                       ?? (d.documentType ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    fileUrl:         resolveCloudinaryUrl(rawFileUrl, mimeType),
    mimeType,
    status:          d.status ?? 'uploaded',
    rejectionReason: d.rejectionReason ?? d.rejection_reason ?? null,
    expiresAt:       d.expiresAt ?? d.expires_at ?? null,
    version:         Number(d.version ?? 1),
    isCurrent:       Boolean(d.isCurrent ?? d.is_current ?? true),
    createdAt:       d.createdAt ?? d.created_at ?? '',
  }
}

export async function getProviderDocuments(userId: string): Promise<UserDocumentsResponse> {
  const raw = await api.get<any>(`/admin/users/${userId}/documents`)

  // New shape: { providers: [{ providerId, providerType, documents: [] }] }
  if (Array.isArray(raw.providers)) {
    return {
      providers: raw.providers.map((p: any) => ({
        providerId:   p.providerId,
        providerType: p.providerType,
        documents:    Array.isArray(p.documents) ? p.documents.map(parseDoc) : [],
      })),
    }
  }

  // Fallback: legacy shape { providerId, providerType, documents: [] }
  const docs: any[] = Array.isArray(raw.documents) ? raw.documents : []
  return {
    providers: raw.providerId ? [{
      providerId:   raw.providerId,
      providerType: raw.providerType,
      documents:    docs.map(parseDoc),
    }] : [],
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
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
  ).toString() : ''
  return api.get<AuditLogResponse>(`/admin/audit-logs${qs}`)
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
  data: { role?: Role; regionId?: string; permissions?: Permission[] },
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

export function deleteAdmin(adminId: string) {
  return api.delete(`/admin/admins/${adminId}`)
}

// ── Announcements ─────────────────────────────────────────────────────────────

export type AnnouncementTopic = 'all_users' | 'clients' | 'drivers' | 'artisans'

export function sendAnnouncement(title: string, body: string, topic: AnnouncementTopic) {
  // Backend expects `targetAudience` with `all` (not `all_users`) for everyone.
  const targetAudience = topic === 'all_users' ? 'all' : topic
  return api.post('/admin/announcements', { title, body, targetAudience })
}

// ── Analytics chart endpoints ─────────────────────────────────────────────────

export interface RideStatusBreakdown {
  completed: number
  cancelled: number
  disputed: number
  inProgress: number
}
export async function getRideStatusReport(params?: { from?: string; to?: string }): Promise<RideStatusBreakdown> {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
  const raw = await api.get<any>(`/admin/reports/rides/status${qs}`)
  return {
    completed:  raw?.completed   ?? 0,
    cancelled:  raw?.cancelled   ?? 0,
    disputed:   raw?.disputed    ?? 0,
    inProgress: raw?.inProgress  ?? raw?.in_progress ?? 0,
  }
}

export interface JobCategoryCount {
  category: string
  jobs: number
}
export async function getJobCategoryReport(params?: { from?: string; to?: string }): Promise<JobCategoryCount[]> {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
  const raw = await api.get<any>(`/admin/reports/jobs/categories${qs}`)
  const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.categories) ? raw.categories : Array.isArray(raw?.items) ? raw.items : []
  return list.map(d => ({
    category: d.category ?? d.name ?? '',
    jobs:     d.jobs ?? d.count ?? d.total ?? 0,
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
export async function getPaymentReport(params?: { from?: string; to?: string }): Promise<PaymentReport> {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
  const raw = await api.get<any>(`/admin/reports/payments${qs}`)
  const methods: any[] = Array.isArray(raw?.methods) ? raw.methods : []
  const dailyRates: any[] = Array.isArray(raw?.dailyRates) ? raw.dailyRates : Array.isArray(raw?.daily_rates) ? raw.daily_rates : []
  return {
    methods: methods.map(m => ({
      name:    m.name ?? m.method ?? '',
      percent: m.percent ?? m.share ?? m.percentage ?? 0,
    })),
    dailyRates: dailyRates.map(d => ({
      date:        d.date ?? '',
      successRate: d.successRate ?? d.success_rate ?? 0,
      failureRate: d.failureRate ?? d.failure_rate ?? 0,
    })),
  }
}

export interface DisputeRatePoint {
  date: string
  rate: number
}
export async function getDisputeRateReport(params?: { from?: string; to?: string }): Promise<DisputeRatePoint[]> {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
  const raw = await api.get<any>(`/admin/reports/disputes/rate${qs}`)
  const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.points) ? raw.points : Array.isArray(raw?.items) ? raw.items : []
  return list.map(d => ({
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

export async function getRecentActivity(limit = 10): Promise<ActivityItem[]> {
  const raw = await api.get<any>(`/admin/activity?limit=${limit}`)
  const arr: any[] = Array.isArray(raw) ? raw : (raw?.items ?? [])
  return arr.filter((r: any) => r?.id).map((r: any): ActivityItem => ({
    id:                 r.id,
    eventType:          r.eventType ?? r.event_type ?? r.type ?? 'unknown',
    actorName:          r.actorName ?? r.actor_name ?? r.userName ?? r.user_name ?? r.fullName ?? r.full_name ?? r.actor?.fullName ?? r.actor?.name ?? r.user?.fullName ?? r.user?.full_name ?? null,
    actorRole:          r.actorRole ?? r.actor_role ?? r.role ?? 'system',
    secondaryActorName: r.secondaryActorName ?? r.secondary_actor_name ?? null,
    description:        r.summary ?? r.description ?? '',
    amountPesewas:      r.amountPesewas ?? r.amount_pesewas ?? null,
    bookingId:          r.bookingId ?? r.booking_id ?? r.rideId ?? r.ride_id ?? r.jobId ?? r.job_id ?? null,
    bookingType:        r.bookingType ?? r.booking_type ?? null,
    occurredAt:         r.occurredAt ?? r.occurred_at ?? r.createdAt ?? '',
  }))
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
    ...(data.highBidFlagPesewas != null && { highBidFlagPesewas: data.highBidFlagPesewas }),
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
  }>,
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
export function deleteCategory(
  categoryId: string,
  opts: { reason: string; force?: boolean },
) {
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
    id:                String(raw.id ?? ''),
    name:              raw.name ?? '',
    slug:              raw.slug ?? '',
    description:       raw.description ?? null,
    baseFarePesewas:   Number(raw.baseFarePesewas    ?? raw.base_fare_pesewas    ?? 0),
    perKmPesewas:      Number(raw.perKmPesewas        ?? raw.per_km_pesewas       ?? 0),
    perMinPesewas:     Number(raw.perMinPesewas       ?? raw.per_min_pesewas      ?? 0),
    minimumFarePesewas:Number(raw.minimumFarePesewas  ?? raw.minimum_fare_pesewas ?? 0),
    capacityPersons:   Number(raw.capacityPersons     ?? raw.capacity_persons     ?? 4),
    iconUrl:           raw.iconUrl ?? raw.icon_url ?? null,
    isActive:          Boolean(raw.isActive ?? raw.is_active ?? false),
    sortOrder:         Number(raw.sortOrder ?? raw.sort_order ?? 0),
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
    ...(data.capacityPersons != null && { capacityPersons: data.capacityPersons }),
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
  data: Partial<RideCategoryInput & { isActive: boolean }>,
): Promise<RideCategory> {
  const raw = await api.patch<any>(`/admin/ride-categories/${id}`, data)
  return normaliseRideCategory(raw?.data ?? raw)
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
    id:              raw.id != null ? String(raw.id) : null,
    status:          (raw.status ?? 'pending') as DriverRideCategoryStatus,
    rejectionReason: raw.rejectionReason ?? raw.rejection_reason ?? null,
    reviewedAt:      raw.reviewedAt ?? raw.reviewed_at ?? null,
    rideCategory: {
      id:       String(rc.id ?? ''),
      name:     rc.name ?? '',
      slug:     rc.slug ?? '',
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
  reason?: string,
): Promise<DriverRideCategoryReviewResult> {
  const raw = await api.patch<any>(
    `/admin/drivers/${driverId}/ride-categories/${rideCategoryId}`,
    { action, ...(action === 'reject' && reason ? { reason } : {}) },
  )
  const body = raw?.data ?? raw
  return {
    driverId:       body?.driverId ?? body?.driver_id ?? driverId,
    rideCategoryId: body?.rideCategoryId ?? body?.ride_category_id ?? rideCategoryId,
    status:         (body?.status ?? (action === 'approve' ? 'approved' : 'rejected')) as DriverRideCategoryStatus,
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

export async function getUnassignedJobs(): Promise<{ total: number; jobs: UnassignedJob[] }> {
  const raw = await api.get<any>('/admin/jobs/unassigned')
  const arr: any[] = Array.isArray(raw) ? raw : (raw?.jobs ?? [])
  return {
    total: raw?.total ?? arr.length,
    jobs: arr.map(j => ({
      id: j.id,
      status: j.status ?? 'queued',
      description: j.description ?? '',
      addressText: j.addressText ?? j.address_text ?? null,
      createdAt: j.createdAt ?? j.created_at ?? '',
      scheduledFor: j.scheduledFor ?? j.scheduled_for ?? null,
      categoryId: j.categoryId ?? j.category?.id ?? '',
      categoryName: j.categoryName ?? j.category?.name ?? '—',
      minBidPesewas: j.minBidPesewas ?? j.category?.minBidPesewas ?? 0,
      clientName: j.clientName ?? j.client?.user?.fullName ?? null,
      clientPhone: j.clientPhone ?? j.client?.user?.phone ?? null,
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
  userId: string
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
  return raw.map(a => ({
    id: a.id,
    userId: a.userId,
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
  const arr: any[] = Array.isArray(raw) ? raw : (raw as any)?.items ?? []
  return arr.map(b => ({
    id: b.id,
    jobId: b.jobId ?? b.job_id ?? '',
    artisanId: b.artisanId ?? b.artisan_id ?? '',
    artisanName: b.artisanName ?? b.artisan_name ?? b.artisan?.fullName ?? '—',
    clientName: b.clientName ?? b.client_name ?? b.job?.clientName ?? '—',
    categoryName: b.categoryName ?? b.category_name ?? b.job?.categoryName ?? '—',
    amountPesewas: b.amountPesewas ?? b.amount_pesewas ?? 0,
    flagThresholdPesewas: b.flagThresholdPesewas ?? b.flag_threshold_pesewas ?? b.highBidFlagPesewas ?? 500000,
    submittedAt: b.submittedAt ?? b.submitted_at ?? b.createdAt ?? '',
    status: 'admin_review' as const,
  }))
}

export function reviewHighBid(
  bidId: string,
  decision: 'approved' | 'rejected',
  reason: string,
) {
  return api.patch(`/admin/bids/${bidId}/review`, { decision, reason })
}

export function unexpireBid(bidId: string) {
  return api.patch(`/admin/bids/${bidId}/unexpire`, {})
}

// ── Rides (admin listing) ─────────────────────────────────────────────────────

export interface AdminRide {
  id: string
  clientName: string | null
  driverName: string | null
  pickupAddress: string
  dropoffAddress: string
  status: string
  farePesewas: number
  paymentMethod: string | null
  paymentStatus: string | null
  createdAt: string
}

export interface AdminRideListResponse {
  items: AdminRide[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export function listRides(params?: {
  status?: string
  search?: string
  page?: number
  limit?: number
  from?: string
  to?: string
}) {
  const qs = params
    ? '?' + new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
      ).toString()
    : ''
  return api.get<AdminRideListResponse>(`/admin/rides${qs}`)
}

export interface RideDetail {
  id: string
  status: string
  pickupAddress: string | null
  dropoffAddress: string | null
  estimatedFarePesewas: number | null
  finalFarePesewas: number | null
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
  client: { id: string; user: { fullName: string; phone: string } } | null
  driver: {
    id: string
    vehicleMake: string | null
    vehicleModel: string | null
    vehiclePlate: string | null
    vehicleColor: string | null
    user: { fullName: string; phone: string }
  } | null
}

export function getRideDetail(rideId: string) {
  return api.get<RideDetail>(`/admin/rides/${rideId}`)
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
    ? '?' + new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
      ).toString()
    : ''
  const raw = await api.get<any>(`/admin/jobs${qs}`)
  return {
    total: raw.total ?? 0,
    page: raw.page ?? 1,
    totalPages: raw.totalPages ?? 1,
    items: (raw.items ?? []).map((j: any): AdminJob => ({
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
    })),
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
  category: { id: string; name: string; minBidPesewas: number; highBidFlagPesewas: number }
  client: { id: string; name: string | null; phone: string | null }
  artisan: { id: string; name: string | null; phone: string | null; verificationStatus: string } | null
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
    paymentStatus:     raw.paymentStatus ?? raw.payment_status ?? null,
    paymentMethod:     raw.paymentMethod ?? raw.payment_method ?? null,
    amountPaidPesewas: raw.amountPaidPesewas ?? raw.amount_paid_pesewas ?? null,
    paidAt:            raw.paidAt ?? raw.paid_at ?? null,
    client: {
      id: raw.client?.id ?? '',
      name: raw.client?.user?.fullName ?? raw.client?.displayName ?? null,
      phone: raw.client?.user?.phone ?? null,
    },
    artisan: raw.artisan ? {
      id: raw.artisan.id,
      name: raw.artisan.user?.fullName ?? raw.artisan.displayName ?? null,
      phone: raw.artisan.user?.phone ?? null,
      verificationStatus: raw.artisan.verificationStatus ?? 'unknown',
    } : null,
    bids: (raw.bids ?? []).map((b: any): JobBid => ({
      id: b.id,
      amountPesewas: b.amountPesewas,
      message: b.message ?? null,
      status: b.status,
      expiresAt: b.expiresAt,
      createdAt: b.createdAt,
      artisanId: b.artisan?.id ?? '',
      artisanName: b.artisan?.user?.fullName ?? null,
      artisanPhone: b.artisan?.user?.phone ?? null,
    })),
  }
}

export function lockJob(jobId: string) {
  return api.post<{ locked: boolean; expiresAt: string }>(`/admin/jobs/${jobId}/lock`, {})
}

export function assignJob(jobId: string, data: { artisanId: string; agreedPricePesewas?: number }) {
  return api.post<{ assigned: boolean; artisanId: string; agreedPricePesewas: number; assignedAt: string }>(
    `/admin/jobs/${jobId}/assign`,
    data,
  )
}

export function forceCompleteJob(jobId: string, reason: string) {
  return api.patch<{ forced: boolean }>(`/admin/jobs/${jobId}/force-complete`, { reason })
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

export function getEmergencyAlerts() {
  return api.get<EmergencyAlert[]>('/admin/emergency')
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
  body: { note: string; contactMethod: WelfareContactMethod },
) {
  return api.patch<{ id: string; isResolved: true; resolvedAt: string }>(
    `/admin/welfare-checks/${welfareCheckId}/resolve`,
    body,
  )
}

// ── Transactions ─────────────────────────────────────────────────────────────

export type TransactionType = 'collection' | 'payout' | 'refund' | 'clawback' | 'tip'

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
    ? '?' + new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
      ).toString()
    : ''
  return api.get<TransactionListResponse>(`/admin/payments/transactions${qs}`)
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
    ? '?' + new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
      ).toString()
    : ''
  const raw = await api.get<any>(`/admin/payouts/batches${qs}`)
  const items: BatchPayoutRun[] = (raw?.items ?? []).map((b: any): BatchPayoutRun => ({
    id:            b.id,
    date:          b.date ?? b.runDate ?? b.run_date ?? '',
    primaryRun:    b.primaryRun ?? b.primary_run ?? '',
    status:        b.status ?? 'pending',
    providerCount: b.providerCount ?? b.provider_count ?? 0,
    totalPesewas:  b.totalPesewas ?? b.total_pesewas ?? 0,
    failureReason: b.failureReason ?? b.failure_reason ?? null,
    retries: (b.retries ?? []).map((r: any): BatchPayoutRetry => ({
      time:   r.time ?? r.at ?? '',
      status: r.status ?? '',
    })),
  }))
  return {
    items,
    total:      raw?.total ?? items.length,
    page:       raw?.page ?? 1,
    limit:      raw?.limit ?? items.length,
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
  // The provider's user-account id. `providerId` is the drivers/artisans row id,
  // a different namespace that /admin/users/:id does NOT accept — SMS reminders
  // must target this userId instead. May be empty until the backend includes it
  // on the clawbacks response (see docs/backend-requests.md).
  userId: string
  source: string | null
  amountPesewas: number
  paidAmountPesewas: number
  outstandingPesewas: number
  originalDisputeId: string | null
  initiatedAt: string
  daysOutstanding: number
  status: string
}

export interface ClawbackListResponse {
  items: AdminClawback[]
  total: number
  totalOutstandingPesewas: number
}

export async function listClawbacks(): Promise<ClawbackListResponse> {
  const raw = await api.get<any>('/admin/clawbacks')
  const items: AdminClawback[] = (raw?.items ?? []).map((c: any): AdminClawback => ({
    id:                 c.id,
    providerName:       c.providerName ?? c.provider_name ?? null,
    providerId:         c.providerId ?? c.provider_id ?? '',
    userId:             c.userId ?? c.user_id ?? '',
    source:             c.source ?? null,
    amountPesewas:      c.amountPesewas ?? c.amount_pesewas ?? 0,
    paidAmountPesewas:  c.paidAmountPesewas ?? c.paid_amount_pesewas ?? 0,
    outstandingPesewas: c.outstandingPesewas ?? c.outstanding_pesewas ?? 0,
    originalDisputeId:  c.originalDisputeId ?? c.original_dispute_id ?? null,
    initiatedAt:        c.initiatedAt ?? c.initiated_at ?? c.createdAt ?? '',
    daysOutstanding:    c.daysOutstanding ?? c.days_outstanding ?? 0,
    status:             c.status ?? 'outstanding',
  }))
  return {
    items,
    total: raw?.total ?? items.length,
    totalOutstandingPesewas: raw?.totalOutstandingPesewas ?? raw?.total_outstanding_pesewas ?? 0,
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
    ? '?' + new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
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
  reason?: string   // present when failed > 0 — the provider's rejection reason
}

export function sendSms(audience: SmsAudience, message: string) {
  return api.post<SmsResult>('/api/sms', { audience, message }, { localRoute: true })
}

// Sends an SMS to a single user. The recipient's phone is resolved server-side
// from their userId, so the raw number is never handled by the browser.
export function sendSmsToUser(userId: string, message: string) {
  return api.post<SmsResult>('/api/sms', { userId, message }, { localRoute: true })
}

// ── Announcement History ──────────────────────────────────────────────────────

export interface AnnouncementHistoryItem {
  id: string
  title: string
  body: string
  audience: string
  channel: string
  sentAt: string
  sentBy: string | null
  delivered: number
  opened: number
}

export function getAnnouncementHistory() {
  return api.get<AnnouncementHistoryItem[]>('/admin/announcements/history')
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
// Backend: GET/POST /admin/session-recovery-requests*, POST /admin/users/:id/sessions/revoke
// Source of truth: apps/api/src/modules/admin/admin.controller.ts (myshop monorepo).

export type SessionRecoveryStatus = 'pending' | 'resolved' | 'expired'
export type SessionRole = 'client' | 'driver' | 'artisan'
export type SessionRecoveryAction = 'revoked' | 'dismissed'

export interface SessionRecoveryRequest {
  id: string
  /** May be null when no User row matches the request phone. */
  userId: string | null
  /** Resolved by request.currentSessionRole or, if absent, the user's profile. */
  userType: SessionRole | null
  fullName: string | null
  phone: string
  requestingDeviceId: string
  requestingIp: string | null
  currentSessionRole: SessionRole | null
  currentSessionDeviceId: string | null
  currentSessionDeviceInfo: string | null
  currentSessionLoggedInAt: string | null
  status: SessionRecoveryStatus
  resolvedAt: string | null
  resolvedByAdminId: string | null
  resolvedAction: SessionRecoveryAction | null
  resolutionReason: string | null
  createdAt: string
}

export interface SessionRecoveryRequestDetail extends SessionRecoveryRequest {
  identity: {
    ghanaCardImageUrl: string | null
    ghanaCardVerified: boolean
    registeredAt: string
    vehicle: { make: string | null; model: string | null; plate: string | null; color: string | null } | null
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
    ? '?' + new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]))
      ).toString()
    : ''
  return api.get<SessionRecoveryListResponse>(`/admin/session-recovery-requests${qs}`)
}

export function getSessionRecoveryRequestDetail(requestId: string) {
  return api.get<SessionRecoveryRequestDetail>(`/admin/session-recovery-requests/${requestId}`)
}

export function dismissSessionRecoveryRequest(requestId: string, reason?: string) {
  return api.post<{ success: true }>(`/admin/session-recovery-requests/${requestId}/resolve`,
    reason ? { reason } : {},
  )
}

/**
 * Approves the recovery — revokes the old device's session for the given role.
 * Pass `recoveryRequestId` to also mark that request resolved with
 * `resolvedAction='revoked'` in one call (backend handles both atomically).
 */
export function revokeUserSession(
  userId: string,
  body: { role: SessionRole; reason?: string; recoveryRequestId?: string },
) {
  return api.post<{ success: true }>(`/admin/users/${userId}/sessions/revoke`, body)
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
    ? '?' + new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]))
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
    ? '?' + new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
      ).toString()
    : ''
  return api.get<PromoRedemptionListResponse>(`/admin/promos/${promoId}/redemptions${qs}`)
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
// User-level referrals (one per phone identity, shared across client/driver/artisan
// roles). The referrer's reward fires on the referee's first completed activity in
// ANY role. Reward amount = config `referral_bonus_pesewas`, credited as loyalty
// points at `loyalty_ghs_per_point_pesewas`. All money is integer PESEWAS on the wire.
// Endpoints (see docs/backend-requests.md §7):
//   GET   /admin/referrals                 (perm view_referrals)   — paginated ledger
//   GET   /admin/referrals/metrics         (perm view_referrals)   — KPI cards + byDay trend
//   GET   /admin/users/:userId/referrals   (perm view_referrals)   — per-user funnel
//   PATCH /admin/referrals/:id/void        (perm manage_referrals) — reverse an awarded bonus
//   POST  /admin/referrals/:id/award       (perm manage_referrals) — manually award a pending one

export type ReferralStatusFilter = 'pending' | 'awarded' | 'all'

// A user reference embedded in a referral row. `roles` reflects every role the
// single user identity holds (e.g. ['client', 'driver']).
export interface ReferralUserRef {
  userId: string
  fullName: string | null
  phone: string | null         // backend returns normalised/masked
  roles: string[]
}

export interface ReferralListItem {
  id: string
  referralCode: string
  referrer: ReferralUserRef
  referee: ReferralUserRef
  firstBookingCompleted: boolean
  bonusAwarded: boolean
  bonusPoints: number | null   // null until awarded (or after a void)
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
  const roles = Array.isArray(r.roles)
    ? r.roles.map((x: any) => (typeof x === 'string' ? x : x?.name ?? '')).filter(Boolean)
    : []
  return {
    userId:   r.userId ?? r.user_id ?? r.id ?? '',
    fullName: r.fullName ?? r.full_name ?? r.name ?? null,
    phone:    r.phone ?? null,
    roles,
  }
}

function normaliseReferralItem(raw: any): ReferralListItem {
  return {
    id:                    String(raw.id ?? ''),
    referralCode:          raw.referralCode ?? raw.referral_code ?? '',
    referrer:              normaliseReferralUserRef(raw.referrer),
    referee:               normaliseReferralUserRef(raw.referee),
    firstBookingCompleted: Boolean(raw.firstBookingCompleted ?? raw.first_booking_completed ?? false),
    bonusAwarded:          Boolean(raw.bonusAwarded ?? raw.bonus_awarded ?? false),
    bonusPoints:           raw.bonusPoints ?? raw.bonus_points ?? null,
    createdAt:             raw.createdAt ?? raw.created_at ?? '',
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
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]))
  ).toString() : ''
  const raw = await api.get<any>(`/admin/referrals${qs}`)
  const list = Array.isArray(raw) ? raw : (raw.items ?? [])
  return {
    items: list.map(normaliseReferralItem),
    total: Number(raw.total ?? list.length),
    page:  Number(raw.page ?? params?.page ?? 1),
    limit: Number(raw.limit ?? params?.limit ?? 20),
  }
}

export interface ReferralByDayPoint {
  date: string       // yyyy-mm-dd
  created: number
  awarded: number
}

export interface ReferralMetrics {
  totalReferrals: number
  awardedCount: number
  pendingCount: number
  conversionRatePct: number          // awarded / total, 0–100
  totalBonusPointsAwarded: number
  totalBonusValuePesewas: number
  byDay: ReferralByDayPoint[]
}

export async function getReferralMetrics(params?: { from?: string; to?: string }): Promise<ReferralMetrics> {
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]))
  ).toString() : ''
  const raw = await api.get<any>(`/admin/referrals/metrics${qs}`)
  const byDayRaw: any[] = Array.isArray(raw?.byDay) ? raw.byDay : Array.isArray(raw?.by_day) ? raw.by_day : []
  return {
    totalReferrals:          Number(raw?.totalReferrals          ?? raw?.total_referrals            ?? 0),
    awardedCount:            Number(raw?.awardedCount            ?? raw?.awarded_count              ?? 0),
    pendingCount:            Number(raw?.pendingCount            ?? raw?.pending_count              ?? 0),
    conversionRatePct:       Number(raw?.conversionRatePct       ?? raw?.conversion_rate_pct        ?? 0),
    totalBonusPointsAwarded: Number(raw?.totalBonusPointsAwarded ?? raw?.total_bonus_points_awarded ?? 0),
    totalBonusValuePesewas:  Number(raw?.totalBonusValuePesewas  ?? raw?.total_bonus_value_pesewas  ?? 0),
    byDay: byDayRaw.map(d => ({
      date:    d.date ?? '',
      created: Number(d.created ?? 0),
      awarded: Number(d.awarded ?? 0),
    })),
  }
}

export interface UserReferralFunnel {
  referralCode: string | null
  referralsMade: ReferralListItem[]
  referralReceived: ReferralListItem | null
  loyaltyPointsBalance: number
}

export async function getUserReferrals(userId: string): Promise<UserReferralFunnel> {
  const raw = await api.get<any>(`/admin/users/${userId}/referrals`)
  const made: any[] = Array.isArray(raw?.referralsMade) ? raw.referralsMade
    : Array.isArray(raw?.referrals_made) ? raw.referrals_made : []
  const received = raw?.referralReceived ?? raw?.referral_received ?? null
  return {
    referralCode:         raw?.referralCode ?? raw?.referral_code ?? null,
    referralsMade:        made.map(normaliseReferralItem),
    referralReceived:     received ? normaliseReferralItem(received) : null,
    loyaltyPointsBalance: Number(raw?.loyaltyPointsBalance ?? raw?.loyalty_points_balance ?? 0),
  }
}

// PATCH /admin/referrals/:id/void — reverse an awarded bonus. Deducts bonusPoints
// from the referrer's balance (floor 0), writes a compensating `adjusted` loyalty
// transaction, sets bonus_awarded=false. Idempotent: 409 if not awarded.
export function voidReferralBonus(referralId: string, reason: string) {
  return api.patch<ReferralListItem>(`/admin/referrals/${referralId}/void`, { reason })
}

// POST /admin/referrals/:id/award — manually award a still-pending referral,
// bypassing the first-activity check. Idempotent: 409 if already awarded.
export function awardReferral(referralId: string) {
  return api.post<ReferralListItem>(`/admin/referrals/${referralId}/award`, {})
}
