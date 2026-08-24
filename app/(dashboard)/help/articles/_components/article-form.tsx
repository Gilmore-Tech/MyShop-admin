'use client'

import { useEffect, useState, type ComponentType } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Eye, EyeOff } from 'lucide-react'
import type { MDEditorProps } from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  createHelpArticle,
  updateHelpArticle,
  type HelpArticle,
  type HelpAudience,
  type HelpCategory,
} from '@/lib/api'
import { userSafeAdminError } from '@/lib/api-client'

// Disable SSR for the markdown editor - it touches `window` on mount.
// Cast preserves prop types that next/dynamic can otherwise drop.
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
  ssr: false,
  loading: () => <div className="h-96 bg-gray-50 rounded-lg animate-pulse" />,
}) as ComponentType<MDEditorProps>

const AUDIENCES: { value: HelpAudience; label: string; sub: string }[] = [
  { value: 'client',   label: 'Clients',   sub: 'App users who book' },
  { value: 'provider', label: 'Providers', sub: 'Drivers + artisans' },
  { value: 'both',     label: 'Both',      sub: 'All app users' },
]

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150)
}

interface ArticleFormProps {
  mode: 'create' | 'edit'
  article?: HelpArticle
  categories: HelpCategory[]
}

export function ArticleForm({ mode, article, categories }: ArticleFormProps) {
  const router = useRouter()
  const isEdit = mode === 'edit'

  const [slug, setSlug] = useState(article?.slug ?? '')
  const [title, setTitle] = useState(article?.title ?? '')
  const [summary, setSummary] = useState(article?.summary ?? '')
  const [body, setBody] = useState<string>(article?.bodyMarkdown ?? '')
  const [categoryId, setCategoryId] = useState(article?.categoryId ?? '')
  const [audience, setAudience] = useState<HelpAudience>(article?.audience ?? 'both')
  const [sortOrder, setSortOrder] = useState<string>(String(article?.sortOrder ?? 0))
  const [isPublished, setIsPublished] = useState<boolean>(article?.isPublished ?? true)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Auto-derive slug from title when creating, until the user manually edits the slug.
  const [slugTouched, setSlugTouched] = useState(false)
  useEffect(() => {
    if (!isEdit && !slugTouched) setSlug(slugify(title))
  }, [title, isEdit, slugTouched])

  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const parsedSort = Number(sortOrder)
    if (!title.trim()) return setError('Title is required.')
    if (!isEdit && !slug.trim()) return setError('Slug is required.')
    if (!categoryId) return setError('Category is required.')
    if (!body.trim()) return setError('Article body is required.')
    if (Number.isNaN(parsedSort) || parsedSort < 0) return setError('Sort order must be a non-negative number.')

    setSaving(true)
    try {
      if (isEdit && article) {
        await updateHelpArticle(article.id, {
          title: title.trim(),
          summary: summary.trim() || undefined,
          bodyMarkdown: body,
          categoryId,
          audience,
          sortOrder: parsedSort,
          isPublished,
        })
        router.push('/help/articles')
        router.refresh()
      } else {
        const created = await createHelpArticle({
          slug: slug.trim(),
          title: title.trim(),
          summary: summary.trim() || undefined,
          bodyMarkdown: body,
          categoryId,
          audience,
          sortOrder: parsedSort,
          isPublished,
        })
        router.push(`/help/articles/${encodeURIComponent(created.slug)}/edit`)
        router.refresh()
      }
    } catch (err) {
      setError(userSafeAdminError(err, 'Failed to save article.'))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-5 space-y-5">
        <h2 className="text-sm font-semibold text-gray-700">Article details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</Label>
            <Input
              placeholder="e.g. How to cancel a ride"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
            <p className="text-[11px] text-gray-400 text-right">{title.length}/200</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Slug</Label>
            <Input
              placeholder="how-to-cancel-a-ride"
              value={slug}
              onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true) }}
              disabled={isEdit}
              maxLength={150}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-gray-400">
              {isEdit ? 'Slug is immutable after publishing.' : 'Auto-generated from the title - edit if needed.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="bg-gray-50">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title} <span className="text-gray-400 text-xs">({c.slug})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCategory && (
              <p className="text-[11px] text-gray-400">
                Audience scope: <strong>{selectedCategory.audience}</strong>
              </p>
            )}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Summary</Label>
            <Textarea
              placeholder="One-line summary shown in the help list..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              maxLength={500}
              className="resize-none"
            />
            <p className="text-[11px] text-gray-400 text-right">{summary.length}/500</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Body</h2>
        <div data-color-mode="light">
          <MDEditor
            value={body}
            onChange={(v: string | undefined) => setBody(v ?? '')}
            height={480}
            preview="live"
            visibleDragbar={false}
          />
        </div>
        <p className="text-[11px] text-gray-400">
          Markdown is sanitised on save - HTML tags are stripped before mobile renders.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 space-y-5">
        <h2 className="text-sm font-semibold text-gray-700">Audience &amp; visibility</h2>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Audience</Label>
          <div className="grid grid-cols-3 gap-2">
            {AUDIENCES.map((a) => {
              const isActive = audience === a.value
              return (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAudience(a.value)}
                  className={`rounded-lg p-2.5 text-left transition-all ${
                    isActive ? 'bg-gray-100 text-gray-700 ring-1 ring-gray-200' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <p className="text-xs font-semibold">{a.label}</p>
                  <p className="text-[10px] opacity-70 mt-0.5">{a.sub}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sort order</Label>
            <Input
              type="number"
              min="0"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
            <p className="text-[11px] text-gray-400">Lower numbers appear first within the category.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Visibility</Label>
            <button
              type="button"
              onClick={() => setIsPublished((v) => !v)}
              className={`w-full flex items-center gap-2.5 rounded-lg p-3 text-left transition-all ${
                isPublished
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                  : 'bg-gray-50 text-gray-600 ring-1 ring-gray-100'
              }`}
            >
              {isPublished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              <div className="min-w-0">
                <p className="text-xs font-semibold">{isPublished ? 'Published' : 'Draft'}</p>
                <p className="text-[10px] opacity-70 mt-0.5">
                  {isPublished ? 'Visible to mobile users.' : 'Hidden until you publish.'}
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={saving}
          className="text-white gap-2"
          style={{ backgroundColor: '#F5A623' }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create article'}
        </Button>
      </div>
    </form>
  )
}
