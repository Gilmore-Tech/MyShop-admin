'use client'

import { useState } from 'react'
import { Download, ExternalLink, Loader2, AlertCircle } from 'lucide-react'

interface PdfViewerProps {
  url: string
  label?: string
  height?: number
}

function proxyUrl(original: string) {
  return `/api/pdf-proxy?url=${encodeURIComponent(original)}`
}

export function PdfViewer({ url, label, height = 480 }: PdfViewerProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const src = proxyUrl(url)

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await fetch(src)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = label ? `${label}.pdf` : 'document.pdf'
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch {
      window.open(url, '_blank')
    } finally {
      setDownloading(false)
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-100 bg-gray-50 py-10">
        <AlertCircle className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-400">Could not load PDF</p>
        <div className="flex items-center gap-3">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-500 hover:text-orange-700"
          >
            Open in tab <ExternalLink className="h-3 w-3" />
          </a>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Download <Download className="h-3 w-3" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-gray-100">
      <div className="relative bg-gray-100" style={{ height }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}
        <iframe
          src={src}
          title={label ?? 'Document'}
          className="w-full h-full border-none"
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true) }}
        />
      </div>

      <div className="flex items-center justify-between px-3 py-2 bg-white border-t border-gray-100">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
        >
          {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          Download
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          title="Open in new tab"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}
