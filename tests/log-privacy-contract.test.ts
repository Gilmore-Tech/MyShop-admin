import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

const repositoryRoot = process.cwd()
const expectedCalls = new Map<string, number>([
  ['app/(dashboard)/analytics/page.tsx', 1],
  ['app/(dashboard)/artisan-jobs/manual-assignment/page.tsx', 3],
  ['app/(dashboard)/help/articles/page.tsx', 1],
  ['app/(dashboard)/verifications/page.tsx', 1],
  ['app/api/pdf-proxy/route.ts', 2],
  ['app/api/sms/route.ts', 3],
  ['lib/distance.ts', 1],
])

function sourceFiles(root: string): string[] {
  const result: string[] = []
  for (const name of readdirSync(root)) {
    const path = join(root, name)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      result.push(...sourceFiles(path))
    } else if (/\.(?:ts|tsx)$/.test(name) && !/\.(?:test|spec)\./.test(name)) {
      result.push(path)
    }
  }
  return result
}

function consoleCalls(source: string): string[] {
  const calls: string[] = []
  const startPattern = /\bconsole\.(?:log|info|warn|error|debug)\s*\(/g
  for (const match of source.matchAll(startPattern)) {
    const start = match.index
    if (start === undefined) continue
    let depth = 1
    let quote: "'" | '"' | '`' | null = null
    let escaped = false
    let index = start + match[0].length
    for (; index < source.length && depth > 0; index += 1) {
      const char = source[index]
      if (quote !== null) {
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === quote) {
          quote = null
        }
        continue
      }
      if (char === "'" || char === '"' || char === '`') {
        quote = char
      } else if (char === '(') {
        depth += 1
      } else if (char === ')') {
        depth -= 1
      }
    }
    assert.equal(depth, 0, 'unterminated console call')
    calls.push(source.slice(start, index))
  }
  return calls
}

test('production console inventory is exact and privacy-bounded', () => {
  const actual = new Map<string, number>()
  for (const rootName of ['app', 'lib']) {
    for (const path of sourceFiles(join(repositoryRoot, rootName))) {
      const calls = consoleCalls(readFileSync(path, 'utf8'))
      if (calls.length === 0) continue
      const relativePath = relative(repositoryRoot, path)
      actual.set(relativePath, calls.length)

      for (const call of calls) {
        assert.match(call, /^console\.(?:warn|error)\s*\(/)
        assert.doesNotMatch(
          call,
          /\b(?:phone|token|payload|url|uri|body|message|reason|userId|providerId|documentId|jobId|rideId|requestId|notificationIdentifier|actionIdentifier)\b/,
          `${relativePath} logs a private field`,
        )
        assert.doesNotMatch(
          call,
          /\b(?:err|error|e)\.(?:name|message|stack|cause)\b/,
          `${relativePath} logs a mutable or raw error field`,
        )
        assert.doesNotMatch(
          call,
          /,\s*(?:err|error|e)\s*\)$/,
          `${relativePath} logs a raw error object`,
        )

        for (const interpolation of call.matchAll(/\$\{([^}]*)\}/g)) {
          assert.ok(
            interpolation[1] === 'label' ||
              interpolation[1] === 'dropped.length',
            `${relativePath} has an unreviewed console interpolation`,
          )
        }
      }
    }
  }

  const byPath = ([left]: [string, number], [right]: [string, number]) =>
    left.localeCompare(right)
  assert.deepEqual([...actual].sort(byPath), [...expectedCalls].sort(byPath))
})

test('generic Admin error diagnostics use a fixed class', () => {
  const source = readFileSync(join(repositoryRoot, 'lib/api-client.ts'), 'utf8')
  assert.match(source, /error instanceof Error \? ['"]Error['"] : typeof error/)
  assert.doesNotMatch(source, /kind:\s*error instanceof Error \? error\.name/)
})

test('repository tooling config never embeds a GitHub credential', () => {
  const path = join(repositoryRoot, '.claude/mcp/mcp-config.json')
  const source = readFileSync(path, 'utf8')
  const config = JSON.parse(source) as {
    mcpServers: { github: { env?: Record<string, string> } }
  }

  assert.equal(config.mcpServers.github.env, undefined)
  assert.doesNotMatch(source, /gh[pousr]_[A-Za-z0-9]{20,}/)
})
