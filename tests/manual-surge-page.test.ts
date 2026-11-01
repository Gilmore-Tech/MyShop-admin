import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../app/(dashboard)/manual-surge/page.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText

type Element = { type: unknown; props: Record<string, any> }
const rule = {
  id: 'rule-1', name: 'Concert', isActive: true, multiplier: '1.50',
  regionId: 'ashanti', region: { id: 'ashanti', name: 'Ashanti', code: 'ASH' },
  centerLat: 6.69, centerLng: -1.62, radiusMeters: 1000,
  createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z',
}

// Exercise the page's async handlers with controlled hooks and API responses.
// Maps and UI primitives remain elements so their event handlers can be invoked.
function mount(api: Record<string, any>) {
  const state: any[] = []
  const effects: (() => void)[] = []
  let cursor = 0
  let firstRender = true
  const jsx = (type: unknown, props: Record<string, any>) => ({ type, props })
  const hooks = {
    useState(initial: unknown) {
      const slot = cursor++
      if (!(slot in state)) state[slot] = initial
      return [state[slot], (value: any) => { state[slot] = typeof value === 'function' ? value(state[slot]) : value }]
    },
    useRef(initial: unknown) {
      const slot = cursor++
      if (!(slot in state)) state[slot] = { current: initial }
      return state[slot]
    },
    useEffect(effect: () => void) { if (firstRender) effects.push(effect) },
    useCallback(callback: unknown) { return callback },
  }
  const exports: Record<string, any> = {}
  runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === 'react') return hooks
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === '@/lib/api') return api
      if (name === '@/lib/api-client') return { userSafeAdminError: (_error: unknown, fallback: string) => fallback }
      if (name === '@/components/admin/admin-region-scope') return {
        useAdminRegionScope: () => ({ activeRegionId: 'ashanti', regions: [{ ...rule.region, ridesEnabled: true }] }),
      }
      return new Proxy({}, { get: (_target, key) => String(key) })
    },
  })
  const Controls = exports.default().props.children.type
  function render(): Element {
    cursor = 0
    const tree = Controls()
    if (firstRender) {
      firstRender = false
      for (const effect of effects) effect()
    }
    return tree
  }
  render()
  return { render }
}

function elements(tree: any): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(elements)
  if (!tree || typeof tree !== 'object' || !tree.props) return []
  return [tree, ...elements(tree.props.children)]
}
function content(tree: any): string {
  if (Array.isArray(tree)) return tree.map(content).join('')
  if (tree && typeof tree === 'object') return content(tree.props?.children)
  return tree == null || typeof tree === 'boolean' ? '' : String(tree)
}
function button(tree: Element, label: string) {
  const found = elements(tree).find(item => item.type === 'Button' && content(item) === label)
  assert.ok(found, `Expected button: ${label}`)
  return found
}
async function settle() { await new Promise(resolve => setImmediate(resolve)) }

test('surge controls load in the active region before the creation form', async () => {
  let requestedRegion: unknown
  const page = mount({ listManualSurges: async (region: unknown) => { requestedRegion = region; return [rule] } })
  await settle()
  const tree = page.render()
  assert.equal(requestedRegion, 'ashanti')
  assert.match(content(tree), /1 enabled · 0 disabled/)
  assert.ok(content(tree).indexOf('View details') < content(tree).indexOf('Enable manual surge'))
  assert.equal(button(tree, 'Disable').props.disabled, false)
})

test('a confirmed disable stays visible when the list refresh fails', async () => {
  let reads = 0
  const writes: unknown[] = []
  const page = mount({
    listManualSurges: async () => { if (++reads > 1) throw Error('offline'); return [rule] },
    toggleManualSurge: async (id: string, isActive: boolean) => { writes.push([id, isActive]); return { ...rule, isActive } },
  })
  await settle()
  await button(page.render(), 'Disable').props.onClick()
  await settle()
  const tree = page.render()
  assert.deepEqual(writes, [['rule-1', false]])
  assert.match(content(tree), /Concert disabled/)
  assert.match(content(tree), /0 enabled · 1 disabled/)
  assert.ok(button(tree, 'Enable'))
  assert.match(content(tree), /Could not load manual surge/)
})

test('coverage and disable remain accessible if activity cannot load', async () => {
  const page = mount({ listManualSurges: async () => [rule], getManualSurge: async () => { throw Error('offline') } })
  await settle()
  await button(page.render(), 'View details').props.onClick()
  await settle()
  const tree = page.render()
  assert.match(content(tree), /Centre: 6.69000, -1.62000/)
  assert.ok(button(tree, 'Disable this surge'))
  assert.ok(button(tree, 'Retry activity'))
})

test('details show recorded actor and reason; closing ignores a late response', async () => {
  let resolveDetail: (value: unknown) => void = () => {}
  const page = mount({
    listManualSurges: async () => [rule],
    getManualSurge: () => new Promise(resolve => { resolveDetail = resolve }),
  })
  await settle()
  button(page.render(), 'View details').props.onClick()
  resolveDetail({ ...rule, activity: [{ id: 'event', action: 'manual_surge_enabled', admin: { fullName: 'Operator' }, createdAt: rule.createdAt, details: { reason: 'Event traffic' } }] })
  await settle()
  assert.match(content(page.render()), /Enabled by Operator/)
  assert.match(content(page.render()), /Reason: Event traffic/)
  button(page.render(), 'View details').props.onClick()
  button(page.render(), 'Close details').props.onClick()
  resolveDetail({ ...rule, activity: [] })
  await settle()
  assert.doesNotMatch(content(page.render()), /Activity history/)
})


test('a disabled application can be re-enabled', async () => {
  const writes: unknown[] = []
  const page = mount({
    listManualSurges: async () => [{ ...rule, isActive: false }],
    toggleManualSurge: async (id: string, isActive: boolean) => { writes.push([id, isActive]); return { ...rule, isActive } },
  })
  await settle()
  button(page.render(), 'Enable').props.onClick()
  await settle()
  assert.deepEqual(writes, [['rule-1', true]])
  assert.match(content(page.render()), /Concert enabled/)
})

test('a newly created application remains manageable when the refresh fails', async () => {
  let reads = 0
  const page = mount({
    listManualSurges: async () => { if (++reads > 1) throw Error('offline'); return [] },
    createManualSurge: async () => rule,
  })
  await settle()
  const map = elements(page.render()).find(item => item.type === 'SurgeAreaMap')!
  map.props.onChange({ lat: rule.centerLat, lng: rule.centerLng })
  const form = elements(page.render()).find(item => item.type === 'form')!
  await form.props.onSubmit({ preventDefault() {} })
  await settle()
  const tree = page.render()
  assert.match(content(tree), /Concert enabled/)
  assert.ok(button(tree, 'Disable'))
})
