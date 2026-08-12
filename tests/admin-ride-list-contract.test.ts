import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  normaliseAdminRide,
  normaliseAdminRideListResponse,
} from '../lib/admin-ride-contract.ts'

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  clientName: 'Ama Client',
  driverName: 'Kofi Driver',
  pickupAddress: 'Adum',
  dropoffAddress: 'KNUST',
  status: 'completed',
  estimatedFarePesewas: 7500,
  finalFarePesewas: 9000,
  paymentMethod: 'momo_mtn',
  createdAt: '2026-08-11T09:00:00.000Z',
}

test('normalises the additive payment-backed pricing contract and client amount alias', () => {
  const ride = normaliseAdminRide({
    ...base,
    farePesewas: 8500,
    paymentStatus: 'completed',
    amountPaidPesewas: 8500,
    paidAt: '2026-08-11T09:30:00.000Z',
    pricing: {
      basis: 'payment',
      prePromoFarePesewas: 12_000,
      promoDiscountPesewas: 3000,
      loyaltyDiscountPesewas: 500,
      totalDiscountPesewas: 3500,
      clientAmountPesewas: 8500,
      clientAmountPaid: true,
    },
  })

  assert.equal(ride?.farePesewas, 8500)
  assert.equal(ride?.paymentStatus, 'completed')
  assert.equal(ride?.pricing?.basis, 'payment')
  assert.equal(ride?.pricing?.totalDiscountPesewas, 3500)
})

test('supports an old backend by falling back to final then estimated fare', () => {
  assert.equal(normaliseAdminRide(base)?.farePesewas, 9000)
  assert.equal(
    normaliseAdminRide({ ...base, finalFarePesewas: null })?.farePesewas,
    7500,
  )
})

test('preserves explicit zero and explicit null instead of swallowing either into legacy fare', () => {
  assert.equal(normaliseAdminRide({ ...base, farePesewas: 0 })?.farePesewas, 0)
  assert.equal(normaliseAdminRide({ ...base, farePesewas: null })?.farePesewas, null)
})

test('uses a valid pricing contract as authority and fails malformed explicit money to null', () => {
  const freeRide = normaliseAdminRide({
    ...base,
    farePesewas: 9999,
    pricing: {
      basis: 'payment',
      prePromoFarePesewas: 10_000,
      promoDiscountPesewas: 9500,
      loyaltyDiscountPesewas: 500,
      totalDiscountPesewas: 10_000,
      clientAmountPesewas: 0,
      clientAmountPaid: true,
    },
  })
  assert.equal(freeRide?.farePesewas, 0)
  assert.equal(normaliseAdminRide({ ...base, farePesewas: -1 })?.farePesewas, null)
  assert.equal(normaliseAdminRide({ ...base, farePesewas: 1.5 })?.farePesewas, null)
})

test('normalises the paginated envelope without inventing missing rows or counts', () => {
  const response = normaliseAdminRideListResponse({
    items: [base, null, { status: 'completed' }],
    total: 1,
    page: 1,
    limit: 15,
    totalPages: 1,
  })

  assert.equal(response.items.length, 1)
  assert.equal(response.total, 1)
  assert.equal(response.limit, 15)
  assert.deepEqual(normaliseAdminRideListResponse(null), {
    items: [],
    total: 0,
    page: 1,
    limit: 0,
    totalPages: 0,
  })
})

test('both ride tables label and format the value as client amount without a false-zero formatter', () => {
  const ridesPage = readFileSync(
    new URL('../app/(dashboard)/rides/page.tsx', import.meta.url),
    'utf8',
  )
  const liveMap = readFileSync(
    new URL('../app/(dashboard)/live-map/page.tsx', import.meta.url),
    'utf8',
  )

  for (const source of [ridesPage, liveMap]) {
    assert.match(source, /Client amount/)
    assert.match(source, /@\/lib\/money/)
    assert.doesNotMatch(source, /return ['"]GHC 0['"]/)
  }
})
