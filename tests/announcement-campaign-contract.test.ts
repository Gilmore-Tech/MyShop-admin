import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
const page = readFileSync(
  new URL('../app/(dashboard)/announcements/page.tsx', import.meta.url),
  'utf8',
)

test('announcements use the reviewed server preview and publish contract', () => {
  assert.match(api, /api\.post<AnnouncementPreview>\('\/admin\/announcements\/preview', draft\)/)
  assert.match(api, /'\/admin\/announcements\/publish'/)
  assert.match(api, /\{ \.\.\.draft, previewToken \}/)
  assert.match(api, /'Idempotency-Key': idempotencyKey/)
  assert.match(api, /api\.get<[\s\S]*'\/admin\/announcements\/history'/)

  assert.match(page, /previewAnnouncement\(request\)/)
  assert.match(page, /publishAnnouncement\(request, preview\.previewToken, preview\.campaignId\)/)
  assert.match(page, /activePushRecipients/)
  assert.match(page, /Nothing is sent while generating a preview\./)
})

test('announcement composer is push-only and history reports campaign truth', () => {
  assert.doesNotMatch(page, /sendSms|sms_push|SMS only|Delivered|Opened/)
  assert.match(page, /Reason for sending/)
  assert.match(page, /campaign\.status/)
  assert.match(page, /campaign\.recipientCount/)
  assert.match(page, /campaign\.queuedAt/)
})

test('announcement payload fields are fixed enums, not arbitrary routes', () => {
  assert.match(api, /export type AnnouncementClassification = 'service' \| 'critical'/)
  for (const destination of ['notifications', 'activity', 'support', 'promotions', 'app_store']) {
    assert.match(api, new RegExp(`\\|? '${destination}'`))
  }
  assert.match(page, /Internal audit reason \(not shown to recipients\)/)
})
