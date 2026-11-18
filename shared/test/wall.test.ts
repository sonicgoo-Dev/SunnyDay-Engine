// Rule 1 of the master plan, proven against a real database: one
// workspace can never read or write another's rows, even when the code
// forgets to filter.
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WallError, assertWallHolds, type Query } from '../src/db/client.js'
import { setting, workspace } from '../src/db/schema/index.js'
import { inWorkspace } from '../src/db/workspace.js'
import { openTestDb } from './db.js'

const { db, close } = openTestDb()

/** True when the database itself refused the write (the driver wraps its message in "cause"). */
async function refusedByWall(work: Promise<unknown>): Promise<boolean> {
  try {
    await work
    return false
  } catch (e) {
    const cause = (e as { cause?: { message?: string } }).cause
    return /row-level security/.test(`${(e as Error).message} ${cause?.message ?? ''}`)
  }
}

let a = ''
let b = ''

beforeAll(async () => {
  const made = await db.insert(workspace).values([{ name: 'Agent A' }, { name: 'Agent B' }]).returning({ id: workspace.id })
  a = made[0]!.id
  b = made[1]!.id
  await inWorkspace(db, a, (tx) => tx.insert(setting).values({ workspaceId: a, name: 'colour', value: 'A-secret' }))
  await inWorkspace(db, b, (tx) => tx.insert(setting).values({ workspaceId: b, name: 'colour', value: 'B-secret' }))
})
afterAll(close)

describe('the wall between workspaces', () => {
  it('the test database user is an ordinary one, as the hosted one must be', async () => {
    await expect(assertWallHolds(db)).resolves.toBeUndefined()
  })

  it('refuses a database user that could see through the wall, or one it cannot identify', async () => {
    const answering = (rows: unknown[]) => ({ execute: async () => ({ rows }) }) as unknown as Query
    await expect(assertWallHolds(answering([{ through: true }]))).rejects.toBeInstanceOf(WallError)
    await expect(assertWallHolds(answering([{ through: null }]))).rejects.toBeInstanceOf(WallError)
    await expect(assertWallHolds(answering([]))).rejects.toBeInstanceOf(WallError)
  })

  it('a query with NO filter sees only its own workspace', async () => {
    const seenByA = await inWorkspace(db, a, (tx) => tx.select().from(setting))
    expect(seenByA.map((r) => r.value)).toEqual(['A-secret'])
    const seenByB = await inWorkspace(db, b, (tx) => tx.select().from(setting))
    expect(seenByB.map((r) => r.value)).toEqual(['B-secret'])
  })

  it("asking for another workspace's rows by id returns nothing", async () => {
    const rows = await inWorkspace(db, a, (tx) => tx.select().from(setting).where(eq(setting.workspaceId, b)))
    expect(rows).toEqual([])
  })

  it("cannot write a row into another workspace", async () => {
    expect(await refusedByWall(inWorkspace(db, a, (tx) => tx.insert(setting).values({ workspaceId: b, name: 'planted', value: 'x' })))).toBe(true)
    const planted = await inWorkspace(db, b, (tx) => tx.select().from(setting).where(eq(setting.name, 'planted')))
    expect(planted).toEqual([])
  })

  it("cannot change or delete another workspace's rows", async () => {
    await inWorkspace(db, a, async (tx) => {
      await tx.update(setting).set({ value: 'overwritten' }).where(eq(setting.workspaceId, b))
      await tx.delete(setting).where(eq(setting.workspaceId, b))
    })
    const still = await inWorkspace(db, b, (tx) => tx.select().from(setting))
    expect(still.map((r) => r.value)).toEqual(['B-secret'])
  })

  it('outside inWorkspace the tables look empty and refuse writes', async () => {
    expect(await db.select().from(setting)).toEqual([])
    expect(await refusedByWall(db.insert(setting).values({ workspaceId: a, name: 'loose', value: 'x' }))).toBe(true)
  })

  it('the workspace number does not leak to the next query on the same connection', async () => {
    await inWorkspace(db, a, (tx) => tx.select().from(setting))
    const r = await db.execute<{ v: string | null }>(sql`select nullif(current_setting('app.workspace_id', true), '') as v`)
    expect(r.rows[0]?.v ?? null).toBeNull()
  })

  it('refuses a workspace number that is not one', async () => {
    await expect(inWorkspace(db, "x' or '1'='1", async () => 1)).rejects.toThrow()
  })

  it('EVERY table in the ws schema is behind the wall', async () => {
    // Fails the day someone adds a customer table and forgets the wall.
    const r = await db.execute<{ name: string; walled: boolean; forced: boolean; has_col: boolean; policies: number; others: number }>(sql`
      select c.relname as name, c.relrowsecurity as walled, c.relforcerowsecurity as forced,
             exists (select 1 from information_schema.columns k
                     where k.table_schema = 'ws' and k.table_name = c.relname and k.column_name = 'workspace_id' and k.is_nullable = 'NO') as has_col,
             (select count(*)::int from pg_policies p where p.schemaname = 'ws' and p.tablename = c.relname and p.policyname = 'workspace_wall' and p.cmd = 'ALL') as policies,
             -- Any second policy would be OR-ed with the wall and could let rows through.
             (select count(*)::int from pg_policies p where p.schemaname = 'ws' and p.tablename = c.relname and p.policyname <> 'workspace_wall') as others
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'ws' and c.relkind in ('r', 'p')`)
    expect(r.rows.length).toBeGreaterThan(0)
    for (const t of r.rows) {
      expect(t, `ws.${t.name}`).toMatchObject({ walled: true, forced: true, has_col: true, policies: 1, others: 0 })
    }
  })
})
