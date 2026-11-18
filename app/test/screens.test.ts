import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SCREENS, SCREEN_PATHS } from '@/frame/screens'

const routeFile = (to: string) =>
  fileURLToPath(new URL(`../src/routes/_in/_frame/${to === '/' ? 'index' : to.slice(1)}.tsx`, import.meta.url))

describe('the nine screens', () => {
  it('are the master plan\'s nine, in its order', () => {
    expect(SCREENS.map((s) => s.name)).toEqual(['Today', 'Approvals', 'Contacts', 'Deals', 'Notes', 'Money', 'Website', 'Agents', 'Settings'])
    expect(SCREENS.map((s) => s.to)).toEqual([...SCREEN_PATHS])
  })

  it('each has a page behind sign-in', () => {
    for (const s of SCREENS) expect(existsSync(routeFile(s.to)), s.name).toBe(true)
  })

  it('each says honestly what is coming, with no technical words and no exclamation marks', () => {
    for (const s of SCREENS) {
      expect(s.soon.length, s.name).toBeGreaterThan(20)
      expect(s.soon, s.name).not.toMatch(/!|token|schema|cron|migration|API|database/i)
    }
  })
})
