'use client'

import type { Region } from '@/lib/api'

type Props = {
  regions: Region[]
  assignedRegions?: Pick<Region, 'id' | 'name'>[]
  value: string[]
  onChange: (ids: string[]) => void
}

export function RegionAssignments({ regions, assignedRegions = [], value, onChange }: Props) {
  const inactive = value.filter(id => !regions.some(region => region.id === id)).map(id => ({
    id,
    name: `${assignedRegions.find(region => region.id === id)?.name ?? 'Unavailable region'} (inactive)`,
  }))
  const options = [...regions, ...inactive]

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Assigned regions</legend>
      <p className="text-xs text-gray-500">Select one or more regions. Uncheck a region to remove access, then save changes.</p>
      <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 p-3 space-y-2">
        {options.map(region => (
          <label key={region.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.includes(region.id)}
              onChange={event => onChange(event.target.checked
                ? [...value, region.id]
                : value.filter(id => id !== region.id))}
            />
            {region.name}
          </label>
        ))}
        {options.length === 0 && <p className="text-sm text-gray-500">No active regions available. Reload to try again.</p>}
      </div>
      <p className="text-xs text-gray-500">{value.length} selected. Regional accounts require at least one region.</p>
    </fieldset>
  )
}
