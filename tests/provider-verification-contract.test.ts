import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  canAdminReviewProviderDocument,
  isRmRejectionCandidate,
  providerDocumentStatusPresentation,
  stageOneDocumentResolution,
  validateRmRejectedDocumentIds,
} from '../lib/provider-verification-contract.ts'

test('provider document badges describe every pipeline state truthfully', () => {
  assert.deepEqual(providerDocumentStatusPresentation('uploaded'), {
    label: 'Upload not completed',
    kind: 'incomplete',
  })
  assert.equal(providerDocumentStatusPresentation('pending_review').label, 'Awaiting Admin review')
  assert.equal(
    providerDocumentStatusPresentation('confirmed').label,
    'Admin verified · awaiting Coordinator',
  )
  assert.equal(
    providerDocumentStatusPresentation('coordinator_validated').label,
    'Coordinator validated - awaiting Regional Manager',
  )
  assert.equal(providerDocumentStatusPresentation('approved').label, 'Approved')
  assert.equal(
    providerDocumentStatusPresentation('rejected').label,
    'Rejected · replacement required',
  )
  assert.equal(providerDocumentStatusPresentation('superseded').label, 'Superseded version')
  assert.equal(
    providerDocumentStatusPresentation('expired').label,
    'Expired · replacement required',
  )

  const unknown = providerDocumentStatusPresentation('future_backend_state')
  assert.equal(unknown.kind, 'unknown')
  assert.equal(unknown.label, 'Unknown status: future_backend_state')
  assert.notEqual(unknown.label, 'Awaiting Upload')
})

test('Stage 1 only reviews pending documents while preserving valid earlier decisions', () => {
  const statuses = [
    'uploaded',
    'pending_review',
    'confirmed',
    'coordinator_validated',
    'approved',
    'rejected',
    'superseded',
    'expired',
  ]
  assert.deepEqual(statuses.filter(canAdminReviewProviderDocument), ['pending_review'])

  assert.equal(stageOneDocumentResolution('pending_review'), 'needs_review')
  assert.equal(stageOneDocumentResolution('pending_review', 'approve'), 'ready')
  assert.equal(stageOneDocumentResolution('pending_review', 'reject'), 'waiting_for_provider')
  assert.equal(stageOneDocumentResolution('rejected'), 'waiting_for_provider')
  assert.equal(stageOneDocumentResolution('expired'), 'waiting_for_provider')
  assert.equal(stageOneDocumentResolution('confirmed'), 'ready')
  assert.equal(stageOneDocumentResolution('coordinator_validated'), 'ready')
  assert.equal(stageOneDocumentResolution('uploaded'), 'upload_incomplete')
  assert.equal(stageOneDocumentResolution('superseded'), 'invalid')
})

test('RM rejection accepts one or more exact current Coordinator-validated documents', () => {
  const documents = [
    { id: 'current-id', status: 'coordinator_validated', isCurrent: true },
    { id: 'old-id', status: 'coordinator_validated', isCurrent: false },
    { id: 'confirmed-id', status: 'confirmed', isCurrent: true },
  ]

  assert.equal(isRmRejectionCandidate(documents[0]), true)
  assert.equal(isRmRejectionCandidate(documents[1]), false)
  assert.equal(isRmRejectionCandidate(documents[2]), false)
  assert.deepEqual(validateRmRejectedDocumentIds(documents, ['current-id']), ['current-id'])
  assert.deepEqual(
    validateRmRejectedDocumentIds(documents, ['current-id', 'current-id']),
    ['current-id'],
  )
  assert.throws(
    () => validateRmRejectedDocumentIds(documents, []),
    /Select at least one current document/,
  )
  assert.throws(
    () => validateRmRejectedDocumentIds(documents, ['old-id']),
    /no longer eligible/,
  )
  assert.throws(
    () => validateRmRejectedDocumentIds(documents, ['confirmed-id']),
    /no longer eligible/,
  )
})

test('verification UI and API preserve the exact-document rejection contract', () => {
  const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
  const queue = readFileSync(
    new URL('../app/(dashboard)/verifications/page.tsx', import.meta.url),
    'utf8',
  )
  const profile = readFileSync(
    new URL('../components/users/user-profile-sheet.tsx', import.meta.url),
    'utf8',
  )

  assert.match(api, /rejectedDocumentIds\?: readonly string\[\]/)
  assert.match(api, /action === 'reject' \? \{ rejectedDocumentIds:/)
  assert.match(api, /verificationStage: \(raw\.verificationStage \?\? raw\.verification_stage/)
  assert.match(api, /rejectionReason: raw\.rejectionReason \?\? raw\.rejection_reason \?\? null/)

  assert.match(queue, /requireRejectedDocuments=\{action === 'rm'\}/)
  assert.match(queue, /validateRmRejectedDocumentIds\(/)
  assert.match(queue, /<Checkbox/)
  assert.match(queue, /Only the selected documents will be marked rejected/)
  assert.match(queue, /Admin review is already saved/)
  assert.match(queue, /remains ready while the provider replaces only the rejected documents/)
  assert.doesNotMatch(queue, /awaitingReset/)

  assert.match(profile, /providerDocumentStatusPresentation\(status\)/)
  assert.match(profile, /href="\/verifications"/)
  assert.match(profile, /driver\.rejectionReason/)
  assert.match(profile, /artisan\.rejectionReason/)
  assert.doesNotMatch(profile, /finalizeVerification/)
  assert.doesNotMatch(profile, /VerifyProviderDialog/)
  assert.doesNotMatch(profile, /openVerify/)
})
