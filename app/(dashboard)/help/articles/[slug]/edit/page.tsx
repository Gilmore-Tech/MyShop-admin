'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import {
  getHelpArticle, getHelpCategories,
  type HelpArticle, type HelpCategory,
} from '@/lib/api'
import { ArticleForm } from '../../_components/article-form'
import { userSafeAdminError } from '@/lib/api-client'

export default function EditHelpArticlePage() {
  const params = useParams<{ slug: string }>()
  const slug = decodeURIComponent(params.slug)

  const [article, setArticle] = useState<HelpArticle | null>(null)
  const [categories, setCategories] = useState<HelpCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([getHelpArticle(slug), getHelpCategories()])
      .then(([art, cats]) => {
        if (!cancelled) {
          setArticle(art)
          setCategories(cats)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(userSafeAdminError(err, 'Failed to load article.'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug])

  return (
    <PageGuard permission="edit_help_articles">
      <div>
        <Link
          href="/help/articles"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-2"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> All articles
        </Link>
        <PageHeader
          title={article ? `Edit: ${article.title}` : 'Edit Help Article'}
          subtitle={article ? `Slug: ${article.slug}` : 'Loading…'}
        />

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading article…
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
        ) : article ? (
          <ArticleForm mode="edit" article={article} categories={categories} />
        ) : null}
      </div>
    </PageGuard>
  )
}
