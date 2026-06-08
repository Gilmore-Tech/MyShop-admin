'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import { Plus, Pencil, ToggleLeft, ToggleRight, Loader2, Search, Tag, ChevronRight, AlertTriangle, CornerDownRight, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/common/page-header'
import { getCategories, createCategory, updateCategory, deleteCategory, type Category, type CategoryDeleteConflict } from '@/lib/api'
import { ApiError } from '@/lib/api-client'
import { MATERIAL_ICONS, iconFontClass, iconLigature } from '@/lib/material-icons'

// ── Material icon helpers ───────────────────────────────────────────────────────

/** Renders a category icon by its mobile `iconName` (handles _outlined variants). */
function MatIcon({ name, className, size = 20 }: { name: string; className?: string; size?: number }) {
  return (
    <span className={`${iconFontClass(name)} leading-none ${className ?? ''}`} style={{ fontSize: size }}>
      {iconLigature(name)}
    </span>
  )
}

// miscellaneous_services is the generic catch-all — multiple categories may use it.
const REUSABLE_ICON = 'miscellaneous_services'

/** Searchable icon grid — pick an unused icon. `usedIcons` are taken by other categories. */
function IconPicker({ value, onChange, usedIcons }: {
  value: string
  onChange: (name: string) => void
  usedIcons: Set<string>
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = q
    ? MATERIAL_ICONS.filter(n => n.includes(q) || n.replace(/_/g, ' ').includes(q))
    : MATERIAL_ICONS

  const isTaken = (name: string) => name !== value && name !== REUSABLE_ICON && usedIcons.has(name)
  const availableCount = MATERIAL_ICONS.filter(n => n === REUSABLE_ICON || n === value || !usedIcons.has(n)).length

  return (
    <div className="space-y-2">
      {/* Selected preview */}
      <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
        <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
          {value
            ? <MatIcon name={value} className="text-gray-700" size={22} />
            : <Tag className="h-4 w-4 text-gray-300" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{value || 'No icon selected'}</p>
          <p className="text-[11px] text-gray-400">{availableCount} of {MATERIAL_ICONS.length} icons available</p>
        </div>
        {value && (
          <button type="button" onClick={() => onChange('')} className="ml-auto text-[11px] text-gray-400 hover:text-red-600 shrink-0">
            Clear
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <Input
          placeholder="Search icons…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-8 text-sm"
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto rounded-lg border border-gray-100 p-2">
        {filtered.map(name => {
          const taken = isTaken(name)
          const selected = value === name
          return (
            <button
              key={name}
              type="button"
              disabled={taken}
              title={taken ? `${name} - already used by another category` : name}
              onClick={() => { if (!taken) onChange(name) }}
              className={`aspect-square rounded-md flex items-center justify-center transition-colors ${
                selected
                  ? 'bg-orange-50 ring-1 ring-orange-300 text-orange-700'
                  : taken
                    ? 'text-gray-300 opacity-40 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <MatIcon name={name} size={20} />
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="col-span-8 text-center text-xs text-gray-400 py-6">No icons match &ldquo;{query}&rdquo;</p>
        )}
      </div>

      {availableCount === 0 && (
        <p className="text-[11px] text-amber-600 leading-snug">
          All icons are in use. New icons must be added to the mobile app&apos;s icon set before more distinct categories can be created.
        </p>
      )}
    </div>
  )
}

// Backend validation: /^[a-z0-9]+(?:_[a-z0-9]+)*$/
const ICON_NAME_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatGhs(pesewas: number) {
  return 'GHS ' + (pesewas / 100).toFixed(2)
}

function ghsToPesewas(ghs: string): number {
  return Math.round(parseFloat(ghs) * 100)
}

function pesewasToGhs(pesewas: number): string {
  return (pesewas / 100).toFixed(2)
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Build a display-ordered flat list: parents first, children indented beneath them. */
function buildDisplayList(categories: Category[]): { cat: Category; depth: number }[] {
  const byParent = new Map<string | null, Category[]>()
  for (const c of categories) {
    const key = c.parentId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(c)
  }
  // Sort each group by sortOrder then name
  for (const group of byParent.values()) {
    group.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  }
  const result: { cat: Category; depth: number }[] = []
  function walk(parentId: string | null, depth: number) {
    for (const cat of byParent.get(parentId) ?? []) {
      result.push({ cat, depth })
      walk(cat.id, depth + 1)
    }
  }
  walk(null, 0)
  return result
}

// ── Form state ────────────────────────────────────────────────────────────────

type FormState = {
  name: string
  slug: string
  minBid: string
  highBidFlag: string
  // 'none' = top-level. Empty string isn't used so an unselected radix Select
  // value doesn't collide with the "no parent" choice.
  parentId: string
  iconName: string
  // sortOrder is assigned automatically (appended to its sibling group), not
  // edited by the admin.
}

const EMPTY_FORM: FormState = {
  name: '', slug: '',
  minBid: '30.00', highBidFlag: '5000.00',
  parentId: 'none', iconName: '',
}

// ── Category Dialog ───────────────────────────────────────────────────────────

function CategoryDialog({
  open,
  category,
  defaultParentId,
  allCategories,
  onClose,
  onSaved,
}: {
  open: boolean
  category: Category | null
  /** Pre-fill the Parent picker when opening from a parent row's "Add subcategory". */
  defaultParentId?: string | null
  /** Top-level categories used to populate the Parent picker. */
  allCategories: Category[]
  onClose: () => void
  onSaved: (saved: Category) => void
}) {
  const isEdit = category !== null
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (category) {
      setForm({
        name: category.name,
        slug: category.slug,
        minBid: pesewasToGhs(category.minBidPesewas),
        highBidFlag: pesewasToGhs(category.highBidFlagPesewas),
        parentId: category.parentId ?? 'none',
        iconName: category.iconName ?? '',
      })
    } else {
      setForm({
        ...EMPTY_FORM,
        parentId: defaultParentId ?? 'none',
      })
    }
    setError('')
  }, [open, category, defaultParentId])

  // Only top-level (parent-less, active) categories can themselves act as
  // parents — backend Prisma schema doesn't enforce depth, but keeping the tree
  // 2-deep matches the mobile client's model and prevents weird nesting.
  const parentOptions = allCategories.filter(c => c.parentId === null && c.id !== category?.id)
  // Icons already taken by other categories — so a new category gets a distinct one.
  const usedIcons = new Set(
    allCategories.filter(c => c.id !== category?.id && c.iconName).map(c => c.iconName as string),
  )
  const isSubcategory = form.parentId !== 'none'
  // Don't let an edit move a category between parents (backend doesn't accept
  // parentId on UpdateCategoryDto either).
  const parentLocked = isEdit

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleNameChange(value: string) {
    setForm(f => ({
      ...f,
      name: value,
      ...(isEdit ? {} : { slug: slugify(value) }),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    const slug = form.slug.trim()
    const iconName = form.iconName.trim()
    const minBidPesewas = ghsToPesewas(form.minBid)
    const highBidFlagPesewas = ghsToPesewas(form.highBidFlag)

    // Auto-assign sort order: keep the existing value on edit, otherwise append
    // to the end of the chosen parent's sibling group.
    const parentKey = form.parentId === 'none' ? null : form.parentId
    const siblings = allCategories.filter(c => (c.parentId ?? null) === parentKey)
    const nextSort = siblings.length ? Math.max(...siblings.map(c => c.sortOrder ?? 0)) + 1 : 0
    const sortOrder = Math.min(isEdit ? (category!.sortOrder ?? nextSort) : nextSort, 999)

    if (!name) { setError('Name is required.'); return }
    if (!slug) { setError('Slug is required.'); return }
    if (iconName && !ICON_NAME_PATTERN.test(iconName)) {
      setError('Icon name must be lowercase snake_case (e.g. "handyman", "laptop_mac").')
      return
    }
    if (isNaN(minBidPesewas) || minBidPesewas <= 0) { setError('Minimum bid must be a positive amount.'); return }
    if (isNaN(highBidFlagPesewas) || highBidFlagPesewas <= 0) { setError('High-bid flag threshold must be a positive amount.'); return }
    if (highBidFlagPesewas <= minBidPesewas) { setError('High-bid flag must be greater than the minimum bid.'); return }

    setSaving(true)
    setError('')
    try {
      const saved = isEdit
        ? await updateCategory(category!.id, {
            name, slug, minBidPesewas, highBidFlagPesewas, sortOrder,
            ...(iconName ? { iconName } : {}),
          }) as Category
        : await createCategory({
            name, slug, minBidPesewas, highBidFlagPesewas, sortOrder,
            ...(form.parentId !== 'none' ? { parentId: form.parentId } : {}),
            ...(iconName ? { iconName } : {}),
          }) as Category
      onSaved(saved)
      onClose()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Failed to save category.')
    } finally {
      setSaving(false)
    }
  }

  const title = isEdit ? 'Edit Category' : isSubcategory ? 'New Subcategory' : 'New Service Category'
  const description = isEdit
    ? 'Update the category details.'
    : isSubcategory
      ? 'Add a subcategory under an existing parent.'
      : 'Add a new artisan service category to the marketplace.'

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        {/* Header with live icon preview */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 space-y-0 text-left">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              {form.iconName
                ? <MatIcon name={form.iconName} size={26} className="text-gray-700" />
                : <Tag className="h-5 w-5 text-gray-300" />}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">{title}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">{description}</DialogDescription>
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
                    placeholder={isSubcategory ? 'e.g. Laptop Repair' : 'e.g. Plumbing'}
                    value={form.name}
                    onChange={e => handleNameChange(e.target.value)}
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Slug</Label>
                  <Input
                    placeholder={isSubcategory ? 'repair-laptop' : 'plumbing'}
                    value={form.slug}
                    onChange={e => set('slug', slugify(e.target.value))}
                    maxLength={60}
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parent</Label>
                <Select value={form.parentId} onValueChange={v => set('parentId', v)} disabled={parentLocked}>
                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Top-level category</SelectItem>
                    {parentOptions.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-gray-400">
                  {parentLocked
                    ? 'Parent cannot be changed after creation.'
                    : 'Top-level for an umbrella category, or pick a parent for a subcategory.'}
                </p>
              </div>
            </div>

            {/* Icon */}
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Icon</Label>
              <IconPicker value={form.iconName} onChange={v => set('iconName', v)} usedIcons={usedIcons} />
            </div>

            {/* Bid pricing */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bid Pricing</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-gray-400">Min Bid (GHS)</Label>
                  <Input type="number" placeholder="30.00" min="0" step="0.01" value={form.minBid} onChange={e => set('minBid', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-gray-400">High-Bid Flag (GHS)</Label>
                  <Input type="number" placeholder="5000.00" min="0" step="0.01" value={form.highBidFlag} onChange={e => set('highBidFlag', e.target.value)} />
                </div>
              </div>

              {form.minBid && form.highBidFlag && !isNaN(parseFloat(form.minBid)) && !isNaN(parseFloat(form.highBidFlag)) && (
                <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-xs text-gray-500 space-y-1">
                  <p>Artisans can bid from <strong className="text-gray-700">{formatGhs(ghsToPesewas(form.minBid))}</strong> with no upper limit.</p>
                  <p className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />
                    <span>Bids above <strong className="text-gray-700">{formatGhs(ghsToPesewas(form.highBidFlag))}</strong> are flagged for admin review before the client sees them.</span>
                  </p>
                </div>
              )}
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
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Delete dialog ─────────────────────────────────────────────────────────────

function DeleteCategoryDialog({
  category, onClose, onDeleted,
}: {
  category: Category | null
  onClose: () => void
  onDeleted: (deletedId: string) => void
}) {
  const [reason, setReason] = useState('')
  const [force, setForce] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState<CategoryDeleteConflict | null>(null)

  // Reset on open / category change.
  useEffect(() => {
    setReason('')
    setForce(false)
    setError('')
    setConflict(null)
  }, [category?.id])

  if (!category) return null

  const reasonValid = reason.trim().length >= 10
  // Job-block is unbypassable; force only helps when only artisans/subcategories block.
  const blockedByJobs = conflict?.code === 'CATEGORY_HAS_JOBS'
  const canSubmit = reasonValid && !submitting && !blockedByJobs

  async function handleDelete() {
    if (!category) return
    setError('')
    setConflict(null)
    setSubmitting(true)
    try {
      await deleteCategory(category.id, { reason: reason.trim(), force })
      onDeleted(category.id)
      onClose()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        const details = (err as unknown as { details?: CategoryDeleteConflict }).details
        // Surface counts from the 409 body when present. ApiError today doesn't
        // carry a typed details field; if backend wraps in the standard envelope
        // we fall back to inferring from the message.
        if (details && typeof details === 'object') {
          setConflict({
            code: details.code ?? (err.message.includes('JOBS') ? 'CATEGORY_HAS_JOBS' : 'CATEGORY_IN_USE'),
            artisansCount: details.artisansCount ?? 0,
            jobsCount: details.jobsCount ?? 0,
            subcategoryCount: details.subcategoryCount ?? 0,
          })
        } else {
          setConflict({
            code: err.message.includes('JOBS') ? 'CATEGORY_HAS_JOBS' : 'CATEGORY_IN_USE',
            artisansCount: 0, jobsCount: 0, subcategoryCount: 0,
          })
        }
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to delete category.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!category} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-red-600 flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> Delete &ldquo;{category.name}&rdquo;
          </DialogTitle>
          <DialogDescription>
            This permanently removes the category. Historical jobs always block deletion to preserve audit records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {conflict && (
            <div className={`rounded-lg p-3 space-y-2 ${
              blockedByJobs ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'
            }`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${
                blockedByJobs ? 'text-red-700' : 'text-amber-700'
              }`}>
                {blockedByJobs ? 'Cannot delete - historical jobs exist' : 'Category is in use'}
              </p>
              <ul className="text-xs text-gray-700 space-y-0.5 list-disc list-inside">
                {conflict.artisansCount > 0 && <li>{conflict.artisansCount} artisan{conflict.artisansCount === 1 ? '' : 's'} offer{conflict.artisansCount === 1 ? 's' : ''} this category</li>}
                {conflict.subcategoryCount > 0 && <li>{conflict.subcategoryCount} subcategor{conflict.subcategoryCount === 1 ? 'y' : 'ies'} under this category</li>}
                {conflict.jobsCount > 0 && <li className="text-red-700 font-medium">{conflict.jobsCount} historical job{conflict.jobsCount === 1 ? '' : 's'} reference{conflict.jobsCount === 1 ? 's' : ''} it</li>}
              </ul>
              {blockedByJobs ? (
                <p className="text-[11px] text-red-700 leading-snug">
                  Use <strong>Deactivate</strong> instead - that hides it from new bookings without breaking historical data.
                </p>
              ) : (
                <p className="text-[11px] text-amber-700 leading-snug">
                  Tick &ldquo;Force&rdquo; below to remove artisan mappings and cascade-delete subcategories.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Reason <span className="text-gray-400">(min 10 chars, audit-logged)</span>
            </Label>
            <Textarea
              rows={3}
              placeholder="Describe why this category is being deleted…"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="text-sm"
            />
            <p className={`text-[11px] ${reasonValid ? 'text-emerald-600' : 'text-gray-400'}`}>
              {reason.trim().length} / 10 characters
            </p>
          </div>

          {!blockedByJobs && conflict && (
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={force}
                onCheckedChange={v => setForce(v === true)}
                className="mt-0.5"
              />
              <span className="text-xs text-gray-700 leading-snug">
                <span className="font-medium text-red-700">Force delete:</span> remove artisan mappings and cascade-delete subcategories. This cannot be undone.
              </span>
            </label>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!canSubmit || (conflict?.code === 'CATEGORY_IN_USE' && !force)}
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700 text-white gap-2"
            title={blockedByJobs ? 'Historical jobs prevent deletion. Deactivate the category instead.' : undefined}
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {force ? 'Force Delete' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    getCategories()
      .then(data => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() { setEditing(null); setCreatingUnder(null); setDialogOpen(true) }
  function openEdit(cat: Category) { setEditing(cat); setCreatingUnder(null); setDialogOpen(true) }
  function openCreateSubcategory(parent: Category) {
    setEditing(null)
    setCreatingUnder(parent.id)
    setDialogOpen(true)
  }

  function handleSaved(saved: Category) {
    setCategories(prev => {
      const idx = prev.findIndex(c => c.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [...prev, saved]
    })
  }

  function handleDeleted(deletedId: string) {
    // Drop the row and any of its descendants (matches backend cascade).
    const dropped = new Set<string>([deletedId])
    let grew = true
    while (grew) {
      grew = false
      for (const c of categories) {
        if (c.parentId && dropped.has(c.parentId) && !dropped.has(c.id)) {
          dropped.add(c.id)
          grew = true
        }
      }
    }
    setCategories(prev => prev.filter(c => !dropped.has(c.id)))
  }

  async function handleToggle(cat: Category) {
    setTogglingId(cat.id)
    try {
      const updated = await updateCategory(cat.id, { isActive: !cat.isActive }) as Category
      setCategories(prev => prev.map(c => c.id === updated.id ? updated : c))
    } catch {
      // silently keep existing state
    } finally {
      setTogglingId(null)
    }
  }

  // Search filters across all categories
  const searchLower = search.toLowerCase()
  const visibleIds = search
    ? new Set(categories.filter(c =>
        c.name.toLowerCase().includes(searchLower) ||
        c.slug.toLowerCase().includes(searchLower)
      ).map(c => c.id))
    : null

  const displayList = buildDisplayList(categories).filter(
    ({ cat }) => !visibleIds || visibleIds.has(cat.id)
  )

  const activeCount = categories.filter(c => c.isActive).length
  const subCount = categories.filter(c => c.parentId).length

  return (
    <PageGuard permission="view_categories">
    <div>
      <PageHeader
        title="Service Categories"
        subtitle="Manage artisan service categories, subcategories, and bid price controls"
        actions={
          <RoleGate permission="edit_categories">
            <Button onClick={openCreate} className="text-white gap-2" style={{ backgroundColor: '#F5A623' }}>
              <Plus className="h-4 w-4" /> Add Category
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
          <span className="text-gray-600">{categories.length - activeCount} inactive</span>
        </div>
        <div className="bg-white rounded-lg px-3 py-1.5 shadow-sm flex items-center gap-2">
          <span className="text-gray-600">{categories.filter(c => !c.parentId).length} top-level - {subCount} subcategories</span>
        </div>
        <div className="relative max-w-xs ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Search categories…"
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
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Min Bid</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">High-Bid Flag</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(6)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(5)].map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : displayList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-14 text-gray-400">
                  <Tag className="h-8 w-8 mx-auto mb-2 text-gray-200" />
                  <p className="text-sm">{search ? 'No categories match your search.' : 'No service categories yet.'}</p>
                  {!search && (
                    <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={openCreate}>
                      <Plus className="h-3.5 w-3.5" /> Add First Category
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              displayList.map(({ cat, depth }) => {
                const isChild = depth > 0
                return (
                  <TableRow
                    key={cat.id}
                    className={`hover:bg-gray-50 transition-colors ${!cat.isActive ? 'opacity-50' : ''} ${isChild ? 'bg-gray-50/40' : ''}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2" style={{ paddingLeft: depth * 20 }}>
                        {isChild && <ChevronRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />}
                        {cat.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cat.iconUrl} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-gray-100 text-gray-600">
                            {cat.iconName
                              ? <MatIcon name={cat.iconName} size={18} />
                              : <Tag className="h-3.5 w-3.5" />}
                          </div>
                        )}
                        <span className={`text-sm min-w-0 truncate ${isChild ? 'text-gray-600' : 'font-medium text-gray-900'}`}>
                          {cat.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-gray-800">
                      {formatGhs(cat.minBidPesewas)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <span className="text-amber-600 font-medium">{formatGhs(cat.highBidFlagPesewas)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        {cat.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <RoleGate permission="edit_categories">
                          {!isChild && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-gray-400 hover:text-orange-600"
                              onClick={() => openCreateSubcategory(cat)}
                              title="Add subcategory"
                            >
                              <CornerDownRight className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-400 hover:text-gray-700"
                            onClick={() => openEdit(cat)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </RoleGate>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${cat.isActive ? 'text-emerald-500 hover:text-gray-400' : 'text-gray-300 hover:text-emerald-500'}`}
                          disabled={togglingId === cat.id}
                          onClick={() => handleToggle(cat)}
                          title={cat.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {togglingId === cat.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : cat.isActive
                            ? <ToggleRight className="h-4 w-4" />
                            : <ToggleLeft className="h-4 w-4" />
                          }
                        </Button>
                        <RoleGate permission="delete_category">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-400 hover:text-red-600"
                            onClick={() => setDeletingCategory(cat)}
                            title="Delete category"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </RoleGate>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        <div className="px-4 py-3 bg-gray-50">
          <p className="text-xs text-gray-400">
            {loading ? '-' : `${displayList.length} of ${categories.length} categories`}
          </p>
        </div>
      </div>

      <CategoryDialog
        open={dialogOpen}
        category={editing}
        defaultParentId={creatingUnder}
        allCategories={categories}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />

      <DeleteCategoryDialog
        category={deletingCategory}
        onClose={() => setDeletingCategory(null)}
        onDeleted={handleDeleted}
      />
    </div>
    </PageGuard>
  )
}
