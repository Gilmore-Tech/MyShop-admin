import assert from 'node:assert/strict'
import test from 'node:test'

import {
  analyzeAnnouncementSmsEncoding,
  announcementSmsLength,
  announcementStatusPresentation,
  normaliseAnnouncementHistory,
  normaliseAnnouncementPreview,
  shouldClearAnnouncementPreview,
  type AnnouncementDraft,
} from '../lib/announcement-campaign-contract.ts'

const smsDraft: AnnouncementDraft = {
  title: 'Service update',
  body: 'Drivers should expect a brief delay.',
  targetAudience: 'drivers',
  classification: 'service',
  channel: 'sms',
  destination: 'notifications',
  reason: 'Operational notice',
}

function previewFor(draft: AnnouncementDraft) {
  const sms = announcementSmsLength(draft.body)
  return {
    campaignId: 'campaign-1',
    previewToken: 'preview-token-1',
    previewExpiresAt: '2026-08-30T18:00:00.000Z',
    revision: 1,
    counts: {
      eligibleRecipients: 4,
      activePushRecipients: 3,
      noActiveToken: 1,
      smsRecipients: 3,
      smsNoValidPhone: 1,
      byRole: { drivers: 4 },
      byPlatform: { android: 2, ios: 1 },
    },
    rendered: {
      title: draft.title,
      body: draft.body,
      targetAudience: draft.targetAudience,
      classification: draft.classification,
      channel: draft.channel,
      destination: draft.destination,
      ...(draft.channel === 'push'
        ? {}
        : {
            smsBody: sms.smsBody,
            smsEncoding: sms.encoding,
            smsUnits: sms.units,
            smsUnitLimit: sms.unitLimit,
          }),
    },
  }
}

function historyItem() {
  return {
    id: 'campaign-1',
    title: 'Service update',
    body: 'Drivers should expect a brief delay.',
    targetAudience: 'drivers',
    classification: 'service',
    channel: 'sms_push',
    destination: 'notifications',
    status: 'partially_failed',
    recipientCount: 4,
    activePushCount: 3,
    noActiveTokenCount: 1,
    acceptedCount: 2,
    failedCount: 1,
    openedCount: 0,
    smsEligibleCount: 3,
    smsNoValidPhoneCount: 1,
    smsAcceptedCount: 1,
    smsFailedCount: 1,
    smsUnknownCount: 1,
    queuedAt: '2026-08-30T17:00:00.000Z',
    reason: 'Operational notice',
  }
}

test('prefixed SMS validation enforces the exact GSM-7 single-segment boundary', () => {
  const atLimit = announcementSmsLength('a'.repeat(152))
  assert.equal(atLimit.encoding, 'gsm7')
  assert.equal(atLimit.units, 160)
  assert.equal(atLimit.unitsLeft, 0)
  assert.equal(atLimit.segments, 1)
  assert.equal(atLimit.tooLong, false)
  assert.equal(atLimit.smsBody.startsWith('MyShop: '), true)

  const overLimit = announcementSmsLength('a'.repeat(153))
  assert.equal(overLimit.units, 161)
  assert.equal(overLimit.segments, 2)
  assert.equal(overLimit.tooLong, true)
})

test('GSM-7 analysis counts basic and extension characters in septets', () => {
  assert.deepEqual(analyzeAnnouncementSmsEncoding('a'.repeat(160)), {
    encoding: 'gsm7',
    units: 160,
    unitLimit: 160,
    segments: 1,
  })
  assert.deepEqual(analyzeAnnouncementSmsEncoding('a'.repeat(161)), {
    encoding: 'gsm7',
    units: 161,
    unitLimit: 160,
    segments: 2,
  })
  assert.deepEqual(analyzeAnnouncementSmsEncoding('^'), {
    encoding: 'gsm7',
    units: 2,
    unitLimit: 160,
    segments: 1,
  })
})

test('UCS-2 analysis uses UTF-16 code units for Unicode and emoji', () => {
  assert.deepEqual(analyzeAnnouncementSmsEncoding('漢'.repeat(70)), {
    encoding: 'ucs2',
    units: 70,
    unitLimit: 70,
    segments: 1,
  })
  assert.equal(analyzeAnnouncementSmsEncoding('漢'.repeat(71)).segments, 2)
  assert.deepEqual(analyzeAnnouncementSmsEncoding('🙂'.repeat(35)), {
    encoding: 'ucs2',
    units: 70,
    unitLimit: 70,
    segments: 1,
  })
  const emojiOverLimit = analyzeAnnouncementSmsEncoding('🙂'.repeat(36))
  assert.equal(emojiOverLimit.units, 72)
  assert.equal(emojiOverLimit.segments, 2)
})

test('SMS previews require the exact non-empty server-rendered SMS body', () => {
  const valid = normaliseAnnouncementPreview(previewFor(smsDraft), smsDraft)
  assert.equal(valid.rendered.channel, 'sms')
  assert.equal(valid.rendered.smsBody, `MyShop: ${smsDraft.body}`)
  assert.equal(valid.rendered.smsEncoding, 'gsm7')
  assert.equal(valid.rendered.smsUnits, valid.rendered.smsBody.length)
  assert.equal(valid.rendered.smsUnitLimit, 160)

  const missing = previewFor(smsDraft)
  delete (missing.rendered as { smsBody?: string }).smsBody
  assert.throws(
    () => normaliseAnnouncementPreview(missing, smsDraft),
    (error: unknown) => error instanceof Error && error.name === 'AnnouncementContractError',
  )

  const changed = previewFor(smsDraft)
  ;(changed.rendered as { smsBody?: string }).smsBody = 'MyShop: different text'
  assert.throws(() => normaliseAnnouncementPreview(changed, smsDraft))
})

test('SMS previews fail closed on missing or mismatched encoding metadata', () => {
  for (const field of ['smsEncoding', 'smsUnits', 'smsUnitLimit'] as const) {
    const missing = previewFor(smsDraft)
    delete (missing.rendered as Record<string, unknown>)[field]
    assert.throws(
      () => normaliseAnnouncementPreview(missing, smsDraft),
      (error: unknown) => error instanceof Error && error.name === 'AnnouncementContractError',
      field,
    )
  }

  const wrongUnits = previewFor(smsDraft)
  ;(wrongUnits.rendered as Record<string, unknown>).smsUnits = 1
  assert.throws(() => normaliseAnnouncementPreview(wrongUnits, smsDraft))

  const wrongEncoding = previewFor(smsDraft)
  ;(wrongEncoding.rendered as Record<string, unknown>).smsEncoding = 'ucs2'
  assert.throws(() => normaliseAnnouncementPreview(wrongEncoding, smsDraft))

  const twoSegmentDraft: AnnouncementDraft = {
    ...smsDraft,
    body: 'a'.repeat(153),
  }
  assert.throws(() => normaliseAnnouncementPreview(previewFor(twoSegmentDraft), twoSegmentDraft))
})

test('push previews remain compatible without an SMS body', () => {
  const pushDraft: AnnouncementDraft = { ...smsDraft, channel: 'push' }
  const normalised = normaliseAnnouncementPreview(previewFor(pushDraft), pushDraft)
  assert.equal(normalised.rendered.channel, 'push')
  assert.equal(normalised.rendered.smsBody, null)
  assert.equal(normalised.rendered.smsEncoding, null)
  assert.equal(normalised.rendered.smsUnits, null)
  assert.equal(normalised.rendered.smsUnitLimit, null)
})

test('history normalisation preserves exact counters and fails closed on old shapes', () => {
  const result = normaliseAnnouncementHistory([historyItem()])
  assert.equal(result[0]?.noActiveTokenCount, 1)
  assert.equal(result[0]?.smsNoValidPhoneCount, 1)
  assert.equal(result[0]?.smsUnknownCount, 1)

  const missingCounter = historyItem()
  delete (missingCounter as Partial<ReturnType<typeof historyItem>>).smsNoValidPhoneCount
  assert.throws(() => normaliseAnnouncementHistory([missingCounter]))

  const oldBackend = {
    id: 'legacy-1',
    title: 'Old push',
    body: 'Old shape without delivery-channel fields.',
    audience: 'All users',
    sentAt: '2026-08-01T10:00:00.000Z',
    delivered: 0,
    opened: 0,
  }
  assert.throws(
    () => normaliseAnnouncementHistory([oldBackend]),
    (error: unknown) => error instanceof Error && error.name === 'AnnouncementContractError',
  )
})

test('status presentation humanises partial failures and fails unknown states safe', () => {
  assert.deepEqual(announcementStatusPresentation('partially_failed'), {
    label: 'Partially failed',
    className: 'bg-amber-50 text-amber-800',
    attentionRequired: true,
  })
  const unknown = announcementStatusPresentation('reconciliation_required')
  assert.equal(unknown.label, 'Needs attention')
  assert.equal(unknown.attentionRequired, true)
  assert.match(unknown.className, /amber/)
  assert.equal(announcementStatusPresentation('sent').attentionRequired, false)
})

test('only stale or unusable preview errors clear the reviewed preview', () => {
  for (const code of [
    'ANNOUNCEMENT_PREVIEW_NOT_FOUND',
    'ANNOUNCEMENT_PREVIEW_ACTOR_MISMATCH',
    'ANNOUNCEMENT_PREVIEW_MISMATCH',
    'ANNOUNCEMENT_PREVIEW_CONSUMED',
    'ANNOUNCEMENT_PREVIEW_EXPIRED',
    'ANNOUNCEMENT_RECIPIENT_SNAPSHOT_MISMATCH',
  ]) {
    assert.equal(shouldClearAnnouncementPreview(code), true, code)
  }
  assert.equal(shouldClearAnnouncementPreview('SMS_CHANNEL_UNAVAILABLE'), false)
  assert.equal(shouldClearAnnouncementPreview('SMS_BODY_TOO_LONG'), false)
  assert.equal(shouldClearAnnouncementPreview(null), false)
})
