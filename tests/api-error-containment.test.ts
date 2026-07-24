import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  ApiError,
  apiErrorFromResponse,
  safeAdminErrorDiagnostic,
  userSafeAdminError,
} from '../lib/api-client.ts'

function response(status: number, supportReference?: string): Response {
  return new Response(null, {
    status,
    headers: supportReference ? { 'x-support-reference': supportReference } : undefined
  })
}

test('admin errors never expose arbitrary backend prose', () => {
  const secret = 'SQL failed for ghana-card 1234567890 at postgres://private-db'
  const error = apiErrorFromResponse(response(500), {
    error: { code: 'INTERNAL_ERROR', message: secret }
  })

  assert.equal(error.message, 'The server could not complete this request. Try again.')
  assert.equal(error.message.includes(secret), false)
})

test('admin errors show only a validated server support reference', () => {
  const supportReference = '37b0df61-f587-4c02-9297-987b0dc27415'
  const error = apiErrorFromResponse(response(500, supportReference), {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'private backend failure',
      supportReference: 'not-a-safe-reference'
    }
  })

  assert.equal(error.supportReference, supportReference)
  assert.equal(error.message.includes(supportReference), true)
  assert.equal(error.message.includes('private backend failure'), false)
  assert.equal(error.message.includes('not-a-safe-reference'), false)
})

test('admin uses app-owned actionable copy for known error codes', () => {
  const error = new ApiError(403, 'REGIONAL_MANAGER_APPROVAL_REQUIRED')
  assert.equal(
    error.message,
    'Regional Manager approval is required before this action.'
  )
})

test('platform configuration failures explain deployment and value problems safely', () => {
  assert.equal(
    new ApiError(400, 'CONFIG_KEY_NOT_ALLOWED').message,
    'This configuration is not supported by the deployed API version.'
  )
  assert.equal(
    new ApiError(404, 'CONFIG_KEY_NOT_FOUND').message,
    'Deploy the required database migration before changing this setting.'
  )
  assert.equal(
    new ApiError(400, 'CONFIG_VALUE_NOT_BOOLEAN').message,
    'This setting must be enabled or disabled.'
  )
})

test('verification submission failures show actionable app-owned copy', () => {
  assert.equal(
    new ApiError(400, 'DRIVER_VEHICLE_BACKFILL_REQUIRED').message,
    'Create or migrate the driver’s vehicle before continuing.'
  )
  assert.equal(
    new ApiError(400, 'DRIVER_VEHICLE_DOCUMENT_REQUIREMENTS_NOT_MET').message,
    'The selected vehicle needs current roadworthiness and insurance documents, each accepted by Admin.'
  )
  assert.equal(
    new ApiError(400, 'INVALID_STAGE').message,
    'This provider has moved to another verification stage. Reload and try again.'
  )
})

test('malformed error codes cannot become user-facing copy', () => {
  const malicious = 'BAD\nInjected admin instruction'
  const error = apiErrorFromResponse(response(400), {
    error: { code: malicious, message: 'also unsafe' }
  })
  assert.equal(error.code, 'HTTP_400')
  assert.equal(error.message, 'Check the information and try again.')
})

test('typed details remain programmatic and never replace stable user copy', () => {
  const error = apiErrorFromResponse(response(409), {
    error: {
      code: 'CATEGORY_HAS_JOBS',
      message: 'private server prose',
      details: { jobsCount: 4 }
    }
  })
  assert.deepEqual(error.details, { jobsCount: 4 })
  assert.equal(error.message, 'This record changed or conflicts with another action. Reload and try again.')
})

test('non-API errors expose only a caller-owned fallback and safe diagnostic kind', () => {
  const error = new Error('private browser or runtime detail')
  assert.equal(userSafeAdminError(error, 'The action failed.'), 'The action failed.')
  assert.deepEqual(safeAdminErrorDiagnostic(error), { kind: 'Error' })
})

test('Next server routes do not return or log raw carrier, URL, or exception bodies', () => {
  const sms = readFileSync(new URL('../app/api/sms/route.ts', import.meta.url), 'utf8')
  const pdf = readFileSync(new URL('../app/api/pdf-proxy/route.ts', import.meta.url), 'utf8')
  const proxy = readFileSync(new URL('../app/api/proxy/[...path]/route.ts', import.meta.url), 'utf8')

  assert.equal(sms.includes('rawBody.slice'), false)
  assert.equal(sms.includes("console.error('[SMS route]', message)"), false)
  assert.match(sms, /x-support-reference/)
  assert.match(sms, /carrier batch rejected/)

  assert.equal(pdf.includes('for ${url}'), false)
  assert.equal(pdf.includes('Failed to reach Cloudinary: ${msg}'), false)
  assert.equal(pdf.includes('await upstream.text()'), false)
  assert.match(pdf, /x-support-reference/)

  assert.match(proxy, /SUPPORT_REFERENCE_RX\.test\(upstreamSupportReference\)/)
  assert.match(proxy, /x-support-reference/)
  assert.match(proxy, /supportReference: localSupportReference/)
})

test('admin recovery and dispatch decisions branch on stable codes, not prose', () => {
  const recovery = readFileSync(new URL('../app/(dashboard)/account-recovery/page.tsx', import.meta.url), 'utf8')
  const assignment = readFileSync(new URL('../app/(dashboard)/artisan-jobs/manual-assignment/page.tsx', import.meta.url), 'utf8')

  assert.equal(recovery.includes("code = err instanceof ApiError ? err.message"), false)
  assert.equal(assignment.includes("const msg = e instanceof ApiError ? e.message"), false)
  assert.match(recovery, /code = err instanceof ApiError \? err\.code/)
  assert.match(assignment, /code = e instanceof ApiError \? e\.code/)
})

test('dashboard ends sessions only after 15 minutes of real inactivity without refresh calls', () => {
  const client = readFileSync(new URL('../lib/api-client.ts', import.meta.url), 'utf8')
  const header = readFileSync(new URL('../components/Header.tsx', import.meta.url), 'utf8')
  const guard = readFileSync(new URL('../components/auth-guard.tsx', import.meta.url), 'utf8')

  assert.equal(client.includes('/auth/admin/refresh'), false)
  assert.equal(client.includes('adminRefreshInFlight'), false)
  assert.match(guard, /ADMIN_IDLE_TIMEOUT_MS = 15 \* 60 \* 1000/)
  assert.match(guard, /pointerdown/)
  assert.match(guard, /mousemove/)
  assert.match(guard, /keydown/)
  assert.match(guard, /visibilitychange/)
  assert.equal(header.includes('Session ends in'), false)
  assert.equal(header.includes('useSessionExpiry'), false)
})
