import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AiPausedError, DEFAULT_AI_LIMIT_CENTS, aiBudget, monthStart, setAiLimit, withAiBudget } from '../src/ai/spend.js'
import { aiSpend, workspace } from '../src/db/schema/index.js'
import { inWorkspace } from '../src/db/workspace.js'
import { openTestDb } from './db.js'

const { db, close } = openTestDb()
let a = ''
let b = ''
beforeAll(async () => {
  const made = await db.insert(workspace).values([{ name: 'Spender' }, { name: 'Saver' }]).returning({ id: workspace.id })
  a = made[0]!.id
  b = made[1]!.id
})
afterAll(close)

const pretendAgent = (costDollars: number) => async () => ({ result: 'a draft', costDollars })

describe('the monthly AI spending limit', () => {
  it('starts at the default, with nothing spent', async () => {
    expect(await aiBudget(db, a)).toEqual({ limitCents: DEFAULT_AI_LIMIT_CENTS, spentCents: 0, paused: false })
  })

  it('counts what each call cost, to the fraction of a cent', async () => {
    await setAiLimit(db, a, 100)
    expect(await withAiBudget(db, a, 'pretend', pretendAgent(0.0123))).toBe('a draft')
    await withAiBudget(db, a, 'pretend', pretendAgent(0.5))
    expect((await aiBudget(db, a)).spentCents).toBeCloseTo(51.23, 4)
  })

  it('at the limit the agents pause: the call is refused BEFORE any money is spent, with a plain message', async () => {
    await withAiBudget(db, a, 'pretend', pretendAgent(0.6))
    expect(await aiBudget(db, a)).toMatchObject({ limitCents: 100, paused: true })
    let called = false
    const attempt = withAiBudget(db, a, 'pretend', async () => {
      called = true
      return { result: 'x', costDollars: 1 }
    })
    await expect(attempt).rejects.toBeInstanceOf(AiPausedError)
    await expect(attempt).rejects.toThrow(/limit \(\$1\.00\) has been reached.*paused/)
    expect(called).toBe(false)
  })

  it("one workspace's spending never pauses another", async () => {
    expect(await aiBudget(db, b)).toMatchObject({ spentCents: 0, paused: false })
    expect(await withAiBudget(db, b, 'pretend', pretendAgent(0.01))).toBe('a draft')
  })

  it('raising the limit starts the agents again; a limit of $0 switches them off', async () => {
    await setAiLimit(db, a, 500)
    expect((await aiBudget(db, a)).paused).toBe(false)
    await setAiLimit(db, b, 0)
    await expect(withAiBudget(db, b, 'pretend', pretendAgent(0.01))).rejects.toBeInstanceOf(AiPausedError)
    await expect(setAiLimit(db, a, -1)).rejects.toThrow(RangeError)
    await expect(setAiLimit(db, a, 20001)).rejects.toThrow(RangeError)
    await expect(setAiLimit(db, a, 12.5)).rejects.toThrow(RangeError)
  })

  it("last month's spending does not count against this month", async () => {
    const lastMonth = new Date(monthStart().getTime() - 86_400_000)
    await inWorkspace(db, a, (tx) => tx.insert(aiSpend).values({ workspaceId: a, agent: 'pretend', micros: 9_000_000_000, spentAt: lastMonth }))
    expect((await aiBudget(db, a)).paused).toBe(false)
  })
})
