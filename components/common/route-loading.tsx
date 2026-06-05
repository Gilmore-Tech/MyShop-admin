'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function RouteLoading() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function startLoading() {
    if (progressRef.current) clearInterval(progressRef.current)
    if (fallbackRef.current) clearTimeout(fallbackRef.current)

    setProgress(0)
    setVisible(true)

    let p = 0
    progressRef.current = setInterval(() => {
      p = Math.min(p + Math.random() * 14 + 6, 85)
      setProgress(p)
      if (p >= 85 && progressRef.current) clearInterval(progressRef.current)
    }, 150)

    // Safety fallback: auto-dismiss after 10s in case navigation is cancelled
    fallbackRef.current = setTimeout(() => finishLoading(), 10_000)
  }

  function finishLoading() {
    if (progressRef.current) clearInterval(progressRef.current)
    if (fallbackRef.current) clearTimeout(fallbackRef.current)
    setProgress(100)
    setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 250)
  }

  // Dismiss when navigation completes (pathname changed)
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    finishLoading()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show on click of any internal navigation link
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.getAttribute('href') ?? ''
      // Skip external links, hash links, same-page links, and download links
      if (
        !href ||
        href.startsWith('http') ||
        href.startsWith('//') ||
        href.startsWith('#') ||
        href === pathname ||
        anchor.hasAttribute('download') ||
        anchor.target === '_blank'
      ) return

      startLoading()
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null

  return (
    <>
      {/* Top progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-[2px] pointer-events-none">
        <div
          className="h-full"
          style={{
            width: `${progress}%`,
            backgroundColor: '#F5A623',
            boxShadow: '0 0 8px rgba(245,166,35,0.6)',
            transition: progress === 100 ? 'width 200ms ease-out' : 'width 150ms ease-out',
          }}
        />
      </div>

      {/* Circular spinner overlay */}
      <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
        <div
          className="flex flex-col items-center gap-3 rounded-2xl px-7 py-5"
          style={{
            backgroundColor: 'rgba(11,16,23,0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="relative w-9 h-9">
            <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(245,166,35,0.15)" strokeWidth="2.5" />
              <circle
                cx="18" cy="18" r="15"
                fill="none"
                stroke="#F5A623"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="94.2"
                strokeDashoffset={94.2 - (94.2 * Math.min(progress, 100)) / 100}
                style={{ transition: 'stroke-dashoffset 150ms ease-out' }}
              />
            </svg>
          </div>
          <p className="text-xs font-medium" style={{ color: '#4A6070' }}>Loading…</p>
        </div>
      </div>
    </>
  )
}
