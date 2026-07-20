import type { VehicleInput } from './vehicle-api'

export function legacyVehicleCreateValidationError(
  draft: VehicleInput,
  targetVehicleId: string | null,
  maxVehicleYear: number,
): string | null {
  // Binding retained evidence to an explicitly selected vehicle must not be
  // blocked by create-only fields. Those controls are deliberately disabled
  // because document binding cannot mutate existing vehicle/category authority.
  if (targetVehicleId) return null

  const normalizedPlate = draft.plate.trim().toUpperCase()
  if (
    !draft.make.trim()
    || !draft.model.trim()
    || !draft.color.trim()
    || normalizedPlate.length < 2
    || normalizedPlate.length > 32
    || !normalizedPlate.replace(/[^A-Z0-9]/g, '')
    || !Number.isInteger(draft.year)
    || draft.year < 1
    || draft.year > maxVehicleYear
    || draft.rideCategoryIds.length === 0
  ) {
    return `Complete every vehicle field, use a year from 1 to ${maxVehicleYear}, and select at least one category.`
  }

  return null
}
