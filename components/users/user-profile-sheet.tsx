'use client'

import { useState, useEffect, useCallback } from 'react'
import { Mail, Phone, Calendar, Star, Pencil, Check, X, Loader2, RotateCcw, ShieldOff, ShieldCheck, UserX, FileText, ExternalLink, CheckCircle, XCircle, ChevronDown, ChevronUp, Car, Tag, TrendingUp, XOctagon, IdCard, Lock, Unlock, LogOut, Trash2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/common/status-badge'
import { PdfViewer } from '@/components/common/pdf-viewer'
import { updateUser, reinstateUser, suspendUser, banUser, deleteUser, forceLogoutUser, getProviderDocuments, reviewVerification, reviewClientKyc, getUser, unlockPayoutMethod, liftVerificationSuspension, getDriverRideCategories, reviewDriverRideCategory, getRideCategories, type PlatformUser, type ProviderSuspension, type UserProviderDocument, type UserProviderGroup, type DriverRideCategory, type RideCategory } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VerifyClientKycDialog, clientKycBadge } from './verify-client-kyc-dialog'
import { useRole } from '@/hooks/use-role'

function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Human labels for the auto/manual suspension triggers the backend can emit.
// Unknown triggers fall back to the raw value (underscores → spaces) so a new
// backend trigger renders without a frontend change.
const SUSPENSION_TRIGGER_LABELS: Record<string, string> = {
  cancellation: 'Excess cancellations',
  rating: 'Low rating',
  background_check: 'Background check',
  manual: 'Manual (admin)',
}

// Shown inside a provider block when verificationStatus === 'suspended', so an
// admin sees WHY before lifting it. Degrades gracefully when the backend hasn't
// shipped suspension detail yet (see docs/backend-requests.md §5). When the admin
// holds the lift permission, an inline action sits next to the context so they
// can unblock without scrolling to Account Actions.
function SuspensionContext({ suspension, liveCancellations, canLift, onLift }: {
  suspension: ProviderSuspension | null
  liveCancellations: number
  canLift: boolean
  onLift: () => void
}) {
  const trigger = suspension?.triggerType ?? null
  const label = trigger ? (SUSPENSION_TRIGGER_LABELS[trigger] ?? trigger.replace(/_/g, ' ')) : null
  // Prefer the count captured at suspension time; fall back to the live 30-day
  // count when the trigger was a cancellation but no snapshot was provided.
  const count = suspension?.cancellationCount ?? (trigger === 'cancellation' ? liveCancellations : null)
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
        <ShieldOff className="h-3.5 w-3.5 shrink-0" />
        <span>{label ? `Suspended — ${label}` : 'Suspended'}</span>
        {trigger === 'cancellation' && count != null && (
          <span className="font-normal text-red-600">· {count} cancellations / 30 days</span>
        )}
      </div>
      {suspension?.reason
        ? <p className="text-[11px] text-red-700 leading-snug">{suspension.reason}</p>
        : <p className="text-[11px] text-red-500 italic">Reason unavailable — pending backend support.</p>}
      {suspension?.suspendedAt && (
        <p className="text-[10px] text-red-500">Suspended {formatDate(suspension.suspendedAt)}</p>
      )}
      {canLift && (
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center gap-1.5 h-7 mt-1 text-xs text-emerald-700 border-emerald-200 bg-white hover:bg-emerald-50"
          onClick={onLift}
        >
          <ShieldCheck className="h-3 w-3" /> Lift Suspension
        </Button>
      )}
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <Icon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-900 mt-0.5">{value}</p>
      </div>
    </div>
  )
}

function docStatusBadge(status: string) {
  if (status === 'approved' || status === 'confirmed')
    return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600"><CheckCircle className="h-3 w-3" />Approved</span>
  if (status === 'rejected')
    return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600"><XCircle className="h-3 w-3" />Rejected</span>
  if (status === 'pending_review')
    return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">Pending Review</span>
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Awaiting Upload</span>
}

function DocumentCard({ doc }: { doc: UserProviderDocument }) {
  const lower = doc.fileUrl.toLowerCase()
  const isPdf = doc.mimeType === 'application/pdf'
    || lower.includes('.pdf') || lower.includes('/raw/upload/')
  const isImage = !isPdf && (
    (doc.mimeType?.startsWith('image/') ?? false)
    || lower.match(/\.(jpe?g|png|webp|gif|avif)/) != null
    || lower.includes('/image/upload/')
  )
  const hasFile = doc.fileUrl.startsWith('http')
  const [previewOpen, setPreviewOpen] = useState(false)

  return (
    <div className={`rounded-lg border space-y-0 overflow-hidden ${
      doc.status === 'rejected' ? 'border-red-100'
      : doc.status === 'approved' || doc.status === 'confirmed' ? 'border-emerald-100'
      : 'border-gray-100'
    }`}>
      {/* Header row */}
      <div className={`px-3 py-2.5 space-y-1.5 ${
        doc.status === 'rejected' ? 'bg-red-50/40'
        : doc.status === 'approved' || doc.status === 'confirmed' ? 'bg-emerald-50/30'
        : 'bg-white'
      }`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-sm font-medium text-gray-900 truncate">{doc.label || doc.documentType}</span>
            {doc.version > 1 && (
              <span className="text-[10px] bg-gray-100 text-gray-600 px-1 rounded font-medium shrink-0">v{doc.version}</span>
            )}
          </div>
          {docStatusBadge(doc.status)}
        </div>

        <div className="flex items-center justify-between gap-2 ml-5">
          <div className="text-[11px] text-gray-400 space-y-0.5">
            <p>Uploaded {new Date(doc.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            {doc.expiresAt && (
              <p>Expires {new Date(doc.expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            )}
          </div>
          {hasFile && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setPreviewOpen(o => !o)}
                className="text-[11px] font-medium text-orange-500 hover:text-orange-700"
              >
                {previewOpen ? 'Hide' : (isPdf ? 'View PDF' : 'Preview')}
              </button>
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-gray-600"
                title="Open in new tab"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        {doc.status === 'rejected' && doc.rejectionReason && (
          <p className="ml-5 text-[11px] text-red-600 bg-red-50 rounded px-2 py-1">{doc.rejectionReason}</p>
        )}
      </div>

      {/* Inline preview pane */}
      {previewOpen && hasFile && (
        isPdf ? (
          <div className="border-t border-gray-100">
            <PdfViewer url={doc.fileUrl} label={doc.label || doc.documentType} height={420} />
          </div>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={doc.fileUrl}
            alt={doc.label || doc.documentType}
            className="w-full object-contain max-h-72 border-t border-gray-100 bg-gray-50"
          />
        ) : (
          <div className="flex items-center justify-center h-24 bg-gray-50 border-t border-gray-100">
            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-orange-500 underline">
              Open file <ExternalLink className="inline h-3 w-3" />
            </a>
          </div>
        )
      )}
    </div>
  )
}

function ProviderDocumentGroup({ group }: { group: UserProviderGroup }) {
  const [showHistory, setShowHistory] = useState(false)
  const current = group.documents.filter(d => d.isCurrent)
  const history = group.documents.filter(d => !d.isCurrent)

  return (
    <div className="space-y-2">
      {current.map(doc => <DocumentCard key={doc.id} doc={doc} />)}
      {history.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(h => !h)}
            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors mt-1"
          >
            {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showHistory ? 'Hide' : 'Show'} {history.length} previous version{history.length > 1 ? 's' : ''}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-2 pl-3 border-l-2 border-gray-100">
              {history.map(doc => <DocumentCard key={doc.id} doc={doc} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DocumentsSection({ userId }: { userId: string }) {
  const [groups, setGroups] = useState<UserProviderGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    getProviderDocuments(userId)
      .then(res => setGroups(res.providers))
      .catch(err => setError(err instanceof ApiError ? err.message : 'Failed to load documents.'))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map(i => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
      </div>
    )
  }

  if (error) {
    return <p className="text-xs text-red-500">{error}</p>
  }

  const totalDocs = groups.reduce((sum, g) => sum + g.documents.length, 0)

  if (totalDocs === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-6 text-center">
        <FileText className="h-7 w-7 text-gray-200" />
        <p className="text-sm text-gray-400">No documents uploaded yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map(group => (
        <div key={group.providerId}>
          {groups.length > 1 && (
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2 capitalize">
              {group.providerType} Documents
            </p>
          )}
          <ProviderDocumentGroup group={group} />
        </div>
      ))}
    </div>
  )
}

// ── Verify Provider Dialog ────────────────────────────────────────────────────

function VerifyProviderDialog({
  open, user, providerId, providerType, action, reason, loading, error,
  onActionChange, onReasonChange, onConfirm, onClose,
}: {
  open: boolean
  user: PlatformUser | null
  providerId: string | null
  providerType: 'driver' | 'artisan' | null
  action: 'approve' | 'reject'
  reason: string
  loading: boolean
  error: string
  onActionChange: (a: 'approve' | 'reject') => void
  onReasonChange: (r: string) => void
  onConfirm: () => void
  onClose: () => void
}) {
  const [docs, setDocs] = useState<UserProviderDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)

  useEffect(() => {
    if (!open || !user) return
    setDocsLoading(true)
    getProviderDocuments(user.id)
      .then(res => {
        const group = res.providers.find(p => p.providerType === providerType)
        setDocs(group?.documents.filter(d => d.isCurrent) ?? [])
      })
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false))
  }, [open, user, providerType])

  const driver = providerType === 'driver' ? user?.driver : null
  const artisan = providerType === 'artisan' ? user?.artisan : null

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <DialogTitle className="text-base font-semibold text-gray-900 capitalize">
            Review {providerType} - {user?.fullName}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-400">
            Review the provider details and documents before making a decision.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Provider details */}
          {driver && (
            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Vehicle</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Make & Model', value: [driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ') || '-' },
                    { label: 'Year', value: driver.vehicleYear ?? '-' },
                    { label: 'Plate Number', value: driver.vehiclePlate ?? '-' },
                    { label: 'Color', value: driver.vehicleColor ?? '-' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
                      <p className="text-sm text-gray-900 mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Licence</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Licence Number', value: driver.licenceNumber ?? '-' },
                    { label: 'Expiry', value: driver.licenceExpiry ? new Date(driver.licenceExpiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
                      <p className="text-sm text-gray-900 mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Payout</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Preference', value: driver.payoutPreference ?? '-' },
                    { label: 'Method', value: driver.payoutMethod ?? '-' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
                      <p className="text-sm text-gray-900 mt-0.5 capitalize">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {artisan && (
            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Business Info</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Business Name', value: artisan.businessName ?? '-' },
                    { label: 'Display Name', value: artisan.displayName ?? '-' },
                    { label: 'Categories', value: artisan.categories?.join(', ') || '-' },
                    { label: 'Service Radius', value: artisan.serviceRadius != null ? `${artisan.serviceRadius} km` : '-' },
                    { label: 'Capacity', value: artisan.shopCapacity ?? '-' },
                    { label: 'Max Concurrent Jobs', value: artisan.maxConcurrentJobs ?? '-' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
                      <p className="text-sm text-gray-900 mt-0.5 capitalize">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Payout</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Preference', value: artisan.payoutPreference ?? '-' },
                    { label: 'Method', value: artisan.payoutMethod ?? '-' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
                      <p className="text-sm text-gray-900 mt-0.5 capitalize">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Documents */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Documents</p>
            {docsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            ) : docs.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                <FileText className="h-7 w-7 text-gray-200" />
                <p className="text-sm text-gray-400">No documents found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map(doc => <DocumentCard key={doc.id} doc={doc} />)}
              </div>
            )}
          </div>

          {/* Decision */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Decision</p>
            <div className="space-y-3">
              <div className="flex gap-2">
                {(['approve', 'reject'] as const).map(a => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => onActionChange(a)}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium border transition-colors ${
                      action === a
                        ? a === 'approve'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                        : 'text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {a === 'approve' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {a === 'approve' ? 'Approve Provider' : 'Reject Provider'}
                  </button>
                ))}
              </div>
              <div>
                <Label className="text-xs text-gray-500">Reason <span className="text-gray-400">(min 5 chars)</span></Label>
                <textarea
                  className="mt-1.5 w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder={action === 'approve' ? 'All documents reviewed and verified.' : 'Describe the reason for rejection…'}
                  value={reason}
                  onChange={e => onReasonChange(e.target.value)}
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={loading || reason.trim().length < 5}
            onClick={onConfirm}
            className={action === 'approve'
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {loading ? 'Submitting…' : `Confirm ${action === 'approve' ? 'Approval' : 'Rejection'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Driver Ride-Tier Verification ─────────────────────────────────────────────
// Per-tier approve/reject for a driver. Matching is mutually exclusive — a driver
// only receives a tier's requests once approved for it. See
// docs/ride-categories-admin-integration.md Surface B.

function tierStatusBadge(status: string) {
  // Reuse the monochrome StatusBadge labels (pending/approved/rejected).
  return <StatusBadge status={status} />
}

function DriverRideCategoriesSection({ driverId, canReview }: { driverId: string; canReview: boolean }) {
  const [rows, setRows] = useState<DriverRideCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // The rideCategoryId currently being approved (inline spinner).
  const [approvingId, setApprovingId] = useState<string | null>(null)

  // Reject dialog state.
  const [rejecting, setRejecting] = useState<DriverRideCategory | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectLoading, setRejectLoading] = useState(false)
  const [rejectError, setRejectError] = useState('')

  // Grant-tier dialog state.
  const [grantOpen, setGrantOpen] = useState(false)
  const [allTiers, setAllTiers] = useState<RideCategory[]>([])
  const [grantTierId, setGrantTierId] = useState('')
  const [grantLoading, setGrantLoading] = useState(false)
  const [grantError, setGrantError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    getDriverRideCategories(driverId)
      .then(setRows)
      .catch(err => setError(err instanceof ApiError ? err.message : 'Failed to load ride tiers.'))
      .finally(() => setLoading(false))
  }, [driverId])

  useEffect(() => { load() }, [load])

  async function handleApprove(row: DriverRideCategory) {
    const tierId = row.rideCategory.id
    setApprovingId(tierId)
    // Optimistic flip.
    setRows(prev => prev.map(r => r.rideCategory.id === tierId ? { ...r, status: 'approved', rejectionReason: null } : r))
    try {
      await reviewDriverRideCategory(driverId, tierId, 'approve')
      load()
    } catch {
      load() // revert to server truth on failure
    } finally {
      setApprovingId(null)
    }
  }

  async function handleRejectConfirm() {
    if (!rejecting) return
    if (rejectReason.trim().length < 5) {
      setRejectError('Reason must be at least 5 characters.')
      return
    }
    setRejectLoading(true)
    setRejectError('')
    const tierId = rejecting.rideCategory.id
    try {
      await reviewDriverRideCategory(driverId, tierId, 'reject', rejectReason.trim())
      setRejecting(null)
      load()
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : 'Failed to reject tier.')
    } finally {
      setRejectLoading(false)
    }
  }

  function openGrant() {
    setGrantTierId('')
    setGrantError('')
    setGrantOpen(true)
    // Active tiers only — exclude any the driver already has a row for.
    getRideCategories()
      .then(tiers => setAllTiers(tiers.filter(t => t.isActive)))
      .catch(() => setAllTiers([]))
  }

  async function handleGrantConfirm() {
    if (!grantTierId) { setGrantError('Pick a tier to grant.'); return }
    setGrantLoading(true)
    setGrantError('')
    try {
      // PATCH upserts — approving a tier the driver never requested creates the row.
      await reviewDriverRideCategory(driverId, grantTierId, 'approve')
      setGrantOpen(false)
      load()
    } catch (err) {
      setGrantError(err instanceof ApiError ? err.message : 'Failed to grant tier.')
    } finally {
      setGrantLoading(false)
    }
  }

  const existingTierIds = new Set(rows.map(r => r.rideCategory.id))
  const grantableTiers = allTiers.filter(t => !existingTierIds.has(t.id))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Ride Tier Verification</p>
        {canReview && (
          <button onClick={openGrant} className="text-[11px] font-medium text-orange-500 hover:text-orange-700">
            Grant tier
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-5 text-center bg-gray-50 rounded-xl">
          <Car className="h-6 w-6 text-gray-200" />
          <p className="text-xs text-gray-400">No tier requests yet</p>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl divide-y divide-gray-100">
          {rows.map(row => {
            const tierId = row.rideCategory.id
            const busy = approvingId === tierId
            return (
              <div key={tierId} className="px-4 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {row.rideCategory.name}
                      {!row.rideCategory.isActive && <span className="ml-1.5 text-[10px] text-gray-400">(inactive)</span>}
                    </p>
                    {row.reviewedAt && (
                      <p className="text-[10px] text-gray-400">Reviewed {formatDate(row.reviewedAt)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {tierStatusBadge(row.status)}
                    {canReview && row.status !== 'approved' && (
                      <button
                        onClick={() => handleApprove(row)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                        Approve
                      </button>
                    )}
                    {canReview && row.status !== 'rejected' && (
                      <button
                        onClick={() => { setRejecting(row); setRejectReason(''); setRejectError('') }}
                        disabled={busy}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        <XCircle className="h-3 w-3" /> Reject
                      </button>
                    )}
                  </div>
                </div>
                {row.status === 'rejected' && row.rejectionReason && (
                  <p className="text-[11px] text-red-600 bg-red-50 rounded px-2 py-1">{row.rejectionReason}</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Reject reason dialog */}
      <Dialog open={!!rejecting} onOpenChange={open => { if (!open) setRejecting(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <XCircle className="h-4 w-4" /> Reject {rejecting?.rideCategory.name} tier
            </DialogTitle>
            <DialogDescription>
              The driver won&apos;t receive {rejecting?.rideCategory.name} ride requests. The reason is shown to the driver.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-gray-500">Reason <span className="text-gray-400">(min 5 chars)</span></Label>
              <textarea
                className="mt-1.5 w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
                placeholder="e.g. Vehicle photos show a Regular-tier car."
                value={rejectReason}
                onChange={e => { setRejectReason(e.target.value); setRejectError('') }}
              />
            </div>
            {rejectError && <p className="text-xs text-red-600">{rejectError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              disabled={rejectLoading || rejectReason.trim().length < 5}
              onClick={handleRejectConfirm}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {rejectLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant tier dialog */}
      <Dialog open={grantOpen} onOpenChange={open => { if (!open) setGrantOpen(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-emerald-700 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" /> Grant a ride tier
            </DialogTitle>
            <DialogDescription>
              Approve this driver for a tier they didn&apos;t request. They become matchable for it immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-gray-500">Tier</Label>
              <Select value={grantTierId} onValueChange={v => { setGrantTierId(v); setGrantError('') }}>
                <SelectTrigger className="mt-1.5 bg-white"><SelectValue placeholder="Select a tier…" /></SelectTrigger>
                <SelectContent>
                  {grantableTiers.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-gray-400">No further tiers to grant</div>
                  ) : (
                    grantableTiers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
            </div>
            {grantError && <p className="text-xs text-red-600">{grantError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantOpen(false)}>Cancel</Button>
            <Button
              disabled={grantLoading || !grantTierId}
              onClick={handleGrantConfirm}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {grantLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Grant & Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type ActionDialogType = 'suspend' | 'ban' | 'delete' | 'reinstate' | 'force_logout' | 'lift_verification'

interface UserProfileSheetProps {
  user: PlatformUser | null
  onClose: () => void
  onUpdate?: (updated: PlatformUser) => void
}

export function UserProfileSheet({ user, onClose, onUpdate }: UserProfileSheetProps) {
  // Fetch full user detail on open — list endpoint returns minimal driver/artisan data
  const [richUser, setRichUser] = useState<PlatformUser | null>(null)
  const [richLoading, setRichLoading] = useState(false)

  useEffect(() => {
    if (!user) { setRichUser(null); return }
    setRichLoading(true)
    getUser(user.id)
      .then(setRichUser)
      .catch(() => setRichUser(null))
      .finally(() => setRichLoading(false))
  }, [user?.id])

  // Use enriched data when available, fall back to list data immediately
  const u = richUser ?? user

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ fullName: '', email: '' })
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [actionDialog, setActionDialog] = useState<ActionDialogType | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  const [verifyDialog, setVerifyDialog] = useState<{ providerId: string; providerType: 'driver' | 'artisan' } | null>(null)
  const [verifyAction, setVerifyAction] = useState<'approve' | 'reject'>('approve')
  const [verifyReason, setVerifyReason] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  const [kycDialogOpen, setKycDialogOpen] = useState(false)
  const [kycAction, setKycAction] = useState<'approve' | 'reject'>('approve')
  const [kycReason, setKycReason] = useState('')
  const [kycLoading, setKycLoading] = useState(false)
  const [kycError, setKycError] = useState('')

  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')
  const [unlockLoading, setUnlockLoading] = useState(false)
  const [unlockError, setUnlockError] = useState('')

  const { can } = useRole()
  const canUnlockPayout = can('unlock_payout_method')
  const canSuspend = can('suspend_user')
  const canBan = can('ban_user')
  const canDelete = can('delete_user')
  const canForceLogout = can('force_logout_user')
  const canLiftVerification = can('lift_verification_suspension')
  const canViewVerifications = can('view_verifications')
  const canReviewVerification = can('review_verification')

  function startEdit() {
    if (!u) return
    setEditForm({ fullName: u.fullName, email: u.email ?? '' })
    setSaveError('')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setSaveError('')
  }

  async function handleSave() {
    if (!u) return
    setSaveLoading(true)
    setSaveError('')
    try {
      const updated = await updateUser(u.id, {
        fullName: editForm.fullName.trim() || undefined,
        email: editForm.email.trim() || undefined,
      })
      setEditing(false)
      onUpdate?.(updated)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save changes.')
    } finally {
      setSaveLoading(false)
    }
  }

  function openAction(type: ActionDialogType) {
    setActionReason('')
    setActionError('')
    setActionDialog(type)
  }

  async function handleActionConfirm() {
    if (!u || !actionDialog) return
    if (actionDialog !== 'reinstate' && actionReason.trim().length < 10) {
      setActionError('Reason must be at least 10 characters.')
      return
    }
    setActionLoading(true)
    setActionError('')
    try {
      let updated: PlatformUser | undefined
      if (actionDialog === 'suspend') updated = await suspendUser(u.id, actionReason.trim()) as PlatformUser
      else if (actionDialog === 'ban') updated = await banUser(u.id, actionReason.trim()) as PlatformUser
      else if (actionDialog === 'delete') updated = await deleteUser(u.id, actionReason.trim()) as PlatformUser
      else if (actionDialog === 'reinstate') updated = await reinstateUser(u.id, actionReason.trim() || undefined) as PlatformUser
      else if (actionDialog === 'force_logout') await forceLogoutUser(u.id, actionReason.trim())
      else if (actionDialog === 'lift_verification') {
        // Suspension can sit on either the driver or artisan sub-profile (or
        // both, if the user holds both roles). Lift whichever is currently
        // suspended; if both are, lift both in sequence.
        if (u.driver?.verificationStatus === 'suspended') {
          await liftVerificationSuspension(u.driver.id, 'driver', actionReason.trim())
        }
        if (u.artisan?.verificationStatus === 'suspended') {
          await liftVerificationSuspension(u.artisan.id, 'artisan', actionReason.trim())
        }
        // Refetch the user so the sheet shows the new verification status.
        updated = await getUser(u.id)
      }
      setActionDialog(null)
      if (updated) onUpdate?.(updated)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed.')
    } finally {
      setActionLoading(false)
    }
  }

  function openVerify(providerId: string, providerType: 'driver' | 'artisan') {
    setVerifyAction('approve')
    setVerifyReason('')
    setVerifyError('')
    setVerifyDialog({ providerId, providerType })
  }

  async function handleVerifyConfirm() {
    if (!verifyDialog) return
    if (verifyReason.trim().length < 5) {
      setVerifyError('Reason must be at least 5 characters.')
      return
    }
    setVerifyLoading(true)
    setVerifyError('')
    try {
      await reviewVerification(verifyDialog.providerId, verifyDialog.providerType, verifyAction, verifyReason.trim())
      setVerifyDialog(null)
      if (u) {
        const updated: PlatformUser = {
          ...u,
          driver: u.driver && verifyDialog.providerType === 'driver'
            ? { ...u.driver, verificationStatus: verifyAction === 'approve' ? 'approved' : 'rejected' }
            : u.driver,
          artisan: u.artisan && verifyDialog.providerType === 'artisan'
            ? { ...u.artisan, verificationStatus: verifyAction === 'approve' ? 'approved' : 'rejected' }
            : u.artisan,
        }
        onUpdate?.(updated)
      }
    } catch (err) {
      setVerifyError(err instanceof ApiError ? err.message : 'Action failed.')
    } finally {
      setVerifyLoading(false)
    }
  }

  function openKycReview() {
    setKycAction('approve')
    setKycReason('')
    setKycError('')
    setKycDialogOpen(true)
  }

  async function handleKycConfirm() {
    if (!u?.client) return
    if (kycAction === 'reject' && kycReason.trim().length < 5) {
      setKycError('Reason must be at least 5 characters when rejecting.')
      return
    }
    setKycLoading(true)
    setKycError('')
    try {
      await reviewClientKyc(u.client.id, kycAction, kycAction === 'reject' ? kycReason.trim() : (kycReason.trim() || undefined))
      setKycDialogOpen(false)
      const updated: PlatformUser = {
        ...u,
        client: {
          ...u.client,
          kycStatus: kycAction === 'approve' ? 'verified' : 'rejected',
          ghanaCardVerified: kycAction === 'approve',
          kycReviewedAt: new Date().toISOString(),
          kycRejectionReason: kycAction === 'approve' ? null : kycReason.trim(),
        },
      }
      onUpdate?.(updated)
      setRichUser(updated)
    } catch (err) {
      setKycError(err instanceof ApiError ? err.message : 'Action failed.')
    } finally {
      setKycLoading(false)
    }
  }

  function openUnlockDialog() {
    setUnlockReason('')
    setUnlockError('')
    setUnlockDialogOpen(true)
  }

  async function handleUnlockConfirm() {
    if (!u) return
    setUnlockLoading(true)
    setUnlockError('')
    try {
      await unlockPayoutMethod(u.id, unlockReason.trim() || undefined)
      setUnlockDialogOpen(false)
      const updated: PlatformUser = {
        ...u,
        driver: u.driver ? { ...u.driver, payoutMethod: null, payoutLocked: false } : u.driver,
        artisan: u.artisan ? { ...u.artisan, payoutMethod: null, payoutLocked: false } : u.artisan,
      }
      onUpdate?.(updated)
      setRichUser(updated)
    } catch (err) {
      setUnlockError(err instanceof ApiError ? err.message : 'Failed to unlock payout method.')
    } finally {
      setUnlockLoading(false)
    }
  }

  const roles = u?.roles ?? []
  const roleColor = 'bg-gray-100 text-gray-600'

  return (
    <>
      <Sheet open={!!user} onOpenChange={open => { if (!open) { setEditing(false); onClose() } }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="pb-0">
            <SheetTitle className="sr-only">User Profile</SheetTitle>
            <SheetDescription className="sr-only">View and manage user account details</SheetDescription>
          </SheetHeader>

          {u && (
            <div className="px-4 pb-6 space-y-5">
              {/* Hero */}
              <div className="flex items-start gap-4 pt-2">
                <Avatar className="h-14 w-14">
                  <AvatarFallback className={`${roleColor} text-base font-bold`}>
                    {initials(u.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <div className="space-y-2">
                      <Input
                        value={editForm.fullName}
                        onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))}
                        placeholder="Full name"
                        className="h-8 text-sm"
                      />
                      <Input
                        value={editForm.email}
                        onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="Email (optional)"
                        type="email"
                        className="h-8 text-sm"
                      />
                      {saveError && <p className="text-xs text-red-600">{saveError}</p>}
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 gap-1 text-xs bg-orange-500 hover:bg-orange-600 text-white" onClick={handleSave} disabled={saveLoading}>
                          {saveLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={cancelEdit}>
                          <X className="h-3 w-3" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-gray-900 truncate">{u.fullName}</h2>
                        {richLoading && <Loader2 className="h-3 w-3 animate-spin text-gray-300" />}
                        <button onClick={startEdit} className="text-gray-400 hover:text-gray-600 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <StatusBadge status={u.status} />
                        {roles.map(r => (
                          <span key={r} className="text-[11px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">{r}</span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Contact & dates */}
              {!editing && (
                <div className="bg-gray-50 rounded-xl px-4 py-1">
                  <InfoRow icon={Phone} label="Phone" value={<span className="font-mono">{u.phone}</span>} />
                  <InfoRow icon={Mail} label="Email" value={u.email ?? <span className="text-gray-400 italic">Not set</span>} />
                  <InfoRow icon={Calendar} label="Joined" value={formatDate(u.createdAt)} />
                </div>
              )}

              {/* Role-specific data */}
              {!editing && u.client && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Client Details</p>
                  <div className="bg-gray-50 rounded-xl px-4 py-1">
                    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100">
                      <IdCard className="h-4 w-4 text-gray-400 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Ghana Card KYC</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {clientKycBadge(u.client.kycStatus)}
                          {u.client.ghanaCardImageUrl && (
                            <button
                              onClick={openKycReview}
                              className="text-[11px] font-medium text-orange-500 hover:text-orange-700 underline"
                            >
                              {u.client.kycStatus === 'pending_review' ? 'Review Card' : 'View Card'}
                            </button>
                          )}
                        </div>
                        {u.client.kycStatus === 'rejected' && u.client.kycRejectionReason && (
                          <p className="mt-1.5 text-[11px] text-red-600 bg-red-50 rounded px-2 py-1">
                            {u.client.kycRejectionReason}
                          </p>
                        )}
                        {u.client.kycSubmittedAt && u.client.kycStatus === 'pending_review' && (
                          <p className="mt-1 text-[11px] text-gray-400">
                            Submitted {new Date(u.client.kycSubmittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100">
                      <Star className="h-4 w-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Loyalty Points</p>
                        <p className="text-sm font-semibold text-orange-600 mt-0.5">{u.client.loyaltyPointsBalance.toLocaleString()} pts</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 py-2.5">
                      <div className="h-4 w-4 shrink-0" />
                      <div>
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Preferred Payment</p>
                        <p className="text-sm text-gray-900 mt-0.5">{u.client.preferredPaymentMethod ?? <span className="text-gray-400 italic">Not set</span>}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!editing && u.driver && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Driver Details</p>
                  <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2.5">
                    {/* Status */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Verification</span>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={u.driver.verificationStatus} />
                        {u.driver.verificationStatus === 'pending' && (
                          <button onClick={() => openVerify(u.driver!.id, 'driver')} className="text-[11px] font-medium text-orange-500 hover:text-orange-700 underline">
                            Review
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Online Status</span>
                      {u.driver.onlineStatus === 'online'
                        ? <span className="flex items-center gap-1.5 text-xs text-gray-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" />Online</span>
                        : <span className="text-xs text-gray-400">Offline</span>}
                    </div>

                    {u.driver.verificationStatus === 'suspended' && (
                      <SuspensionContext
                        suspension={u.driver.suspension}
                        liveCancellations={u.driver.cancellationCount30d}
                        canLift={canLiftVerification}
                        onLift={() => openAction('lift_verification')}
                      />
                    )}

                    <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Vehicle</p>
                      <div className="flex items-start justify-between text-sm gap-2">
                        <span className="text-gray-500 shrink-0">Make & Model</span>
                        <span className="text-gray-900 text-xs text-right">
                          {[u.driver.vehicleMake, u.driver.vehicleModel].filter(Boolean).join(' ') || <span className="text-gray-400 italic">Not set</span>}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Year</span>
                        <span className="text-gray-900 text-xs">{u.driver.vehicleYear ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Color</span>
                        <span className="text-gray-900 text-xs capitalize">{u.driver.vehicleColor ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Plate</span>
                        {u.driver.vehiclePlate
                          ? <span className="font-mono bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded text-[11px]">{u.driver.vehiclePlate}</span>
                          : <span className="text-xs text-gray-400 italic">Not set</span>}
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Licence</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Number</span>
                        <span className="text-gray-900 text-xs font-mono">{u.driver.licenceNumber ?? <span className="text-gray-400 italic not-italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Expiry</span>
                        <span className="text-gray-900 text-xs">
                          {u.driver.licenceExpiry
                            ? new Date(u.driver.licenceExpiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                            : <span className="text-gray-400 italic">Not set</span>}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Payout</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Preference</span>
                        <span className="text-gray-900 text-xs capitalize">{u.driver.payoutPreference ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Method</span>
                        <span className="flex items-center gap-1.5 text-gray-900 text-xs capitalize">
                          {u.driver.payoutMethod ?? <span className="text-gray-400 italic">Not set</span>}
                          {u.driver.payoutLocked && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              <Lock className="h-2.5 w-2.5" />Locked
                            </span>
                          )}
                        </span>
                      </div>
                      {u.driver.payoutLocked && canUnlockPayout && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-center gap-1.5 h-7 text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
                          onClick={openUnlockDialog}
                        >
                          <Unlock className="h-3 w-3" /> Unlock Payout Method
                        </Button>
                      )}
                    </div>

                    <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Activity</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-gray-400" />Rating</span>
                        <span className="text-xs">
                          {u.driver.avgRating != null ? <span className="font-medium text-amber-600">{u.driver.avgRating.toFixed(1)}</span> : <span className="text-gray-400">No ratings yet</span>}
                          {u.driver.ratingCount > 0 && <span className="text-gray-400 ml-1">({u.driver.ratingCount})</span>}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-gray-400" />Completed Rides</span>
                        <span className="text-gray-900 text-xs font-medium">{u.driver.completedRidesCount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5"><XOctagon className="h-3.5 w-3.5 text-gray-400" />Cancellations (30d)</span>
                        <span className={`text-xs font-medium ${u.driver.cancellationCount30d >= 3 ? 'text-red-600' : 'text-gray-700'}`}>{u.driver.cancellationCount30d}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Ride tier verification — drivers only, gated on view_verifications */}
              {!editing && u.driver && canViewVerifications && (
                <DriverRideCategoriesSection driverId={u.driver.id} canReview={canReviewVerification} />
              )}

              {!editing && u.artisan && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Artisan Details</p>
                  <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2.5">
                    {/* Status */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Verification</span>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={u.artisan.verificationStatus} />
                        {u.artisan.verificationStatus === 'pending' && (
                          <button onClick={() => openVerify(u.artisan!.id, 'artisan')} className="text-[11px] font-medium text-orange-500 hover:text-orange-700 underline">
                            Review
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Online Status</span>
                      {u.artisan.onlineStatus === 'online'
                        ? <span className="flex items-center gap-1.5 text-xs text-gray-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" />Online</span>
                        : <span className="text-xs text-gray-400">Offline</span>}
                    </div>

                    {u.artisan.verificationStatus === 'suspended' && (
                      <SuspensionContext
                        suspension={u.artisan.suspension}
                        liveCancellations={u.artisan.cancellationCount30d}
                        canLift={canLiftVerification}
                        onLift={() => openAction('lift_verification')}
                      />
                    )}

                    <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Business Info</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Business Name</span>
                        <span className="text-gray-900 text-xs font-medium">{u.artisan.businessName ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Display Name</span>
                        <span className="text-gray-900 text-xs">{u.artisan.displayName ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5 shrink-0 mt-0.5"><Tag className="h-3.5 w-3.5 text-gray-400" />Categories</span>
                        {(u.artisan.categories ?? []).length > 0
                          ? <div className="flex flex-wrap gap-1 justify-end">
                              {(u.artisan.categories ?? []).map(cat => (
                                <span key={cat} className="text-[10px] bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded-full">{cat}</span>
                              ))}
                            </div>
                          : <span className="text-xs text-gray-400 italic ml-auto">Not set</span>}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Service Radius</span>
                        <span className="text-gray-900 text-xs">{u.artisan.serviceRadius != null ? `${u.artisan.serviceRadius} km` : <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Capacity</span>
                        <span className="text-gray-900 text-xs capitalize">{u.artisan.shopCapacity ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Max Concurrent Jobs</span>
                        <span className="text-gray-900 text-xs">{u.artisan.maxConcurrentJobs ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Payout</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Preference</span>
                        <span className="text-gray-900 text-xs capitalize">{u.artisan.payoutPreference ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Method</span>
                        <span className="flex items-center gap-1.5 text-gray-900 text-xs capitalize">
                          {u.artisan.payoutMethod ?? <span className="text-gray-400 italic">Not set</span>}
                          {u.artisan.payoutLocked && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              <Lock className="h-2.5 w-2.5" />Locked
                            </span>
                          )}
                        </span>
                      </div>
                      {u.artisan.payoutLocked && canUnlockPayout && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-center gap-1.5 h-7 text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
                          onClick={openUnlockDialog}
                        >
                          <Unlock className="h-3 w-3" /> Unlock Payout Method
                        </Button>
                      )}
                    </div>

                    <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Activity</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-gray-400" />Rating</span>
                        <span className="text-xs">
                          {u.artisan.avgRating != null ? <span className="font-medium text-amber-600">{u.artisan.avgRating.toFixed(1)}</span> : <span className="text-gray-400">No ratings yet</span>}
                          {u.artisan.ratingCount > 0 && <span className="text-gray-400 ml-1">({u.artisan.ratingCount})</span>}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-gray-400" />Completed Jobs</span>
                        <span className="text-gray-900 text-xs font-medium">{u.artisan.completedJobsCount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5"><XOctagon className="h-3.5 w-3.5 text-gray-400" />Cancellations (30d)</span>
                        <span className={`text-xs font-medium ${u.artisan.cancellationCount30d >= 3 ? 'text-red-600' : 'text-gray-700'}`}>{u.artisan.cancellationCount30d}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Documents — drivers and artisans only */}
              {!editing && (u.driver || u.artisan) && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Documents</p>
                  <DocumentsSection userId={u.id} />
                </div>
              )}

              {/* Account actions */}
              {!editing && (canSuspend || canBan || canDelete || canForceLogout || canLiftVerification) && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Account Actions</p>
                  <div className="flex flex-col gap-2">
                    {canLiftVerification && (u.driver?.verificationStatus === 'suspended' || u.artisan?.verificationStatus === 'suspended') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        onClick={() => openAction('lift_verification')}
                      >
                        <ShieldCheck className="h-4 w-4" /> Lift Verification Suspension
                      </Button>
                    )}
                    {canSuspend && u.status === 'suspended' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        onClick={() => openAction('reinstate')}
                      >
                        <RotateCcw className="h-4 w-4" /> Reinstate Account
                      </Button>
                    )}
                    {canForceLogout && u.status !== 'banned' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start gap-2 text-blue-700 border-blue-200 hover:bg-blue-50"
                        onClick={() => openAction('force_logout')}
                      >
                        <LogOut className="h-4 w-4" /> Force Logout (All Devices)
                      </Button>
                    )}
                    {canSuspend && u.status !== 'suspended' && u.status !== 'banned' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                        onClick={() => openAction('suspend')}
                      >
                        <UserX className="h-4 w-4" /> Suspend Account
                      </Button>
                    )}
                    {canBan && u.status !== 'banned' && u.status !== 'deleted' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start gap-2 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => openAction('ban')}
                      >
                        <ShieldOff className="h-4 w-4" /> Ban Permanently
                      </Button>
                    )}
                    {canDelete && u.status !== 'banned' && u.status !== 'deleted' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start gap-2 text-gray-700 border-gray-300 hover:bg-gray-50"
                        onClick={() => openAction('delete')}
                      >
                        <Trash2 className="h-4 w-4" /> Delete Account
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* ID */}
              {!editing && (
                <p className="text-[10px] text-gray-300 font-mono break-all">ID: {u.id}</p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirm action dialog */}
      <Dialog open={!!actionDialog} onOpenChange={open => { if (!open) setActionDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={
              actionDialog === 'ban' ? 'text-red-600'
              : actionDialog === 'delete' ? 'text-gray-700'
              : actionDialog === 'suspend' ? 'text-orange-600'
              : actionDialog === 'force_logout' ? 'text-blue-700'
              : 'text-emerald-700'
            }>
              {actionDialog === 'reinstate' ? 'Reinstate'
                : actionDialog === 'ban' ? 'Ban'
                : actionDialog === 'delete' ? 'Delete'
                : actionDialog === 'force_logout' ? 'Force Logout'
                : actionDialog === 'lift_verification' ? 'Lift verification suspension for'
                : 'Suspend'} {user?.fullName}
            </DialogTitle>
            <DialogDescription>
              {actionDialog === 'reinstate'
                ? 'Restore this user\'s access to the platform.'
                : actionDialog === 'ban'
                ? 'This will permanently ban the user. This action is hard to reverse.'
                : actionDialog === 'delete'
                ? 'Soft-deletes the account. Use for housekeeping (duplicate / test) or when the user has requested removal. Data is retained 90 days; outstanding clawbacks must be settled first.'
                : actionDialog === 'force_logout'
                ? 'Revoke every active session for this user. They will be signed out on every device and must log in again - use after verifying identity over the phone.'
                : actionDialog === 'lift_verification'
                ? 'Restores the provider\'s verification status to "approved", lifting an auto-suspension from the rating or cancellation engine. They\'ll be able to go online again.'
                : 'This will suspend the user. You can reinstate them later.'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-gray-500">Reason {actionDialog !== 'reinstate' && <span className="text-gray-400">(min 10 chars)</span>}</Label>
              <textarea
                className="mt-1.5 w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
                placeholder={actionDialog === 'reinstate' ? 'Reason for reinstatement (optional)…' : 'Describe the reason for this action…'}
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
              />
            </div>
            {actionError && <p className="text-xs text-red-600">{actionError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              disabled={actionLoading || (actionDialog !== 'reinstate' && actionReason.trim().length < 10)}
              onClick={handleActionConfirm}
              className={actionDialog === 'ban'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : actionDialog === 'delete'
                ? 'bg-gray-700 hover:bg-gray-800 text-white'
                : actionDialog === 'suspend'
                ? 'bg-orange-500 hover:bg-orange-600 text-white'
                : actionDialog === 'force_logout'
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Confirm ${
                actionDialog === 'reinstate' ? 'Reinstatement'
                : actionDialog === 'ban' ? 'Ban'
                : actionDialog === 'delete' ? 'Deletion'
                : actionDialog === 'force_logout' ? 'Force Logout'
                : actionDialog === 'lift_verification' ? 'Lift Suspension'
                : 'Suspension'
              }`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify provider review dialog */}
      <VerifyProviderDialog
        open={!!verifyDialog}
        user={user}
        providerId={verifyDialog?.providerId ?? null}
        providerType={verifyDialog?.providerType ?? null}
        action={verifyAction}
        reason={verifyReason}
        loading={verifyLoading}
        error={verifyError}
        onActionChange={a => { setVerifyAction(a); setVerifyError('') }}
        onReasonChange={r => { setVerifyReason(r); setVerifyError('') }}
        onConfirm={handleVerifyConfirm}
        onClose={() => setVerifyDialog(null)}
      />

      {/* Unlock payout method dialog */}
      <Dialog open={unlockDialogOpen} onOpenChange={open => { if (!open) setUnlockDialogOpen(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-amber-700 flex items-center gap-2">
              <Unlock className="h-4 w-4" /> Unlock Payout Method
            </DialogTitle>
            <DialogDescription>
              This clears the locked payout method on every provider profile this user holds. The user will need to re-enter their MoMo number and verify a new OTP before payouts can resume.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-gray-500">Reason <span className="text-gray-400">(optional)</span></Label>
              <textarea
                className="mt-1.5 w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
                placeholder="e.g. User contacted support - lost access to MoMo number…"
                value={unlockReason}
                onChange={e => setUnlockReason(e.target.value)}
              />
            </div>
            {unlockError && <p className="text-xs text-red-600">{unlockError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={unlockLoading}
              onClick={handleUnlockConfirm}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {unlockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Unlock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify client Ghana Card dialog */}
      <VerifyClientKycDialog
        open={kycDialogOpen}
        fullName={u?.fullName ?? null}
        ghanaCardImageUrl={u?.client?.ghanaCardImageUrl ?? null}
        submittedAt={u?.client?.kycSubmittedAt ?? null}
        action={kycAction}
        reason={kycReason}
        loading={kycLoading}
        error={kycError}
        onActionChange={a => { setKycAction(a); setKycError('') }}
        onReasonChange={r => { setKycReason(r); setKycError('') }}
        onConfirm={handleKycConfirm}
        onClose={() => setKycDialogOpen(false)}
      />
    </>
  )
}
