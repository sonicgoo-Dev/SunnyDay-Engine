// Rule 8: every workspace has its own monthly AI spending limit. Every AI
// call goes through withAiBudget: it refuses before spending when the
// month's limit is reached, and records what the call cost afterwards.
import { and, eq, gte, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { aiSpend, setting } from '../db/schema/index.js'
import { inWorkspace } from '../db/workspace.js'

export const DEFAULT_AI_LIMIT_CENTS = 2000
export const MAX_AI_LIMIT_CENTS = 20000
const LIMIT_SETTING = 'ai_limit_cents'
const MICROS_PER_CENT = 10_000

export type AiBudget = { limitCents: number; spentCents: number; paused: boolean }

export class AiPausedError extends Error {
  constructor(readonly budget: AiBudget) {
    super(`This month's AI spending limit ($${(budget.limitCents / 100).toFixed(2)}) has been reached, so the agents are paused. Raise the limit in Settings, or they start again on the 1st.`)
    this.name = 'AiPausedError'
  }
}

/** The first moment of the current month, in UTC. Spending is counted from here. */
export const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

export async function aiBudget(db: Db, workspaceId: string, now = new Date()): Promise<AiBudget> {
  return inWorkspace(db, workspaceId, async (tx) => {
    const [row] = await tx.select({ value: setting.value }).from(setting).where(and(eq(setting.workspaceId, workspaceId), eq(setting.name, LIMIT_SETTING)))
    const stored = row ? Number(row.value) : Number.NaN
    const limitCents = Number.isInteger(stored) && stored >= 0 ? stored : DEFAULT_AI_LIMIT_CENTS
    const [sum] = await tx
      .select({ micros: sql<string>`coalesce(sum(${aiSpend.micros}), 0)` })
      .from(aiSpend)
      .where(and(eq(aiSpend.workspaceId, workspaceId), gte(aiSpend.spentAt, monthStart(now))))
    const spentCents = Number(sum?.micros ?? 0) / MICROS_PER_CENT
    return { limitCents, spentCents, paused: spentCents >= limitCents }
  })
}

/** Sets the monthly limit in whole cents, between $0 (agents off) and $200. */
export async function setAiLimit(db: Db, workspaceId: string, cents: number): Promise<void> {
  if (!Number.isInteger(cents) || cents < 0 || cents > MAX_AI_LIMIT_CENTS) throw new RangeError('The limit must be between $0 and $200.')
  await inWorkspace(db, workspaceId, (tx) =>
    tx
      .insert(setting)
      .values({ workspaceId, name: LIMIT_SETTING, value: String(cents) })
      .onConflictDoUpdate({ target: [setting.workspaceId, setting.name], set: { value: String(cents), updatedAt: sql`now()` } }),
  )
}

/**
 * Runs one AI call inside the budget. `call` returns its result and what it
 * cost in dollars. Throws AiPausedError, before calling, at the limit.
 */
export async function withAiBudget<T>(db: Db, workspaceId: string, agent: string, call: () => Promise<{ result: T; costDollars: number }>): Promise<T> {
  const budget = await aiBudget(db, workspaceId)
  if (budget.paused) throw new AiPausedError(budget)
  const { result, costDollars } = await call()
  const micros = Math.max(0, Math.round(costDollars * 100 * MICROS_PER_CENT))
  await inWorkspace(db, workspaceId, (tx) => tx.insert(aiSpend).values({ workspaceId, agent, micros }))
  return result
}
