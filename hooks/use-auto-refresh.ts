import { useEffect, useRef } from 'react'

/**
 * Background auto-refresh is disabled across the app — screens refresh on mount,
 * on user action, and via their manual Refresh buttons only. This flag is kept
 * (hardcoded) so the hook, the transactions feed poll, and the sidebar badge
 * counts all remain no-ops from a single source of truth.
 */
export const AUTO_REFRESH_DISABLED = true

/**
 * Calls `fn` on a fixed interval while the tab is visible. Pauses when the tab
 * is hidden and refires once on re-show so stale data refreshes immediately.
 *
 * @param fn   - stable callback (wrap in useCallback)
 * @param ms   - interval in milliseconds (default 30 000)
 */
export function useAutoRefresh(fn: () => void, ms = 30_000) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (AUTO_REFRESH_DISABLED) return
    let id: ReturnType<typeof setInterval> | null = null

    function start() {
      if (id != null) return
      id = setInterval(() => fnRef.current(), ms)
    }
    function stop() {
      if (id == null) return
      clearInterval(id)
      id = null
    }
    function handleVisibility() {
      if (document.hidden) {
        stop()
      } else {
        fnRef.current()
        start()
      }
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [ms])
}
