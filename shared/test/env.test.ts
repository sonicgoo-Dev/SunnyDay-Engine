import { describe, expect, it } from 'vitest'
import { SettingsError, readSettings } from '../src/env.js'

const good = {
  DATABASE_URL: 'postgres://u:secret-password@localhost:5432/x',
  APP_URL: 'https://app.sunnydaycrm.com',
  SIGNIN_SECRET: 'x'.repeat(32),
  SIGNIN_GOOGLE_CLIENT_ID: 'id',
  SIGNIN_GOOGLE_CLIENT_SECRET: 'client-secret-value',
}

describe('readSettings', () => {
  it('accepts a full set and defaults the optional ones to empty', () => {
    const s = readSettings(good)
    expect(s.APP_URL).toBe('https://app.sunnydaycrm.com')
    expect(s.FIRST_INVITES).toBe('')
    expect(s.SENTRY_DSN).toBe('')
  })

  it('names every missing setting', () => {
    try {
      readSettings({})
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(SettingsError)
      const m = (e as Error).message
      for (const name of Object.keys(good)) expect(m).toContain(`${name} is not set`)
    }
  })

  it('never prints a value, even a wrong one', () => {
    try {
      readSettings({ ...good, SIGNIN_SECRET: 'too-short-secret', APP_URL: 'https://app.sunnydaycrm.com/' })
      expect.unreachable()
    } catch (e) {
      const m = (e as Error).message
      expect(m).toContain('SIGNIN_SECRET')
      expect(m).toContain('APP_URL must not end with a slash')
      expect(m).not.toContain('too-short-secret')
      expect(m).not.toContain('secret-password')
      expect(m).not.toContain('client-secret-value')
    }
  })

  it('refuses a database address that is not Postgres', () => {
    expect(() => readSettings({ ...good, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/)
  })
})
