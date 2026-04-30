'use client'

import { CheckCircle, XCircle, Loader2, IdCard, ExternalLink } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function clientKycBadge(status: string) {
  if (status === 'verified')
    return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><CheckCircle className="h-3 w-3" />Verified</span>
  if (status === 'rejected')
    return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700"><XCircle className="h-3 w-3" />Rejected</span>
  if (status === 'pending_review')
    return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending Review</span>
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Not Submitted</span>
}

interface VerifyClientKycDialogProps {
  open: boolean
  fullName: string | null
  ghanaCardImageUrl: string | null
  submittedAt: string | null
  action: 'approve' | 'reject'
  reason: string
  loading: boolean
  error: string
  onActionChange: (a: 'approve' | 'reject') => void
  onReasonChange: (r: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function VerifyClientKycDialog({
  open, fullName, ghanaCardImageUrl, submittedAt,
  action, reason, loading, error,
  onActionChange, onReasonChange, onConfirm, onClose,
}: VerifyClientKycDialogProps) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <DialogTitle className="text-base font-semibold text-gray-900">
            Review Ghana Card{fullName ? ` — ${fullName}` : ''}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-400">
            Inspect the client&apos;s submitted Ghana Card image, then approve or reject.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Card image */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Ghana Card</p>
              {submittedAt && (
                <p className="text-[11px] text-gray-400">
                  Submitted {new Date(submittedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            {ghanaCardImageUrl ? (
              <div className="rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ghanaCardImageUrl} alt="Ghana Card" className="w-full max-h-[420px] object-contain bg-gray-50" />
                <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-end">
                  <a
                    href={ghanaCardImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-orange-500 hover:text-orange-700"
                  >
                    Open full size <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 py-10 text-center bg-gray-50 rounded-lg">
                <IdCard className="h-7 w-7 text-gray-200" />
                <p className="text-sm text-gray-400">No Ghana Card image uploaded</p>
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
                    {a === 'approve' ? 'Approve Card' : 'Reject Card'}
                  </button>
                ))}
              </div>
              <div>
                <Label className="text-xs text-gray-500">
                  Reason {action === 'reject' && <span className="text-gray-400">(min 5 chars, shown to client)</span>}
                </Label>
                <textarea
                  className="mt-1.5 w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder={action === 'approve'
                    ? 'Card verified — name and number match (optional).'
                    : 'e.g. Image is blurry. Please re-upload a clearer photo of the front.'}
                  value={reason}
                  onChange={e => onReasonChange(e.target.value)}
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={loading || (action === 'reject' && reason.trim().length < 5)}
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
