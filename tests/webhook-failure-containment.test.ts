import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')
const page = readFileSync(
  new URL('../app/(dashboard)/payments/webhook-failures/page.tsx', import.meta.url),
  'utf8'
)

test('webhook failure API is read-only and exposes no payment-routing fields', () => {
  const typeStart = api.indexOf('export interface WebhookFailure {')
  const typeEnd = api.indexOf('export interface WebhookFailureListResponse', typeStart)
  const safeType = api.slice(typeStart, typeEnd)

  assert.ok(typeStart >= 0)
  assert.match(api, /api\.get<WebhookFailureListResponse>\(`\/admin\/payments\/webhook-failures\$\{qs\}`\)/)
  assert.equal(safeType.includes('reference:'), false)
  assert.equal(safeType.includes('transactionReference'), false)
  assert.equal(safeType.includes('providerObjectId'), false)
  assert.equal(safeType.includes('transferCode'), false)
  assert.equal(safeType.includes('rawBody'), false)
})

test('webhook failure page is payment-scoped and deliberately read-only', () => {
  assert.match(page, /<PageGuard permission="view_payments">/)
  assert.match(page, /listWebhookFailures\(\{ page, limit: LIMIT \}\)/)
  assert.match(page, /This\s+page is read-only/)
  assert.equal(page.includes('api.post'), false)
  assert.equal(page.includes('api.patch'), false)
  assert.equal(page.includes('api.delete'), false)
  assert.equal(page.includes('retryWebhook'), false)
  assert.equal(page.includes('resolveWebhook'), false)
})

test('the reconciliation queue is reachable from every payment navigation surface', () => {
  const paths = [
    '../components/app-sidebar.tsx',
    '../app/(dashboard)/payments/transactions/page.tsx',
    '../app/(dashboard)/payments/revenue/page.tsx',
    '../app/(dashboard)/payments/batch-payouts/page.tsx',
    '../app/(dashboard)/payments/clawbacks/page.tsx',
  ]

  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.match(source, /\/payments\/webhook-failures/)
  }
})
