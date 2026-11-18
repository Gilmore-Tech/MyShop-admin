import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../app/(dashboard)/configuration/page.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
const REGION = '11111111-1111-4111-8111-111111111111'
type Element = { type: any; props: Record<string, any> }

function mount(hasOverride = false, companyWide = true) {
  const slots: any[] = []
  let cursor = 0
  const pending: (() => void)[] = []
  const writes: any[][] = []
  const removals: any[][] = []
  const reads: any[] = []
  let platform = '20'
  let value = '20'
  let overridden = hasOverride
  const changed = (old: any[] | undefined, next: any[]) => !old || old.length !== next.length || next.some((v, i) => old[i] !== v)
  const hooks = {
    useState(initial: any) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, (next: any) => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next }]
    },
    useCallback(fn: any, deps: any[]) {
      const index = cursor++
      if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { deps, fn }
      return slots[index].fn
    },
    useEffect(fn: () => void, deps: any[]) {
      const index = cursor++
      if (!slots[index] || changed(slots[index].deps, deps)) { slots[index] = { deps }; pending.push(fn) }
    },
  }
  const jsx = (type: any, props: any) => ({ type, props })
  const exports: Record<string, any> = {}
  runInNewContext(compiled, {
    exports,
    window: { addEventListener() {}, removeEventListener() {}, confirm: () => true },
    require(name: string) {
      if (name === 'react') return hooks
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === '@/components/admin/admin-region-scope') return { useAdminRegionScope: () => ({ activeRegionId: REGION, activeRegion: { id: REGION, name: 'Bono' }, canUseCompanyWideViews: companyWide }) }
      if (name === '@/lib/money') return { formatGhs: (n: number) => String(n) }
      if (name === '@/lib/api') return {
        getAllConfig: async (regionId?: string) => {
          reads.push(regionId)
          return [
            { key: 'commission_rate_percent', value: regionId && overridden ? value : platform, platformValue: platform, hasOverride: !!regionId && overridden, regionalEditable: true },
            { key: 'provider_commission_window_hours', value: '48', platformValue: '48', hasOverride: false, regionalEditable: false },
          ]
        },
        updateConfig: async (...args: any[]) => {
          writes.push(args)
          if (args[2]) { value = args[1]; overridden = true }
          else platform = args[1]
        },
        removeRegionConfigOverride: async (...args: any[]) => { removals.push(args); overridden = false },
      }
      return new Proxy({}, { get: (_target, key) => String(key) })
    },
  })
  const render = (): Element => {
    cursor = 0
    const tree = exports.default()
    for (const effect of pending.splice(0)) effect()
    return tree
  }
  render()
  return { render, writes, removals, reads }
}
function walk(tree: any): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(walk)
  if (!tree?.props) return []
  return [tree, ...walk(tree.props.children), ...walk(tree.props.actions)]
}
function field(tree: Element, key: string): Element {
  const found = walk(tree).find(node => node.type?.name === 'ConfigField' && node.props.configKey === key)
  assert.ok(found, `Expected field ${key}`)
  return found
}
function component(tree: Element, name: string): Element {
  const found = walk(tree).find(node => node.type === name)
  assert.ok(found, `Expected ${name}`)
  return found
}
const settle = () => new Promise(resolve => setImmediate(resolve))

test('Marketplace settings defaults to the selected region and leaves provider-wide controls read-only', async () => {
  const page = mount()
  await settle()
  const tree = page.render()
  assert.equal(page.reads[0], REGION)
  assert.equal(field(tree, 'commissionRatePercent').props.disabled, false)
  assert.equal(field(tree, 'providerCommissionWindowHours').props.disabled, true)
  assert.equal(field(tree, 'providerCommissionWindowHours').props.disabledReason, 'Platform-wide')
})

test('saving a regional edit writes only the selected region and preserves platform defaults', async () => {
  const page = mount()
  await settle()
  field(page.render(), 'commissionRatePercent').props.onChange('commissionRatePercent', '12.5')
  await component(page.render(), 'ConfirmDialog').props.onConfirm()
  assert.deepEqual(page.writes, [['commission_rate_percent', '12.5', REGION]])
  assert.match(component(page.render(), 'ConfirmDialog').props.description, /Bono only/)
})

test('removing an override is saved even when it equals the current platform default', async () => {
  const page = mount(true)
  await settle()
  const before = field(page.render(), 'commissionRatePercent')
  assert.equal(before.props.hasOverride, true)
  before.props.onInherit()
  const dirty = page.render()
  const save = walk(dirty).find(node => node.type === 'Button' && node.props.variant === 'brand')!
  assert.equal(save.props.disabled, false)
  await component(dirty, 'ConfirmDialog').props.onConfirm()
  assert.deepEqual(page.removals, [[REGION, 'commission_rate_percent']])
  assert.equal(page.writes.length, 0)
  assert.equal(field(page.render(), 'commissionRatePercent').props.hasOverride, false)
})

test('platform defaults require an explicit scope change and use the global route', async () => {
  const page = mount()
  await settle()
  component(page.render(), 'Select').props.onValueChange('global')
  page.render()
  await settle()
  const tree = page.render()
  assert.equal(field(tree, 'providerCommissionWindowHours').props.disabled, false)
  field(tree, 'commissionRatePercent').props.onChange('commissionRatePercent', '30')
  await component(page.render(), 'ConfirmDialog').props.onConfirm()
  assert.equal(page.writes[0][0], 'commission_rate_percent')
  assert.equal(page.writes[0][1], '30')
  assert.equal(page.writes[0][2], undefined)
})

test('regional operators are not offered the platform-defaults option', async () => {
  const page = mount(false, false)
  await settle()
  const choices = walk(page.render()).filter(node => node.type === 'SelectItem').map(node => node.props.value)
  assert.ok(choices.includes('region'))
  assert.ok(!choices.includes('global'))
})
