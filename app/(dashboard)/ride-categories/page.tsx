'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import { Plus, Pencil, ToggleLeft, ToggleRight, Loader2, Car, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { FilterBar, FilterSearch } from '@/components/common/filter-bar'
import { EmptyState } from '@/components/common/empty-state'
import { FormDialog } from '@/components/common/form-dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { getRideCategories, createRideCategory, updateRideCategory, type RideCategory } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { formatGhs } from '@/lib/money'
import { DistanceFareSafeguardCard } from './_components/distance-fare-safeguard-card'

// ── Money helpers ───────────────────────────────────────────────────────────────
// All rates travel as integer pesewas (GHS 26.00 = 2600). Display in GHS, send
// pesewas, never floats. See docs/ride-categories-admin-integration.md §4.
// (Form-string <-> pesewas round-trip; distinct from the display-only
// `formatGhs` imported above from `@/lib/money`.)

function ghsToPesewas(ghs: string): number {
  return Math.round(parseFloat(ghs) * 100)
}

function pesewasToGhs(pesewas: number): string {
  return (pesewas / 100).toFixed(2)
}

// Backend slug rule: lowercase kebab-case - /^[a-z0-9]+(?:-[a-z0-9]+)*$/
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

// ── Tier dialog ─────────────────────────────────────────────────────────────────

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
      // Auto-derive the slug only while creating - don't silently rewrite an
      // existing tier's slug (mobile may hardcode it).
      ...(isEdit ? {} : { slug: slugify(value) }),
    }))
  }

  // Soft warning: editing the slug of an existing tier is risky (mobile clients
  // may hardcode regular/comfort). Spec §5.
  const slugChanged = isEdit && tier != null && form.slug.trim() !== tier.slug

  async function handleSubmit() {
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
        setSlugError('Invalid slug - use lowercase kebab-case.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to save tier.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit ride tier' : 'New ride tier'}
      description={isEdit ? 'Update this tier and its fare rates.' : 'Add a new ride tier with its own fare rates.'}
      submitLabel={isEdit ? 'Save changes' : 'Create tier'}
      onSubmit={handleSubmit}
      loading={saving}
      error={error || null}
      size="lg"
    >
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
            <span>Changing a tier&apos;s slug is risky - mobile apps and ride matching may rely on the existing value. Only do this if you&apos;re sure.</span>
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
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fare rates (GHS)</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-gray-400">Base fare</Label>
            <Input type="number" placeholder="3.00" min="0" step="0.01" value={form.baseFare} onChange={e => set('baseFare', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-gray-400">Minimum fare</Label>
            <Input type="number" placeholder="26.00" min="0" step="0.01" value={form.minFare} onChange={e => set('minFare', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-gray-400">Per kilometre</Label>
            <Input type="number" placeholder="1.50" min="0" step="0.01" value={form.perKm} onChange={e => set('perKm', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-gray-400">Per minute</Label>
            <Input type="number" placeholder="0.20" min="0" step="0.01" value={form.perMin} onChange={e => set('perMin', e.target.value)} />
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-xs text-gray-500">
          Save the tier first, then use the server-authored preview in the Distance Fare
          Safeguard card. The dashboard does not duplicate the authoritative fare formula.
        </div>
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
    </FormDialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RideCategoriesPage() {
  const [tiers, setTiers] = useState<RideCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RideCategory | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deactivating, setDeactivating] = useState<RideCategory | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    getRideCategories()
      .then(data => setTiers(Array.isArray(data) ? data : []))
      .catch(() => {
        setTiers([])
        setError('Could not load ride tiers. Check your connection and try again.')
      })
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

  const columns: DataTableColumn<RideCategory>[] = [
    {
      key: 'tier',
      header: 'Tier',
      render: tier => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-gray-100 text-gray-600">
            {tier.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tier.iconUrl} alt="" className="w-7 h-7 rounded-md object-cover" />
            ) : (
              <Car className="h-3.5 w-3.5" />
            )}
          </div>
          <div className={`min-w-0 ${tier.isActive ? '' : 'opacity-50'}`}>
            <p className="text-sm font-medium text-gray-900 truncate">{tier.name}</p>
            <p className="text-[11px] font-mono text-gray-400 truncate">{tier.slug}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'base',
      header: 'Base',
      align: 'right',
      render: tier => <span className={tier.isActive ? '' : 'opacity-50'}>{formatGhs(tier.baseFarePesewas)}</span>,
    },
    {
      key: 'perKm',
      header: 'Per km',
      align: 'right',
      render: tier => <span className={tier.isActive ? '' : 'opacity-50'}>{formatGhs(tier.perKmPesewas)}</span>,
    },
    {
      key: 'perMin',
      header: 'Per min',
      align: 'right',
      render: tier => <span className={tier.isActive ? '' : 'opacity-50'}>{formatGhs(tier.perMinPesewas)}</span>,
    },
    {
      key: 'minFare',
      header: 'Min fare',
      align: 'right',
      render: tier => <span className={`font-semibold ${tier.isActive ? '' : 'opacity-50'}`}>{formatGhs(tier.minimumFarePesewas)}</span>,
    },
    {
      key: 'seats',
      header: 'Seats',
      align: 'center',
      render: tier => <span className={tier.isActive ? '' : 'opacity-50'}>{tier.capacityPersons}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: tier => <StatusBadge status={tier.isActive ? 'active' : 'inactive'} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      className: 'w-20',
      render: tier => (
        <RoleGate permission="edit_ride_categories">
          <div className="flex items-center gap-1 justify-end">
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
          </div>
        </RoleGate>
      ),
    },
  ]

  return (
    <PageGuard permission="view_ride_categories">
      <div>
        <PageHeader
          title="Ride tiers"
          subtitle="Manage ride tiers and their per-tier fare rates"
          actions={
            <RoleGate permission="edit_ride_categories">
              <Button variant="brand" className="gap-2" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add tier
              </Button>
            </RoleGate>
          }
        />

        <DistanceFareSafeguardCard />

        <FilterBar onRefresh={load} refreshing={loading} meta={`${activeCount} active - ${tiers.length - activeCount} inactive`}>
          <FilterSearch value={search} onChange={setSearch} placeholder="Search tiers" />
        </FilterBar>

        <DataTable
          columns={columns}
          rows={visible}
          rowKey={tier => tier.id}
          loading={loading}
          error={error}
          onRetry={load}
          empty={
            <EmptyState
              icon={Car}
              title={search ? 'No tiers match your search' : 'No ride tiers yet'}
              description={search ? 'Try a different search.' : 'Add a tier to start pricing rides.'}
              action={!search ? (
                <RoleGate permission="edit_ride_categories">
                  <Button variant="brand" size="sm" className="gap-1.5" onClick={openCreate}>
                    <Plus className="h-3.5 w-3.5" /> Add first tier
                  </Button>
                </RoleGate>
              ) : undefined}
            />
          }
          caption={`${visible.length} of ${tiers.length} tiers`}
        />

        <TierDialog
          open={dialogOpen}
          tier={editing}
          onClose={() => setDialogOpen(false)}
          onSaved={handleSaved}
        />

        <ConfirmDialog
          open={!!deactivating}
          onClose={() => setDeactivating(null)}
          title={`Deactivate "${deactivating?.name}"?`}
          description="New bookings won't see this tier and it disappears from the public list. Existing rides and driver approvals are kept - you can reactivate it later."
          confirmLabel="Deactivate tier"
          onConfirm={() => deactivating && applyToggle(deactivating, false)}
          loading={togglingId === deactivating?.id}
        />
      </div>
    </PageGuard>
  )
}
