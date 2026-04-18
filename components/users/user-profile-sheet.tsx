'use client'

import { useState, useEffect } from 'react'
import { Mail, Phone, Calendar, Star, Pencil, Check, X, Loader2, RotateCcw, ShieldOff, UserX, FileText, ExternalLink, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/common/status-badge'
import { PdfViewer } from '@/components/common/pdf-viewer'
import { updateUser, reinstateUser, suspendUser, banUser, getProviderDocuments, type PlatformUser, type UserProviderDocument } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
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
    return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><CheckCircle className="h-3 w-3" />Approved</span>
  if (status === 'rejected')
    return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700"><XCircle className="h-3 w-3" />Rejected</span>
  if (status === 'pending_review')
    return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending Review</span>
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Awaiting Upload</span>
}

function DocumentCard({ doc }: { doc: UserProviderDocument }) {
  const lower = doc.fileUrl.toLowerCase()
  // Prefer mimeType from DB; fall back to URL pattern (Cloudinary strips extension from public_id,
  // so PDFs land at /raw/upload/... with no .pdf in the URL)
  const isPdf = doc.mimeType === 'application/pdf'
    || lower.includes('.pdf') || lower.includes('/raw/upload/')
  const isImage = !isPdf && (
    (doc.mimeType?.startsWith('image/') ?? false)
    || lower.match(/\.(jpe?g|png|webp|gif|avif)/) != null
    || lower.includes('/image/upload/')
  )
  // fileUrl is only a real URL after confirmDocumentUpload — status 'uploaded' stores a storage key path
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
              <span className="text-[10px] bg-blue-50 text-blue-600 px-1 rounded font-medium shrink-0">v{doc.version}</span>
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

function DocumentsSection({ userId }: { userId: string }) {
  const [data, setData] = useState<UserProviderDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError('')
    getProviderDocuments(userId)
      .then(res => setData(res.documents))
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

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-6 text-center">
        <FileText className="h-7 w-7 text-gray-200" />
        <p className="text-sm text-gray-400">No documents uploaded yet</p>
      </div>
    )
  }

  const current = data.filter(d => d.isCurrent)
  const history = data.filter(d => !d.isCurrent)

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

type ActionDialogType = 'suspend' | 'ban' | 'reinstate'

interface UserProfileSheetProps {
  user: PlatformUser | null
  onClose: () => void
  onUpdate?: (updated: PlatformUser) => void
}

export function UserProfileSheet({ user, onClose, onUpdate }: UserProfileSheetProps) {
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ fullName: '', email: '' })
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [actionDialog, setActionDialog] = useState<ActionDialogType | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  function startEdit() {
    if (!user) return
    setEditForm({ fullName: user.fullName, email: user.email ?? '' })
    setSaveError('')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setSaveError('')
  }

  async function handleSave() {
    if (!user) return
    setSaveLoading(true)
    setSaveError('')
    try {
      const updated = await updateUser(user.id, {
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
    if (!user || !actionDialog) return
    if (actionDialog !== 'reinstate' && actionReason.trim().length < 10) {
      setActionError('Reason must be at least 10 characters.')
      return
    }
    setActionLoading(true)
    setActionError('')
    try {
      let updated: PlatformUser | undefined
      if (actionDialog === 'suspend') updated = await suspendUser(user.id, actionReason.trim()) as PlatformUser
      else if (actionDialog === 'ban') updated = await banUser(user.id, actionReason.trim()) as PlatformUser
      else if (actionDialog === 'reinstate') updated = await reinstateUser(user.id, actionReason.trim() || undefined) as PlatformUser
      setActionDialog(null)
      if (updated) onUpdate?.(updated)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed.')
    } finally {
      setActionLoading(false)
    }
  }

  const roles = user?.roles ?? []
  const roleColor = roles.includes('driver')
    ? 'bg-green-100 text-green-700'
    : roles.includes('artisan')
    ? 'bg-purple-100 text-purple-700'
    : 'bg-blue-100 text-blue-700'

  return (
    <>
      <Sheet open={!!user} onOpenChange={open => { if (!open) { setEditing(false); onClose() } }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="pb-0">
            <SheetTitle className="sr-only">User Profile</SheetTitle>
            <SheetDescription className="sr-only">View and manage user account details</SheetDescription>
          </SheetHeader>

          {user && (
            <div className="px-4 pb-6 space-y-5">
              {/* Hero */}
              <div className="flex items-start gap-4 pt-2">
                <Avatar className="h-14 w-14">
                  <AvatarFallback className={`${roleColor} text-base font-bold`}>
                    {initials(user.fullName)}
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
                        <h2 className="text-base font-semibold text-gray-900 truncate">{user.fullName}</h2>
                        <button onClick={startEdit} className="text-gray-400 hover:text-gray-600 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <StatusBadge status={user.status} />
                        {roles.map(r => (
                          <span key={r} className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                            r === 'client' ? 'bg-blue-100 text-blue-700'
                            : r === 'driver' ? 'bg-green-100 text-green-700'
                            : 'bg-purple-100 text-purple-700'
                          }`}>{r}</span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Contact & dates */}
              {!editing && (
                <div className="bg-gray-50 rounded-xl px-4 py-1">
                  <InfoRow icon={Phone} label="Phone" value={<span className="font-mono">{user.phone}</span>} />
                  <InfoRow icon={Mail} label="Email" value={user.email ?? <span className="text-gray-400 italic">Not set</span>} />
                  <InfoRow icon={Calendar} label="Joined" value={formatDate(user.createdAt)} />
                </div>
              )}

              {/* Role-specific data */}
              {!editing && user.client && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Client Details</p>
                  <div className="bg-gray-50 rounded-xl px-4 py-1">
                    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100">
                      <Star className="h-4 w-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Loyalty Points</p>
                        <p className="text-sm font-semibold text-orange-600 mt-0.5">{user.client.loyaltyPointsBalance.toLocaleString()} pts</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 py-2.5">
                      <div className="h-4 w-4 shrink-0" />
                      <div>
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Preferred Payment</p>
                        <p className="text-sm text-gray-900 mt-0.5">{user.client.preferredPaymentMethod ?? <span className="text-gray-400 italic">Not set</span>}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!editing && user.driver && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Driver Details</p>
                  <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Verification</span>
                      <StatusBadge status={user.driver.verificationStatus} />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Online Status</span>
                      {user.driver.onlineStatus === 'online'
                        ? <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Online</span>
                        : <span className="text-xs text-gray-400">Offline</span>
                      }
                    </div>
                  </div>
                </div>
              )}

              {!editing && user.artisan && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Artisan Details</p>
                  <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Verification</span>
                      <StatusBadge status={user.artisan.verificationStatus} />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Online Status</span>
                      {user.artisan.onlineStatus === 'online'
                        ? <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Online</span>
                        : <span className="text-xs text-gray-400">Offline</span>
                      }
                    </div>
                  </div>
                </div>
              )}

              {/* Documents — drivers and artisans only */}
              {!editing && (user.driver || user.artisan) && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Documents</p>
                  <DocumentsSection userId={user.id} />
                </div>
              )}

              {/* Account actions */}
              {!editing && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Account Actions</p>
                  <div className="flex flex-col gap-2">
                    {user.status === 'suspended' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        onClick={() => openAction('reinstate')}
                      >
                        <RotateCcw className="h-4 w-4" /> Reinstate Account
                      </Button>
                    )}
                    {user.status !== 'suspended' && user.status !== 'banned' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                        onClick={() => openAction('suspend')}
                      >
                        <UserX className="h-4 w-4" /> Suspend Account
                      </Button>
                    )}
                    {user.status !== 'banned' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start gap-2 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => openAction('ban')}
                      >
                        <ShieldOff className="h-4 w-4" /> Ban Permanently
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* ID */}
              {!editing && (
                <p className="text-[10px] text-gray-300 font-mono break-all">ID: {user.id}</p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirm action dialog */}
      <Dialog open={!!actionDialog} onOpenChange={open => { if (!open) setActionDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={actionDialog === 'ban' ? 'text-red-600' : actionDialog === 'suspend' ? 'text-orange-600' : 'text-emerald-700'}>
              {actionDialog === 'reinstate' ? 'Reinstate' : actionDialog === 'ban' ? 'Ban' : 'Suspend'} {user?.fullName}
            </DialogTitle>
            <DialogDescription>
              {actionDialog === 'reinstate'
                ? 'Restore this user\'s access to the platform.'
                : actionDialog === 'ban'
                ? 'This will permanently ban the user. This action is hard to reverse.'
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
                : actionDialog === 'suspend'
                ? 'bg-orange-500 hover:bg-orange-600 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Confirm ${actionDialog === 'reinstate' ? 'Reinstatement' : actionDialog === 'ban' ? 'Ban' : 'Suspension'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
