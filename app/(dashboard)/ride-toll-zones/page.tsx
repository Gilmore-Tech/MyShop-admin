'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  MapPinned,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { SuperAdminPageGuard } from '@/components/common/super-admin-page-guard'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  getRideTollPolicyState,
  previewRideTollPolicyDraft,
  publishRideTollPolicy,
  saveRideTollPolicyDraft,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format-date'
import { formatGhs } from '@/lib/money'
import {
  assertRideTollPreviewMatchesState,
  boundaryFromText,
  boundaryToText,
  evaluateRideTollSample,
  ghsTollInputToPesewas,
  overlappingRideTollZoneKeys,
  pesewasToGhsTollInput,
  type GeoJsonMultiPolygon,
  type GeoJsonPosition,
  type RideTollApplicationMode,
  type RideTollPolicyPreview,
  type RideTollPolicyRevision,
  type RideTollPolicyState,
  type RideTollZone,
} from '@/lib/ride-toll-policy-contract'
import { TollZoneMap } from './_components/toll-zone-map'

type Operation = 'load' | 'save' | 'preview' | 'publish' | null

interface ZoneForm {
  localId: string
  stableKey: string
  label: string
  amountGhs: string
  applicationMode: RideTollApplicationMode
  boundaryText: string
}

interface WorkingDraft {
  enabled: boolean
  effectiveFromGmt: string
  reason: string
  zones: ZoneForm[]
}

interface ValidatedDraft {
  payload: Parameters<typeof saveRideTollPolicyDraft>[0] | null
  topErrors: string[]
  zoneErrors: Record<string, string[]>
}

interface SampleForm {
  pickupLat: string
  pickupLng: string
  dropoffLat: string
  dropoffLng: string
}

const EMPTY_SAMPLE: SampleForm = {
  pickupLat: '6.6884',
  pickupLng: '-1.6244',
  dropoffLat: '6.7000',
  dropoffLng: '-1.6100',
}

const STABLE_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_REASON = 500

function localId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `zone-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function effectiveInput(iso: string): string {
  return iso.slice(0, 16)
}

function effectiveIso(input: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return null
  const iso = `${input}:00.000Z`
  return Number.isFinite(Date.parse(iso)) ? iso : null
}

function formFromState(state: RideTollPolicyState): WorkingDraft {
  const source = state.draft ?? state.activePolicy
  return {
    enabled: source.enabled,
    effectiveFromGmt: effectiveInput(source.effectiveFrom),
    reason: state.draft?.reason ?? '',
    zones: source.zones.map((zone) => ({
      localId: zone.id,
      stableKey: zone.stableKey,
      label: zone.label,
      amountGhs: pesewasToGhsTollInput(zone.amountPesewas),
      applicationMode: zone.applicationMode,
      boundaryText: boundaryToText(zone.boundary),
    })),
  }
}

function validateDraft(state: RideTollPolicyState, form: WorkingDraft): ValidatedDraft {
  const topErrors: string[] = []
  const zoneErrors: Record<string, string[]> = {}
  const effectiveFrom = effectiveIso(form.effectiveFromGmt)
  const reason = form.reason.trim()
  if (!effectiveFrom) topErrors.push('Enter a valid effective date and time in GMT.')
  if (reason.length < 8 || reason.length > MAX_REASON) {
    topErrors.push(`Draft reason must contain 8–${MAX_REASON} characters.`)
  }
  if (form.zones.length > 100) topErrors.push('A policy can contain at most 100 zones.')
  if (form.enabled && form.zones.length === 0) {
    topErrors.push('An enabled policy requires at least one toll zone.')
  }
  const keys = new Set<string>()
  const zones = form.zones.map((zone) => {
    const errors: string[] = []
    const stableKey = zone.stableKey.trim()
    const label = zone.label.trim()
    const amountPesewas = ghsTollInputToPesewas(zone.amountGhs)
    const boundary = boundaryFromText(zone.boundaryText)
    if (!STABLE_KEY.test(stableKey) || stableKey.length < 2 || stableKey.length > 64) {
      errors.push('Stable key must be 2–64 lowercase kebab-case characters.')
    }
    if (keys.has(stableKey)) errors.push('Stable key is duplicated in this complete revision.')
    keys.add(stableKey)
    if (label.length < 2 || label.length > 80) errors.push('Passenger-facing label must contain 2–80 characters.')
    if (amountPesewas === null || amountPesewas > 1_000_000) {
      errors.push('Amount must be GHS 0.01–10,000.00 with at most two decimal places.')
    }
    if (!boundary) errors.push('Paste or draw a valid closed GeoJSON MultiPolygon.')
    if (errors.length > 0) zoneErrors[zone.localId] = errors
    return boundary && amountPesewas !== null
      ? {
          stableKey,
          label,
          amountPesewas,
          applicationMode: zone.applicationMode,
          boundary,
        }
      : null
  })
  const validZones = zones.filter((zone): zone is NonNullable<typeof zone> => zone !== null)
  if (validZones.length === form.zones.length) {
    const overlaps = overlappingRideTollZoneKeys(validZones.map((zone, index) => ({
      id: form.zones[index].localId,
      ...zone,
    })))
    for (const [left, right] of overlaps) {
      topErrors.push(`Zones “${left}” and “${right}” overlap or touch. Separate their boundaries.`)
    }
  }
  const payload = topErrors.length === 0 && Object.keys(zoneErrors).length === 0
    ? {
        expectedRevision: state.revision,
        enabled: form.enabled,
        effectiveFrom: effectiveFrom as string,
        reason,
        zones: validZones,
      }
    : null
  return { payload, topErrors, zoneErrors }
}

function actionError(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

function needsReload(error: unknown): boolean {
  return error instanceof ApiError && [
    'RIDE_TOLL_POLICY_REVISION_CONFLICT',
    'RIDE_TOLL_PREVIEW_INVALID',
    'RIDE_TOLL_PREVIEW_STALE',
    'RIDE_TOLL_PREVIEW_USED',
  ].includes(error.code)
}

function PolicySummary({
  title,
  policy,
  runtimeEnabled,
}: {
  title: string
  policy: RideTollPolicyRevision | null
  runtimeEnabled: boolean
}) {
  if (!policy) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
        {title}: no policy is currently effective.
      </div>
    )
  }
  const live = runtimeEnabled && policy.enabled && Date.parse(policy.effectiveFrom) <= Date.now()
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">Policy revision {policy.revision}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          live ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
        }`}>
          {live ? 'Charging eligible rides' : policy.enabled ? 'Not charging yet' : 'Disabled'}
        </span>
      </div>
      <div className="mt-3 grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
        <p>Effective from: <strong>{formatDateTime(policy.effectiveFrom)}</strong></p>
        <p>Zones: <strong>{policy.zones.length}</strong></p>
        <p>Changed by: <strong>{policy.actor.displayName}</strong></p>
        <p>Changed: <strong>{formatDateTime(policy.changedAt)}</strong></p>
      </div>
      <p className="mt-2 text-xs text-gray-500">Reason: {policy.reason}</p>
      <p className="mt-1 break-all font-mono text-[10px] text-gray-400">{policy.fingerprint}</p>
    </div>
  )
}

function classificationClass(value: string): string {
  if (value === 'inside') return 'bg-emerald-100 text-emerald-800'
  if (value === 'boundary') return 'bg-amber-100 text-amber-800'
  return 'bg-gray-100 text-gray-600'
}

function RideTollZonesContent() {
  const [state, setState] = useState<RideTollPolicyState | null>(null)
  const [form, setForm] = useState<WorkingDraft | null>(null)
  const [preview, setPreview] = useState<RideTollPolicyPreview | null>(null)
  const [operation, setOperation] = useState<Operation>('load')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [drawingPoints, setDrawingPoints] = useState<GeoJsonPosition[]>([])
  const [sample, setSample] = useState<SampleForm>(EMPTY_SAMPLE)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishReason, setPublishReason] = useState('')

  const replaceState = useCallback((next: RideTollPolicyState) => {
    setState(next)
    const nextForm = formFromState(next)
    setForm(nextForm)
    setSelectedZoneId(nextForm.zones[0]?.localId ?? null)
    setPreview(null)
    setDrawing(false)
    setDrawingPoints([])
  }, [])

  const load = useCallback(async (message?: string) => {
    setOperation('load')
    setError(null)
    try {
      replaceState(await getRideTollPolicyState())
      if (message) setNotice(message)
    } catch (caught) {
      setError(actionError(caught, 'The toll policy could not be loaded. No pricing change was applied.'))
    } finally {
      setOperation(null)
    }
  }, [replaceState])

  useEffect(() => { void load() }, [load])

  const baseline = useMemo(() => state ? formFromState(state) : null, [state])
  const validation = useMemo(
    () => state && form ? validateDraft(state, form) : null,
    [state, form],
  )
  const dirty = Boolean(form && baseline && JSON.stringify(form) !== JSON.stringify(baseline))
  const selectedZone = form?.zones.find((zone) => zone.localId === selectedZoneId) ?? null
  const mapZones = useMemo<RideTollZone[]>(() => (form?.zones ?? []).flatMap((zone) => {
    const boundary = boundaryFromText(zone.boundaryText)
    const amount = ghsTollInputToPesewas(zone.amountGhs)
    if (!boundary || amount === null) return []
    return [{
      id: zone.localId,
      stableKey: zone.stableKey.trim() || zone.localId,
      label: zone.label.trim() || zone.stableKey,
      amountPesewas: amount,
      applicationMode: zone.applicationMode,
      boundary,
    }]
  }), [form])
  const busy = operation !== null

  const previewOverlaps = useMemo(
    () => preview ? overlappingRideTollZoneKeys(preview.policy.zones) : [],
    [preview],
  )
  const sampleResult = useMemo(() => {
    if (!preview) return null
    const values = [sample.pickupLat, sample.pickupLng, sample.dropoffLat, sample.dropoffLng]
      .map((value) => Number(value))
    if (
      values.some((value) => !Number.isFinite(value)) ||
      Math.abs(values[0]) > 90 || Math.abs(values[2]) > 90 ||
      Math.abs(values[1]) > 180 || Math.abs(values[3]) > 180
    ) return null
    return evaluateRideTollSample(
      preview.policy,
      { latitude: values[0], longitude: values[1] },
      { latitude: values[2], longitude: values[3] },
    )
  }, [preview, sample])

  function editForm(update: (current: WorkingDraft) => WorkingDraft) {
    setForm((current) => current ? update(current) : current)
    setPreview(null)
    setNotice(null)
    setError(null)
  }

  function editZone(localZoneId: string, update: Partial<ZoneForm>) {
    editForm((current) => ({
      ...current,
      zones: current.zones.map((zone) => zone.localId === localZoneId ? { ...zone, ...update } : zone),
    }))
  }

  function addZone() {
    const zone: ZoneForm = {
      localId: localId(),
      stableKey: '',
      label: '',
      amountGhs: '',
      applicationMode: 'either',
      boundaryText: '',
    }
    editForm((current) => ({ ...current, zones: [...current.zones, zone] }))
    setSelectedZoneId(zone.localId)
    setDrawing(false)
    setDrawingPoints([])
  }

  function removeZone(zoneId: string) {
    editForm((current) => ({ ...current, zones: current.zones.filter((zone) => zone.localId !== zoneId) }))
    if (selectedZoneId === zoneId) setSelectedZoneId(null)
    setDrawing(false)
    setDrawingPoints([])
  }

  function beginDrawing() {
    if (!selectedZone) return
    setDrawing(true)
    setDrawingPoints([])
  }

  function finishDrawing() {
    if (!selectedZone || drawingPoints.length < 3) return
    const ring = [...drawingPoints, drawingPoints[0]]
    const boundary: GeoJsonMultiPolygon = { type: 'MultiPolygon', coordinates: [[[...ring]]] }
    editZone(selectedZone.localId, { boundaryText: boundaryToText(boundary) })
    setDrawing(false)
    setDrawingPoints([])
  }

  function updateSelectedBoundary(boundary: GeoJsonMultiPolygon) {
    if (selectedZone) editZone(selectedZone.localId, { boundaryText: boundaryToText(boundary) })
  }

  async function saveDraft() {
    if (!validation?.payload) return
    setOperation('save')
    setError(null)
    setNotice(null)
    try {
      replaceState(await saveRideTollPolicyDraft(validation.payload))
      setNotice('Complete draft saved. Generate the server preview, review it, and publish when ready.')
    } catch (caught) {
      if (needsReload(caught)) {
        await load('The policy changed while you were editing. Review the latest revision before continuing.')
        return
      }
      setError(actionError(caught, 'The complete toll-policy draft could not be saved.'))
    } finally {
      setOperation(null)
    }
  }

  async function generatePreview() {
    if (!state?.draft || dirty) return
    setOperation('preview')
    setError(null)
    setNotice(null)
    setPreview(null)
    try {
      const result = await previewRideTollPolicyDraft(state.revision)
      assertRideTollPreviewMatchesState(result, state)
      setPreview(result)
    } catch (caught) {
      if (needsReload(caught)) {
        await load('The draft changed. Review it and generate a fresh preview.')
        return
      }
      setError(actionError(caught, 'The server could not preview this exact draft. Publishing remains unavailable.'))
    } finally {
      setOperation(null)
    }
  }

  async function publish() {
    if (!state || !preview || publishReason.trim().length < 8) return
    setOperation('publish')
    setError(null)
    try {
      replaceState(await publishRideTollPolicy({
        expectedRevision: state.revision,
        previewToken: preview.previewToken,
        reason: publishReason,
      }))
      setPublishOpen(false)
      setPublishReason('')
      setNotice('Policy published. Its effective time and the separate runtime switch still control charging.')
    } catch (caught) {
      if (needsReload(caught)) {
        setPublishOpen(false)
        await load('The preview is no longer publishable. Review the latest policy and preview again.')
        return
      }
      setError(actionError(caught, 'The policy could not be published. The active policy is unchanged.'))
    } finally {
      setOperation(null)
    }
  }

  if (!state || !form || !validation) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ride Toll Zones" subtitle="Exact Super Administrator policy control" />
        <Card>
          <CardContent className="flex min-h-48 items-center justify-center p-6">
            {operation === 'load' ? (
              <span className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading toll policy…
              </span>
            ) : (
              <div className="text-center">
                <AlertTriangle className="mx-auto h-6 w-6 text-red-600" />
                <p className="mt-2 text-sm font-medium text-red-700">{error ?? 'Policy controls are unavailable.'}</p>
                <Button className="mt-3" variant="outline" onClick={() => void load()}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Retry
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ride Toll Zones"
        subtitle="Draft, review and publish location-specific driver toll reimbursements"
        actions={(
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        )}
      />

      {!state.runtimeEnabled && (
        <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Runtime toll charging is OFF</p>
            <p className="mt-1 text-xs leading-relaxed">
              RIDE_TOLLS_ENABLED is not true. Drafting and publishing are safe, but no passenger
              estimate or ride will include a toll until the separately reviewed runtime switch is enabled.
            </p>
          </div>
        </div>
      )}

      {notice && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{notice}</div>}
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-2">
        <PolicySummary title="Latest published policy" policy={state.activePolicy} runtimeEnabled={state.runtimeEnabled} />
        <PolicySummary title="Currently effective policy" policy={state.effectivePolicy} runtimeEnabled={state.runtimeEnabled} />
      </div>

      <Card>
        <CardHeader className="border-b border-gray-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPinned className="h-5 w-5 text-orange-500" /> Complete policy draft
              </CardTitle>
              <p className="mt-1 text-xs text-gray-500">
                Saving replaces the entire draft zone set. It never changes live pricing directly.
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              State revision {state.revision}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          {state.draft && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Saved draft revision {state.draft.revision}, created by <strong>{state.draft.actor.displayName}</strong>
              {' '}on {formatDateTime(state.draft.changedAt)}. Fingerprint:
              <span className="ml-1 break-all font-mono text-[10px]">{state.draft.fingerprint}</span>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[0.6fr_1fr_1.4fr]">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="toll-policy-enabled"
                  checked={form.enabled}
                  disabled={busy}
                  onCheckedChange={(checked) => editForm((current) => ({ ...current, enabled: checked === true }))}
                />
                <div>
                  <Label htmlFor="toll-policy-enabled">Enable this policy when published</Label>
                  <p className="mt-1 text-xs text-gray-500">
                    Clear this and publish through the same reviewed flow to disable tolls safely.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="toll-effective-from">Effective from (GMT)</Label>
              <Input
                id="toll-effective-from"
                type="datetime-local"
                value={form.effectiveFromGmt}
                disabled={busy}
                onChange={(event) => editForm((current) => ({ ...current, effectiveFromGmt: event.target.value }))}
              />
              <p className="text-xs text-gray-500">Policy-level time; all zones in this revision start together.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="toll-draft-reason">Draft audit reason</Label>
              <Textarea
                id="toll-draft-reason"
                rows={3}
                maxLength={MAX_REASON}
                value={form.reason}
                disabled={busy}
                placeholder="Why is this complete toll-zone revision proposed?"
                onChange={(event) => editForm((current) => ({ ...current, reason: event.target.value }))}
              />
              <p className="text-right text-xs text-gray-400">{form.reason.length}/{MAX_REASON}</p>
            </div>
          </div>

          {validation.topErrors.length > 0 && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {validation.topErrors.map((message) => <p key={message}>• {message}</p>)}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Toll zones ({form.zones.length})</h3>
              <p className="mt-1 text-xs text-gray-500">
                Stable keys are internal. Labels appear only when a positive toll applies.
              </p>
            </div>
            <Button variant="outline" disabled={busy || form.zones.length >= 100} onClick={addZone}>
              <Plus className="mr-2 h-4 w-4" /> Add zone
            </Button>
          </div>

          {form.zones.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
              <p className="text-sm font-medium text-gray-700">No toll zones in this complete revision</p>
              <p className="mt-1 text-xs text-gray-500">
                This is valid only for a disabled policy. Add a zone before enabling.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
              <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
                {form.zones.map((zone) => {
                  const zoneErrors = validation.zoneErrors[zone.localId] ?? []
                  const selected = zone.localId === selectedZoneId
                  return (
                    <button
                      type="button"
                      key={zone.localId}
                      onClick={() => {
                        setSelectedZoneId(zone.localId)
                        setDrawing(false)
                        setDrawingPoints([])
                      }}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        selected ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{zone.label || 'Unnamed zone'}</p>
                          <p className="truncate font-mono text-[11px] text-gray-500">{zone.stableKey || 'stable-key-required'}</p>
                        </div>
                        <span className="text-xs font-semibold text-gray-700">
                          {ghsTollInputToPesewas(zone.amountGhs) === null
                            ? 'Invalid amount'
                            : formatGhs(ghsTollInputToPesewas(zone.amountGhs))}
                        </span>
                      </div>
                      <p className="mt-2 text-xs capitalize text-gray-500">{zone.applicationMode.replace('either', 'pickup or drop-off')}</p>
                      {zoneErrors.length > 0 && <p className="mt-2 text-xs font-medium text-red-600">{zoneErrors.length} issue(s) to fix</p>}
                    </button>
                  )
                })}
              </div>

              {selectedZone && (
                <div className="space-y-4 rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">Edit selected zone</h4>
                      <p className="mt-1 text-xs text-gray-500">Coordinates are GeoJSON longitude, latitude order.</p>
                    </div>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => removeZone(selectedZone.localId)}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="zone-stable-key">Stable key</Label>
                      <Input
                        id="zone-stable-key"
                        value={selectedZone.stableKey}
                        disabled={busy}
                        placeholder="kumasi-airport"
                        onChange={(event) => editZone(selectedZone.localId, { stableKey: event.target.value.toLowerCase() })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="zone-label">Passenger-facing label</Label>
                      <Input
                        id="zone-label"
                        value={selectedZone.label}
                        disabled={busy}
                        placeholder="Airport toll"
                        onChange={(event) => editZone(selectedZone.localId, { label: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="zone-amount">Amount (GHS)</Label>
                      <Input
                        id="zone-amount"
                        inputMode="decimal"
                        value={selectedZone.amountGhs}
                        disabled={busy}
                        placeholder="5.00"
                        onChange={(event) => editZone(selectedZone.localId, { amountGhs: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="zone-application-mode">Apply at</Label>
                      <Select
                        value={selectedZone.applicationMode}
                        disabled={busy}
                        onValueChange={(value: RideTollApplicationMode) => editZone(selectedZone.localId, { applicationMode: value })}
                      >
                        <SelectTrigger id="zone-application-mode"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pickup">Pickup only</SelectItem>
                          <SelectItem value="dropoff">Drop-off only</SelectItem>
                          <SelectItem value="either">Pickup or drop-off</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {(validation.zoneErrors[selectedZone.localId] ?? []).length > 0 && (
                    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                      {validation.zoneErrors[selectedZone.localId].map((message) => <p key={message}>• {message}</p>)}
                    </div>
                  )}

                  <TollZoneMap
                    zones={mapZones}
                    selectedZoneId={selectedZone.localId}
                    drawing={drawing}
                    drawingPoints={drawingPoints}
                    onMapPoint={(point) => setDrawingPoints((current) => [...current, point])}
                    onBoundaryChange={updateSelectedBoundary}
                  />

                  <div className="flex flex-wrap gap-2">
                    {!drawing ? (
                      <Button variant="outline" size="sm" disabled={busy} onClick={beginDrawing}>
                        Draw replacement polygon
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" disabled={drawingPoints.length < 3} onClick={finishDrawing}>
                          Finish polygon
                        </Button>
                        <Button variant="outline" size="sm" disabled={drawingPoints.length === 0} onClick={() => setDrawingPoints((current) => current.slice(0, -1))}>
                          Undo point
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setDrawing(false); setDrawingPoints([]) }}>
                          Cancel drawing
                        </Button>
                      </>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="zone-boundary">Manual GeoJSON MultiPolygon fallback</Label>
                    <Textarea
                      id="zone-boundary"
                      className="min-h-48 font-mono text-xs"
                      value={selectedZone.boundaryText}
                      disabled={busy || drawing}
                      spellCheck={false}
                      placeholder={'{"type":"MultiPolygon","coordinates":[[[[lng,lat],...]]]}'}
                      onChange={(event) => editZone(selectedZone.localId, { boundaryText: event.target.value })}
                    />
                    <p className="text-xs text-gray-500">
                      Every ring needs at least three distinct points and must repeat its first point at the end.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
            {dirty && <span className="mr-auto text-xs font-medium text-amber-700">Unsaved local changes invalidate any earlier preview.</span>}
            <Button disabled={busy || validation.payload === null || !dirty} onClick={() => void saveDraft()}>
              {operation === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save complete draft
            </Button>
            <Button
              variant="outline"
              disabled={busy || !state.draft || dirty}
              onClick={() => void generatePreview()}
            >
              {operation === 'preview' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              Generate server preview
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card className="border-emerald-200">
          <CardHeader className="border-b border-emerald-100 bg-emerald-50/50">
            <CardTitle className="flex items-center gap-2 text-base text-emerald-900">
              <CheckCircle2 className="h-5 w-5" /> Exact saved revision preview
            </CardTitle>
            <p className="text-xs text-emerald-800">
              Generated {formatDateTime(preview.generatedAt)} · draft revision {preview.draftRevision} · token expires in 30 minutes and is single-use.
            </p>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Policy result</p>
                <p className="mt-1 text-sm font-semibold">{preview.policy.enabled ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Effective from (GMT)</p>
                <p className="mt-1 text-sm font-semibold">{formatDateTime(preview.policy.effectiveFrom)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Complete zone count</p>
                <p className="mt-1 text-sm font-semibold">{preview.policy.zones.length}</p>
              </div>
            </div>

            {previewOverlaps.length > 0 ? (
              <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Overlapping boundaries need review</p>
                <p className="mt-1 text-xs">This preview is blocked. A ride matching more than one distinct zone is ambiguous; tolls are never stacked or silently selected.</p>
                <div className="mt-2 space-y-1 font-mono text-xs">
                  {previewOverlaps.map(([left, right]) => <p key={`${left}-${right}`}>{left} ↔ {right}</p>)}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                No overlapping/touching exterior boundaries were found in the local review.
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-gray-900">Sample coordinate classification</h3>
              <p className="mt-1 text-xs text-gray-500">
                Review inside, boundary and outside behaviour. Boundary counts as covered, matching PostGIS ST_Covers.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {([
                  ['pickupLat', 'Pickup latitude'],
                  ['pickupLng', 'Pickup longitude'],
                  ['dropoffLat', 'Drop-off latitude'],
                  ['dropoffLng', 'Drop-off longitude'],
                ] as const).map(([key, label]) => (
                  <div className="space-y-1.5" key={key}>
                    <Label htmlFor={`sample-${key}`}>{label}</Label>
                    <Input
                      id={`sample-${key}`}
                      inputMode="decimal"
                      value={sample[key]}
                      onChange={(event) => setSample((current) => ({ ...current, [key]: event.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            {sampleResult ? (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Zone</th>
                      <th className="px-3 py-2">Mode</th>
                      <th className="px-3 py-2">Pickup</th>
                      <th className="px-3 py-2">Drop-off</th>
                      <th className="px-3 py-2 text-right">Candidate amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sampleResult.zones.map((zone) => {
                      const source = preview.policy.zones.find((item) => item.stableKey === zone.stableKey)
                      return (
                        <tr key={zone.stableKey} className="border-t border-gray-100">
                          <td className="px-3 py-2 font-medium">{zone.label}</td>
                          <td className="px-3 py-2 text-xs capitalize text-gray-600">{source?.applicationMode}</td>
                          <td className="px-3 py-2"><span className={`rounded px-2 py-1 text-xs ${classificationClass(zone.pickup)}`}>{zone.pickup}</span></td>
                          <td className="px-3 py-2"><span className={`rounded px-2 py-1 text-xs ${classificationClass(zone.dropoff)}`}>{zone.dropoff}</span></td>
                          <td className={`px-3 py-2 text-right font-semibold ${zone.applies ? 'text-emerald-700' : 'text-gray-400'}`}>
                            {zone.applies ? formatGhs(zone.amountPesewas) : 'Not applicable'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="border-t border-gray-200 bg-gray-50">
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-sm font-semibold">
                        {sampleResult.ambiguous ? 'AMBIGUOUS — multiple zones match; pricing must be blocked' : 'Sample total toll'}
                      </td>
                      <td className={`px-3 py-3 text-right text-base font-bold ${sampleResult.ambiguous ? 'text-red-700' : 'text-gray-900'}`}>
                        {sampleResult.ambiguous ? 'No total' : formatGhs(sampleResult.totalTollPesewas)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p role="alert" className="text-sm text-red-600">Enter valid latitude/longitude sample coordinates.</p>
            )}

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              Review this exact saved revision before publishing. The one-time preview token, revision,
              fingerprint, overlap checks and audit reason remain required.
            </div>

            <div className="flex justify-end">
              <Button disabled={busy || previewOverlaps.length > 0} onClick={() => setPublishOpen(true)}>
                <Send className="mr-2 h-4 w-4" /> Publish reviewed policy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={publishOpen} onOpenChange={(open) => { if (!busy) setPublishOpen(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish this exact toll policy?</DialogTitle>
            <DialogDescription>
              This consumes the one-time preview token. Existing rides keep their captured price;
              eligible new estimates use this revision only after its GMT effective time and runtime enablement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="toll-publish-reason">Review and publication reason</Label>
            <Textarea
              id="toll-publish-reason"
              rows={4}
              maxLength={MAX_REASON}
              value={publishReason}
              disabled={busy}
              placeholder="What did you verify before publishing?"
              onChange={(event) => setPublishReason(event.target.value)}
            />
            {publishReason.trim().length > 0 && publishReason.trim().length < 8 && (
              <p className="text-xs text-red-600">Enter at least eight characters.</p>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setPublishOpen(false)}>Cancel</Button>
            <Button disabled={busy || publishReason.trim().length < 8} onClick={() => void publish()}>
              {operation === 'publish' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function RideTollZonesPage() {
  return (
    <SuperAdminPageGuard>
      <RideTollZonesContent />
    </SuperAdminPageGuard>
  )
}
