import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

test('shutdown has an exact Super Admin UI gate and describes admin-only revocation', () => {
  const page = readFileSync(new URL('../app/(dashboard)/system-settings/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /hasRole\(admin\?\.roles, admin\?\.role, 'super_admin'\)/)
  assert.match(page, /disabled=\{!canControlShutdown \|\| saving\}/)
  assert.match(page, /Mobile sessions will be preserved/)
})

test('dashboard verifies sessions before rendering and polls without recording user activity', () => {
  const guard = readFileSync(new URL('../components/auth-guard.tsx', import.meta.url), 'utf8')
  assert.match(guard, /api.get\('\/auth\/admin\/session'/)
  assert.match(guard, /skipRegionScope: true/)
  assert.match(guard, /AbortSignal.timeout\(10_000\)/)
  assert.match(guard, /if \(!expired\) \{\s*setSessionError\(false\)\s*setChecked\(true\)/)
  assert.match(guard, /setInterval\(\(\) => void validateSession\(\), 5_000\)/)
  assert.match(guard, /clearInterval\(sessionCheck\)/)
  const validation = guard.slice(guard.indexOf('async function validateSession'), guard.indexOf('const activityEvents'))
  assert.doesNotMatch(validation, /recordActivity|ADMIN_ACTIVITY_KEY/)
})
