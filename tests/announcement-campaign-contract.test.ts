import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
const contract = readFileSync(
  new URL('../lib/announcement-campaign-contract.ts', import.meta.url),
  'utf8',
)
const apiClient = readFileSync(new URL('../lib/api-client.ts', import.meta.url), 'utf8')
const page = readFileSync(
  new URL('../app/(dashboard)/announcements/page.tsx', import.meta.url),
  'utf8',
)

test('announcements use normalised server preview, publish, and history contracts', () => {
  assert.match(api, /api\.post<unknown>\('\/admin\/announcements\/preview', draft\)/)
  assert.match(api, /normaliseAnnouncementPreview\(raw, draft\)/)
  assert.match(api, /'\/admin\/announcements\/publish'/)
  assert.match(api, /\{ \.\.\.draft, previewToken \}/)
  assert.match(api, /'Idempotency-Key': idempotencyKey/)
  assert.match(api, /api\.get<unknown>\('\/admin\/announcements\/history'\)/)
  assert.match(api, /normaliseAnnouncementHistory\(raw\)/)

  assert.match(page, /previewAnnouncement\(request\)/)
  assert.match(page, /publishAnnouncement\(request, preview\.previewToken, preview\.campaignId\)/)
  assert.match(page, /Nothing is sent while generating a preview\./)
})

test('announcement composer restores audited push, SMS, and combined channels', () => {
  assert.match(contract, /export type AnnouncementChannel = 'push' \| 'sms' \| 'sms_push'/)
  assert.match(contract, /channel: AnnouncementChannel/)
  assert.match(page, /<SelectItem value="push">Push notification<\/SelectItem>/)
  assert.match(page, /<SelectItem value="sms">SMS only \(Arkesel\)<\/SelectItem>/)
  assert.match(page, /<SelectItem value="sms_push">SMS \+ Push<\/SelectItem>/)
  assert.match(contract, /ANNOUNCEMENT_SMS_PREFIX = 'MyShop: '/)
  assert.match(contract, /GSM7_SINGLE_SEGMENT_SEPTETS = 160/)
  assert.match(contract, /UCS2_SINGLE_SEGMENT_CODE_UNITS = 70/)
  assert.match(page, /announcementSmsLength\(body\)/)
  assert.match(page, /setChannel\(value\); invalidatePreview\(\)/)
  assert.doesNotMatch(page, /sendSms\(/)
  assert.match(page, /preview\.rendered\.channel !== 'push'/)
  assert.match(page, /preview\.rendered\.smsBody/)
  assert.match(page, /preview\.rendered\.smsEncoding/)
  assert.match(page, /preview\.rendered\.smsUnits/)
  assert.match(page, /preview\.rendered\.smsUnitLimit/)
  assert.match(page, /preview\.counts\.smsNoValidPhone/)
})

test('announcement composer mirrors reason validation and clears stale previews', () => {
  assert.match(contract, /ANNOUNCEMENT_REASON_MIN_CHARS = 5/)
  assert.match(page, /reasonLength < ANNOUNCEMENT_REASON_MIN_CHARS/)
  assert.match(page, /shouldClearAnnouncementPreview\(err\.code\)/)
  assert.match(page, /setPreview\(null\)/)
  for (const code of [
    'ANNOUNCEMENT_PREVIEW_EXPIRED',
    'ANNOUNCEMENT_PREVIEW_CONSUMED',
    'ANNOUNCEMENT_PREVIEW_MISMATCH',
    'ANNOUNCEMENT_PREVIEW_ACTOR_MISMATCH',
    'SMS_CHANNEL_UNAVAILABLE',
    'SMS_BODY_TOO_LONG',
  ]) {
    assert.match(apiClient, new RegExp(`${code}:`))
  }
  assert.match(apiClient, /SMS_BODY_TOO_LONG:[^\n]*one SMS[^\n]*160 GSM-7 septets[^\n]*70 UCS-2 code units/)
})

test('announcement history reports honest channel and transport counters', () => {
  assert.match(page, /Reason for sending/)
  assert.match(page, /CHANNEL_LABELS\[campaign\.channel\]/)
  assert.match(page, /announcementStatusPresentation\(campaign\.status\)/)
  assert.match(page, /campaign\.activePushCount/)
  assert.match(page, /campaign\.noActiveTokenCount/)
  assert.match(page, /campaign\.smsEligibleCount/)
  assert.match(page, /campaign\.smsNoValidPhoneCount/)
  assert.match(page, /campaign\.smsAcceptedCount/)
  assert.match(page, /campaign\.smsFailedCount/)
  assert.match(page, /campaign\.smsUnknownCount/)
  assert.match(page, /SMS outcomes unknown - attention required/)
  assert.match(page, /campaign\.queuedAt/)
  assert.match(page, /header: 'Audience profiles'/)
  assert.doesNotMatch(page, /Delivered|Opened|billed segment/i)
})

test('announcement payload fields remain fixed enums and exact counters', () => {
  assert.match(contract, /export type AnnouncementClassification = 'service' \| 'critical'/)
  for (const destination of ['notifications', 'activity', 'support', 'promotions', 'app_store']) {
    assert.match(contract, new RegExp(`\\|? '${destination}'`))
  }
  for (const field of [
    'smsRecipients',
    'smsNoValidPhone',
    'smsEligibleCount',
    'smsNoValidPhoneCount',
    'smsAcceptedCount',
    'smsFailedCount',
    'smsUnknownCount',
  ]) {
    assert.match(contract, new RegExp(field))
  }
  assert.match(page, /Internal audit reason \(not shown to recipients\)/)
  assert.match(page, /Audience profiles/)
})
