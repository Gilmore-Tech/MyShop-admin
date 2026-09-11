import { ApiError, userSafeApiErrorMessage } from './api-client.ts'

type RideCategoryErrorTarget = 'form' | 'slug'

export interface RideCategoryErrorPresentation {
  message: string
  target: RideCategoryErrorTarget
}

const FARE_FIELD_LABELS: Readonly<Record<string, string>> = {
  baseFarePesewas: 'base fare',
  perKmPesewas: 'per-kilometre rate',
  perMinPesewas: 'per-minute rate',
  minimumFarePesewas: 'minimum fare',
}

/**
 * Convert the ride-category API contract into actionable, dashboard-owned
 * copy. Backend prose is intentionally never rendered; only allow-listed
 * codes and detail fields influence the message. Support references stay on
 * the ApiError for diagnostics but are not shown in this form.
 */
export function presentRideCategorySaveError(
  error: unknown,
): RideCategoryErrorPresentation {
  if (!(error instanceof ApiError)) {
    return {
      message: 'The ride tier could not be saved. Try again.',
      target: 'form',
    }
  }

  if (error.code === 'SLUG_ALREADY_EXISTS') {
    return {
      message: 'That slug is already used by another ride tier. Choose a different slug.',
      target: 'slug',
    }
  }

  if (error.code === 'INVALID_SLUG') {
    return {
      message: 'Use lowercase letters and numbers separated by hyphens, for example "comfort-plus".',
      target: 'slug',
    }
  }

  if (error.code === 'INVALID_RIDE_CATEGORY_PRICING') {
    const field = typeof error.details?.field === 'string'
      ? FARE_FIELD_LABELS[error.details.field]
      : undefined
    const message = field
      ? `Comfort's ${field} must be equal to or higher than Regular's ${field}. If you are increasing Regular, update Comfort first.`
      : 'Every Comfort fare must be equal to or higher than the corresponding Regular fare. If you are increasing Regular, update Comfort first.'

    return {
      message,
      target: 'form',
    }
  }

  if (error.code === 'INVALID_RIDE_CATEGORY_RATE') {
    const field = typeof error.details?.field === 'string'
      ? FARE_FIELD_LABELS[error.details.field]
      : undefined
    const message = field
      ? `Enter a valid non-negative amount for the ${field}.`
      : 'Enter valid non-negative amounts for every fare field.'

    return {
      message,
      target: 'form',
    }
  }

  if (error.code === 'RIDE_CATEGORY_NOT_FOUND') {
    return {
      message: 'This ride tier no longer exists. Reload the page and try again.',
      target: 'form',
    }
  }

  if (error.code === 'VALIDATION_ERROR' || error.code === 'HTTP_400') {
    return {
      message: 'Review the tier details. Fare amounts must be valid non-negative amounts, and capacity must be between 1 and 20.',
      target: 'form',
    }
  }

  return {
    message: userSafeApiErrorMessage(error.status, error.code),
    target: 'form',
  }
}
