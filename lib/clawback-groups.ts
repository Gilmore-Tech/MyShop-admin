import type { AdminClawback } from './api'

export interface ProviderClawbackGroup {
  providerId: string
  providerName: string | null
  providerType: string | null
  providerPhone: string | null
  clawbacks: AdminClawback[]
  amountPesewas: number
  paidAmountPesewas: number
  outstandingPesewas: number
  sources: string[]
  disputeIds: string[]
  /** Oldest debt in the group. */
  initiatedAt: string
  /** Most recently recorded debt in the group — what the list sorts on. */
  latestInitiatedAt: string
  daysOutstanding: number
  status: string
}

function newestFirst(a: AdminClawback, b: AdminClawback) {
  return (b.initiatedAt || '').localeCompare(a.initiatedAt || '')
}

/**
 * Combines the API's individual debt records into one operational row per provider,
 * newest debt first so today's records lead the list.
 */
export function groupClawbacksByProvider(clawbacks: AdminClawback[]): ProviderClawbackGroup[] {
  const groups = new Map<string, ProviderClawbackGroup>()

  for (const clawback of clawbacks) {
    // A missing provider ID must not accidentally merge unrelated malformed records.
    const key = clawback.providerId || `clawback:${clawback.id}`
    const existing = groups.get(key)

    if (!existing) {
      groups.set(key, {
        providerId: clawback.providerId,
        providerName: clawback.providerName,
        providerType: clawback.providerType,
        providerPhone: clawback.providerPhone,
        clawbacks: [clawback],
        amountPesewas: clawback.amountPesewas,
        paidAmountPesewas: clawback.paidAmountPesewas,
        outstandingPesewas: clawback.outstandingPesewas,
        sources: clawback.source ? [clawback.source] : [],
        disputeIds: clawback.originalDisputeId ? [clawback.originalDisputeId] : [],
        initiatedAt: clawback.initiatedAt,
        latestInitiatedAt: clawback.initiatedAt,
        daysOutstanding: clawback.daysOutstanding,
        status: clawback.status,
      })
      continue
    }

    existing.clawbacks.push(clawback)
    if (!existing.providerType && clawback.providerType) existing.providerType = clawback.providerType
    existing.amountPesewas += clawback.amountPesewas
    existing.paidAmountPesewas += clawback.paidAmountPesewas
    existing.outstandingPesewas += clawback.outstandingPesewas
    existing.daysOutstanding = Math.max(existing.daysOutstanding, clawback.daysOutstanding)

    if (clawback.source && !existing.sources.includes(clawback.source)) existing.sources.push(clawback.source)
    if (clawback.originalDisputeId && !existing.disputeIds.includes(clawback.originalDisputeId)) {
      existing.disputeIds.push(clawback.originalDisputeId)
    }
    if (clawback.initiatedAt && (!existing.initiatedAt || clawback.initiatedAt < existing.initiatedAt)) {
      existing.initiatedAt = clawback.initiatedAt
    }
    if (clawback.initiatedAt > existing.latestInitiatedAt) {
      existing.latestInitiatedAt = clawback.initiatedAt
    }
    if (clawback.status !== existing.status) existing.status = 'mixed'
  }

  const ordered = [...groups.values()]
  for (const group of ordered) group.clawbacks.sort(newestFirst)
  return ordered.sort((a, b) => b.latestInitiatedAt.localeCompare(a.latestInitiatedAt))
}
