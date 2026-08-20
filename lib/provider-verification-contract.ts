export type ProviderDocumentStatus =
  | 'uploaded'
  | 'pending_review'
  | 'confirmed'
  | 'coordinator_validated'
  | 'approved'
  | 'rejected'
  | 'superseded'
  | 'expired'

export type ProviderDocumentStatusKind =
  | 'incomplete'
  | 'pending'
  | 'progress'
  | 'approved'
  | 'rejected'
  | 'historical'
  | 'unknown'

export interface ProviderDocumentStatusPresentation {
  label: string
  kind: ProviderDocumentStatusKind
}

export function providerDocumentStatusPresentation(
  status: string | null | undefined,
): ProviderDocumentStatusPresentation {
  switch (status) {
    case 'uploaded':
      return { label: 'Upload not completed', kind: 'incomplete' }
    case 'pending_review':
      return { label: 'Awaiting Admin review', kind: 'pending' }
    case 'confirmed':
      return { label: 'Admin verified · awaiting Coordinator', kind: 'progress' }
    case 'coordinator_validated':
      return { label: 'Coordinator validated · awaiting RM', kind: 'progress' }
    case 'approved':
      return { label: 'Approved', kind: 'approved' }
    case 'rejected':
      return { label: 'Rejected · replacement required', kind: 'rejected' }
    case 'superseded':
      return { label: 'Superseded version', kind: 'historical' }
    case 'expired':
      return { label: 'Expired · replacement required', kind: 'rejected' }
    default:
      return {
        label: status ? `Unknown status: ${status}` : 'Status unavailable',
        kind: 'unknown',
      }
  }
}

export function canAdminReviewProviderDocument(status: string): boolean {
  return status === 'pending_review'
}

export type StageOneDocumentResolution =
  | 'ready'
  | 'needs_review'
  | 'waiting_for_provider'
  | 'upload_incomplete'
  | 'invalid'

export function stageOneDocumentResolution(
  status: string,
  localDecision?: 'approve' | 'reject',
): StageOneDocumentResolution {
  if (localDecision === 'approve') return 'ready'
  if (localDecision === 'reject') return 'waiting_for_provider'

  switch (status) {
    case 'approved':
    case 'confirmed':
    case 'coordinator_validated':
      return 'ready'
    case 'pending_review':
      return 'needs_review'
    case 'rejected':
    case 'expired':
      return 'waiting_for_provider'
    case 'uploaded':
      return 'upload_incomplete'
    default:
      return 'invalid'
  }
}

export interface RejectionCandidateDocument {
  id: string
  status: string
  isCurrent: boolean
}

export function isRmRejectionCandidate(document: RejectionCandidateDocument): boolean {
  return document.isCurrent && document.status === 'coordinator_validated'
}

export function validateRmRejectedDocumentIds(
  documents: readonly RejectionCandidateDocument[],
  selectedIds: readonly string[],
): string[] {
  const candidates = new Set(documents.filter(isRmRejectionCandidate).map(document => document.id))
  const unique = [...new Set(selectedIds)]
  if (unique.length === 0) {
    throw new Error('Select at least one current document that the provider must replace.')
  }
  if (unique.some(id => !candidates.has(id))) {
    throw new Error('A selected document is no longer eligible for rejection. Reload and try again.')
  }
  return unique
}
