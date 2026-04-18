'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import { Plus, Pencil, ToggleLeft, ToggleRight, Loader2, Search, Tag, ChevronRight, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { PageHeader } from '@/components/common/page-header'
import { getCategories, createCategory, updateCategory, type Category } from '@/lib/api'

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
}

const EMPTY_FORM: FormState = {
  name: '', slug: '',
  minBid: '30.00', highBidFlag: '5000.00',
}

// ── Category Dialog ───────────────────────────────────────────────────────────

function CategoryDialog({
  open,
  category,
  onClose,
  onSaved,
}: {
  open: boolean
  category: Category | null
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
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setError('')
  }, [open, category])

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
    const minBidPesewas = ghsToPesewas(form.minBid)
    const highBidFlagPesewas = ghsToPesewas(form.highBidFlag)

    if (!name) { setError('Name is required.'); return }
    if (!slug) { setError('Slug is required.'); return }
    if (isNaN(minBidPesewas) || minBidPesewas <= 0) { setError('Minimum bid must be a positive amount.'); return }
    if (isNaN(highBidFlagPesewas) || highBidFlagPesewas <= 0) { setError('High-bid flag threshold must be a positive amount.'); return }
    if (highBidFlagPesewas <= minBidPesewas) { setError('High-bid flag must be greater than the minimum bid.'); return }

    setSaving(true)
    setError('')
    try {
      const saved = isEdit
        ? await updateCategory(category!.id, { name, slug, minBidPesewas, highBidFlagPesewas }) as Category
        : await createCategory({ name, slug, minBidPesewas, highBidFlagPesewas }) as Category
      onSaved(saved)
      onClose()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Failed to save category.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Category' : 'New Service Category'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the category details.' : 'Add a new artisan service category to the marketplace.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Name + Slug */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</Label>
              <Input
                placeholder="e.g. Plumbing"
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Slug</Label>
              <Input
                placeholder="plumbing"
                value={form.slug}
                onChange={e => set('slug', slugify(e.target.value))}
                maxLength={60}
                className="font-mono text-sm"
              />
            </div>
          </div>

          {/* Bid pricing */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Min Bid (GHS)</Label>
              <Input
                type="number"
                placeholder="30.00"
                min="0"
                step="0.01"
                value={form.minBid}
                onChange={e => set('minBid', e.target.value)}
              />
              <p className="text-[11px] text-gray-400">Lowest a bid can be submitted</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                High-Bid Flag (GHS)
              </Label>
              <Input
                type="number"
                placeholder="5000.00"
                min="0"
                step="0.01"
                value={form.highBidFlag}
                onChange={e => set('highBidFlag', e.target.value)}
              />
              <p className="text-[11px] text-gray-400">Bids above this need admin review</p>
            </div>
          </div>

          {/* Pricing preview */}
          {form.minBid && form.highBidFlag && !isNaN(parseFloat(form.minBid)) && !isNaN(parseFloat(form.highBidFlag)) && (
            <div className="bg-orange-50 rounded-lg px-3 py-2.5 text-xs text-orange-700 space-y-1">
              <p>Artisans can bid from <strong>{formatGhs(ghsToPesewas(form.minBid))}</strong> with no upper limit.</p>
              <p className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Bids above <strong>{formatGhs(ghsToPesewas(form.highBidFlag))}</strong> will be flagged for admin review before the client sees them.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <DialogFooter className="pt-2">
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    getCategories()
      .then(data => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() { setEditing(null); setDialogOpen(true) }
  function openEdit(cat: Category) { setEditing(cat); setDialogOpen(true) }

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
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-gray-600">{activeCount} active</span>
        </div>
        <div className="bg-white rounded-lg px-3 py-1.5 shadow-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          <span className="text-gray-600">{categories.length - activeCount} inactive</span>
        </div>
        <div className="bg-white rounded-lg px-3 py-1.5 shadow-sm flex items-center gap-2">
          <span className="text-gray-600">{categories.filter(c => !c.parentId).length} top-level · {subCount} subcategories</span>
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
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Slug</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Min Bid</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">High-Bid Flag</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Order</TableHead>
              <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(6)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(7)].map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : displayList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-14 text-gray-400">
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
                          <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isChild ? 'bg-purple-50' : 'bg-orange-50'}`}>
                            <Tag className={`h-3.5 w-3.5 ${isChild ? 'text-purple-400' : 'text-orange-400'}`} />
                          </div>
                        )}
                        <span className={`text-sm ${isChild ? 'text-gray-600' : 'font-medium text-gray-900'}`}>
                          {cat.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        {cat.slug}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-gray-800">
                      {formatGhs(cat.minBidPesewas)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <span className="text-amber-600 font-medium">{formatGhs(cat.highBidFlagPesewas)}</span>
                    </TableCell>
                    <TableCell className="text-center text-sm text-gray-400">
                      {cat.sortOrder}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                        cat.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cat.isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        {cat.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <RoleGate permission="edit_categories">
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
            {loading ? '—' : `${displayList.length} of ${categories.length} categories`}
          </p>
        </div>
      </div>

      <CategoryDialog
        open={dialogOpen}
        category={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />
    </div>
    </PageGuard>
  )
}
