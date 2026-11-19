// Rule 3 on the screens: mail goes out only from the agent's main mailbox.
// A plain "mailto:" link hands the message to whatever mail app and account
// the phone prefers (found by Eric on his iPhone, Nov 18, 2026), so the
// screens never use one. Every email link goes through gmailCompose, which
// names the main address.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { gmailCompose } from '../src/contacts/reach-links'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return filesUnder(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })

describe('email links', () => {
  it('no screen uses a plain mailto link', () => {
    const found = filesUnder(SRC).filter((f) => /mailto:/i.test(readFileSync(f, 'utf8')))
    expect(found).toEqual([])
  })

  it('open Gmail as the main address, to the person', () => {
    const url = new URL(gmailCompose('sunnyday.main@example.com', 'bob+house@example.com'))
    expect(url.origin).toBe('https://mail.google.com')
    expect(url.searchParams.get('authuser')).toBe('sunnyday.main@example.com')
    expect(url.searchParams.get('to')).toBe('bob+house@example.com')
    expect(url.searchParams.get('view')).toBe('cm')
  })
})
