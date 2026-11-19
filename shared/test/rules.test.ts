// The stage rules and names, as plain logic (no database).
import { describe, expect, it } from 'vitest'
import { BUYER_STAGES, CLOSED_STAGES, FOUND_BY, SELLER_STAGES, clientName, isBackward, mayMove, stagesFor, tabFor } from '../src/contacts/rules.js'

describe('stages', () => {
  it('are the master plan\'s, in its order', () => {
    expect(BUYER_STAGES).toEqual(['New', 'Written to', 'Talking', 'Pre-approved', 'Touring', 'Offer out', 'Under contract', 'Closed', 'Past client'])
    expect(SELLER_STAGES).toEqual(['New', 'Written to', 'Talking', 'Listing appointment', 'Signed', 'Listed', 'Under contract', 'Closed', 'Past client'])
    expect(CLOSED_STAGES).toEqual(['Not now', 'Not a lead', 'Gone quiet', 'Lost'])
    expect(stagesFor('buyer')).toEqual([...BUYER_STAGES, ...CLOSED_STAGES])
  })

  it('moving to an earlier stage is backward; to a later one, forward', () => {
    expect(isBackward('buyer', 'Touring', 'Talking')).toBe(true)
    expect(isBackward('buyer', 'Talking', 'Touring')).toBe(false)
    expect(isBackward('seller', 'Listed', 'Signed')).toBe(true)
  })

  it('closing someone, or reopening them, is not "moving back" (only she does either)', () => {
    expect(isBackward('buyer', 'Gone quiet', 'Talking')).toBe(false)
    expect(isBackward('buyer', 'Talking', 'Lost')).toBe(false)
  })

  it('she may move anyone anywhere; an automatic move only ever goes forward', () => {
    expect(mayMove('person', 'buyer', 'Touring', 'New')).toBe(true)
    expect(mayMove('automatic', 'buyer', 'New', 'Talking')).toBe(true)
    expect(mayMove('automatic', 'buyer', 'Touring', 'Talking')).toBe(false)
    expect(mayMove('automatic', 'buyer', 'Talking', 'Gone quiet')).toBe(false)
    expect(mayMove('automatic', 'buyer', 'Lost', 'New')).toBe(false)
    expect(mayMove('automatic', 'buyer', 'Talking', 'Talking')).toBe(false)
    expect(mayMove('person', 'buyer', 'Talking', 'Talking')).toBe(false)
    expect(mayMove('person', 'buyer', 'Lost', 'Talking')).toBe(true)
  })

  it('refuses a stage from the other side or one that does not exist', () => {
    expect(mayMove('person', 'buyer', 'New', 'Listed')).toBe(false)
    expect(mayMove('person', 'seller', 'New', 'Pre-approved')).toBe(false)
    expect(mayMove('person', 'seller', 'New', 'Nonsense')).toBe(false)
  })
})

describe('which tab a person is in', () => {
  it('New, Written to and Talking are leads; anything later is a client', () => {
    expect(tabFor({ business: false, buyerStage: 'Talking', sellerStage: null })).toEqual({ tab: 'leads', active: true })
    expect(tabFor({ business: false, buyerStage: 'Pre-approved', sellerStage: null })).toEqual({ tab: 'clients', active: true })
    expect(tabFor({ business: false, buyerStage: null, sellerStage: 'Past client' })).toEqual({ tab: 'clients', active: true })
  })

  it('a buyer and seller at once goes by the further side', () => {
    expect(tabFor({ business: false, buyerStage: 'New', sellerStage: 'Listed' })).toEqual({ tab: 'clients', active: true })
  })

  it('closed on every side sits folded away in Leads; one open side keeps them active', () => {
    expect(tabFor({ business: false, buyerStage: 'Lost', sellerStage: null })).toEqual({ tab: 'leads', active: false })
    expect(tabFor({ business: false, buyerStage: 'Lost', sellerStage: 'Talking' })).toEqual({ tab: 'leads', active: true })
  })

  it('business contacts have their own tab', () => {
    expect(tabFor({ business: true, buyerStage: null, sellerStage: null })).toEqual({ tab: 'business', active: true })
  })
})

describe('the name a client may see', () => {
  it('is the name they go by, else their first name', () => {
    expect(clientName({ fullName: 'Robert Parker', goesBy: 'Bob' })).toBe('Bob')
    expect(clientName({ fullName: '  Robert  Parker', goesBy: '  ' })).toBe('Robert')
    expect(clientName({ fullName: 'Robert Parker', goesBy: null })).toBe('Robert')
  })

  it('never the private nickname, even when one is handed in by mistake', () => {
    const withNickname = { fullName: 'Robert Parker', goesBy: null, nickname: 'Bobby Tables' } as { fullName: string; goesBy: string | null }
    expect(clientName(withNickname)).toBe('Robert')
  })
})

describe('how they found her', () => {
  it('is the approved list, with Don\'t remember as an honest answer', () => {
    expect(FOUND_BY.map((f) => f.label)).toEqual(['Referral', 'Past client', 'Friend or family', 'Your website', 'Open house', 'Sign call', 'Online listing site', 'Other', "Don't remember"])
  })
})
