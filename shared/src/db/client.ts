// One way to open the database, for the app, the worker and the scripts.
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import pg from 'pg'
import * as schema from './schema/index.js'

export type Db = NodePgDatabase<typeof schema>
/** A Db or a transaction on one: what every query function accepts. */
export type Query = Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'execute'>

export type OpenDb = { db: Db; pool: pg.Pool; close: () => Promise<void> }

export function openDb(databaseUrl: string, max = 10): OpenDb {
  // Render's hosted database needs TLS; a database on this computer does not.
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl)
  const pool = new pg.Pool({ connectionString: databaseUrl, max, ...(local ? {} : { ssl: { rejectUnauthorized: false } }) })
  const db = drizzle(pool, { schema })
  return { db, pool, close: () => pool.end() }
}

export class WallError extends Error {
  constructor() {
    super('This database user can see through the wall between workspaces (it is a superuser or has BYPASSRLS). Use an ordinary database user.')
    this.name = 'WallError'
  }
}

/** Rule 1: refuse to run as a database user the wall does not apply to. */
export async function assertWallHolds(db: Query): Promise<void> {
  const r = await db.execute<{ through: boolean }>(
    sql`select (rolsuper or rolbypassrls) as through from pg_roles where rolname = current_user`,
  )
  if (r.rows[0]?.through !== false) throw new WallError()
}
