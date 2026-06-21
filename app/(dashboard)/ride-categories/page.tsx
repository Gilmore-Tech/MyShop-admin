'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import { Plus, Pencil, ToggleLeft, ToggleRight, Loader2, Search, Car, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { PageHeader } from '@/components/common/page-header'
import { getRideCategories, createRideCategory, updateRideCategory, type RideCategory } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatGhs } from '@/lib/money'

// ── Money helpers ───────────────────────────────────────────────────────────────
// All rates travel as integer pesewas (GHS 26.00 = 2600). Display in GHS, send
// pesewas, never floats. See docs/ride-categories-admin-integration.md §4.

function ghsToPesewas(ghs: string): number {
  return Math.round(parseFloat(ghs) * 100)
}

function pesewasToGhs(pesewas: number): string {
  return (pesewas / 100).toFixed(2)
}

// Backend slug rule: lowercase kebab-case — /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Form state ────────────────────────────────────────────────────────────────

type FormState = {
  name: string
  slug: string
  description: string
  baseFare: string       // GHS strings in the form; converted to pesewas on submit
  perKm: string
  perMin: string
  minFare: string
  capacity: string
}

const EMPTY_FORM: FormState = {
  name: '', slug: '', description: '',
  baseFare: '3.00', perKm: '1.50', perMin: '0.20', minFare: '26.00',
  capacity: '4',
}

// ── Tier Dialog ─────────────────────────────────────────────────────────────────

function TierDialog({
  open, tier, onClose, onSaved,
}: {
  open: boolean
  tier: RideCategory | null
  onClose: () => void
  onSaved: (saved: RideCategory) => void
}) {
  const isEdit = tier !== null
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [slugError, setSlugError] = useState('')

  useEffect(() => {
    if (!open) return
    if (tier) {
      setForm({
        name: tier.name,
        slug: tier.slug,
        description: tier.description ?? '',
        baseFare: pesewasToGhs(tier.baseFarePesewas),
        perKm: pesewasToGhs(tier.perKmPesewas),
        perMin: pesewasToGhs(tier.perMinPesewas),
        minFare: pesewasToGhs(tier.minimumFarePesewas),
        capacity: String(tier.capacityPersons),
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setError('')
    setSlugError('')
  }, [open, tier])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleNameChange(value: string) {
    setForm(f => ({
      ...f,
      name: value,
      // Auto-derive the slug only while creating — don't silently rewrite an
      // existing tier's slug (mobile may hardcode it).
      ...(isEdit ? {} : { slug: slugify(value) }),
    }))
  }

  // Soft warning: editing the slug of an existing tier is risky (mobile clients
  // may hardcode regular/comfort). Spec §5.
  const slugChanged = isEdit && tier != null && form.slug.trim() !== tier.slug

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSlugError('')

    const name = form.name.trim()
    const slug = form.slug.trim()
    const baseFarePesewas = ghsToPesewas(form.baseFare)
    const perKmPesewas = ghsToPesewas(form.perKm)
    const perMinPesewas = ghsToPesewas(form.perMin)
    const minimumFarePesewas = ghsToPesewas(form.minFare)
    const capacityPersons = parseInt(form.capacity, 10)

    if (!name) { setError('Name is required.'); return }
    if (!slug) { setSlugError('Slug is required.'); return }
    if (!SLUG_PATTERN.test(slug)) {
      setSlugError('Slug must be lowercase kebab-case (e.g. "comfort", "comfort-plus").')
      return
    }
    const rates: [string, number][] = [
      ['Base fare', baseFarePesewas],
      ['Per-km rate', perKmPesewas],
      ['Per-min rate', perMinPesewas],
      ['Minimum fare', minimumFarePesewas],
    ]
    for (const [label, value] of rates) {
      if (isNaN(value) || value < 0 || !Number.isInteger(value)) {
        setError(`${label} must be a whole, non-negative amount in GHS.`)
        return
      }
    }
    if (isNaN(capacityPersons) || capacityPersons < 1 || capacityPersons > 20) {
      setError('Capacity must be between 1 and 20.')
      return
    }

    setSaving(true)
    try {
      const description = form.description.trim()
      const saved = isEdit
        ? await updateRideCategory(tier!.id, {
            name, slug, baseFarePesewas, perKmPesewas, perMinPesewas, minimumFarePesewas,
            capacityPersons, description,
          })
        : await createRideCategory({
            name, slug, baseFarePesewas, perKmPesewas, perMinPesewas, minimumFarePesewas,
            capacityPersons, ...(description ? { description } : {}),
          })
      onSaved(saved)
      onClose()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'SLUG_ALREADY_EXISTS') {
        setSlugError('That slug is already taken by another tier.')
      } else if (err instanceof ApiError && err.code === 'INVALID_SLUG') {
        setSlugError('Invalid slug — use lowercase kebab-case.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to save tier.')
      }
    } finally {
      setSaving(false)
    }
  }

  // Live fare preview for a sample 5 km / 12 min trip.
  const sampleFare = (() => {
    const base = ghsToPesewas(form.baseFare)
    const km = ghsToPesewas(form.perKm)
    const min = ghsToPesewas(form.perMin)
    const minFare = ghsToPesewas(form.minFare)
    if ([base, km, min, minFare].some(v => isNaN(v))) return null
    return Math.max(base + km * 5 + min * 12, minFare)
  })()

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 space-y-0 text-left">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Car className="h-5 w-5 text-gray-500" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">{isEdit ? 'Edit Ride Tier' : 'New Ride Tier'}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {isEdit ? 'Update this tier and its fare rates.' : 'Add a new ride tier with its own fare rates.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
          <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[60vh]">

            {/* Identity */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</Label>
                  <Input
                    placeholder="e.g. Comfort"
                    value={form.name}
                    onChange={e => handleNameChange(e.target.value)}
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Slug</Label>
                  <Input
                    placeholder="comfort"
                    value={form.slug}
                    onChange={e => set('slug', e.target.value.toLowerCase())}
                    maxLength={60}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
              {slugError && (
                <p className="text-[11px] text-red-600">{slugError}</p>
              )}
              {slugChanged && !slugError && (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-600 leading-snug">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>Changing a tier&apos;s slug is risky — mobile apps and ride matching may rely on the existing value. Only do this if you&apos;re sure.</span>
                </p>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description <span className="text-gray-300 normal-case">(optional)</span></Label>
                <Input
                  placeholder="e.g. Roomier cars for a more comfortable ride"
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  maxLength={140}
                />
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fare Rates (GHS)</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-gray-400">Base Fare</Label>
                  <Input type="number" placeholder="3.00" min="0" step="0.01" value={form.baseFare} onChange={e => set('baseFare', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-gray-400">Minimum Fare</Label>
                  <Input type="number" placeholder="26.00" min="0" step="0.01" value={form.minFare} onChange={e => set('minFare', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-gray-400">Per Kilometre</Label>
                  <Input type="number" placeholder="1.50" min="0" step="0.01" value={form.perKm} onChange={e => set('perKm', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-gray-400">Per Minute</Label>
                  <Input type="number" placeholder="0.20" min="0" step="0.01" value={form.perMin} onChange={e => set('perMin', e.target.value)} />
                </div>
              </div>
              {sampleFare != null && (
                <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-xs text-gray-500">
                  Estimated fare for a 5&nbsp;km / 12&nbsp;min trip:{' '}
                  <strong className="text-gray-700">{formatGhs(sampleFare)}</strong>
                </div>
              )}
            </div>

            {/* Capacity */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Capacity (persons)</Label>
                  <Input type="number" placeholder="4" min="1" max="20" step="1" value={form.capacity} onChange={e => set('capacity', e.target.value)} />
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={saving}
              className="text-white gap-2"
              style={{ backgroundColor: '#F5A623' }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Tier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Deactivate confirmation ─────────────────────────────────────────────────────

function DeactivateDialog({
  tier, onClose, onConfirm, submitting,
}: {
  tier: RideCategory | null
  onClose: () => void
  onConfirm: () => void
  submitting: boolean
}) {
  return (
    <Dialog open={!!tier} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-800">
            <ToggleLeft className="h-4 w-4" /> Deactivate &ldquo;{tier?.name}&rdquo;
          </DialogTitle>
          <DialogDescription>
            New bookings won&apos;t see this tier and it disappears from the public list. Existing rides and driver approvals are kept — you can reactivate it later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={submitting}
            onClick={onConfirm}
            className="bg-gray-700 hover:bg-gray-800 text-white gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Deactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RideCategoriesPage() {
  const [tiers, setTiers] = useState<RideCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RideCategory | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deactivating, setDeactivating] = useState<RideCategory | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    getRideCategories()
      .then(data => setTiers(Array.isArray(data) ? data : []))
      .catch(() => setTiers([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() { setEditing(null); setDialogOpen(true) }
  function openEdit(tier: RideCategory) { setEditing(tier); setDialogOpen(true) }

  function handleSaved(saved: RideCategory) {
    setTiers(prev => {
      const idx = prev.findIndex(t => t.id === saved.id)
      const next = idx >= 0 ? prev.map(t => t.id === saved.id ? saved : t) : [...prev, saved]
      return next.sort((a, b) => a.sortOrder - b.sortOrder)
    })
  }

  // Activating is direct; deactivating goes through a confirmation first.
  async function applyToggle(tier: RideCategory, isActive: boolean) {
    setTogglingId(tier.id)
    try {
      const updated = await updateRideCategory(tier.id, { isActive })
      setTiers(prev => prev.map(t => t.id === updated.id ? updated : t))
    } catch {
      // keep existing state on failure
    } finally {
      setTogglingId(null)
      setDeactivating(null)
    }
  }

  function handleToggle(tier: RideCategory) {
    if (tier.isActive) setDeactivating(tier)
    else applyToggle(tier, true)
  }

  const searchLower = search.toLowerCase()
  const visible = search
    ? tiers.filter(t => t.name.toLowerCase().includes(searchLower) || t.slug.toLowerCase().includes(searchLower))
    : tiers

  const activeCount = tiers.filter(t => t.isActive).length

  return (
    <PageGuard permission="view_ride_categories">
      <div>
        <PageHeader
          title="Ride Tiers"
          subtitle="Manage ride tiers and their per-tier fare rates"
          actions={
            <RoleGate permission="edit_ride_categories">
              <Button onClick={openCreate} className="text-white gap-2" style={{ backgroundColor: '#F5A623' }}>
                <Plus className="h-4 w-4" /> Add Tier
              </Button>
            </RoleGate>
          }
        />

        {/* Stats strip */}
        <div className="flex items-center gap-4 mb-4 text-sm">
          <div className="bg-white rounded-lg px-3 py-1.5 shadow-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-gray-600">{activeCount} active</span>
          </div>
          <div className="bg-white rounded-lg px-3 py-1.5 shadow-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-gray-600">{tiers.length - activeCount} inactive</span>
          </div>
          <div className="relative max-w-xs ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search tiers…"
              className="pl-9 bg-white"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tier</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Base</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Per km</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Per min</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Min Fare</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Seats</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(8)].map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-14 text-gray-400">
                    <Car className="h-8 w-8 mx-auto mb-2 text-gray-200" />
                    <p className="text-sm">{search ? 'No tiers match your search.' : 'No ride tiers yet.'}</p>
                    {!search && (
                      <RoleGate permission="edit_ride_categories">
                        <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={openCreate}>
                          <Plus className="h-3.5 w-3.5" /> Add First Tier
                        </Button>
                      </RoleGate>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map(tier => (
                  <TableRow
                    key={tier.id}
                    className={`hover:bg-gray-50 transition-colors ${!tier.isActive ? 'opacity-50' : ''}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-gray-100 text-gray-600">
                          {tier.iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={tier.iconUrl} alt="" className="w-7 h-7 rounded-md object-cover" />
                          ) : (
                            <Car className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{tier.name}</p>
                          <p className="text-[11px] font-mono text-gray-400 truncate">{tier.slug}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm text-gray-800">{formatGhs(tier.baseFarePesewas)}</TableCell>
                    <TableCell className="text-right text-sm text-gray-800">{formatGhs(tier.perKmPesewas)}</TableCell>
                    <TableCell className="text-right text-sm text-gray-800">{formatGhs(tier.perMinPesewas)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold text-gray-800">{formatGhs(tier.minimumFarePesewas)}</TableCell>
                    <TableCell className="text-center text-sm text-gray-700">{tier.capacityPersons}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        {tier.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <RoleGate permission="edit_ride_categories">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-400 hover:text-gray-700"
                            onClick={() => openEdit(tier)}
                            title="Edit tier"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${tier.isActive ? 'text-emerald-500 hover:text-gray-400' : 'text-gray-300 hover:text-emerald-500'}`}
                            disabled={togglingId === tier.id}
                            onClick={() => handleToggle(tier)}
                            title={tier.isActive ? 'Deactivate' : 'Reactivate'}
                          >
                            {togglingId === tier.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : tier.isActive
                              ? <ToggleRight className="h-4 w-4" />
                              : <ToggleLeft className="h-4 w-4" />}
                          </Button>
                        </RoleGate>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="px-4 py-3 bg-gray-50">
            <p className="text-xs text-gray-400">
              {loading ? '-' : `${visible.length} of ${tiers.length} tiers`}
            </p>
          </div>
        </div>

        <TierDialog
          open={dialogOpen}
          tier={editing}
          onClose={() => setDialogOpen(false)}
          onSaved={handleSaved}
        />

        <DeactivateDialog
          tier={deactivating}
          onClose={() => setDeactivating(null)}
          onConfirm={() => deactivating && applyToggle(deactivating, false)}
          submitting={togglingId === deactivating?.id}
        />
      </div>
    </PageGuard>
  )
}
