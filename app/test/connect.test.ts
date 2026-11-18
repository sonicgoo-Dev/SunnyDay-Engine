import { describe, expect, it } from 'vitest'
import { makeState, readState } from '@/mail/connect.server'
import { secondMailboxInput, usualServerFor } from '@/settings/settings.schema'

const SECRET = 's'.repeat(40)
const good = { ws: '11111111-1111-4111-8111-111111111111', uid: 'user-1', exp: Date.now() + 60_000, n: 'nonce' }

describe('the note that travels to Google and back', () => {
  it('comes back as it left', () => {
    expect(readState(SECRET, makeState(SECRET, good))).toEqual(good)
  })
  it('is refused when altered, forged, signed with another key, or late', () => {
    const state = makeState(SECRET, good)
    const [body, mac] = state.split('.')
    const forged = Buffer.from(JSON.stringify({ ...good, ws: '22222222-2222-4222-8222-222222222222' })).toString('base64url')
    expect(readState(SECRET, `${forged}.${mac}`)).toBeNull()
    expect(readState(SECRET, `${body}.${mac!.slice(0, -2)}xx`)).toBeNull()
    expect(readState('other'.repeat(10), state)).toBeNull()
    expect(readState(SECRET, makeState(SECRET, { ...good, exp: Date.now() - 1 }))).toBeNull()
    expect(readState(SECRET, null)).toBeNull()
    expect(readState(SECRET, 'nonsense')).toBeNull()
  })
})

describe('the second-mailbox form', () => {
  it('fills in the usual mail server from the address', () => {
    expect(usualServerFor('Amy@Olypen.com ')).toBe('imap.olypen.com')
    expect(usualServerFor('not an address')).toBe('')
  })
  it('tidies the address and refuses an empty password', () => {
    expect(secondMailboxInput.parse({ address: ' Amy@Olypen.com', password: 'p', server: 'IMAP.olypen.com' })).toEqual({ address: 'amy@olypen.com', password: 'p', server: 'imap.olypen.com' })
    expect(secondMailboxInput.safeParse({ address: 'amy@olypen.com', password: '', server: 'imap.olypen.com' }).success).toBe(false)
  })
})
