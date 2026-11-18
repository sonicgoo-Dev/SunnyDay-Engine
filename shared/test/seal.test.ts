import { describe, expect, it } from 'vitest'
import { SealError, seal, unseal } from '../src/crypto/seal.js'

const KEY = 'k'.repeat(40)
const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'

describe('sealing a mailbox connection', () => {
  it('opens again with the same key and workspace', () => {
    expect(unseal(KEY, WS_A, seal(KEY, WS_A, 'the way in'))).toBe('the way in')
  })
  it('never stores the value in a readable form, and seals differently every time', () => {
    const one = seal(KEY, WS_A, 'refresh-token-value')
    expect(one).not.toContain('refresh-token-value')
    expect(Buffer.from(one.split('.')[3]!, 'base64url').toString()).not.toContain('refresh-token-value')
    expect(seal(KEY, WS_A, 'refresh-token-value')).not.toBe(one)
  })
  it('will not open in another workspace, with another key, or after being altered', () => {
    const sealed = seal(KEY, WS_A, 'secret')
    expect(() => unseal(KEY, WS_B, sealed)).toThrow(SealError)
    expect(() => unseal('x'.repeat(40), WS_A, sealed)).toThrow(SealError)
    const parts = sealed.split('.')
    parts[3] = Buffer.from('tampered').toString('base64url')
    expect(() => unseal(KEY, WS_A, parts.join('.'))).toThrow(SealError)
    expect(() => unseal(KEY, WS_A, 'nonsense')).toThrow(SealError)
  })
  it('refuses to work without a real key, and its errors never carry the value', () => {
    expect(() => seal('', WS_A, 'secret')).toThrow(SealError)
    expect(() => seal('short', WS_A, 'secret')).toThrow(SealError)
    try {
      unseal(KEY, WS_B, seal(KEY, WS_A, 'do-not-print'))
    } catch (e) {
      expect(String(e)).not.toContain('do-not-print')
    }
  })
})
