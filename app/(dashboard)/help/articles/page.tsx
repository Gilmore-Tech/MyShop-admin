'use client'

import { useCallback, useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, BookOpen, CheckCircle, EyeOff,
} from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { RoleGate } from '@/components/common/role-gate'
import { PageHeader } from '@/components/common/page-header'
import { FilterBar, FilterSearch } from '@/components/common/filter-bar'
import { DataTable, type DataTableColumn } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/empty-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  getHelpArticles, getHelpCategories, deleteHelpArticle,
  type HelpArticleSummary, type HelpCategory, type HelpAudience,
} from '@/lib/api'
import { safeAdminErrorDiagnostic, userSafeAdminError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format-date'

const AUDIENCE_LABEL: Record<HelpAudience, string> = {
  client:   'Clients',
  provider: 'Providers',
  both:     'Both',
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

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const labelled = <T,>(label: string, p: Promise<T>) =>
      p.catch((err: unknown) => {
        console.error(`[help] ${label} failed`, safeAdminErrorDiagnostic(err))
        throw err
      })
    try {
      const [arts, cats] = await Promise.all([
        labelled('articles', getHelpArticles()),
        labelled('categories', getHelpCategories()),
      ])
      setArticles(arts)
      setCategories(cats)
    } catch (err) {
      setLoadError(userSafeAdminError(err, 'Failed to load help center data.'))
      setArticles([])
      setCategories([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

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
      setDeleteError(userSafeAdminError(err, 'Failed to delete article.'))
    } finally {
      setDeleting(false)
    }
  }

  const columns: DataTableColumn<HelpArticleSummary>[] = [
    {
      key: 'article', header: 'Article',
      render: a => (
        <>
          <p className="text-sm font-medium text-gray-800">{a.title}</p>
          <p className="text-[11px] font-mono text-gray-400 mt-0.5">{a.slug}</p>
        </>
      ),
    },
    {
      key: 'category', header: 'Category',
      render: a => <span className="text-xs text-gray-600">{categoryById.get(a.categoryId)?.title ?? a.categorySlug}</span>,
    },
    {
      key: 'audience', header: 'Audience',
      render: a => (
        <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">
          {AUDIENCE_LABEL[a.audience]}
        </span>
      ),
    },
    {
      key: 'status', header: 'Status',
      render: a => a.isPublished ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
          <CheckCircle className="h-3 w-3" /> Published
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[11px] text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
          <EyeOff className="h-3 w-3" /> Draft
        </span>
      ),
    },
    {
      key: 'updated', header: 'Updated',
      render: a => <span className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(a.updatedAt)}</span>,
    },
    {
      key: 'actions', header: '', align: 'right',
      render: a => (
        <div className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
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
      ),
    },
  ]

  return (
    <PageGuard permission="view_help_articles">
      <div>
        <PageHeader
          title="Help center"
          subtitle="Articles shown in the client and provider apps"
          actions={
            <RoleGate permission="edit_help_articles">
              <Button variant="brand" className="gap-1.5" onClick={() => router.push('/help/articles/new')}>
                <Plus className="h-4 w-4" /> New article
              </Button>
            </RoleGate>
          }
        />

        <FilterBar onRefresh={() => void load()} refreshing={loading}>
          <FilterSearch value={search} onChange={setSearch} placeholder="Title or slug..." />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.slug}>{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={audienceFilter} onValueChange={(v) => setAudienceFilter(v as HelpAudience | 'all')}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All audiences</SelectItem>
              <SelectItem value="client">Clients</SelectItem>
              <SelectItem value="provider">Providers</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'published' | 'draft')}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </FilterBar>

        <DataTable<HelpArticleSummary>
          columns={columns}
          rows={filtered}
          rowKey={a => a.id}
          loading={loading}
          skeletonRows={5}
          error={loadError}
          onRetry={() => void load()}
          rowHref={a => `/help/articles/${encodeURIComponent(a.slug)}/edit`}
          rowAriaLabel={a => `Edit ${a.title}`}
          empty={<EmptyState icon={BookOpen} title="No articles match the current filters" />}
        />

        <ConfirmDialog
          open={!!pendingDelete}
          onClose={() => setPendingDelete(null)}
          title={pendingDelete ? `Delete "${pendingDelete.title}"?` : 'Delete this article?'}
          description="It disappears from the help center immediately. Mobile clients see the change on their next refresh."
          confirmLabel="Delete article"
          destructive
          loading={deleting}
          error={deleteError || null}
          onConfirm={() => handleDelete()}
        />
      </div>
    </PageGuard>
  )
}
