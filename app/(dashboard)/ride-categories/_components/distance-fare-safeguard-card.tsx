'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  Power,
  PowerOff,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useRole } from '@/hooks/use-role'
import {
  activateDistanceSafeguard,
  deactivateDistanceSafeguard,
  getDistanceSafeguardState,
  previewDistanceSafeguardDraft,
  saveDistanceSafeguardDraft,
} from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format-date'
import { formatGhs } from '@/lib/money'
import {
  assertPreviewMatchesState,
  ghsInputToPesewas,
  isDistanceSafeguardDraftCurrent,
  kmInputToMetres,
  MAX_DISTANCE_SAFEGUARD_METRES,
  metresToKmInput,
  pesewasToGhsInput,
  type DistanceSafeguardFloorMode,
  type DistanceSafeguardPolicyRevision,
  type DistanceSafeguardPreview,
  type DistanceSafeguardRideCategory,
  type DistanceSafeguardState,
  type SaveDistanceSafeguardDraftInput,
} from '@/lib/ride-distance-safeguard-contract'

type Operation = 'load' | 'save' | 'preview' | 'activate' | 'deactivate' | null
type Confirmation = 'activate' | 'deactivate' | null

interface FloorForm {
  mode: DistanceSafeguardFloorMode
  customFloorGhs: string
}

interface WorkingDraft {
  includedDistanceKm: string
  reason: string
  floors: Record<string, FloorForm>
}

interface DraftValidation {
  payload: Omit<SaveDistanceSafeguardDraftInput, 'expectedRevision'> | null
  distanceError: string | null
  reasonError: string | null
  floorErrors: Record<string, string>
}

const MAX_REASON_LENGTH = 500

function actionError(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

function recoveryNotice(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  if (error.code === 'RIDE_FARE_POLICY_CATEGORY_FLOORS_INVALID') {
    return 'Active ride tiers changed while you were working. The latest terms are loaded. Review every tier and save a repaired draft before previewing again.'
  }
  if (
    error.code === 'RIDE_FARE_POLICY_REVISION_CONFLICT' ||
    error.code === 'RIDE_FARE_POLICY_PREVIEW_STALE'
  ) {
    return 'The pricing policy changed while you were working. The latest revision has been loaded; review it before continuing.'
  }
  return null
}

function policyFloorByCategory(policy: DistanceSafeguardPolicyRevision) {
  return new Map(policy.categoryFloors.map((floor) => [floor.rideCategoryId, floor]))
}

function workingDraftFromState(state: DistanceSafeguardState): WorkingDraft {
  const source = state.draft ?? state.activePolicy
  const existingFloors = policyFloorByCategory(source)
  const floors = Object.fromEntries(
    state.categories
      .filter((category) => category.isActive)
      .map((category) => {
        const existing = existingFloors.get(category.id)
        const mode = existing?.mode ?? 'category_minimum'
        const customFloorPesewas = existing?.customFloorPesewas ?? category.minimumFarePesewas
        return [
          category.id,
          {
            mode,
            customFloorGhs: pesewasToGhsInput(customFloorPesewas),
          } satisfies FloorForm,
        ]
      }),
  )
  return {
    includedDistanceKm: metresToKmInput(source.includedDistanceMeters),
    // A new draft needs its own operational reason rather than silently
    // inheriting the active policy's publication reason.
    reason: state.draft?.reason ?? '',
    floors,
  }
}

function validateWorkingDraft(
  state: DistanceSafeguardState,
  draft: WorkingDraft,
): DraftValidation {
  const includedDistanceMeters = kmInputToMetres(draft.includedDistanceKm)
  const distanceError = includedDistanceMeters === null
    ? `Enter 0.001–${MAX_DISTANCE_SAFEGUARD_METRES / 1000} km with no more than three decimal places.`
    : null
  const reason = draft.reason.trim()
  const reasonError = reason.length === 0
    ? 'Explain why this pricing draft is being changed.'
    : reason.length > MAX_REASON_LENGTH
      ? `Use ${MAX_REASON_LENGTH} characters or fewer.`
      : null
  const floorErrors: Record<string, string> = {}
  const categoryFloors = state.categories
    .filter((category) => category.isActive)
    .map((category) => {
      const floor = draft.floors[category.id]
      if (!floor) {
        floorErrors[category.id] = 'Choose a floor mode for this active category.'
        return null
      }
      if (floor.mode === 'category_minimum') {
        return {
          rideCategoryId: category.id,
          mode: floor.mode,
          customFloorPesewas: null,
        } as const
      }
      const customFloorPesewas = ghsInputToPesewas(floor.customFloorGhs)
      if (customFloorPesewas === null) {
        floorErrors[category.id] = 'Enter a valid GHS amount with no more than two decimal places.'
        return null
      }
      if (customFloorPesewas < category.minimumFarePesewas) {
        floorErrors[category.id] = `Custom floor cannot be below ${formatGhs(category.minimumFarePesewas)}.`
        return null
      }
      return {
        rideCategoryId: category.id,
        mode: floor.mode,
        customFloorPesewas,
      } as const
    })
  if (categoryFloors.length === 0) {
    floorErrors._categories = 'At least one active ride category is required.'
  }
  const validFloors = categoryFloors.filter((floor) => floor !== null)
  const payload = distanceError || reasonError || Object.keys(floorErrors).length > 0
    ? null
    : {
        includedDistanceMeters: includedDistanceMeters as number,
        categoryFloors: validFloors,
        reason,
      }
  return { payload, distanceError, reasonError, floorErrors }
}

function formatDistance(metres: number): string {
  return `${(metres / 1000).toFixed(3)} km`
}

function formatDuration(seconds: number): string {
  const minutes = seconds / 60
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`
}

function PolicyStatus({ enabled }: { enabled: boolean }) {
  return (
    <span className={enabled
      ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700'
      : 'inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600'}
    >
      <span className={enabled ? 'h-1.5 w-1.5 rounded-full bg-emerald-500' : 'h-1.5 w-1.5 rounded-full bg-gray-400'} />
      {enabled ? 'Active' : 'Inactive'}
    </span>
  )
}

function PolicyTerms({
  title,
  policy,
  categories,
  variant = 'published',
}: {
  title: string
  policy: DistanceSafeguardPolicyRevision
  categories: DistanceSafeguardRideCategory[]
  variant?: 'published' | 'draft'
}) {
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
          <span className="text-[11px] text-gray-400">Revision {policy.revision}</span>
        </div>
        {variant === 'draft' ? (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            Draft
          </span>
        ) : (
          <PolicyStatus enabled={policy.enabled} />
        )}
      </div>
      <div className="mt-2 grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
        <p>Included distance: <strong>{formatDistance(policy.includedDistanceMeters)}</strong></p>
        <p>Surge: <strong>only distance beyond the threshold</strong></p>
        <p>Changed by: <strong>{policy.actor.displayName}</strong></p>
        <p>Changed: <strong>{formatDateTime(policy.changedAt)}</strong></p>
      </div>
      <p className="mt-2 text-xs text-gray-500">Reason: {policy.reason}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {policy.categoryFloors.map((floor) => {
          const category = categoriesById.get(floor.rideCategoryId)
          return (
            <span key={floor.rideCategoryId} className="rounded bg-white px-2 py-1 text-[11px] text-gray-600 shadow-sm">
              {category?.name ?? 'Unknown tier'}: {formatGhs(floor.resolvedFloorPesewas)}
              {floor.mode === 'category_minimum' ? ' (tier minimum)' : ' (custom)'}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function PreviewResults({ preview }: { preview: DistanceSafeguardPreview }) {
  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4" role="status" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <CheckCircle2 className="h-4 w-4" /> Server preview ready
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            Generated {formatDateTime(preview.generatedAt)} from saved draft revision {preview.draftRevision}.
            Activation is bound to this preview and the current tier rates.
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-emerald-700">
          Threshold {formatDistance(preview.includedDistanceMeters)}
        </span>
      </div>

      {preview.categories.map((category) => (
        <div key={category.rideCategoryId} className="overflow-x-auto rounded-lg border border-emerald-100 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
            <p className="text-sm font-semibold text-gray-900">{category.name}</p>
            <p className="text-xs text-gray-500">
              Minimum {formatGhs(category.minimumFarePesewas)} · Per km {formatGhs(category.perKmPesewas)} · Effective floor {formatGhs(category.effectiveFloorPesewas)}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs">Scenario</TableHead>
                <TableHead className="text-xs">Route</TableHead>
                <TableHead className="text-right text-xs">Surge</TableHead>
                <TableHead className="text-right text-xs">Safeguard off</TableHead>
                <TableHead className="text-right text-xs">Safeguard on</TableHead>
                <TableHead className="text-right text-xs">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {category.scenarios.map((scenario) => (
                <TableRow key={scenario.key}>
                  <TableCell className="text-xs font-medium text-gray-800">{scenario.label}</TableCell>
                  <TableCell className="text-xs text-gray-600">
                    {formatDistance(scenario.distanceMeters)} / {formatDuration(scenario.durationSeconds)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-gray-600">
                    {scenario.surgeMultiplier.toFixed(1)}x
                  </TableCell>
                  <TableCell className="text-right text-xs text-gray-600">
                    {formatGhs(scenario.safeguardOffFarePesewas)}
                  </TableCell>
                  <TableCell className="text-right text-xs font-semibold text-gray-900">
                    {formatGhs(scenario.safeguardOnFarePesewas)}
                  </TableCell>
                  <TableCell className="text-right text-xs font-semibold text-emerald-700">
                    {formatGhs(scenario.deltaPesewas, { signed: true })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  )
}

export function DistanceFareSafeguardCard() {
  const { permissions, isSuperAdmin } = useRole()
  const [state, setState] = useState<DistanceSafeguardState | null>(null)
  const [form, setForm] = useState<WorkingDraft | null>(null)
  const [preview, setPreview] = useState<DistanceSafeguardPreview | null>(null)
  const [operation, setOperation] = useState<Operation>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const [confirmationReason, setConfirmationReason] = useState('')

  const replaceState = useCallback((fresh: DistanceSafeguardState) => {
    setState(fresh)
    setForm(workingDraftFromState(fresh))
    setPreview(null)
  }, [])

  const load = useCallback(async (postLoadNotice?: string) => {
    setOperation('load')
    setError(null)
    setNotice(null)
    setState(null)
    setForm(null)
    setPreview(null)
    try {
      replaceState(await getDistanceSafeguardState())
      setNotice(postLoadNotice ?? null)
    } catch (caught) {
      setError(actionError(caught, 'The distance fare safeguard is unavailable. No policy controls were shown.'))
    } finally {
      setOperation(null)
    }
  }, [replaceState])

  useEffect(() => {
    if (isSuperAdmin) void load()
  }, [isSuperAdmin, load])

  const baselineForm = useMemo(() => state ? workingDraftFromState(state) : null, [state])
  const validation = useMemo(
    () => state && form ? validateWorkingDraft(state, form) : null,
    [state, form],
  )
  const savedDraftCurrent = state ? isDistanceSafeguardDraftCurrent(state) : false
  const dirty = Boolean(
    form && baselineForm && (
      JSON.stringify(form) !== JSON.stringify(baselineForm) ||
      (state?.draft !== null && !savedDraftCurrent)
    ),
  )
  const busy = operation !== null

  function editForm(update: (current: WorkingDraft) => WorkingDraft) {
    setForm((current) => current ? update(current) : current)
    // A preview token is valid only for the exact saved draft and current rate
    // fingerprint. Any local edit removes it from the activation surface.
    setPreview(null)
    setNotice(null)
    setError(null)
  }

  async function recoverPolicy(error: unknown): Promise<boolean> {
    const message = recoveryNotice(error)
    if (!message) return false
    await load(message)
    return true
  }

  async function saveDraft() {
    if (!state || !validation?.payload) return
    setOperation('save')
    setError(null)
    setNotice(null)
    try {
      const fresh = await saveDistanceSafeguardDraft({
        expectedRevision: state.revision,
        ...validation.payload,
      })
      replaceState(fresh)
      setNotice('Draft saved. Generate the server preview before activation.')
    } catch (caught) {
      if (await recoverPolicy(caught)) return
      setError(actionError(caught, 'The pricing draft could not be saved. No policy change was applied.'))
    } finally {
      setOperation(null)
    }
  }

  async function generatePreview() {
    if (!state?.draft || dirty || !savedDraftCurrent) return
    setOperation('preview')
    setError(null)
    setNotice(null)
    setPreview(null)
    try {
      const result = await previewDistanceSafeguardDraft(state.revision)
      assertPreviewMatchesState(result, state)
      setPreview(result)
    } catch (caught) {
      if (await recoverPolicy(caught)) return
      setError(actionError(caught, 'The server could not preview this draft. Activation remains unavailable.'))
    } finally {
      setOperation(null)
    }
  }

  function openConfirmation(next: Exclude<Confirmation, null>) {
    setConfirmation(next)
    setConfirmationReason('')
    setError(null)
  }

  async function confirmPolicyAction() {
    if (!state || !confirmation || confirmationReason.trim().length === 0) return
    const action = confirmation
    if (action === 'activate' && !preview) return
    setOperation(action)
    setError(null)
    setNotice(null)
    try {
      const fresh = action === 'activate'
        ? await activateDistanceSafeguard({
            expectedRevision: state.revision,
            previewToken: (preview as DistanceSafeguardPreview).previewToken,
            reason: confirmationReason,
          })
        : await deactivateDistanceSafeguard({
            expectedRevision: state.revision,
            reason: confirmationReason,
          })
      setConfirmation(null)
      setConfirmationReason('')
      replaceState(fresh)
      setNotice(action === 'activate'
        ? 'Distance fare safeguard activated for new bookings.'
        : 'Distance fare safeguard deactivated for new bookings.')
    } catch (caught) {
      if (recoveryNotice(caught)) {
        setConfirmation(null)
        setConfirmationReason('')
        await recoverPolicy(caught)
        return
      }
      setError(actionError(caught, `The safeguard could not be ${action === 'activate' ? 'activated' : 'deactivated'}. No policy change was applied.`))
    } finally {
      setOperation(null)
    }
  }

  // Defense in depth only. Every endpoint independently requires the exact
  // `super_admin` role; Product Owner and permission grants are insufficient.
  if (permissions === null || !isSuperAdmin) return null

  if (!state || !form || !validation) {
    return (
      <Card className="mb-5 border-amber-200">
        <CardContent className="flex min-h-32 items-center justify-center p-6">
          {operation === 'load' ? (
            <div className="flex items-center gap-2 text-sm text-gray-500" role="status" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading distance fare safeguard…
            </div>
          ) : (
            <div className="max-w-xl text-center">
              <AlertTriangle className="mx-auto h-6 w-6 text-red-500" />
              <p className="mt-2 text-sm font-medium text-red-700" role="alert" aria-live="assertive">{error ?? 'Policy controls are unavailable.'}</p>
              <p className="mt-1 text-xs text-gray-500">Pricing remains unchanged. Reload before attempting any policy action.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const activeCategories = state.categories.filter((category) => category.isActive)
  const parsedDistanceMeters = kmInputToMetres(form.includedDistanceKm)

  return (
    <Card className="mb-5 border-amber-200 shadow-sm">
      <CardHeader className="border-b border-amber-100 bg-amber-50/40 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base text-gray-900">
              <ShieldCheck className="h-5 w-5 text-amber-600" /> Distance Fare Safeguard
              <PolicyStatus enabled={state.activePolicy.enabled} />
            </CardTitle>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-600">
              Optional protection for longer trips. Changes apply to <strong>new bookings only</strong>;
              existing rides keep the exact policy captured when they were booked. At or below the
              included distance, standard tier pricing still applies; a custom safeguard floor starts
              only after the threshold is crossed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
            </Button>
            {state.activePolicy.enabled && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => openConfirmation('deactivate')}>
                <PowerOff className="mr-2 h-3.5 w-3.5" /> Deactivate
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <div className="grid gap-3 lg:grid-cols-2">
          <PolicyTerms title="Current published policy" policy={state.activePolicy} categories={state.categories} />
          {state.draft ? (
            <PolicyTerms title="Saved draft" policy={state.draft} categories={state.categories} variant="draft" />
          ) : (
            <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center">
              <div>
                <p className="text-sm font-medium text-gray-700">No saved draft</p>
                <p className="mt-1 text-xs text-gray-500">The editor starts from the current active terms.</p>
              </div>
            </div>
          )}
        </div>

        {notice && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800" role="status" aria-live="polite">
            {notice}
          </div>
        )}
        {error && confirmation === null && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Draft settings</h3>
              <p className="mt-1 text-xs text-gray-500">
                Save an immutable draft, preview that saved revision on the server, then activate it with a reason.
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
              State revision {state.revision}
            </span>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(240px,0.6fr)_minmax(300px,1.4fr)]">
            <div className="space-y-1.5">
              <Label htmlFor="safeguard-included-distance">Distance included in the floor (km)</Label>
              <Input
                id="safeguard-included-distance"
                type="number"
                min="0.001"
                max={MAX_DISTANCE_SAFEGUARD_METRES / 1000}
                step="0.001"
                value={form.includedDistanceKm}
                disabled={busy}
                aria-invalid={validation.distanceError ? true : undefined}
                onChange={(event) => editForm((current) => ({
                  ...current,
                  includedDistanceKm: event.target.value,
                }))}
              />
              {validation.distanceError ? (
                <p className="text-xs text-red-600">{validation.distanceError}</p>
              ) : (
                <p className="text-xs text-gray-500">
                  {parsedDistanceMeters?.toLocaleString('en-GH')} metres. The safeguard starts after this distance.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="safeguard-draft-reason">Draft change reason</Label>
              <Textarea
                id="safeguard-draft-reason"
                value={form.reason}
                maxLength={MAX_REASON_LENGTH}
                rows={3}
                disabled={busy}
                aria-invalid={validation.reasonError ? true : undefined}
                placeholder="Why are these safeguard terms being proposed?"
                onChange={(event) => editForm((current) => ({ ...current, reason: event.target.value }))}
              />
              <div className="flex justify-between gap-2 text-xs">
                <span className={validation.reasonError ? 'text-red-600' : 'text-gray-500'}>
                  {validation.reasonError ?? 'Recorded in the immutable policy audit history.'}
                </span>
                <span className="text-gray-400">{form.reason.length}/{MAX_REASON_LENGTH}</span>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Per-tier floor settings</h4>
              <p className="mt-1 text-xs text-gray-500">
                Per-kilometre rates remain read-only here and continue to come from the existing tier pricing controls below.
              </p>
            </div>

            {state.draft && !savedDraftCurrent && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status" aria-live="polite">
                The saved draft no longer covers the current active tiers exactly. Missing tiers have
                been added with “Use category minimum” and obsolete tiers will be removed. Review any
                highlighted custom floor, then Save Draft to create a repair revision before previewing.
              </div>
            )}

            {activeCategories.map((category) => {
              const selectorId = `safeguard-floor-mode-${category.id}`
              const customFloorId = `safeguard-custom-floor-${category.id}`
              const floor = form.floors[category.id] ?? {
                mode: 'category_minimum' as const,
                customFloorGhs: pesewasToGhsInput(category.minimumFarePesewas),
              }
              const customPesewas = floor.mode === 'custom'
                ? ghsInputToPesewas(floor.customFloorGhs)
                : null
              const thresholdIncrease = customPesewas === null
                ? null
                : customPesewas - category.minimumFarePesewas
              return (
                <div key={category.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1.2fr] lg:items-start">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{category.name}</p>
                      <p className="text-[11px] font-mono text-gray-400">{category.slug}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Existing minimum</p>
                      <p className="mt-1 text-sm font-semibold text-gray-800">{formatGhs(category.minimumFarePesewas)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Existing per km</p>
                      <p className="mt-1 text-sm font-semibold text-gray-800">{formatGhs(category.perKmPesewas)}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={selectorId} className="text-[11px] uppercase tracking-wide text-gray-400">Safeguard floor</Label>
                      <Select
                        value={floor.mode}
                        disabled={busy}
                        onValueChange={(mode: DistanceSafeguardFloorMode) => editForm((current) => ({
                          ...current,
                          floors: {
                            ...current.floors,
                            [category.id]: {
                              ...floor,
                              mode,
                              customFloorGhs: mode === 'custom' && !floor.customFloorGhs
                                ? pesewasToGhsInput(category.minimumFarePesewas)
                                : floor.customFloorGhs,
                            },
                          },
                        }))}
                      >
                        <SelectTrigger id={selectorId} aria-label={`${category.name} safeguard floor mode`} className="w-full bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="category_minimum">Use category minimum</SelectItem>
                          <SelectItem value="custom">Custom floor</SelectItem>
                        </SelectContent>
                      </Select>
                      {floor.mode === 'custom' && (
                        <div className="space-y-1">
                          <Label htmlFor={customFloorId} className="sr-only">{category.name} custom safeguard floor in GHS</Label>
                          <Input
                            id={customFloorId}
                            type="number"
                            min={(category.minimumFarePesewas / 100).toFixed(2)}
                            step="0.01"
                            value={floor.customFloorGhs}
                            disabled={busy}
                            aria-invalid={validation.floorErrors[category.id] ? true : undefined}
                            onChange={(event) => editForm((current) => ({
                              ...current,
                              floors: {
                                ...current.floors,
                                [category.id]: { ...floor, customFloorGhs: event.target.value },
                              },
                            }))}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  {validation.floorErrors[category.id] && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {validation.floorErrors[category.id]}
                    </p>
                  )}
                  {floor.mode === 'custom' && thresholdIncrease !== null && thresholdIncrease >= 0 && !validation.floorErrors[category.id] && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {thresholdIncrease > 0
                        ? `At or below ${form.includedDistanceKm || 'the included distance'} km, standard tier pricing still applies. Immediately above it, this custom floor is ${formatGhs(thresholdIncrease)} above the category minimum and can create a boundary jump. Review the equal-threshold and just-above-threshold server rows.`
                        : 'This custom floor currently equals the category minimum. Review the server preview before activation.'}
                    </p>
                  )}
                </div>
              )
            })}

            {validation.floorErrors._categories && (
              <p className="text-xs text-red-600">{validation.floorErrors._categories}</p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
            {dirty && <span className="mr-auto text-xs font-medium text-amber-700">Unsaved draft changes</span>}
            <Button
              variant="outline"
              disabled={busy || !dirty || validation.payload === null}
              onClick={() => void saveDraft()}
            >
              {operation === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Draft
            </Button>
            <Button
              variant="outline"
              disabled={busy || dirty || !state.draft || !savedDraftCurrent}
              onClick={() => void generatePreview()}
            >
              {operation === 'preview' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              Preview Saved Draft
            </Button>
          </div>
        </div>

        {preview && <PreviewResults preview={preview} />}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-800">Activation is a separate audited action</p>
            <p className="mt-0.5 text-xs text-gray-500">
              A fresh server preview is required. Category-rate or policy changes invalidate its token automatically.
            </p>
          </div>
          <Button
            disabled={busy || dirty || !preview || !state.draft}
            onClick={() => openConfirmation('activate')}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Power className="mr-2 h-4 w-4" /> Activate Safeguard
          </Button>
        </div>
      </CardContent>

      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setConfirmation(null)
            setConfirmationReason('')
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmation === 'activate' ? 'Activate distance fare safeguard?' : 'Deactivate distance fare safeguard?'}
            </DialogTitle>
            <DialogDescription>
              {confirmation === 'activate'
                ? 'Only new bookings will use the saved and previewed terms. Existing rides remain unchanged.'
                : 'Only new bookings will return to standard tier pricing. Existing safeguarded rides retain their captured terms.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="safeguard-confirmation-reason">Mandatory reason</Label>
            <Textarea
              id="safeguard-confirmation-reason"
              rows={3}
              maxLength={MAX_REASON_LENGTH}
              value={confirmationReason}
              disabled={busy}
              placeholder={confirmation === 'activate'
                ? 'Why should this draft go live now?'
                : 'Why is the safeguard being stopped?'}
              onChange={(event) => setConfirmationReason(event.target.value)}
            />
            <p className="text-right text-xs text-gray-400">{confirmationReason.length}/{MAX_REASON_LENGTH}</p>
          </div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert" aria-live="assertive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button>
            <Button
              variant={confirmation === 'deactivate' ? 'destructive' : 'default'}
              disabled={busy || confirmationReason.trim().length === 0}
              onClick={() => void confirmPolicyAction()}
            >
              {(operation === 'activate' || operation === 'deactivate') && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmation === 'activate' ? 'Confirm activation' : 'Confirm deactivation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
