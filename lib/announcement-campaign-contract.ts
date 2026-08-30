export type AnnouncementAudience = 'all' | 'clients' | 'drivers' | 'artisans'
export type AnnouncementClassification = 'service' | 'critical'
export type AnnouncementChannel = 'push' | 'sms' | 'sms_push'
export type AnnouncementSmsEncoding = 'gsm7' | 'ucs2'
export type AnnouncementDestination =
  | 'notifications'
  | 'activity'
  | 'support'
  | 'promotions'
  | 'app_store'

export interface AnnouncementDraft {
  title: string
  body: string
  targetAudience: AnnouncementAudience
  classification: AnnouncementClassification
  channel: AnnouncementChannel
  destination: AnnouncementDestination
  reason: string
}

export interface AnnouncementPreviewCounts {
  eligibleRecipients: number
  activePushRecipients: number
  noActiveToken: number
  smsRecipients: number
  smsNoValidPhone: number
  byRole: Record<string, number>
  byPlatform: Record<string, number>
}

interface AnnouncementRenderedBase {
  title: string
  body: string
  classification: AnnouncementClassification
  targetAudience: AnnouncementAudience
  destination: AnnouncementDestination
}

export type AnnouncementPreviewRendered = AnnouncementRenderedBase & (
  | {
      channel: 'push'
      smsBody: null
      smsEncoding: null
      smsUnits: null
      smsUnitLimit: null
    }
  | {
      channel: 'sms' | 'sms_push'
      smsBody: string
      smsEncoding: AnnouncementSmsEncoding
      smsUnits: number
      smsUnitLimit: number
    }
)

export interface AnnouncementPreview {
  campaignId: string
  previewToken: string
  previewExpiresAt: string
  revision: number
  counts: AnnouncementPreviewCounts
  rendered: AnnouncementPreviewRendered
}

export interface AnnouncementPublishResult {
  id: string
  status: string
  channel: AnnouncementChannel
  recipientCount: number
  smsEligibleCount: number
  queuedAt: string | null
}

export interface AnnouncementHistoryItem {
  id: string
  title: string
  body: string
  targetAudience: AnnouncementAudience
  classification: AnnouncementClassification
  channel: AnnouncementChannel
  destination: AnnouncementDestination
  status: string
  recipientCount: number
  activePushCount: number
  noActiveTokenCount: number
  acceptedCount: number
  failedCount: number
  openedCount: number
  smsEligibleCount: number
  smsNoValidPhoneCount: number
  smsAcceptedCount: number
  smsFailedCount: number
  smsUnknownCount: number
  queuedAt: string
  reason: string
}

export const ANNOUNCEMENT_SMS_PREFIX = 'MyShop: '
export const ANNOUNCEMENT_REASON_MIN_CHARS = 5

const GSM7_SINGLE_SEGMENT_SEPTETS = 160
const GSM7_CONCATENATED_SEGMENT_SEPTETS = 153
const UCS2_SINGLE_SEGMENT_CODE_UNITS = 70
const UCS2_CONCATENATED_SEGMENT_CODE_UNITS = 67

// GSM 03.38 default alphabet. Extension-table characters consume an escape
// plus their extension code, so each one costs two septets.
const GSM7_BASIC = new Set<string>([
  '@',
  '£',
  '$',
  '¥',
  'è',
  'é',
  'ù',
  'ì',
  'ò',
  'Ç',
  '\n',
  'Ø',
  'ø',
  '\r',
  'Å',
  'å',
  'Δ',
  '_',
  'Φ',
  'Γ',
  'Λ',
  'Ω',
  'Π',
  'Ψ',
  'Σ',
  'Θ',
  'Ξ',
  ' ',
  '!',
  '"',
  '#',
  '¤',
  '%',
  '&',
  "'",
  '(',
  ')',
  '*',
  '+',
  ',',
  '-',
  '.',
  '/',
  ...'0123456789',
  ':',
  ';',
  '<',
  '=',
  '>',
  '?',
  '¡',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'Ä',
  'Ö',
  'Ñ',
  'Ü',
  '§',
  '¿',
  ...'abcdefghijklmnopqrstuvwxyz',
  'ä',
  'ö',
  'ñ',
  'ü',
  'à',
])

const GSM7_EXTENSION = new Set<string>(['\f', '^', '{', '}', '\\', '[', '~', ']', '|', '€'])

const AUDIENCES: readonly AnnouncementAudience[] = ['all', 'clients', 'drivers', 'artisans']
const CLASSIFICATIONS: readonly AnnouncementClassification[] = ['service', 'critical']
const CHANNELS: readonly AnnouncementChannel[] = ['push', 'sms', 'sms_push']
const DESTINATIONS: readonly AnnouncementDestination[] = [
  'notifications',
  'activity',
  'support',
  'promotions',
  'app_store',
]

type JsonObject = Record<string, unknown>

function unsafeContract(message: string): never {
  const error = new Error(`Unsafe announcement response: ${message}`)
  error.name = 'AnnouncementContractError'
  throw error
}

function objectAt(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return unsafeContract(`${label} must be an object.`)
  }
  return value as JsonObject
}

function stringAt(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return unsafeContract(`${label} must be a non-empty string.`)
  }
  return value
}

function integerAt(value: unknown, label: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    return unsafeContract(`${label} must be an integer of at least ${minimum}.`)
  }
  return value as number
}

function isoDateAt(value: unknown, label: string, nullable = false): string | null {
  if (nullable && value == null) return null
  const result = stringAt(value, label)
  if (Number.isNaN(Date.parse(result))) return unsafeContract(`${label} must be an ISO date.`)
  return result
}

function enumAt<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value === 'string' && allowed.includes(value as T)) return value as T
  return unsafeContract(`${label} is unknown.`)
}

function countRecordAt(value: unknown, label: string): Record<string, number> {
  const source = objectAt(value, label)
  return Object.fromEntries(
    Object.entries(source).map(([key, count]) => [key, integerAt(count, `${label}.${key}`)]),
  )
}

export function announcementIncludesPush(channel: AnnouncementChannel): boolean {
  return channel === 'push' || channel === 'sms_push'
}

export function announcementIncludesSms(channel: AnnouncementChannel): boolean {
  return channel === 'sms' || channel === 'sms_push'
}

export function renderAnnouncementSmsBody(body: string): string {
  return `${ANNOUNCEMENT_SMS_PREFIX}${body.trim()}`
}

export interface AnnouncementSmsEncodingAnalysis {
  encoding: AnnouncementSmsEncoding
  units: number
  unitLimit: number
  segments: number
}

export function analyzeAnnouncementSmsEncoding(
  message: string,
): AnnouncementSmsEncodingAnalysis {
  let septets = 0
  let gsm7 = true
  for (const character of message) {
    if (GSM7_BASIC.has(character)) {
      septets += 1
    } else if (GSM7_EXTENSION.has(character)) {
      septets += 2
    } else {
      gsm7 = false
      break
    }
  }

  if (gsm7) {
    return {
      encoding: 'gsm7',
      units: septets,
      unitLimit: GSM7_SINGLE_SEGMENT_SEPTETS,
      segments:
        septets <= GSM7_SINGLE_SEGMENT_SEPTETS
          ? 1
          : Math.ceil(septets / GSM7_CONCATENATED_SEGMENT_SEPTETS),
    }
  }

  // JavaScript length is the UTF-16/UCS-2 code-unit count used for SMS
  // segmentation. A supplementary character such as an emoji consumes two.
  const codeUnits = message.length
  return {
    encoding: 'ucs2',
    units: codeUnits,
    unitLimit: UCS2_SINGLE_SEGMENT_CODE_UNITS,
    segments:
      codeUnits <= UCS2_SINGLE_SEGMENT_CODE_UNITS
        ? 1
        : Math.ceil(codeUnits / UCS2_CONCATENATED_SEGMENT_CODE_UNITS),
  }
}

export function announcementSmsLength(body: string) {
  const smsBody = renderAnnouncementSmsBody(body)
  const analysis = analyzeAnnouncementSmsEncoding(smsBody)
  return {
    smsBody,
    ...analysis,
    unitsLeft: analysis.unitLimit - analysis.units,
    tooLong: analysis.segments > 1,
  }
}

export function announcementSmsUnitsLabel(encoding: AnnouncementSmsEncoding): string {
  return encoding === 'gsm7' ? 'GSM-7 septets' : 'UCS-2 units'
}

export function normaliseAnnouncementPreview(
  raw: unknown,
  expected: AnnouncementDraft,
): AnnouncementPreview {
  const source = objectAt(raw, 'preview')
  const countsSource = objectAt(source.counts, 'preview.counts')
  const renderedSource = objectAt(source.rendered, 'preview.rendered')
  const renderedChannel = enumAt(renderedSource.channel, CHANNELS, 'preview.rendered.channel')
  const expectedTitle = expected.title.trim()
  const expectedBody = expected.body.trim()

  if (renderedChannel !== expected.channel) {
    return unsafeContract('preview.rendered.channel does not match the requested channel.')
  }
  if (stringAt(renderedSource.title, 'preview.rendered.title') !== expectedTitle) {
    return unsafeContract('preview.rendered.title does not match the requested title.')
  }
  if (stringAt(renderedSource.body, 'preview.rendered.body') !== expectedBody) {
    return unsafeContract('preview.rendered.body does not match the requested body.')
  }
  const targetAudience = enumAt(
    renderedSource.targetAudience,
    AUDIENCES,
    'preview.rendered.targetAudience',
  )
  if (targetAudience !== expected.targetAudience) {
    return unsafeContract('preview.rendered.targetAudience does not match the request.')
  }
  const classification = enumAt(
    renderedSource.classification,
    CLASSIFICATIONS,
    'preview.rendered.classification',
  )
  if (classification !== expected.classification) {
    return unsafeContract('preview.rendered.classification does not match the request.')
  }
  const destination = enumAt(
    renderedSource.destination,
    DESTINATIONS,
    'preview.rendered.destination',
  )
  if (destination !== expected.destination) {
    return unsafeContract('preview.rendered.destination does not match the request.')
  }

  const expectedSms = announcementSmsLength(expectedBody)
  let rendered: AnnouncementPreviewRendered
  if (renderedChannel === 'sms' || renderedChannel === 'sms_push') {
    const smsBody = stringAt(renderedSource.smsBody, 'preview.rendered.smsBody')
    const smsEncoding = enumAt(
      renderedSource.smsEncoding,
      ['gsm7', 'ucs2'] as const,
      'preview.rendered.smsEncoding',
    )
    const smsUnits = integerAt(renderedSource.smsUnits, 'preview.rendered.smsUnits')
    const smsUnitLimit = integerAt(
      renderedSource.smsUnitLimit,
      'preview.rendered.smsUnitLimit',
      1,
    )
    if (
      smsBody !== expectedSms.smsBody ||
      smsEncoding !== expectedSms.encoding ||
      smsUnits !== expectedSms.units ||
      smsUnitLimit !== expectedSms.unitLimit ||
      expectedSms.segments !== 1
    ) {
      return unsafeContract('preview SMS text or encoding metadata does not match the exact one-SMS review.')
    }
    rendered = {
      title: expectedTitle,
      body: expectedBody,
      classification,
      targetAudience,
      channel: renderedChannel,
      destination,
      smsBody,
      smsEncoding,
      smsUnits,
      smsUnitLimit,
    }
  } else {
    rendered = {
      title: expectedTitle,
      body: expectedBody,
      classification,
      targetAudience,
      channel: 'push',
      destination,
      smsBody: null,
      smsEncoding: null,
      smsUnits: null,
      smsUnitLimit: null,
    }
  }

  return {
    campaignId: stringAt(source.campaignId, 'preview.campaignId'),
    previewToken: stringAt(source.previewToken, 'preview.previewToken'),
    previewExpiresAt: isoDateAt(source.previewExpiresAt, 'preview.previewExpiresAt') as string,
    revision: integerAt(source.revision, 'preview.revision', 1),
    counts: {
      eligibleRecipients: integerAt(countsSource.eligibleRecipients, 'counts.eligibleRecipients'),
      activePushRecipients: integerAt(countsSource.activePushRecipients, 'counts.activePushRecipients'),
      noActiveToken: integerAt(countsSource.noActiveToken, 'counts.noActiveToken'),
      smsRecipients: integerAt(countsSource.smsRecipients, 'counts.smsRecipients'),
      smsNoValidPhone: integerAt(countsSource.smsNoValidPhone, 'counts.smsNoValidPhone'),
      byRole: countRecordAt(countsSource.byRole, 'counts.byRole'),
      byPlatform: countRecordAt(countsSource.byPlatform, 'counts.byPlatform'),
    },
    rendered,
  }
}

function historyArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  const source = objectAt(raw, 'history')
  if (Array.isArray(source.data)) return source.data
  return unsafeContract('history must be an array.')
}

function normaliseAnnouncementHistoryItem(raw: unknown): AnnouncementHistoryItem {
  const source = objectAt(raw, 'history item')
  return {
    id: stringAt(source.id, 'history.id'),
    title: stringAt(source.title, 'history.title'),
    body: stringAt(source.body, 'history.body'),
    targetAudience: enumAt(source.targetAudience, AUDIENCES, 'history.targetAudience'),
    classification: enumAt(source.classification, CLASSIFICATIONS, 'history.classification'),
    channel: enumAt(source.channel, CHANNELS, 'history.channel'),
    destination: enumAt(source.destination, DESTINATIONS, 'history.destination'),
    status: stringAt(source.status, 'history.status'),
    recipientCount: integerAt(source.recipientCount, 'history.recipientCount'),
    activePushCount: integerAt(source.activePushCount, 'history.activePushCount'),
    noActiveTokenCount: integerAt(source.noActiveTokenCount, 'history.noActiveTokenCount'),
    acceptedCount: integerAt(source.acceptedCount, 'history.acceptedCount'),
    failedCount: integerAt(source.failedCount, 'history.failedCount'),
    openedCount: integerAt(source.openedCount, 'history.openedCount'),
    smsEligibleCount: integerAt(source.smsEligibleCount, 'history.smsEligibleCount'),
    smsNoValidPhoneCount: integerAt(
      source.smsNoValidPhoneCount,
      'history.smsNoValidPhoneCount',
    ),
    smsAcceptedCount: integerAt(source.smsAcceptedCount, 'history.smsAcceptedCount'),
    smsFailedCount: integerAt(source.smsFailedCount, 'history.smsFailedCount'),
    smsUnknownCount: integerAt(source.smsUnknownCount, 'history.smsUnknownCount'),
    queuedAt: isoDateAt(source.queuedAt, 'history.queuedAt') as string,
    reason: stringAt(source.reason, 'history.reason'),
  }
}

export function normaliseAnnouncementHistory(raw: unknown): AnnouncementHistoryItem[] {
  return historyArray(raw).map(normaliseAnnouncementHistoryItem)
}

export interface AnnouncementStatusPresentation {
  label: string
  className: string
  attentionRequired: boolean
}

export function announcementStatusPresentation(status: string): AnnouncementStatusPresentation {
  switch (status.toLowerCase()) {
    case 'sent':
    case 'completed':
      return { label: 'Sent', className: 'bg-emerald-50 text-emerald-700', attentionRequired: false }
    case 'queued':
      return { label: 'Queued', className: 'bg-blue-50 text-blue-700', attentionRequired: false }
    case 'sending':
      return { label: 'Sending', className: 'bg-blue-50 text-blue-700', attentionRequired: false }
    case 'partially_failed':
      return { label: 'Partially failed', className: 'bg-amber-50 text-amber-800', attentionRequired: true }
    case 'failed':
      return { label: 'Failed', className: 'bg-red-50 text-red-700', attentionRequired: true }
    case 'cancelled':
      return { label: 'Cancelled', className: 'bg-gray-100 text-gray-700', attentionRequired: false }
    default:
      return { label: 'Needs attention', className: 'bg-amber-50 text-amber-800', attentionRequired: true }
  }
}

const STALE_PREVIEW_CODES = new Set([
  'ANNOUNCEMENT_PREVIEW_NOT_FOUND',
  'ANNOUNCEMENT_PREVIEW_ACTOR_MISMATCH',
  'ANNOUNCEMENT_PREVIEW_MISMATCH',
  'ANNOUNCEMENT_PREVIEW_CONSUMED',
  'ANNOUNCEMENT_PREVIEW_EXPIRED',
  'ANNOUNCEMENT_RECIPIENT_SNAPSHOT_MISMATCH',
])

export function shouldClearAnnouncementPreview(code: unknown): boolean {
  return typeof code === 'string' && STALE_PREVIEW_CODES.has(code)
}
