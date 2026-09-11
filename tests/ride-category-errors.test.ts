import assert from 'node:assert/strict'
import test from 'node:test'

import { ApiError } from '../lib/api-client.ts'
import { presentRideCategorySaveError } from '../lib/ride-category-errors.ts'

test('names the exact Regular and Comfort fare conflict without displaying an error code', () => {
  const error = new ApiError(
    400,
    'INVALID_RIDE_CATEGORY_PRICING',
    null,
    { field: 'perMinPesewas' },
  )

  const presentation = presentRideCategorySaveError(error)

  assert.equal(presentation.target, 'form')
  assert.equal(
    presentation.message,
    "Comfort's per-minute rate must be equal to or higher than Regular's per-minute rate. If you are increasing Regular, update Comfort first.",
  )
  assert.equal(presentation.message.includes(error.code), false)
})

test('ignores unknown backend detail fields and uses safe pricing guidance', () => {
  const error = new ApiError(
    400,
    'INVALID_RIDE_CATEGORY_PRICING',
    null,
    { field: 'privateDatabaseValue' },
  )

  const presentation = presentRideCategorySaveError(error)

  assert.match(presentation.message, /Every Comfort fare/)
  assert.equal(presentation.message.includes('privateDatabaseValue'), false)
})

test('names the invalid fare field in plain language', () => {
  const error = new ApiError(
    400,
    'INVALID_RIDE_CATEGORY_RATE',
    null,
    { field: 'baseFarePesewas' },
  )

  const presentation = presentRideCategorySaveError(error)

  assert.equal(
    presentation.message,
    'Enter a valid non-negative amount for the base fare.',
  )
  assert.equal(presentation.message.includes(error.code), false)
})

test('keeps slug errors beside the slug input', () => {
  const presentation = presentRideCategorySaveError(
    new ApiError(409, 'SLUG_ALREADY_EXISTS'),
  )

  assert.equal(presentation.target, 'slug')
  assert.match(presentation.message, /already used by another ride tier/)
})

test('keeps the support reference diagnostic out of the form message', () => {
  const reference = '94eefdf3-b4c3-4d8a-bd92-996862d50de0'
  const error = new ApiError(
    400,
    'INVALID_RIDE_CATEGORY_PRICING',
    reference,
    { field: 'minimumFarePesewas' },
  )
  const presentation = presentRideCategorySaveError(error)

  assert.match(presentation.message, /Comfort's minimum fare/)
  assert.equal(presentation.message.includes(reference), false)
  assert.equal(error.supportReference, reference)
})

test('does not expose arbitrary runtime error text', () => {
  const presentation = presentRideCategorySaveError(
    new Error('private browser failure'),
  )

  assert.equal(presentation.message, 'The ride tier could not be saved. Try again.')
})
