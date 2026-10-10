'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { listRegions, type Region } from '@/lib/api'
import { ADMIN_REGION_KEY, getAdminUser } from '@/lib/api-client'
import { Button } from '@/components/ui/button'

type AdminRegionScopeValue = {
  regions: Region[]
  activeRegionId: string | null
  activeRegion: Region | null
  canSelectRegion: boolean
  setActiveRegionId: (regionId: string) => void
}

const AdminRegionScopeContext = createContext<AdminRegionScopeValue | null>(null)

export function AdminRegionScopeProvider({ children }: { children: React.ReactNode }) {
  const [regions, setRegions] = useState<Region[]>([])
  const [activeRegionId, setActiveRegionIdState] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const admin = getAdminUser()
  const canSelectRegion = admin?.role === 'super_admin' || admin?.role === 'product_owner'

  const load = useCallback(() => {
    setReady(false)
    setError(false)
    if (!canSelectRegion) {
      // Regional staff are permanently pinned by the backend account scope.
      // Other global read-only roles retain their existing nationwide scope.
      setActiveRegionIdState(admin?.regionId ?? null)
      setRegions(admin?.regionId && admin.regionName
        ? [{
            id: admin.regionId,
            name: admin.regionName,
            code: '',
            ridesEnabled: true,
            jobsEnabled: true,
            serviceAreaName: null,
          }]
        : [])
      setReady(true)
      return
    }

    listRegions()
      .then(items => {
        const available = Array.isArray(items) ? items : []
        if (available.length === 0) throw new Error('No active regions')
        const stored = window.localStorage.getItem(ADMIN_REGION_KEY)
        const selected = available.some(region => region.id === stored)
          ? stored!
          : available[0].id
        window.localStorage.setItem(ADMIN_REGION_KEY, selected)
        setRegions(available)
        setActiveRegionIdState(selected)
        setReady(true)
      })
      .catch(() => {
        setError(true)
        setReady(true)
      })
  }, [admin?.regionId, admin?.regionName, canSelectRegion])

  useEffect(() => { load() }, [load])

  const setActiveRegionId = useCallback((regionId: string) => {
    if (!canSelectRegion || !regions.some(region => region.id === regionId)) return
    window.localStorage.setItem(ADMIN_REGION_KEY, regionId)
    setActiveRegionIdState(regionId)
    // Every mounted page and live feed must restart under exactly the same
    // scope. A reload is deliberate: it prevents a stale response from the
    // former region racing into the newly selected dashboard.
    window.location.reload()
  }, [canSelectRegion, regions])

  const value = useMemo<AdminRegionScopeValue>(() => ({
    regions,
    activeRegionId,
    activeRegion: regions.find(region => region.id === activeRegionId) ?? null,
    canSelectRegion,
    setActiveRegionId,
  }), [activeRegionId, canSelectRegion, regions, setActiveRegionId])

  if (!ready) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-500">Loading operational region...</div>
  }
  if (canSelectRegion && (error || !activeRegionId)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-gray-600">
        <p>The operational regions could not be loaded. Dashboard data remains hidden.</p>
        <Button variant="outline" onClick={load}>Try again</Button>
      </div>
    )
  }

  return (
    <AdminRegionScopeContext.Provider value={value}>
      {children}
    </AdminRegionScopeContext.Provider>
  )
}

export function useAdminRegionScope(): AdminRegionScopeValue {
  const value = useContext(AdminRegionScopeContext)
  if (!value) throw new Error('useAdminRegionScope must be used inside AdminRegionScopeProvider')
  return value
}
