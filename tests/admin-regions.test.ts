import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { applyAdminRegionScopeHeader, canSelectAdminRegion, canUseCompanyWideViews, ADMIN_REGION_KEY } from '../lib/api-client.ts'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const compiled = ts.transpileModule(readFileSync(new URL('../components/admin/region-assignments.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const componentExports: Record<string, any> = {}
runInNewContext(compiled, {
  exports: componentExports,
  require: () => ({ jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) }),
})
function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements)
  if (!tree?.props) return []
  return [tree, ...elements(tree.props.children)]
}

test('region checkboxes allow adding and removing access without losing other selections', () => {
  let value = ['ashanti']
  const render = () => componentExports.RegionAssignments({
    regions: [{ id: 'ashanti', name: 'Ashanti' }, { id: 'bono', name: 'Bono' }],
    value, onChange: (next: string[]) => { value = next },
  })
  let inputs = elements(render()).filter(item => item.type === 'input')
  assert.equal(inputs[0].props.checked, true)
  assert.equal(inputs[1].props.checked, false)
  inputs[1].props.onChange({ target: { checked: true } })
  assert.deepEqual(Array.from(value), ['ashanti', 'bono'])
  inputs = elements(render()).filter(item => item.type === 'input')
  inputs[0].props.onChange({ target: { checked: false } })
  assert.deepEqual(Array.from(value), ['bono'])
})

test('an inactive assignment remains visible and removable', () => {
  let value = ['inactive-region']
  const tree = componentExports.RegionAssignments({ regions: [], value, onChange: (next: string[]) => { value = next } })
  const input = elements(tree).find(item => item.type === 'input')
  assert.equal(input.props.checked, true)
  input.props.onChange({ target: { checked: false } })
  assert.deepEqual(Array.from(value), [])
})

test('all named roles attach the selected operational region', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null }
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  try {
    values.set(ADMIN_REGION_KEY, 'bono')
    values.set('myshop_admin_user', JSON.stringify({ role: 'regional_manager', roles: ['regional_manager'], regionId: 'ashanti', permissions: [] }))
    assert.equal(applyAdminRegionScopeHeader(new Headers()).get('X-MyShop-Region-Id'), 'bono')
    const director = { role: 'director', roles: ['director'], regionId: null, permissions: [] }
    values.set('myshop_admin_user', JSON.stringify(director))
    assert.equal(canSelectAdminRegion(director as never), true)
    assert.equal(canUseCompanyWideViews(director as never), false)
    assert.equal(applyAdminRegionScopeHeader(new Headers()).get('X-MyShop-Region-Id'), 'bono')
    values.set(ADMIN_REGION_KEY, 'ashanti')
    assert.equal(applyAdminRegionScopeHeader(new Headers()).get('X-MyShop-Region-Id'), 'ashanti')
    values.set('myshop_admin_user', JSON.stringify({ role: 'accountant', roles: ['accountant'], regionId: null, permissions: [] }))
    assert.equal(applyAdminRegionScopeHeader(new Headers()).get('X-MyShop-Region-Id'), 'ashanti')
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})


test('region switching does not grant company-wide modes to directors or regional staff', () => {
  for (const role of ['director', 'regional_manager']) {
    const admin = { role, roles: [role], regionId: 'ashanti' } as never
    assert.equal(canSelectAdminRegion(admin), true)
    assert.equal(canUseCompanyWideViews(admin), false)
  }
  for (const role of ['super_admin', 'product_owner']) {
    assert.equal(canUseCompanyWideViews({ role, roles: [role] } as never), true)
  }
  assert.equal(canSelectAdminRegion({ role: 'accountant', roles: ['accountant', 'director'] } as never), true)
  assert.equal(canSelectAdminRegion({ role: 'director', roles: [] } as never), true)
})


test('every account role gets region switching without extra company-wide authority', () => {
  const roles = ['super_admin', 'product_owner', 'director', 'accountant', 'regional_manager', 'coordinator_rides', 'coordinator_artisan', 'back_officer', 'admin']
  for (const role of roles) {
    const admin = { role, roles: [role] } as never
    assert.equal(canSelectAdminRegion(admin), true, role)
    assert.equal(canUseCompanyWideViews(admin), ['super_admin', 'product_owner'].includes(role), role)
  }
  assert.equal(canSelectAdminRegion({ role: null, roles: [] } as never), true)
  assert.equal(canSelectAdminRegion(null), false)
})
