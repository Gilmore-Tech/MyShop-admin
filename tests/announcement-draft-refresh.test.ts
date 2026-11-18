import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../app/(dashboard)/announcements/page.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(`${source}\nexport { ComposeDialog }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const contract = require('../lib/announcement-campaign-contract.ts')
const REGION = '11111111-1111-4111-8111-111111111111'

type Element = { type: any; props: Record<string, any> }

// Run the real composer and its dependency-aware effects without a DOM.
function mount() {
  const slots: any[] = []
  const effects: (() => void)[] = []
  let cursor = 0
  let open = true
  let regionId = REGION
  let lockedAudience: string | null = null
  const changed = (old: any[] | undefined, next: any[]) => !old || old.length !== next.length || next.some((value, index) => value !== old[index])
  const hooks = {
    useState(initial: any) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, (next: any) => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next }]
    },
    useEffect(fn: () => void, deps: any[]) {
      const index = cursor++
      if (!slots[index] || changed(slots[index].deps, deps)) {
        slots[index] = { deps }
        effects.push(fn)
      }
    },
  }
  const jsx = (type: any, props: any) => ({ type, props })
  const exports: Record<string, any> = {}
  runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === 'react') return hooks
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === '@/lib/announcement-campaign-contract') return contract
      return new Proxy({}, { get: (_target, key) => String(key) })
    },
  })
  const render = (): Element => {
    cursor = 0
    const tree = exports.ComposeDialog({
      open,
      onClose() {},
      onPublished() {},
      lockedAudience,
      audienceOptions: [],
      // Polling/focus supplies a freshly allocated array and object each time.
      regions: [{ id: regionId, name: 'Operational region' }],
      canUseCompanyWideViews: true,
    })
    for (const effect of effects.splice(0)) effect()
    return tree
  }
  render()
  return {
    render,
    setOpen(value: boolean) { open = value },
    setRegion(value: string) { regionId = value },
    setAudience(value: string) { lockedAudience = value },
  }
}

function walk(tree: any): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(walk)
  if (!tree?.props) return []
  return [tree, ...walk(tree.props.children)]
}
function field(tree: Element, placeholder: string): Element {
  const result = walk(tree).find(node => node.props.placeholder === placeholder)
  assert.ok(result, `Missing ${placeholder}`)
  return result
}
const fields = ['Message title...', 'Write your announcement...', 'Internal audit reason (not shown to recipients)...']
function typeDraft(page: ReturnType<typeof mount>) {
  fields.forEach((placeholder, index) => {
    field(page.render(), placeholder).props.onChange({ target: { value: `Unfinished draft ${index}` } })
  })
}
function expectDraft(page: ReturnType<typeof mount>, empty = false) {
  fields.forEach((placeholder, index) => {
    assert.equal(field(page.render(), placeholder).props.value, empty ? '' : `Unfinished draft ${index}`)
  })
}

test('region permission polling and focus refreshes preserve an announcement being typed', () => {
  const page = mount()
  typeDraft(page)
  // Each render models another refresh with the same region ID.
  for (let refresh = 0; refresh < 5; refresh++) {
    page.render()
    expectDraft(page)
  }
  field(page.render(), fields[1]).props.onChange({ target: { value: 'The announcement is now complete.' } })
  page.render()
  assert.equal(field(page.render(), fields[1]).props.value, 'The announcement is now complete.')
})

test('closing and reopening deliberately starts a new announcement', () => {
  const page = mount()
  typeDraft(page)
  page.setOpen(false)
  page.render()
  page.setOpen(true)
  page.render()
  expectDraft(page, true)
})

test('a different operational region resets the draft to the new scope', () => {
  const page = mount()
  typeDraft(page)
  const nextRegion = '22222222-2222-4222-8222-222222222222'
  page.setRegion(nextRegion)
  page.render()
  expectDraft(page, true)
  const regionSelect = walk(page.render()).find(node => node.type === 'Select')!
  assert.equal(regionSelect.props.value, nextRegion)
})

test('a changed role audience resets the draft and applies the new restriction', () => {
  const page = mount()
  typeDraft(page)
  page.setAudience('drivers')
  page.render()
  expectDraft(page, true)
})
