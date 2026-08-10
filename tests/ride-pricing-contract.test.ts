import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getRidePricingPresentation,
  normaliseRidePricing,
} from '../lib/ride-pricing-contract.ts'

test('normalises payment-backed promo and loyalty amounts without losing their combined discount', () => {
  const pricing = normaliseRidePricing({
    basis: 'payment',
    prePromoFarePesewas: 10_000,
    promoDiscountPesewas: 2_000,
    loyaltyDiscountPesewas: 500,
    totalDiscountPesewas: 2_500,
    clientAmountPesewas: 7_500,
    clientAmountPaid: true,
  })

  assert.deepEqual(pricing, {
    basis: 'payment',
    prePromoFarePesewas: 10_000,
    promoDiscountPesewas: 2_000,
    loyaltyDiscountPesewas: 500,
    totalDiscountPesewas: 2_500,
    clientAmountPesewas: 7_500,
    clientAmountPaid: true,
  })
  assert.equal(getRidePricingPresentation(pricing).clientAmountLabel, 'CLIENT AMOUNT PAID')
})

test('preserves an explicit zero discount for non-promo rides', () => {
  const pricing = normaliseRidePricing({
    basis: 'payment',
    prePromoFarePesewas: 8_000,
    promoDiscountPesewas: 0,
    loyaltyDiscountPesewas: 0,
    totalDiscountPesewas: 0,
    clientAmountPesewas: 8_000,
    clientAmountPaid: true,
  })

  assert.equal(pricing?.totalDiscountPesewas, 0)
  assert.equal(pricing?.clientAmountPesewas, 8_000)
})

test('labels quote-backed pricing as an estimate and not as money already paid', () => {
  const pricing = normaliseRidePricing({
    basis: 'current_quote',
    prePromoFarePesewas: 8_500,
    promoDiscountPesewas: 1_000,
    loyaltyDiscountPesewas: 0,
    totalDiscountPesewas: 1_000,
    clientAmountPesewas: 7_500,
    clientAmountPaid: false,
  })
  const presentation = getRidePricingPresentation(pricing)

  assert.equal(presentation.basisLabel, 'Current estimate')
  assert.equal(presentation.clientAmountLabel, 'CURRENT ESTIMATE')
  assert.equal(presentation.isEstimate, true)
  assert.match(presentation.note, /has not paid/i)
})

test('labels final ride amounts without a collected payment as due, not paid', () => {
  const pricing = normaliseRidePricing({
    basis: 'final_ride',
    prePromoFarePesewas: 9_000,
    promoDiscountPesewas: 1_500,
    loyaltyDiscountPesewas: 500,
    totalDiscountPesewas: 2_000,
    clientAmountPesewas: 7_000,
    clientAmountPaid: false,
  })
  const presentation = getRidePricingPresentation(pricing)

  assert.equal(presentation.clientAmountLabel, 'CLIENT AMOUNT DUE')
  assert.match(presentation.note, /not recorded yet/i)
})

test('fails soft when the additive pricing contract is absent instead of deriving legacy fare fields', () => {
  assert.equal(normaliseRidePricing(undefined), null)
  assert.equal(
    normaliseRidePricing({ basis: 'payment', clientAmountPaid: true, clientAmountPesewas: 5_000 }),
    null,
  )
  const presentation = getRidePricingPresentation(null)

  assert.equal(presentation.basisLabel, 'Pricing unavailable')
  assert.equal(presentation.clientAmountLabel, 'CLIENT AMOUNT')
  assert.match(presentation.note, /did not return/i)
})

test('fails soft on negative money, an unknown basis, or inconsistent money totals', () => {
  const base = {
    basis: 'payment',
    prePromoFarePesewas: 10_000,
    promoDiscountPesewas: 2_000,
    loyaltyDiscountPesewas: 500,
    totalDiscountPesewas: 2_500,
    clientAmountPesewas: 7_500,
    clientAmountPaid: true,
  }

  assert.equal(normaliseRidePricing({ ...base, clientAmountPesewas: -1 }), null)
  assert.equal(normaliseRidePricing({ ...base, basis: 'estimated' }), null)
  assert.equal(normaliseRidePricing({ ...base, totalDiscountPesewas: 2_499 }), null)
  assert.equal(normaliseRidePricing({ ...base, clientAmountPesewas: 7_499 }), null)
  assert.equal(normaliseRidePricing({ ...base, basis: 'current_quote' }), null)
  assert.equal(normaliseRidePricing({ ...base, clientAmountPesewas: null }), null)
})
