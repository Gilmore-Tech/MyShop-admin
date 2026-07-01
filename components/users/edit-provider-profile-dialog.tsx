'use client'

import { useMemo, useRef, useState } from 'react'
import { Loader2, Pencil, Camera, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  editDriverProfile,
  editArtisanProfile,
  uploadProviderPhoto,
  getUser,
  type PlatformUser,
  type EditDriverProfileInput,
  type EditArtisanProfileInput,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'

// Form key for the profile photo — handled outside the descriptor grid (it has a
// bespoke upload control) but tracked in the same form/initial record so the
// shared diff logic still picks up changes.
const PHOTO_KEY = 'profilePhotoUrl'

// Client-side guard before uploading to Cloudinary.
const MAX_PHOTO_BYTES = 5 * 1024 * 1024 // 5 MB

function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// ── Field descriptors ─────────────────────────────────────────────────────────
// The two PATCH endpoints (/driver-profile, /artisan-profile) accept an
// overlapping-but-distinct field set. We drive both forms off a descriptor list
// so the diff/submit logic is shared. `key` is the API field name; numeric and
// date inputs are stored as strings and coerced only at submit time.

type FieldType = 'text' | 'email' | 'number' | 'date' | 'textarea' | 'capacity'

interface FieldDef {
  key: string
  label: string
  type: FieldType
  min?: number
  max?: number
  maxLength?: number
  hint?: string
  full?: boolean // span both grid columns
}

const DRIVER_FIELDS: FieldDef[] = [
  { key: 'legalName', label: 'Legal name', type: 'text', full: true },
  { key: 'email', label: 'Email', type: 'email', full: true },
  { key: 'displayName', label: 'Display name', type: 'text', full: true },
  { key: 'vehicleMake', label: 'Vehicle make', type: 'text' },
  { key: 'vehicleModel', label: 'Vehicle model', type: 'text' },
  { key: 'vehicleYear', label: 'Vehicle year', type: 'number', min: 1990, max: 2100 },
  { key: 'vehicleColor', label: 'Vehicle colour', type: 'text' },
  { key: 'vehiclePlate', label: 'Plate number', type: 'text' },
  { key: 'serviceRadiusKm', label: 'Service radius (km)', type: 'number', min: 1, max: 100 },
  { key: 'licenceNumber', label: 'Licence number', type: 'text' },
  { key: 'licenceExpiry', label: 'Licence expiry', type: 'date' },
]

const ARTISAN_FIELDS: FieldDef[] = [
  { key: 'legalName', label: 'Legal name', type: 'text', full: true },
  { key: 'email', label: 'Email', type: 'email', full: true },
  { key: 'displayName', label: 'Display name', type: 'text' },
  { key: 'businessName', label: 'Business name', type: 'text' },
  { key: 'businessAddress', label: 'Business address', type: 'textarea', maxLength: 500, full: true },
  { key: 'businessPhone', label: 'Business phone', type: 'text', maxLength: 32 },
  { key: 'shopCapacity', label: 'Shop capacity', type: 'capacity' },
  { key: 'maxConcurrentJobs', label: 'Max concurrent jobs', type: 'number', min: 1, max: 3 },
  { key: 'serviceRadiusKm', label: 'Service radius (km)', type: 'number', min: 1, max: 100 },
  { key: 'serviceLatitude', label: 'Service latitude', type: 'number', min: -90, max: 90 },
  { key: 'serviceLongitude', label: 'Service longitude', type: 'number', min: -180, max: 180 },
]

// Initial string values for the form, sourced from the GET-detail provider object.
// Number/date are stringified; date is trimmed to yyyy-MM-dd for the date input.
function initialValues(providerType: 'driver' | 'artisan', u: PlatformUser): Record<string, string> {
  const str = (v: unknown) => (v == null ? '' : String(v))
  if (providerType === 'driver') {
    const d = u.driver
    return {
      profilePhotoUrl: str(d?.profilePhotoUrl),
      legalName: str(d?.legalName),
      email: str(d?.email),
      displayName: str(d?.displayName),
      vehicleMake: str(d?.vehicleMake),
      vehicleModel: str(d?.vehicleModel),
      vehicleYear: str(d?.vehicleYear),
      vehicleColor: str(d?.vehicleColor),
      vehiclePlate: str(d?.vehiclePlate),
      serviceRadiusKm: str(d?.serviceRadius),
      licenceNumber: str(d?.licenceNumber),
      licenceExpiry: d?.licenceExpiry ? d.licenceExpiry.slice(0, 10) : '',
    }
  }
  const a = u.artisan
  return {
    profilePhotoUrl: str(a?.profilePhotoUrl),
    legalName: str(a?.legalName),
    email: str(a?.email),
    displayName: str(a?.displayName),
    businessName: str(a?.businessName),
    businessAddress: str(a?.businessAddress),
    businessPhone: str(a?.businessPhone),
    shopCapacity: str(a?.shopCapacity),
    maxConcurrentJobs: str(a?.maxConcurrentJobs),
    serviceRadiusKm: str(a?.serviceRadius),
    serviceLatitude: str(a?.serviceLatitude),
    serviceLongitude: str(a?.serviceLongitude),
  }
}

// Maps the backend error envelope codes to friendly, field-aware messages.
function messageForError(err: unknown, providerType: 'driver' | 'artisan'): { general?: string; email?: string } {
  if (!(err instanceof ApiError)) return { general: 'Failed to save changes.' }
  switch (err.code) {
    case 'NO_UPDATE_FIELDS':
      return { general: 'No changes to save.' }
    case 'INSUFFICIENT_PERMISSIONS':
      return { general: "You don't have permission to edit provider profiles." }
    case 'OUT_OF_SCOPE':
      return { general: 'This provider is outside your region/category scope.' }
    case 'PROVIDER_NOT_FOUND':
      return { general: `This user has no ${providerType} profile to edit.` }
    case 'EMAIL_ALREADY_EXISTS':
      return { email: 'This email is already used by another provider.' }
    default:
      return { general: err.message || 'Failed to save changes.' }
  }
}

interface EditProviderProfileDialogProps {
  open: boolean
  providerType: 'driver' | 'artisan'
  user: PlatformUser
  onClose: () => void
  onSaved: (updated: PlatformUser) => void
}

export function EditProviderProfileDialog({ open, providerType, user, onClose, onSaved }: EditProviderProfileDialogProps) {
  const fields = providerType === 'driver' ? DRIVER_FIELDS : ARTISAN_FIELDS
  // Snapshot the initial values so the diff is stable across edits. The dialog is
  // conditionally rendered (remounts per open), so this recomputes on each open.
  const initial = useMemo(() => initialValues(providerType, user), [providerType, user])

  const [form, setForm] = useState<Record<string, string>>(initial)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [generalError, setGeneralError] = useState('')
  const [emailError, setEmailError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')

  // Reset local state whenever the dialog (re)opens for a provider.
  function syncOnOpen(isOpen: boolean) {
    if (isOpen) {
      setForm(initial)
      setReason('')
      setGeneralError('')
      setEmailError('')
      setPhotoError('')
    } else {
      onClose()
    }
  }

  function setField(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    setGeneralError('')
    if (key === 'email') setEmailError('')
  }

  async function handlePhotoPick(file: File | null) {
    if (!file) return
    setPhotoError('')
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose an image file.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('Image must be 5 MB or smaller.')
      return
    }
    setUploadingPhoto(true)
    try {
      const url = await uploadProviderPhoto(user.id, file)
      setField(PHOTO_KEY, url)
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Photo upload failed.')
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Build the PATCH body from only the fields that actually changed — keeps the
  // request minimal (no accidental overwrites) and avoids NO_UPDATE_FIELDS.
  // The photo lives outside `fields`, so check it explicitly.
  const changedKeys = useMemo(() => {
    const keys = fields.filter(f => (form[f.key] ?? '') !== (initial[f.key] ?? '')).map(f => f.key)
    if ((form[PHOTO_KEY] ?? '') !== (initial[PHOTO_KEY] ?? '')) keys.push(PHOTO_KEY)
    return keys
  }, [fields, form, initial])
  const hasChanges = changedKeys.length > 0

  function buildPayload(): { payload: Record<string, unknown> } | { error: string } {
    const payload: Record<string, unknown> = {}
    for (const f of fields) {
      if (!changedKeys.includes(f.key)) continue
      const raw = (form[f.key] ?? '').trim()
      if (f.type === 'number') {
        if (raw === '') continue // a number can't be cleared via this form; skip
        const n = Number(raw)
        if (Number.isNaN(n)) return { error: `${f.label} must be a number.` }
        if (f.min != null && n < f.min) return { error: `${f.label} must be at least ${f.min}.` }
        if (f.max != null && n > f.max) return { error: `${f.label} must be at most ${f.max}.` }
        payload[f.key] = n
      } else {
        payload[f.key] = raw
      }
    }
    if (changedKeys.includes(PHOTO_KEY)) payload[PHOTO_KEY] = (form[PHOTO_KEY] ?? '').trim()
    return { payload }
  }

  async function handleSave() {
    const built = buildPayload()
    if ('error' in built) {
      setGeneralError(built.error)
      return
    }
    const { payload } = built
    if (Object.keys(payload).length === 0) {
      setGeneralError('No changes to save.')
      return
    }
    if (reason.trim()) payload.reason = reason.trim()

    setLoading(true)
    setGeneralError('')
    setEmailError('')
    try {
      if (providerType === 'driver') {
        await editDriverProfile(user.id, payload as EditDriverProfileInput)
      } else {
        await editArtisanProfile(user.id, payload as EditArtisanProfileInput)
      }
      // Re-fetch the normalised detail so the sheet reflects the saved values.
      const refreshed = await getUser(user.id)
      onSaved(refreshed)
      onClose()
    } catch (err) {
      const { general, email } = messageForError(err, providerType)
      if (general) setGeneralError(general)
      if (email) setEmailError(email)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={syncOnOpen}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <DialogTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Pencil className="h-4 w-4 text-orange-500" />
            Edit {providerType} profile
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-400">
            Update {user.fullName}&apos;s {providerType} details. Payout details aren&apos;t editable here.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Profile photo */}
          {(() => {
            const photo = form[PHOTO_KEY] ?? ''
            return (
              <div className="mb-5 flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  {photo && <AvatarImage src={photo} alt={user.fullName} className="object-cover" />}
                  <AvatarFallback className="bg-gray-100 text-gray-500 text-lg font-bold">
                    {initials(user.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <Label className="text-xs text-gray-500">Profile photo</Label>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => handlePhotoPick(e.target.files?.[0] ?? null)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      disabled={uploadingPhoto}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                      {uploadingPhoto ? 'Uploading…' : photo ? 'Replace' : 'Upload'}
                    </Button>
                    {photo && !uploadingPhoto && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => { setField(PHOTO_KEY, ''); setPhotoError('') }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">JPG or PNG, up to 5 MB.</p>
                  {photoError && <p className="mt-1 text-[11px] text-red-600">{photoError}</p>}
                </div>
              </div>
            )
          })()}

          <div className="grid grid-cols-2 gap-3">
            {fields.map(f => {
              const isFull = f.full || f.type === 'textarea'
              const value = form[f.key] ?? ''
              const showEmailError = f.key === 'email' && emailError
              return (
                <div key={f.key} className={isFull ? 'col-span-2' : ''}>
                  <Label className="text-xs text-gray-500">{f.label}</Label>
                  {f.type === 'textarea' ? (
                    <textarea
                      className="mt-1 w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-16 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
                      maxLength={f.maxLength}
                      value={value}
                      onChange={e => setField(f.key, e.target.value)}
                    />
                  ) : f.type === 'capacity' ? (
                    <div className="mt-1 flex gap-2">
                      {(['solo', 'multi'] as const).map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setField(f.key, opt)}
                          className={`flex-1 rounded-lg py-2 text-sm font-medium border capitalize transition-colors ${
                            value === opt
                              ? 'bg-orange-50 text-orange-700 border-orange-200'
                              : 'text-gray-500 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Input
                      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                      value={value}
                      min={f.min}
                      max={f.max}
                      maxLength={f.maxLength}
                      onChange={e => setField(f.key, e.target.value)}
                      className={`mt-1 h-9 text-sm ${showEmailError ? 'border-red-300 focus-visible:ring-red-200' : ''}`}
                    />
                  )}
                  {showEmailError && <p className="mt-1 text-[11px] text-red-600">{emailError}</p>}
                </div>
              )
            })}
          </div>

          <div className="mt-4">
            <Label className="text-xs text-gray-500">Reason <span className="text-gray-400">(optional — recorded in the audit log)</span></Label>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-200 text-sm px-3 py-2 h-16 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
              maxLength={1000}
              placeholder="e.g. Corrected vehicle plate after document review…"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>

          {generalError && <p className="mt-3 text-xs text-red-600">{generalError}</p>}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-gray-100 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={loading || uploadingPhoto || !hasChanges}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {loading ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
