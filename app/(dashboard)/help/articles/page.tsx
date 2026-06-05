'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Loader2, Search, BookOpen, CheckCircle, EyeOff, AlertTriangle,
} from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import {
  getHelpArticles, getHelpCategories, deleteHelpArticle,
  type HelpArticleSummary, type HelpCategory, type HelpAudience,
} from '@/lib/api'

const AUDIENCE_LABEL: Record<HelpAudience, string> = {
  client:   'Clients',
  provider: 'Providers',
  both:     'Both',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function HelpArticlesPage() {
  const router = useRouter()

  const [articles, setArticles] = useState<HelpArticleSummary[]>([])
  const [categories, setCategories] = useState<HelpCategory[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [audienceFilter, setAudienceFilter] = useState<HelpAudience | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all')

  const [pendingDelete, setPendingDelete] = useState<HelpArticleSummary | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      const labelled = <T,>(label: string, p: Promise<T>) =>
        p.catch((err: unknown) => {
          const e = err as { status?: number; code?: string; message?: string }
          console.error(`[help] ${label} failed`, { status: e?.status, code: e?.code, message: e?.message, error: err })
          throw err
        })
      try {
        const [arts, cats] = await Promise.all([
          labelled('articles', getHelpArticles()),
          labelled('categories', getHelpCategories()),
        ])
        if (!cancelled) {
          setArticles(arts)
          setCategories(cats)
        }
      } catch (err) {
        if (!cancelled) {
          const e = err as { status?: number; code?: string; message?: string }
          const status = e?.status ? `${e.status} ` : ''
          setLoadError(`${status}${e?.message ?? 'Failed to load help center data.'}`)
          setArticles([])
          setCategories([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return articles.filter((a) => {
      if (categoryFilter !== 'all' && a.categorySlug !== categoryFilter) return false
      if (audienceFilter !== 'all' && a.audience !== audienceFilter) return false
      if (statusFilter === 'published' && !a.isPublished) return false
      if (statusFilter === 'draft' && a.isPublished) return false
      if (q && !a.title.toLowerCase().includes(q) && !a.slug.includes(q)) return false
      return true
    })
  }, [articles, search, categoryFilter, audienceFilter, statusFilter])

  async function handleDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteHelpArticle(pendingDelete.id)
      setArticles((prev) => prev.filter((a) => a.id !== pendingDelete.id))
      setPendingDelete(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete article.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageGuard permission="view_help_articles">
      <div>
        <PageHeader
          title="Help Articles"
          subtitle="Authoring surface for in-app help content. Changes are live on next mobile refresh."
        />

        {/* ── Toolbar ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Search</label>
              <div className="relative mt-1">
                <Search className="h-3.5 w-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="Title or slug…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="md:col-span-3">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Category</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="mt-1 bg-gray-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.slug}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Audience</label>
              <Select value={audienceFilter} onValueChange={(v) => setAudienceFilter(v as HelpAudience | 'all')}>
                <SelectTrigger className="mt-1 bg-gray-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="client">Clients</SelectItem>
                  <SelectItem value="provider">Providers</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Status</label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'published' | 'draft')}>
                <SelectTrigger className="mt-1 bg-gray-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-1 flex justify-end">
              <RoleGate permission="edit_help_articles">
                <Button
                  onClick={() => router.push('/help/articles/new')}
                  className="text-white gap-1.5 w-full md:w-auto"
                  style={{ backgroundColor: '#F5A623' }}
                >
                  <Plus className="h-4 w-4" /> New
                </Button>
              </RoleGate>
            </div>
          </div>
        </div>

        {/* ── Load error ─────────────────────────────────────────── */}
        {loadError && (
          <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">Help center data didn&apos;t load</p>
              <p className="text-xs text-red-600 mt-0.5">{loadError}</p>
              <p className="text-[11px] text-red-500/80 mt-1">
                If this persists, the backend endpoints under <code className="font-mono bg-red-100/60 px-1 rounded">/admin/support/help</code> may not be deployed yet. Check the browser console for details.
              </p>
            </div>
          </div>
        )}

        {/* ── Table ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Article</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Audience</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Updated</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(6)].map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-gray-400">
                    <BookOpen className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No articles match the current filters.</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((a) => (
                  <TableRow key={a.id} className="hover:bg-gray-50">
                    <TableCell>
                      <Link
                        href={`/help/articles/${encodeURIComponent(a.slug)}/edit`}
                        className="block"
                      >
                        <p className="text-sm font-medium text-gray-800">{a.title}</p>
                        <p className="text-[11px] font-mono text-gray-400 mt-0.5">{a.slug}</p>
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-gray-600">
                      {categoryById.get(a.categoryId)?.title ?? a.categorySlug}
                    </TableCell>
                    <TableCell>
                      <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {AUDIENCE_LABEL[a.audience]}
                      </span>
                    </TableCell>
                    <TableCell>
                      {a.isPublished ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <CheckCircle className="h-3 w-3" /> Published
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                          <EyeOff className="h-3 w-3" /> Draft
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">{formatDate(a.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <RoleGate permission="edit_help_articles">
                          <Link href={`/help/articles/${encodeURIComponent(a.slug)}/edit`}>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-gray-600 hover:text-gray-900">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </RoleGate>
                        <RoleGate permission="delete_help_articles">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setPendingDelete(a); setDeleteError('') }}
                            className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </RoleGate>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* ── Delete confirm ──────────────────────────────────────── */}
        <Dialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null) }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Delete article?
              </DialogTitle>
              <DialogDescription>
                {pendingDelete && (
                  <>
                    This will remove <strong>{pendingDelete.title}</strong> from the help center immediately.
                    Mobile clients will see it disappear on their next refresh.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            {deleteError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{deleteError}</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>Cancel</Button>
              <Button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? 'Deleting…' : 'Delete article'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageGuard>
  )
}
