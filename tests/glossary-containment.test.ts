// Locks the Aug 2026 redesign glossary: banned jargon never renders, UI copy
// stays ASCII, and every sidebar label matches its page's H1. If this test
// fails, a page has drifted from the approved plain-English vocabulary -
// fix the copy (or, for a deliberate rename, change sidebar + H1 + tests
// together in one PR).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname)

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collectTsx(full, out)
    else if (name.endsWith('.tsx')) out.push(full)
  }
  return out
}

const uiFiles = [
  ...collectTsx(join(ROOT, 'app', '(dashboard)')),
  ...collectTsx(join(ROOT, 'components')),
]
const rel = (f: string) => relative(ROOT, f)

test('banned jargon never appears where it could render', () => {
  assert.ok(uiFiles.length > 60, 'file walk found the UI sources')
  // Each entry: [label, pattern]. Patterns are tuned so type/function
  // identifiers (WebhookFailureGroup, groupClawbacksByProvider) stay legal
  // while quoted copy and JSX text ('Webhook failures', >Clawbacks<) fail.
  const banned: [string, RegExp][] = [
    ['Clawback', /['"`>]Clawbacks?\b/],
    ['Webhook', /['"`>]Webhook/],
    ['Net revenue (say Kept after promos / Kept after refunds)', /Net [Rr]evenue/],
    ['Trip outcomes (say Booking outcomes)', /Trip [Oo]utcomes/],
    ['suppl. (say Extra charges)', /suppl\./],
    ['maker-checker (say: a different admin must approve)', /maker-checker/],
    ['PRD § (spec references do not render)', /PRD §/],
    ['exact-role (say: scoped to that role)', /exact-role/],
  ]
  for (const file of uiFiles) {
    const src = readFileSync(file, 'utf8')
    for (const [label, rx] of banned) {
      assert.doesNotMatch(src, rx, `${label} found in ${rel(file)}`)
    }
  }
})

test('KYC renders only as the single allowed subtitle mention', () => {
  for (const file of uiFiles) {
    let src = readFileSync(file, 'utf8')
    if (rel(file).includes('kyc-queue')) src = src.replace('(KYC)', '') // one allowed
    assert.doesNotMatch(src, /KYC/, `KYC found in ${rel(file)} - say "Client ID checks"`)
  }
})

test('UI copy is ASCII - no smart punctuation or symbol characters', () => {
  // The design language is ASCII-only. Degree signs and box-drawing comment
  // rules are tolerated; everything else in this set is a copy bug.
  const bannedChars = /[·–—‘’“”•…→↔≈≥≤₵]/
  for (const file of uiFiles) {
    const src = readFileSync(file, 'utf8')
    const m = src.match(bannedChars)
    assert.equal(m, null, `non-ASCII char ${JSON.stringify(m?.[0])} in ${rel(file)}`)
  }
})

test('every sidebar label is the H1 of the page it opens', () => {
  const sidebar = readFileSync(join(ROOT, 'components', 'app-sidebar.tsx'), 'utf8')
  const items = [...sidebar.matchAll(/title: '([^']+)',\s*href: '(\/[a-z0-9/-]+)'/g)]
    .map(m => ({ title: m[1], href: m[2] }))
  assert.ok(items.length >= 30, `sidebar parse found ${items.length} items`)

  const byHref = new Map<string, string[]>()
  for (const { title, href } of items) {
    if (href === '/dashboard') continue // Home has the greeting header, no H1
    const list = byHref.get(href)
    if (list) list.push(title)
    else byHref.set(href, [title])
  }

  for (const [href, titles] of byHref) {
    let src: string
    try {
      src = readFileSync(join(ROOT, 'app', '(dashboard)', ...href.slice(1).split('/'), 'page.tsx'), 'utf8')
    } catch {
      continue // dynamic landing paths have no literal page file
    }
    if (src.includes('redirect(')) continue // route stubs carry no H1
    // A group parent shares its href with its first child; the child label wins.
    const found = titles.some(t => src.includes(`"${t}"`) || src.includes(`'${t}'`) || src.includes(`>${t}<`))
    assert.ok(found, `page for ${href} should carry its sidebar label as H1 (one of: ${titles.join(' | ')})`)
  }
})
