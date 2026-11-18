// Rule 1 at the door: every server function must run the session check,
// which is also what hands it its workspace. This reads every
// *.functions.ts file and fails if one makes a server function without it.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

function functionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return functionFiles(path)
    return name.endsWith('.functions.ts') ? [path] : []
  })
}

describe('server functions', () => {
  const files = functionFiles(SRC)

  it('exist (so this test is looking at something)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('every one runs the signed-in check', () => {
    for (const file of files) {
      const code = readFileSync(file, 'utf8')
      const made = code.split('createServerFn(').slice(1)
      for (const [i, rest] of made.entries()) {
        // The check must be attached before the handler is.
        const beforeHandler = rest.split('.handler(')[0] ?? ''
        expect(beforeHandler, `${file} (server function ${i + 1})`).toContain('.middleware([signedInOnly')
      }
    }
  })

  it('no page or component opens the database itself', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx$/.test(name) && /db\.server|@sunnyday\/shared/.test(readFileSync(path, 'utf8'))) offenders.push(path)
      }
    }
    walk(SRC)
    expect(offenders).toEqual([])
  })
})
