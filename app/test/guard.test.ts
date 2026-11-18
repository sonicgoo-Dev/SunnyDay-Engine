// Rule 1 at the door: every server function must run the session check,
// which is also what hands it its workspace. This reads every
// *.functions.ts file and fails if one makes a server function without it.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return filesUnder(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

/** The code with its comments taken out, so a commented-out check does not count. */
const code = (file: string) => readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// The only addresses that answer without a session: the host's health
// check, and sign-in itself. Adding one here is a decision, not a chore.
const OPEN_ADDRESSES = ['routes/healthz.ts', 'routes/api/auth/$.ts']

describe('server functions', () => {
  const all = filesUnder(SRC)
  const makers = all.filter((f) => code(f).includes('createServerFn('))

  it('exist (so this test is looking at something)', () => {
    expect(makers.length).toBeGreaterThan(0)
  })

  it('are only made in *.functions.ts files', () => {
    expect(makers.filter((f) => !f.endsWith('.functions.ts'))).toEqual([])
  })

  it('every one runs the signed-in check', () => {
    for (const file of makers) {
      const made = code(file).split('createServerFn(').slice(1)
      for (const [i, rest] of made.entries()) {
        // The check must be attached before the handler is.
        const beforeHandler = rest.split('.handler(')[0] ?? ''
        expect(beforeHandler, `${file} (server function ${i + 1})`).toContain('.middleware([signedInOnly')
      }
    }
  })

  it('only the health check and sign-in answer without a session', () => {
    const open = all.filter((f) => /\bhandlers\s*:/.test(code(f))).map((f) => f.slice(SRC.length + 1).split('\\').join('/'))
    expect(open.sort()).toEqual([...OPEN_ADDRESSES].sort())
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
