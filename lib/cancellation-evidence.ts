type CancellationActorInput = {
  booking: 'ride' | 'job'
  cancelledBy: string | null | undefined
  clientName?: string | null
  providerName?: string | null
}

const LEGACY_REASON_LABELS: Record<string, string> = {
  rider_cancelled:
    'Rider cancelled without selecting a detailed reason (recorded by an older app version).',
  client_cancelled:
    'Client cancelled without selecting a detailed reason (recorded by an older app version).',
  rider_cancelled_during_search: 'Rider cancelled while searching for a driver.',
  client_matching_timeout_recovery:
    'The driver search timed out and the app cancelled the stale request.',
  driver_cancelled:
    'Driver cancelled without selecting a detailed reason (recorded by an older app version).',
  artisan_cancelled:
    'Artisan cancelled without selecting a detailed reason (recorded by an older app version).',
  no_drivers_available: 'No eligible drivers were available.',
  initialization_timeout: 'The request could not finish starting before the safety timeout.',
  cancelled_by_rider: 'Rider cancelled the request.',
  cancelled_by_client: 'Client cancelled the request.',
}

function withName(role: string, name: string | null | undefined): string {
  const cleanName = name?.trim()
  return cleanName ? `${role} - ${cleanName}` : role
}

export function cancellationActorLabel({
  booking,
  cancelledBy,
  clientName,
  providerName,
}: CancellationActorInput): string {
  switch (cancelledBy?.trim().toLowerCase()) {
    case 'client':
    case 'rider':
      return withName(booking === 'ride' ? 'Rider' : 'Client', clientName)
    case 'driver':
      return withName('Driver', providerName)
    case 'artisan':
    case 'provider':
      return withName('Artisan', providerName)
    case 'admin':
      return 'Administrator'
    case 'system':
      return 'System automation'
    default:
      return 'Not recorded'
  }
}

export function cancellationReasonLabel(reason: string | null | undefined): string {
  const cleanReason = reason?.trim()
  if (!cleanReason) return 'No reason was recorded.'
  return LEGACY_REASON_LABELS[cleanReason.toLowerCase()] ?? cleanReason.replaceAll('_', ' ')
}
