'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Mail, Phone, Calendar, Star, Pencil, Check, X, Loader2, RotateCcw, ShieldOff, UserX, FileText, ExternalLink, CheckCircle, XCircle, ChevronDown, ChevronUp, Car, Tag, TrendingUp, XOctagon, IdCard, Lock, Unlock, LogOut, Trash2, Upload, AlertTriangle } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/common/status-badge'
import { PdfViewer } from '@/components/common/pdf-viewer'
import { updateUser, reinstateUser, suspendUser, banUser, deleteUser, forceLogoutUser, getProviderDocuments, finalizeVerification, reviewClientKyc, getUser, unlockPayoutMethod, uploadProviderDocument, ADMIN_UPLOADABLE_DOC_TYPES, documentTypeTracksExpiry, type PlatformUser, type ProviderSuspension, type UserProviderDocument } from '@/lib/api'
import { ApiError, FEATURES } from '@/lib/api-client'
import { DocumentExpiryControl } from '@/components/common/document-expiry-control'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RoleGate } from '@/components/common/role-gate'
import { VerifyClientKycDialog, clientKycBadge } from './verify-client-kyc-dialog'
import { EditProviderProfileDialog } from './edit-provider-profile-dialog'
import { useRole } from '@/hooks/use-role'

function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
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
  manual: 'Manual (admin)'
}

// Shown inside a provider block when verificationStatus === 'suspended', so an
// admin sees WHY before taking a separately scoped action from the suspension
// queue, where the exact suspension id is available.
function SuspensionContext({ suspension, liveCancellations }: { suspension: ProviderSuspension | null; liveCancellations: number }) {
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
        {trigger === 'cancellation' && count != null && <span className="font-normal text-red-600">· {count} cancellations / 30 days</span>}
      </div>
      {suspension?.reason ? <p className="text-[11px] text-red-700 leading-snug">{suspension.reason}</p> : <p className="text-[11px] text-red-500 italic">Reason unavailable — pending backend support.</p>}
      {suspension?.suspendedAt && <p className="text-[10px] text-red-500">Suspended {formatDate(suspension.suspendedAt)}</p>}
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
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
        <CheckCircle className="h-3 w-3" />
        Approved
      </span>
    )
  if (status === 'rejected')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
        <XCircle className="h-3 w-3" />
        Rejected
      </span>
    )
  if (status === 'pending_review') return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">Pending Review</span>
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Awaiting Upload</span>
}

function DocumentCard({ doc, onStale, expiryEditable = true }: { doc: UserProviderDocument; onStale?: () => void; expiryEditable?: boolean }) {
  const lower = doc.fileUrl.toLowerCase()
  const isPdf = doc.mimeType === 'application/pdf' || lower.includes('.pdf') || lower.includes('/raw/upload/')
  const isImage = !isPdf && ((doc.mimeType?.startsWith('image/') ?? false) || lower.match(/\.(jpe?g|png|webp|gif|avif)/) != null || lower.includes('/image/upload/'))
  const hasFile = doc.fileUrl.startsWith('http')
  const [previewOpen, setPreviewOpen] = useState(false)

  return (
    <div className={`rounded-lg border space-y-0 overflow-hidden ${doc.status === 'rejected' ? 'border-red-100' : doc.status === 'approved' || doc.status === 'confirmed' ? 'border-emerald-100' : 'border-gray-100'}`}>
      {/* Header row */}
      <div className={`px-3 py-2.5 space-y-1.5 ${doc.status === 'rejected' ? 'bg-red-50/40' : doc.status === 'approved' || doc.status === 'confirmed' ? 'bg-emerald-50/30' : 'bg-white'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-sm font-medium text-gray-900 truncate">{doc.label || doc.documentType}</span>
            {doc.version > 1 && <span className="text-[10px] bg-gray-100 text-gray-600 px-1 rounded font-medium shrink-0">v{doc.version}</span>}
          </div>
          {docStatusBadge(doc.status)}
        </div>

        <div className="flex items-center justify-between gap-2 ml-5">
          <div className="text-[11px] text-gray-400 space-y-1">
            <p>
              Uploaded{' '}
              {new Date(doc.createdAt).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              })}
            </p>
            {documentTypeTracksExpiry(doc.documentType) ? (
              <DocumentExpiryControl documentId={doc.id} documentType={doc.documentType} expiresAt={doc.expiresAt} onStale={onStale} editable={expiryEditable} />
            ) : doc.expiresAt ? (
              <p>
                Expires{' '}
                {new Date(doc.expiresAt).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })}
              </p>
            ) : null}
          </div>
          {hasFile && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setPreviewOpen(o => !o)} className="text-[11px] font-medium text-orange-500 hover:text-orange-700">
                {previewOpen ? 'Hide' : isPdf ? 'View PDF' : 'Preview'}
              </button>
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-gray-600" title="Open in new tab">
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        {doc.status === 'rejected' && doc.rejectionReason && <p className="ml-5 text-[11px] text-red-600 bg-red-50 rounded px-2 py-1">{doc.rejectionReason}</p>}
      </div>

      {/* Inline preview pane */}
      {previewOpen &&
        hasFile &&
        (isPdf ? (
          <div className="border-t border-gray-100">
            <PdfViewer url={doc.fileUrl} label={doc.label || doc.documentType} height={420} />
          </div>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={doc.fileUrl} alt={doc.label || doc.documentType} className="w-full object-contain max-h-72 border-t border-gray-100 bg-gray-50" />
        ) : (
          <div className="flex items-center justify-center h-24 bg-gray-50 border-t border-gray-100">
            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-orange-500 underline">
              Open file <ExternalLink className="inline h-3 w-3" />
            </a>
          </div>
        ))}
    </div>
  )
}

function ProviderDocumentGroup({ documents, onStale }: { documents: UserProviderDocument[]; onStale?: () => void }) {
  const [showHistory, setShowHistory] = useState(false)
  const current = documents.filter(d => d.isCurrent)
  const history = documents.filter(d => !d.isCurrent)

  return (
    <div className="space-y-2">
      {current.map(doc => (
        <DocumentCard key={doc.id} doc={doc} onStale={onStale} />
      ))}
      {history.length > 0 && (
        <div>
          <button onClick={() => setShowHistory(h => !h)} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors mt-1">
            {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showHistory ? 'Hide' : 'Show'} {history.length} previous version
            {history.length > 1 ? 's' : ''}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-2 pl-3 border-l-2 border-gray-100">
              {history.map(doc => (
                <DocumentCard key={doc.id} doc={doc} expiryEditable={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Upload replacement document (Regional Manager) ──────────────────────────────
// Lets an RM upload a new document on a provider's behalf when self-service
// re-upload is closed (e.g. an expired licence). This starts a new review. Any
// still-valid approved authority remains usable only for its bounded grace;
// otherwise normal eligibility takes the provider offline.
function UploadDocumentDialog({ open, roleAccountId, providerType, providerName, currentDocumentTypes, onClose, onUploaded }: { open: boolean; roleAccountId: string; providerType: 'driver' | 'artisan'; providerName: string; currentDocumentTypes: readonly string[]; onClose: () => void; onUploaded: () => void }) {
  const currentTypeSet = new Set(currentDocumentTypes)
  const hasTradeCertificate = currentTypeSet.has('trade_certificate')
  const hasBusinessRegistration = currentTypeSet.has('business_registration')
  const hasCredentialConflict = hasTradeCertificate && hasBusinessRegistration
  const options = ADMIN_UPLOADABLE_DOC_TYPES.filter(t => {
    if (t.appliesTo !== null && t.appliesTo !== providerType) return false
    if (providerType !== 'artisan') return true

    // BR-02: these are a strict XOR. Replacing the currently selected
    // credential remains possible, but the uploader must not create the other
    // type alongside it. Legacy rows containing both require data repair.
    if (t.value === 'trade_certificate') {
      return !hasBusinessRegistration
    }
    if (t.value === 'business_registration') {
      return !hasTradeCertificate
    }
    return true
  })
  const [documentType, setDocumentType] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [expiresAt, setExpiresAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Reset the form whenever the dialog (re)opens or switches provider role.
  useEffect(() => {
    if (open) {
      setDocumentType('')
      setFile(null)
      setExpiresAt('')
      setError('')
      setSaving(false)
    }
  }, [open, providerType])

  const selected = options.find(o => o.value === documentType) ?? null
  const expiryRequired = selected?.expiryRequired ?? false

  async function submit() {
    setError('')
    if (!documentType) {
      setError('Select a document type.')
      return
    }
    if (!file) {
      setError('Choose a file to upload.')
      return
    }
    if (expiryRequired && !expiresAt) {
      setError('This document requires an expiry date.')
      return
    }

    setSaving(true)
    try {
      await uploadProviderDocument(roleAccountId, {
        providerType,
        documentType,
        file,
        expiresAt: expiresAt || undefined
      })
      onUploaded()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o && !saving) onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-gray-900">Upload {providerType} document</DialogTitle>
          <DialogDescription className="text-xs text-gray-400">Replacement document for {providerName}. Uploading starts a new approval review.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Explain the actual bounded-grace/offline behavior before writing. */}
          <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 leading-relaxed">
              This returns the document to the approval queue (Admin → Coordinator → Regional Manager). A still-valid approved document may remain authoritative only until its expiry or seven-day grace deadline; without valid authority, the provider is taken <strong>offline</strong>. An active trip may finish first.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Document type</Label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select a document type" />
              </SelectTrigger>
              <SelectContent>
                {options.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {providerType === 'artisan' && hasCredentialConflict && <p className="text-[11px] text-red-600">Legacy conflict: both artisan credentials are current. Approval is blocked until the data is repaired.</p>}
            {providerType === 'artisan' && !hasCredentialConflict && (hasTradeCertificate || hasBusinessRegistration) && <p className="text-[11px] text-amber-700">Business Registration and Trade Certificate are mutually exclusive. Only the current credential type can be replaced here.</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">File (JPG, PNG or PDF — max 10 MB)</Label>
            <Input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} className="h-10 file:mr-3 file:text-xs file:text-gray-600" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Expiry date{expiryRequired ? ' (required)' : ' (optional)'}</Label>
            <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="h-10" />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} style={{ backgroundColor: '#F5A623' }}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> Upload document
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DocumentsSection({ roleAccountId, role, userName }: { roleAccountId: string; role: 'driver' | 'artisan'; userName: string }) {
  const [documents, setDocuments] = useState<UserProviderDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploadFor, setUploadFor] = useState<'driver' | 'artisan' | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    getProviderDocuments(role, roleAccountId)
      .then(res => setDocuments(res.documents))
      .catch(err => setError(err instanceof ApiError ? err.message : 'Failed to load documents.'))
      .finally(() => setLoading(false))
  }, [role, roleAccountId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map(i => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return <p className="text-xs text-red-500">{error}</p>
  }

  return (
    <div className="space-y-4">
      {FEATURES.adminProviderDocumentUpload && (
        <div className="flex justify-end">
          <RoleGate permission="upload_provider_document">
            <button onClick={() => setUploadFor(role)} className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-500 hover:text-orange-700">
              <Upload className="h-3 w-3" /> {documents.length === 0 ? 'Upload document' : 'Upload replacement'}
            </button>
          </RoleGate>
        </div>
      )}
      {documents.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-6 text-center">
          <FileText className="h-7 w-7 text-gray-200" />
          <p className="text-sm text-gray-400">No documents uploaded yet</p>
        </div>
      ) : (
        <ProviderDocumentGroup documents={documents} onStale={load} />
      )}

      {FEATURES.adminProviderDocumentUpload && uploadFor && <UploadDocumentDialog open={uploadFor !== null} roleAccountId={roleAccountId} providerType={uploadFor} providerName={userName} currentDocumentTypes={documents.filter(document => document.isCurrent).map(document => document.documentType) ?? []} onClose={() => setUploadFor(null)} onUploaded={load} />}
    </div>
  )
}

// ── Verify Provider Dialog ────────────────────────────────────────────────────

function VerifyProviderDialog({ open, user, providerType, action, reason, loading, error, onActionChange, onReasonChange, onConfirm, onClose }: { open: boolean; user: PlatformUser | null; providerType: 'driver' | 'artisan' | null; action: 'approve' | 'reject'; reason: string; loading: boolean; error: string; onActionChange: (a: 'approve' | 'reject') => void; onReasonChange: (r: string) => void; onConfirm: () => void; onClose: () => void }) {
  const [docs, setDocs] = useState<UserProviderDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)

  const loadDocs = useCallback(() => {
    if (!open || !user) return
    setDocsLoading(true)
    if (providerType !== 'driver' && providerType !== 'artisan') return
    getProviderDocuments(providerType, user.roleAccountId)
      .then(res => {
        setDocs(res.documents.filter(d => d.isCurrent))
      })
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false))
  }, [open, user, providerType])

  useEffect(() => {
    loadDocs()
  }, [loadDocs])

  const driver = providerType === 'driver' && user?.role === 'driver' ? user.profile : null
  const artisan = providerType === 'artisan' && user?.role === 'artisan' ? user.profile : null

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <DialogTitle className="text-base font-semibold text-gray-900 capitalize">
            Review {providerType} - {user?.fullName}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-400">Review the provider details and documents before making a decision.</DialogDescription>
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
                    {
                      label: 'Make & Model',
                      value: [driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ') || '-'
                    },
                    { label: 'Year', value: driver.vehicleYear ?? '-' },
                    {
                      label: 'Plate Number',
                      value: driver.vehiclePlate ?? '-'
                    },
                    { label: 'Color', value: driver.vehicleColor ?? '-' }
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
                    {
                      label: 'Licence Number',
                      value: driver.licenceNumber ?? '-'
                    },
                    {
                      label: 'Expiry',
                      value: driver.licenceExpiry ? new Date(driver.licenceExpiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
                    }
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
                    {
                      label: 'Preference',
                      value: driver.payoutPreference ?? '-'
                    },
                    { label: 'Method', value: driver.payoutMethod ?? '-' }
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
                    {
                      label: 'Business Name',
                      value: artisan.businessName ?? '-'
                    },
                    {
                      label: 'Display Name',
                      value: artisan.displayName ?? '-'
                    },
                    {
                      label: 'Categories',
                      value: artisan.categories?.join(', ') || '-'
                    },
                    {
                      label: 'Service Radius',
                      value: artisan.serviceRadius != null ? `${artisan.serviceRadius} km` : '-'
                    },
                    { label: 'Capacity', value: artisan.shopCapacity ?? '-' },
                    {
                      label: 'Max Concurrent Jobs',
                      value: artisan.maxConcurrentJobs ?? '-'
                    }
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
                    {
                      label: 'Preference',
                      value: artisan.payoutPreference ?? '-'
                    },
                    { label: 'Method', value: artisan.payoutMethod ?? '-' }
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
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : docs.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                <FileText className="h-7 w-7 text-gray-200" />
                <p className="text-sm text-gray-400">No documents found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map(doc => (
                  <DocumentCard key={doc.id} doc={doc} onStale={loadDocs} />
                ))}
              </div>
            )}
          </div>

          {/* Decision */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Decision</p>
            <div className="space-y-3">
              <div className="flex gap-2">
                {(['approve', 'reject'] as const).map(a => (
                  <button key={a} type="button" onClick={() => onActionChange(a)} className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium border transition-colors ${action === a ? (a === 'approve' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200') : 'text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                    {a === 'approve' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {a === 'approve' ? 'Approve Provider' : 'Reject Provider'}
                  </button>
                ))}
              </div>
              <div>
                <Label className="text-xs text-gray-500">
                  Reason <span className="text-gray-400">(min 5 chars)</span>
                </Label>
                <textarea className="mt-1.5 w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200" placeholder={action === 'approve' ? 'All documents reviewed and verified.' : 'Describe the reason for rejection…'} value={reason} onChange={e => onReasonChange(e.target.value)} />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={loading || reason.trim().length < 5} onClick={onConfirm} className={action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {loading ? 'Submitting…' : `Confirm ${action === 'approve' ? 'Approval' : 'Rejection'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type ActionDialogType = 'suspend' | 'ban' | 'delete' | 'reinstate' | 'force_logout'

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
    if (!user) {
      setRichUser(null)
      return
    }
    setRichLoading(true)
    getUser(user.role, user.roleAccountId)
      .then(setRichUser)
      .catch(() => setRichUser(null))
      .finally(() => setRichLoading(false))
  }, [user])

  // Use enriched data when available, fall back to list data immediately
  const u = richUser ?? user
  const client = u?.role === 'client' ? u.profile : null
  const driver = u?.role === 'driver' ? u.profile : null
  const artisan = u?.role === 'artisan' ? u.profile : null

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ fullName: '', email: '' })
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [actionDialog, setActionDialog] = useState<ActionDialogType | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  const [verifyDialog, setVerifyDialog] = useState<{
    providerId: string
    providerType: 'driver' | 'artisan'
  } | null>(null)
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

  const [editProvider, setEditProvider] = useState<'driver' | 'artisan' | null>(null)

  const { can } = useRole()
  const canUnlockPayout = can('unlock_payout_method')
  const canEditProviderProfile = can('edit_provider_profile')
  const canSuspend = can('suspend_user')
  const canBan = can('ban_user')
  const canDelete = can('delete_user')
  const canForceLogout = can('force_logout_user')
  const canViewVerifications = can('view_verifications')
  // The profile-sheet inline review maps to the RM final decision.

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
      await updateUser(u.role, u.roleAccountId, {
        fullName: editForm.fullName.trim() || undefined,
        email: editForm.email.trim() || undefined
      })
      const updated = await getUser(u.role, u.roleAccountId)
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
      if (actionDialog === 'suspend') await suspendUser(u.role, u.roleAccountId, actionReason.trim())
      else if (actionDialog === 'ban') await banUser(u.role, u.roleAccountId, actionReason.trim())
      else if (actionDialog === 'delete') await deleteUser(u.role, u.roleAccountId, actionReason.trim())
      else if (actionDialog === 'reinstate') await reinstateUser(u.role, u.roleAccountId, actionReason.trim() || undefined)
      else if (actionDialog === 'force_logout') await forceLogoutUser(u.role, u.roleAccountId, actionReason.trim())
      if (actionDialog !== 'delete' && actionDialog !== 'force_logout') {
        updated = await getUser(u.role, u.roleAccountId)
      }
      setActionDialog(null)
      if (updated) onUpdate?.(updated)
      if (actionDialog === 'delete') onClose()
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
      await finalizeVerification(verifyDialog.providerId, verifyDialog.providerType, verifyAction, verifyReason.trim())
      setVerifyDialog(null)
      if (u) {
        const updated = await getUser(u.role, u.roleAccountId)
        onUpdate?.(updated)
        setRichUser(updated)
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
    if (!u || u.role !== 'client') return
    if (kycAction === 'reject' && kycReason.trim().length < 5) {
      setKycError('Reason must be at least 5 characters when rejecting.')
      return
    }
    setKycLoading(true)
    setKycError('')
    try {
      await reviewClientKyc(u.roleAccountId, kycAction, kycAction === 'reject' ? kycReason.trim() : kycReason.trim() || undefined)
      setKycDialogOpen(false)
      const updated: PlatformUser = {
        ...u,
        profile: {
          ...u.profile,
          kycStatus: kycAction === 'approve' ? 'verified' : 'rejected',
          ghanaCardVerified: kycAction === 'approve',
          kycReviewedAt: new Date().toISOString(),
          kycRejectionReason: kycAction === 'approve' ? null : kycReason.trim()
        }
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
      if (u.role === 'client') throw new Error('Client accounts do not have provider payout methods.')
      await unlockPayoutMethod(u.role, u.roleAccountId, unlockReason.trim() || undefined)
      setUnlockDialogOpen(false)
      const updated = await getUser(u.role, u.roleAccountId)
      onUpdate?.(updated)
      setRichUser(updated)
    } catch (err) {
      setUnlockError(err instanceof ApiError ? err.message : 'Failed to unlock payout method.')
    } finally {
      setUnlockLoading(false)
    }
  }

  const roleColor = 'bg-gray-100 text-gray-600'

  return (
    <>
      <Sheet
        open={!!user}
        onOpenChange={open => {
          if (!open) {
            setEditing(false)
            onClose()
          }
        }}
      >
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
                  {(driver?.profilePhotoUrl ?? artisan?.profilePhotoUrl) && <AvatarImage src={(driver?.profilePhotoUrl ?? artisan?.profilePhotoUrl) as string} alt={u.fullName} className="object-cover" />}
                  <AvatarFallback className={`${roleColor} text-base font-bold`}>{initials(u.fullName)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <div className="space-y-2">
                      <Input
                        value={editForm.fullName}
                        onChange={e =>
                          setEditForm(f => ({
                            ...f,
                            fullName: e.target.value
                          }))
                        }
                        placeholder="Full name"
                        className="h-8 text-sm"
                      />
                      <Input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="Email (optional)" type="email" className="h-8 text-sm" />
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
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 capitalize">{u.role} account</span>
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
              {!editing && client && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Client Details</p>
                  <div className="bg-gray-50 rounded-xl px-4 py-1">
                    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100">
                      <IdCard className="h-4 w-4 text-gray-400 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Ghana Card KYC</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {clientKycBadge(client.kycStatus)}
                          {client.ghanaCardImageUrl && (
                            <button onClick={openKycReview} className="text-[11px] font-medium text-orange-500 hover:text-orange-700 underline">
                              {client.kycStatus === 'pending_review' ? 'Review Card' : 'View Card'}
                            </button>
                          )}
                        </div>
                        {client.kycStatus === 'rejected' && client.kycRejectionReason && <p className="mt-1.5 text-[11px] text-red-600 bg-red-50 rounded px-2 py-1">{client.kycRejectionReason}</p>}
                        {client.kycSubmittedAt && client.kycStatus === 'pending_review' && (
                          <p className="mt-1 text-[11px] text-gray-400">
                            Submitted{' '}
                            {new Date(client.kycSubmittedAt).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-3 py-2.5">
                      <div className="h-4 w-4 shrink-0" />
                      <div>
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Preferred Payment</p>
                        <p className="text-sm text-gray-900 mt-0.5">{client.preferredPaymentMethod ?? <span className="text-gray-400 italic">Not set</span>}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!editing && driver && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Driver Details</p>
                    {canEditProviderProfile && (
                      <button onClick={() => setEditProvider('driver')} className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-500 hover:text-orange-700">
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2.5">
                    {/* Status */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Verification</span>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={driver.verificationStatus} />
                        {driver.verificationStatus === 'pending' && (
                          <button onClick={() => openVerify(u.roleAccountId, 'driver')} className="text-[11px] font-medium text-orange-500 hover:text-orange-700 underline">
                            Review
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Online Status</span>
                      {driver.onlineStatus === 'online' ? (
                        <span className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          Online
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Offline</span>
                      )}
                    </div>

                    {driver.verificationStatus === 'suspended' && <SuspensionContext suspension={driver.suspension} liveCancellations={driver.cancellationCount30d} />}

                    <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Vehicle</p>
                      <div className="flex items-start justify-between text-sm gap-2">
                        <span className="text-gray-500 shrink-0">Make & Model</span>
                        <span className="text-gray-900 text-xs text-right">{[driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ') || <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Year</span>
                        <span className="text-gray-900 text-xs">{driver.vehicleYear ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Color</span>
                        <span className="text-gray-900 text-xs capitalize">{driver.vehicleColor ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Plate</span>
                        {driver.vehiclePlate ? <span className="font-mono bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded text-[11px]">{driver.vehiclePlate}</span> : <span className="text-xs text-gray-400 italic">Not set</span>}
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Licence</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Number</span>
                        <span className="text-gray-900 text-xs font-mono">{driver.licenceNumber ?? <span className="text-gray-400 italic not-italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Expiry</span>
                        <span className="text-gray-900 text-xs">
                          {driver.licenceExpiry ? (
                            new Date(driver.licenceExpiry).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })
                          ) : (
                            <span className="text-gray-400 italic">Not set</span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Payout</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Preference</span>
                        <span className="text-gray-900 text-xs capitalize">{driver.payoutPreference ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Method</span>
                        <span className="flex items-center gap-1.5 text-gray-900 text-xs capitalize">
                          {driver.payoutMethod ?? <span className="text-gray-400 italic">Not set</span>}
                          {driver.payoutLocked && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              <Lock className="h-2.5 w-2.5" />
                              Locked
                            </span>
                          )}
                        </span>
                      </div>
                      {canUnlockPayout && (
                        <Button variant="outline" size="sm" className="w-full justify-center gap-1.5 h-7 text-xs text-amber-700 border-amber-200 hover:bg-amber-50" onClick={openUnlockDialog}>
                          <Unlock className="h-3 w-3" /> Reset Driver Payout Method
                        </Button>
                      )}
                    </div>

                    <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Activity</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5">
                          <Star className="h-3.5 w-3.5 text-gray-400" />
                          Rating
                        </span>
                        <span className="text-xs">
                          {driver.avgRating != null ? <span className="font-medium text-amber-600">{driver.avgRating.toFixed(1)}</span> : <span className="text-gray-400">No ratings yet</span>}
                          {driver.ratingCount > 0 && <span className="text-gray-400 ml-1">({driver.ratingCount})</span>}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5 text-gray-400" />
                          Completed Rides
                        </span>
                        <span className="text-gray-900 text-xs font-medium">{driver.completedRidesCount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5">
                          <XOctagon className="h-3.5 w-3.5 text-gray-400" />
                          Cancellations (30d)
                        </span>
                        <span className={`text-xs font-medium ${driver.cancellationCount30d >= 3 ? 'text-red-600' : 'text-gray-700'}`}>{driver.cancellationCount30d}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* BR-46: legacy driver-level category controls are deliberately
                  replaced by the physical-vehicle queue. */}
              {!editing && driver && canViewVerifications && (
                <div className="rounded-xl border border-gray-100 p-3">
                  <div className="flex items-start gap-2">
                    <Car className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Vehicle-specific ride categories</p>
                      <p className="text-xs text-gray-500 mt-1">Review every physical vehicle and its categories separately.</p>
                      <Link href="/verifications/vehicles" className="inline-block mt-2 text-xs font-medium text-orange-600">
                        Open vehicle queue
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {!editing && artisan && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Artisan Details</p>
                    {canEditProviderProfile && (
                      <button onClick={() => setEditProvider('artisan')} className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-500 hover:text-orange-700">
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2.5">
                    {/* Status */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Verification</span>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={artisan.verificationStatus} />
                        {artisan.verificationStatus === 'pending' && (
                          <button onClick={() => openVerify(u.roleAccountId, 'artisan')} className="text-[11px] font-medium text-orange-500 hover:text-orange-700 underline">
                            Review
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Online Status</span>
                      {artisan.onlineStatus === 'online' ? (
                        <span className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          Online
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Offline</span>
                      )}
                    </div>

                    {artisan.verificationStatus === 'suspended' && <SuspensionContext suspension={artisan.suspension} liveCancellations={artisan.cancellationCount30d} />}

                    <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Business Info</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Business Name</span>
                        <span className="text-gray-900 text-xs font-medium">{artisan.businessName ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Display Name</span>
                        <span className="text-gray-900 text-xs">{artisan.displayName ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5 shrink-0 mt-0.5">
                          <Tag className="h-3.5 w-3.5 text-gray-400" />
                          Categories
                        </span>
                        {artisan.categories.length > 0 ? (
                          <div className="flex flex-wrap gap-1 justify-end">
                            {artisan.categories.map(cat => (
                              <span key={cat} className="text-[10px] bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded-full">
                                {cat}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic ml-auto">Not set</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Service Radius</span>
                        <span className="text-gray-900 text-xs">{artisan.serviceRadius != null ? `${artisan.serviceRadius} km` : <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Capacity</span>
                        <span className="text-gray-900 text-xs capitalize">{artisan.shopCapacity ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Max Concurrent Jobs</span>
                        <span className="text-gray-900 text-xs">{artisan.maxConcurrentJobs ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Payout</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Preference</span>
                        <span className="text-gray-900 text-xs capitalize">{artisan.payoutPreference ?? <span className="text-gray-400 italic">Not set</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Method</span>
                        <span className="flex items-center gap-1.5 text-gray-900 text-xs capitalize">
                          {artisan.payoutMethod ?? <span className="text-gray-400 italic">Not set</span>}
                          {artisan.payoutLocked && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              <Lock className="h-2.5 w-2.5" />
                              Locked
                            </span>
                          )}
                        </span>
                      </div>
                      {canUnlockPayout && (
                        <Button variant="outline" size="sm" className="w-full justify-center gap-1.5 h-7 text-xs text-amber-700 border-amber-200 hover:bg-amber-50" onClick={openUnlockDialog}>
                          <Unlock className="h-3 w-3" /> Reset Artisan Payout Method
                        </Button>
                      )}
                    </div>

                    <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Activity</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5">
                          <Star className="h-3.5 w-3.5 text-gray-400" />
                          Rating
                        </span>
                        <span className="text-xs">
                          {artisan.avgRating != null ? <span className="font-medium text-amber-600">{artisan.avgRating.toFixed(1)}</span> : <span className="text-gray-400">No ratings yet</span>}
                          {artisan.ratingCount > 0 && <span className="text-gray-400 ml-1">({artisan.ratingCount})</span>}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5 text-gray-400" />
                          Completed Jobs
                        </span>
                        <span className="text-gray-900 text-xs font-medium">{artisan.completedJobsCount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1.5">
                          <XOctagon className="h-3.5 w-3.5 text-gray-400" />
                          Cancellations (30d)
                        </span>
                        <span className={`text-xs font-medium ${artisan.cancellationCount30d >= 3 ? 'text-red-600' : 'text-gray-700'}`}>{artisan.cancellationCount30d}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Documents — drivers and artisans only */}
              {!editing && (driver || artisan) && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Documents</p>
                  <DocumentsSection roleAccountId={u.roleAccountId} role={u.role === 'driver' ? 'driver' : 'artisan'} userName={u.fullName} />
                </div>
              )}

              {/* Account actions */}
              {!editing && (canSuspend || canBan || canDelete || canForceLogout) && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Account Actions</p>
                  <div className="flex flex-col gap-2">
                    {canSuspend && u.status === 'suspended' && (
                      <Button variant="outline" size="sm" className="justify-start gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => openAction('reinstate')}>
                        <RotateCcw className="h-4 w-4" /> Reinstate Account
                      </Button>
                    )}
                    {canForceLogout && u.status !== 'banned' && (
                      <Button variant="outline" size="sm" className="justify-start gap-2 text-blue-700 border-blue-200 hover:bg-blue-50" onClick={() => openAction('force_logout')}>
                        <LogOut className="h-4 w-4" /> Force Logout ({u.role} only)
                      </Button>
                    )}
                    {canSuspend && u.status !== 'suspended' && u.status !== 'banned' && (
                      <Button variant="outline" size="sm" className="justify-start gap-2 text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => openAction('suspend')}>
                        <UserX className="h-4 w-4" /> Suspend Account
                      </Button>
                    )}
                    {canBan && u.status !== 'banned' && u.status !== 'deleted' && (
                      <Button variant="outline" size="sm" className="justify-start gap-2 text-red-600 border-red-200 hover:bg-red-50" onClick={() => openAction('ban')}>
                        <ShieldOff className="h-4 w-4" /> Ban Permanently
                      </Button>
                    )}
                    {canDelete && u.status !== 'banned' && u.status !== 'deleted' && (
                      <Button variant="outline" size="sm" className="justify-start gap-2 text-gray-700 border-gray-300 hover:bg-gray-50" onClick={() => openAction('delete')}>
                        <Trash2 className="h-4 w-4" /> Delete Account
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* ID */}
              {!editing && (
                <p className="text-[10px] text-gray-300 font-mono break-all capitalize">
                  {u.role} account ID: {u.roleAccountId}
                </p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirm action dialog */}
      <Dialog
        open={!!actionDialog}
        onOpenChange={open => {
          if (!open) setActionDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={actionDialog === 'ban' ? 'text-red-600' : actionDialog === 'delete' ? 'text-gray-700' : actionDialog === 'suspend' ? 'text-orange-600' : actionDialog === 'force_logout' ? 'text-blue-700' : 'text-emerald-700'}>
              {actionDialog === 'reinstate' ? 'Reinstate' : actionDialog === 'ban' ? 'Ban' : actionDialog === 'delete' ? 'Delete' : actionDialog === 'force_logout' ? 'Force Logout' : 'Suspend'} {u?.role} account for {user?.fullName}
            </DialogTitle>
            <DialogDescription>{actionDialog === 'reinstate' ? `Restore only this ${u?.role} account. Its sibling accounts remain untouched.` : actionDialog === 'ban' ? `This permanently bans only this ${u?.role} account. Its sibling accounts remain untouched.` : actionDialog === 'delete' ? `Soft-deletes only this ${u?.role} account for 90-day retention. Client, driver, and artisan siblings remain untouched; outstanding clawbacks must be settled first.` : actionDialog === 'force_logout' ? `Revoke only this ${u?.role} account's sessions on every device. Sibling-role sessions remain active.` : `Suspend only this ${u?.role} account. Its sibling accounts remain untouched.`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-gray-500">Reason {actionDialog !== 'reinstate' && <span className="text-gray-400">(min 10 chars)</span>}</Label>
              <textarea className="mt-1.5 w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200" placeholder={actionDialog === 'reinstate' ? 'Reason for reinstatement (optional)…' : 'Describe the reason for this action…'} value={actionReason} onChange={e => setActionReason(e.target.value)} />
            </div>
            {actionError && <p className="text-xs text-red-600">{actionError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>
              Cancel
            </Button>
            <Button disabled={actionLoading || (actionDialog !== 'reinstate' && actionReason.trim().length < 10)} onClick={handleActionConfirm} className={actionDialog === 'ban' ? 'bg-red-600 hover:bg-red-700 text-white' : actionDialog === 'delete' ? 'bg-gray-700 hover:bg-gray-800 text-white' : actionDialog === 'suspend' ? 'bg-orange-500 hover:bg-orange-600 text-white' : actionDialog === 'force_logout' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Confirm ${actionDialog === 'reinstate' ? 'Reinstatement' : actionDialog === 'ban' ? 'Ban' : actionDialog === 'delete' ? 'Deletion' : actionDialog === 'force_logout' ? 'Force Logout' : 'Suspension'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify provider review dialog */}
      <VerifyProviderDialog
        open={!!verifyDialog}
        user={user}
        providerType={verifyDialog?.providerType ?? null}
        action={verifyAction}
        reason={verifyReason}
        loading={verifyLoading}
        error={verifyError}
        onActionChange={a => {
          setVerifyAction(a)
          setVerifyError('')
        }}
        onReasonChange={r => {
          setVerifyReason(r)
          setVerifyError('')
        }}
        onConfirm={handleVerifyConfirm}
        onClose={() => setVerifyDialog(null)}
      />

      {/* Unlock payout method dialog */}
      <Dialog
        open={unlockDialogOpen}
        onOpenChange={open => {
          if (!open) setUnlockDialogOpen(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-amber-700 flex items-center gap-2">
              <Unlock className="h-4 w-4" /> Unlock Payout Method
            </DialogTitle>
            <DialogDescription>This clears the payout binding only for this {u?.role} account. The sibling provider role, if any, remains untouched. A new OTP-verified payout binding is required before payouts resume.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-gray-500">
                Reason <span className="text-gray-400">(optional)</span>
              </Label>
              <textarea className="mt-1.5 w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200" placeholder="e.g. User contacted support - lost access to MoMo number…" value={unlockReason} onChange={e => setUnlockReason(e.target.value)} />
            </div>
            {unlockError && <p className="text-xs text-red-600">{unlockError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={unlockLoading} onClick={handleUnlockConfirm} className="bg-amber-600 hover:bg-amber-700 text-white">
              {unlockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Unlock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit provider profile dialog */}
      {editProvider && u && (
        <EditProviderProfileDialog
          open={!!editProvider}
          providerType={editProvider}
          user={u}
          onClose={() => setEditProvider(null)}
          onSaved={updated => {
            setRichUser(updated)
            onUpdate?.(updated)
          }}
        />
      )}

      {/* Verify client Ghana Card dialog */}
      <VerifyClientKycDialog
        open={kycDialogOpen}
        fullName={u?.fullName ?? null}
        ghanaCardImageUrl={client?.ghanaCardImageUrl ?? null}
        submittedAt={client?.kycSubmittedAt ?? null}
        action={kycAction}
        reason={kycReason}
        loading={kycLoading}
        error={kycError}
        onActionChange={a => {
          setKycAction(a)
          setKycError('')
        }}
        onReasonChange={r => {
          setKycReason(r)
          setKycError('')
        }}
        onConfirm={handleKycConfirm}
        onClose={() => setKycDialogOpen(false)}
      />
    </>
  )
}
