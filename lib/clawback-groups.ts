import type { AdminClawback } from './api'

export interface ProviderClawbackGroup {
  providerId: string
  providerName: string | null
  providerPhone: string | null
  clawbacks: AdminClawback[]
  amountPesewas: number
  paidAmountPesewas: number
  outstandingPesewas: number
  sources: string[]
  disputeIds: string[]
  initiatedAt: string
  daysOutstanding: number
  status: string
}

/** Combines the API's individual debt records into one operational row per provider. */
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
        providerPhone: clawback.providerPhone,
        clawbacks: [clawback],
        amountPesewas: clawback.amountPesewas,
        paidAmountPesewas: clawback.paidAmountPesewas,
        outstandingPesewas: clawback.outstandingPesewas,
        sources: clawback.source ? [clawback.source] : [],
        disputeIds: clawback.originalDisputeId ? [clawback.originalDisputeId] : [],
        initiatedAt: clawback.initiatedAt,
        daysOutstanding: clawback.daysOutstanding,
        status: clawback.status,
      })
      continue
    }

    existing.clawbacks.push(clawback)
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
    if (clawback.status !== existing.status) existing.status = 'mixed'
  }

  return [...groups.values()]
}
