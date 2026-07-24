import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync('app/(dashboard)/system-settings/page.tsx', 'utf8')

test('system settings use the owner-approved support destinations', () => {
  assert.match(source, /support_email:\s+'support@gilmoretechnologiesgh\.com'/)
  assert.match(source, /support_phone:\s+'\+233\(0\)204962227'/)
  assert.equal(source.includes('support@gilmoretechnologies.com.gh'), false)
  assert.equal(source.includes('+233 XX XXX XXXX'), false)
})
