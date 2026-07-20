'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarPlus, Pencil, Check, Loader2, AlertTriangle } from 'lucide-react'
import { setDocumentExpiry, documentTypeTracksExpiry } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { useRole } from '@/hooks/use-role'

// ── Date helpers (the document-expiry contract is explicitly GMT) ─────────────
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// The backend returns expiresAt as a full ISO datetime; slice to YYYY-MM-DD for
// the <input type="date"> value and for lexical past-date comparison. Slicing
// (rather than `new Date`) avoids any timezone shift on the date boundary.
function toInputValue(iso: string): string {
  return iso.slice(0, 10)
}

function isPastDate(yyyyMmDd: string): boolean {
  return yyyyMmDd < todayStr()
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Expiry-date backfill control for provider verification documents.
 *
 * Renders next to the approve/reject affordance on any document-review surface
 * (the verification queue drawer and a provider's document list). Only shown for
 * document types that carry a real-world expiry (see EXPIRY_TRACKED_DOC_TYPES) and
 * only editable by admins holding `verify_documents` — the same permission that
 * gates approve/reject. See docs/admin-frontend-spec-document-expiry.md.
 *
 * Calls PATCH /admin/verifications/documents/:id/expiry. The row updates
 * optimistically from the response; on a 404 (the id is a superseded version)
 * it surfaces a refresh hint and asks the parent to reload via `onStale`.
 */
export function DocumentExpiryControl({
  documentId,
  documentType,
  expiresAt,
  onStale,
  editable = true,
  className = '',
}: {
  documentId: string
  documentType: string
  expiresAt: string | null
  /** Called after a 404 so the parent can refetch the (superseded) document list. */
  onStale?: () => void
  /**
   * Whether the Add/Edit affordance is offered. Pass false for superseded
   * (non-current) versions — the backend only patches the current version, so
   * editing there would always 404. Defaults to true.
   */
  editable?: boolean
  className?: string
}) {
  const { can } = useRole()
  // Both the permission and the version-currency gate the edit affordance.
  const canEdit = editable && can('verify_documents')

  const [current, setCurrent] = useState<string | null>(expiresAt)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmingPast, setConfirmingPast] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  // Keep local state in sync only when the parent genuinely hands us a *different*
  // expiry (e.g. after a refetch) — never on every render, or we'd clobber the
  // optimistic value we just saved (the parent doesn't refetch on success). Also
  // deferred while mid-edit so an in-progress entry isn't overwritten.
  const lastSyncedRef = useRef(expiresAt)
  useEffect(() => {
    if (editing) return
    if (expiresAt === lastSyncedRef.current) return
    lastSyncedRef.current = expiresAt
    setCurrent(expiresAt)
  }, [expiresAt, editing])

  // Auto-dismiss the "Saved" confirmation.
  useEffect(() => {
    if (!savedFlash) return
    const t = setTimeout(() => setSavedFlash(false), 2500)
    return () => clearTimeout(t)
  }, [savedFlash])

  // UI hygiene: this control is only for document types that actually expire.
  if (!documentTypeTracksExpiry(documentType)) return null

  function startEdit() {
    setValue(current ? toInputValue(current) : '')
    setError('')
    setConfirmingPast(false)
    setSavedFlash(false)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setConfirmingPast(false)
    setError('')
  }

  function attemptSave() {
    setError('')
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setError('Enter a valid date.')
      return
    }
    // A past date has a provider-facing consequence (marks the document expired
    // and prompts re-upload) — confirm once before committing.
    if (isPastDate(value) && !confirmingPast) {
      setConfirmingPast(true)
      return
    }
    void save()
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await setDocumentExpiry(documentId, value)
      setCurrent(res?.expiresAt ?? value)
      setEditing(false)
      setConfirmingPast(false)
      setSavedFlash(true)
    } catch (err) {
      const e = err instanceof ApiError ? err : null
      if (e?.status === 404 || e?.code === 'DOCUMENT_NOT_FOUND') {
        setError('This document is no longer the current version — refresh and try again.')
        onStale?.()
      } else if (e?.status === 400) {
        setError('Enter a valid date.')
      } else {
        setError(e?.message ?? 'Could not save the expiry date. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={value}
            onChange={e => { setValue(e.target.value); setError(''); setConfirmingPast(false) }}
            disabled={saving}
            className="h-8 rounded-md border border-gray-200 px-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={attemptSave}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: '#F5A623' }}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {saving ? 'Saving…' : confirmingPast ? 'Confirm' : 'Save'}
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            className="rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>

        {confirmingPast && !error && (
          <div className="flex items-start gap-1.5 rounded-md bg-amber-50 border border-amber-100 px-2 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 leading-snug">
              This date is in the past. Saving will mark the document as <strong>expired</strong> and prompt the
              provider to re-upload. Press <strong>Confirm</strong> to continue.
            </p>
          </div>
        )}

        {error && (
          <p className="flex items-center gap-1 text-[11px] text-red-600">
            <AlertTriangle className="h-3 w-3 shrink-0" />{error}
          </p>
        )}
      </div>
    )
  }

  // ── View mode — expiry already set ───────────────────────────────────────────
  if (current) {
    const expired = isPastDate(toInputValue(current))
    return (
      <div className={`flex items-center gap-2 flex-wrap ${className}`}>
        <span className="text-[11px] text-gray-500">Expires {formatExpiry(current)}</span>
        {expired && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
            <AlertTriangle className="h-3 w-3" /> Expired
          </span>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-500 hover:text-orange-700"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
        {savedFlash && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
            <Check className="h-3 w-3" /> Saved
          </span>
        )}
      </div>
    )
  }

  // ── View mode — legacy backfill case (no expiry set) ─────────────────────────
  // Hidden entirely for admins who can't edit — there is nothing to show.
  if (!canEdit) return null

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <button
        type="button"
        onClick={startEdit}
        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100 transition-colors"
      >
        <CalendarPlus className="h-3.5 w-3.5" /> Add expiry date
      </button>
      {savedFlash && (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
          <Check className="h-3 w-3" /> Saved
        </span>
      )}
    </div>
  )
}
