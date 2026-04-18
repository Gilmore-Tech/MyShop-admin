/**
 * Typed API methods for MyShop Admin Panel
 * All endpoints map directly to the NestJS backend (v1 prefix).
 */
import { api, AdminUser, setTokens, setAdminUser, clearTokens } from './api-client'

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
  paymentSuccessRatePct: number
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
    paymentSuccessRatePct: raw.paymentSuccessRatePct ?? raw.payment_success_rate_pct ?? 100,
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
  paymentSuccessRatePct: number
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
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
  const raw = await api.get<any>(`/admin/reports/revenue${qs}`)
  const periods: RevenueDataPoint[] = (raw.periods ?? raw.data ?? []).map((p: any) => ({
    period:               p.period               ?? p.date               ?? '',
    collectionsGhs:       p.collectionsGhs        ?? p.collections_ghs    ?? 0,
    commissionGhs:        p.commissionGhs         ?? p.commission_ghs     ?? 0,
    payoutsGhs:           p.payoutsGhs            ?? p.payouts_ghs        ?? 0,
    tipsGhs:              p.tipsGhs               ?? p.tips_ghs           ?? 0,
    totalPayments:        p.totalPayments         ?? p.total_payments     ?? 0,
    successfulPayments:   p.successfulPayments    ?? p.successful_payments ?? 0,
    paymentSuccessRatePct: p.paymentSuccessRatePct ?? p.payment_success_rate_pct ?? 100,
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

export function getProviderReport() {
  return api.get<ProviderReport>('/admin/reports/providers')
}

// ── Pilot Report ──────────────────────────────────────────────────────────────

export interface PilotMetric {
  label: string
  key: string
  target: number
  actual: number
  unit: string
}

export function getPilotReport() {
  return api.get<PilotMetric[]>('/admin/reports/pilot')
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

export function getLiveMapData() {
  return api.get<LiveMapMarker[]>('/admin/live-map')
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
}

export interface VerificationItem {
  provider_type: string
  provider_id: string
  provider_name: string | null
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
  return {
    id:               String(d.id ?? ''),
    type:             rawType,
    label:            d.label ?? docTypeLabel(rawType),
    status:           d.status ?? 'pending_review',
    file_url:         d.file_url ?? d.fileUrl ?? '',
    mime_type:        d.mime_type ?? d.mimeType ?? null,
    uploaded_at:      d.uploaded_at ?? d.uploadedAt ?? d.created_at ?? d.createdAt ?? '',
    expires_at:       d.expires_at ?? d.expiresAt ?? null,
    version:          Number(d.version ?? 1),
    rejection_reason: d.rejection_reason ?? d.rejectionReason ?? null,
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
    provider_name:  v.provider_name  ?? v.providerName  ?? null,
    docs_pending:   Number(v.docs_pending   ?? v.docsPending   ?? 0),
    docs_approved:  Number(v.docs_approved  ?? v.docsApproved  ?? 0),
    docs_rejected:  Number(v.docs_rejected  ?? v.docsRejected  ?? 0),
    total_docs:     Number(v.total_docs     ?? v.totalDocs     ?? rawDocs.length),
    first_upload_at: v.first_upload_at ?? v.firstUploadAt ?? v.createdAt ?? '',
    documents: rawDocs.map(normaliseDoc),
  }
}

export async function getVerificationQueue(): Promise<VerificationItem[]> {
  const raw = await api.get<any>('/admin/verifications')
  const arr: any[] = Array.isArray(raw) ? raw : (raw as any)?.items ?? []
  return arr.map(normaliseItem)
}

// ReviewVerificationDto: { providerType, action: 'approve'|'reject', reason (min 5) }
export function reviewVerification(
  providerId: string,
  providerType: string,
  action: 'approve' | 'reject',
  reason: string,
) {
  return api.patch(`/admin/verifications/${providerId}`, { providerType, action, reason })
}

// ReviewDocumentDto: { providerType, action: 'approve'|'reject', reason (required on reject) }
export function reviewDocument(
  documentId: string,
  providerType: string,
  action: 'approve' | 'reject',
  reason: string,
) {
  return api.patch(`/admin/verifications/documents/${documentId}`, { providerType, action, reason })
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

export function getDisputeDetail(disputeId: string) {
  return api.get(`/admin/disputes/${disputeId}`)
}

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

export interface PlatformUser {
  id: string
  fullName: string
  phone: string
  email: string | null
  status: string
  createdAt: string
  roles: string[]
  client: { id: string; loyaltyPointsBalance: number; preferredPaymentMethod: string | null } | null
  driver: { id: string; verificationStatus: string; onlineStatus: string } | null
  artisan: { id: string; verificationStatus: string; onlineStatus: string } | null
}

export interface UserListResponse {
  items: PlatformUser[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export function listUsers(params?: {
  role?: string
  status?: string
  search?: string
  page?: number
  limit?: number
}) {
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
  ).toString() : ''
  return api.get<UserListResponse>(`/admin/users${qs}`)
}

export function getUser(userId: string) {
  return api.get<PlatformUser>(`/admin/users/${userId}`)
}

export function suspendUser(userId: string, reason: string) {
  return api.patch(`/admin/users/${userId}/suspend`, { reason })
}

export function banUser(userId: string, reason: string) {
  return api.patch(`/admin/users/${userId}/ban`, { reason })
}

export function reinstateUser(userId: string, reason?: string) {
  return api.patch<PlatformUser>(`/admin/users/${userId}`, { status: 'active', ...(reason ? { reason } : {}) })
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

export interface UserDocumentsResponse {
  providerId: string | null
  providerType: 'driver' | 'artisan' | null
  documents: UserProviderDocument[]
}

export async function getProviderDocuments(userId: string): Promise<UserDocumentsResponse> {
  const raw = await api.get<any>(`/admin/users/${userId}/documents`)
  const docs: any[] = Array.isArray(raw.documents) ? raw.documents : []
  return {
    providerId:   raw.providerId   ?? null,
    providerType: raw.providerType ?? null,
    documents: docs.map(d => ({
      id:              d.id,
      documentType:    d.documentType ?? d.document_type ?? '',
      label:           DOC_TYPE_LABELS[d.documentType ?? d.document_type ?? '']
                         ?? (d.documentType ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      fileUrl:         d.fileUrl   ?? d.file_url   ?? '',
      mimeType:        d.mimeType  ?? d.mime_type  ?? null,
      status:          d.status    ?? 'uploaded',
      rejectionReason: d.rejectionReason ?? d.rejection_reason ?? null,
      expiresAt:       d.expiresAt ?? d.expires_at  ?? null,
      version:         Number(d.version ?? 1),
      isCurrent:       Boolean(d.isCurrent ?? d.is_current ?? true),
      createdAt:       d.createdAt ?? d.created_at ?? '',
    })),
  }
}

// ── Admin Account Management ──────────────────────────────────────────────────

export type AdminRole = 'super_admin' | 'regional_admin' | 'ops_admin' | 'support_agent'

export interface AdminAccount {
  id: string
  email: string
  fullName: string
  role: AdminRole
  regionScope: string | null
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

export function listAdmins() {
  return api.get<AdminAccount[]>('/admin/admins')
}

export function getAdmin(adminId: string) {
  return api.get<AdminAccount>(`/admin/admins/${adminId}`)
}

export function createAdmin(data: {
  email: string
  fullName: string
  role: AdminRole
  password: string
  regionScope?: string
}) {
  return api.post<AdminAccount>('/admin/admins', data)
}

export function reassignAdminRole(adminId: string, role: AdminRole, regionScope?: string) {
  return api.patch<AdminAccount>(`/admin/admins/${adminId}/role`, { role, regionScope })
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
  return api.post('/admin/announcements', { title, body, topic })
}

// ── Analytics chart endpoints ─────────────────────────────────────────────────

export interface RideStatusBreakdown {
  completed: number
  cancelled: number
  disputed: number
  inProgress: number
}
export function getRideStatusReport(params?: { from?: string; to?: string }) {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
  return api.get<RideStatusBreakdown>(`/admin/reports/rides/status${qs}`)
}

export interface JobCategoryCount {
  category: string
  jobs: number
}
export function getJobCategoryReport(params?: { from?: string; to?: string }) {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
  return api.get<JobCategoryCount[]>(`/admin/reports/jobs/categories${qs}`)
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
export function getPaymentReport(params?: { from?: string; to?: string }) {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
  return api.get<PaymentReport>(`/admin/reports/payments${qs}`)
}

export interface DisputeRatePoint {
  date: string
  rate: number
}
export function getDisputeRateReport(params?: { from?: string; to?: string }) {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
  return api.get<DisputeRatePoint[]>(`/admin/reports/disputes/rate${qs}`)
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
  description: string
  amountPesewas: number | null
  occurredAt: string
}

export function getRecentActivity(limit = 10) {
  return api.get<ActivityItem[]>(`/admin/activity?limit=${limit}`)
}

// ── Categories ────────────────────────────────────────────────────────────────

export interface Category {
  id: string
  parentId: string | null
  name: string
  slug: string
  iconUrl: string | null
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
}) {
  return api.post<Category>('/admin/categories', {
    name: data.name,
    slug: data.slug,
    minBidPesewas: data.minBidPesewas,
    ...(data.highBidFlagPesewas != null && { highBidFlagPesewas: data.highBidFlagPesewas }),
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
  }>,
) {
  return api.patch<Category>(`/admin/categories/${categoryId}`, data)
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
}

export async function searchArtisans(params: { categoryId?: string; q?: string; limit?: number }): Promise<ArtisanSearchResult[]> {
  const qs = new URLSearchParams()
  if (params.categoryId) qs.set('categoryId', params.categoryId)
  if (params.q) qs.set('q', params.q)
  if (params.limit) qs.set('limit', String(params.limit))
  const raw = await api.get<any[]>(`/admin/artisans/search?${qs}`)
  return Array.isArray(raw) ? raw : []
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
  paymentStatus: string
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
}) {
  const qs = params
    ? '?' + new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
      ).toString()
    : ''
  return api.get<AdminRideListResponse>(`/admin/rides${qs}`)
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
  createdAt: string
  lastActivityAt: string | null
  staleHours: number
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
      paymentStatus: j.paymentStatus ?? null,
      createdAt: j.createdAt,
      lastActivityAt: j.lastActivityAt ?? null,
      staleHours: j.hoursInactive ?? j.staleHours ?? 0,
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
}

export function getEmergencyAlerts() {
  return api.get<EmergencyAlert[]>('/admin/emergency')
}

export function acknowledgeEmergency(emergencyId: string) {
  return api.patch(`/admin/emergency/${emergencyId}/acknowledge`)
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

export function listTransactions(params?: {
  type?: string
  status?: string
  search?: string
  page?: number
  limit?: number
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

export function listBatchPayouts(params?: { page?: number; limit?: number }) {
  const qs = params
    ? '?' + new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
      ).toString()
    : ''
  return api.get<BatchPayoutListResponse>(`/admin/payouts/batches${qs}`)
}

export function forceBatchPayoutRun() {
  return api.post('/admin/payouts/batches/force', {})
}

// ── Clawbacks ─────────────────────────────────────────────────────────────────

export interface AdminClawback {
  id: string
  providerName: string | null
  providerId: string
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

export function listClawbacks() {
  return api.get<ClawbackListResponse>('/admin/clawbacks')
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

// ── Health ────────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: string
  database: string
  redis: string
}

export function getHealth() {
  return api.get<HealthStatus>('/health')
}
