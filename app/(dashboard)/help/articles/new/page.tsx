'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { PageGuard } from '@/components/common/page-guard'
import { PageHeader } from '@/components/common/page-header'
import { getHelpCategories, type HelpCategory } from '@/lib/api'
import { ArticleForm } from '../_components/article-form'

export default function NewHelpArticlePage() {
  const [categories, setCategories] = useState<HelpCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getHelpCategories()
      .then((cats) => { if (!cancelled) setCategories(cats) })
      .catch((err: Error) => { if (!cancelled) setError(err.message ?? 'Failed to load categories.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

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
          title="New Help Article"
          subtitle="Create a help center article. Save as a draft, or publish to go live immediately."
        />

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading categories…
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
        ) : categories.length === 0 ? (
          <div className="bg-amber-50 text-amber-800 text-sm rounded-lg px-4 py-3">
            No help categories exist yet. The migration seeds 8 starter categories — make sure
            the database is migrated and seeded before authoring articles.
          </div>
        ) : (
          <ArticleForm mode="create" categories={categories} />
        )}
      </div>
    </PageGuard>
  )
}
