'use client'

import { getDeployEnv } from '@/lib/api-client'

// Per-environment banner styling. PROD intentionally has no banner.
const BANNER_STYLES = {
  STAGING: { label: 'STAGING', bg: 'bg-red-600',     text: 'text-white',     sha: 'bg-red-700/60' },
  LOCAL:   { label: 'LOCAL',   bg: 'bg-indigo-600',  text: 'text-white',     sha: 'bg-indigo-700/60' },
} as const

export default function EnvBanner() {
  const env = getDeployEnv()

  // Production runs clean — no banner, no tag.
  if (env === 'PROD') return null

  const style = BANNER_STYLES[env]
  const sha = process.env.NEXT_PUBLIC_GIT_SHA ?? ''
  const message = process.env.NEXT_PUBLIC_GIT_MESSAGE ?? ''

  return (
    <div
      className={`shrink-0 w-full h-7 flex items-center justify-center gap-2 px-4 ${style.bg} ${style.text}`}
      role="status"
    >
      <span className="text-[10px] font-bold tracking-widest uppercase shrink-0">
        {style.label}
      </span>
      {message && (
        <span className="text-[11px] font-medium truncate max-w-[60vw] opacity-95">
          {message}
        </span>
      )}
      {sha && (
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${style.sha}`}>
          {sha}
        </span>
      )}
    </div>
  )
}
