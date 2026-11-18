// The invited list and the workspaces: what sign-in needs before any
// workspace is known. Server code only.
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, Query } from './client.js'
import { invite, membership, workspace, type Role } from './schema/index.js'

const emailShape = z.string().email()

/** One spelling per address: trimmed and lowercased. Null when it is not an email address. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase()
  return emailShape.safeParse(v).success ? v : null
}

export async function isInvited(db: Query, email: string | null | undefined): Promise<boolean> {
  const e = normalizeEmail(email)
  if (!e) return false
  const rows = await db.select({ email: invite.email }).from(invite).where(eq(invite.email, e)).limit(1)
  return rows.length === 1
}

/** Adds an address to the invited list. Safe to repeat. Returns false for something that is not an email address. */
export async function addInvite(db: Query, email: string, note?: string): Promise<boolean> {
  const e = normalizeEmail(email)
  if (!e) return false
  await db.insert(invite).values({ email: e, note: note ?? null }).onConflictDoNothing()
  return true
}

/** FIRST_INVITES: comma-separated addresses added at startup. Returns the ones that were not email addresses. */
export async function seedFirstInvites(db: Query, csv: string): Promise<string[]> {
  const bad: string[] = []
  for (const part of csv.split(',').map((p) => p.trim()).filter(Boolean)) {
    if (!(await addInvite(db, part, 'first invites'))) bad.push(part)
  }
  return bad
}

export type Member = { workspaceId: string; workspaceName: string; role: Role }

export async function membershipsOf(db: Query, userId: string): Promise<Member[]> {
  return db
    .select({ workspaceId: workspace.id, workspaceName: workspace.name, role: membership.role })
    .from(membership)
    .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
    .where(eq(membership.userId, userId))
    .orderBy(membership.createdAt)
}

/**
 * The workspace a person works in. Someone with none gets their own, as its
 * agent, the first time; asking again returns the same one. The lock makes
 * two sign-ins at the same moment produce one workspace, not two.
 */
export async function ensureWorkspace(db: Db, user: { id: string; name: string }): Promise<Member> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'ensure-workspace:' + user.id}))`)
    const existing = await membershipsOf(tx, user.id)
    if (existing[0]) return existing[0]
    const name = user.name.trim() || 'My workspace'
    const [made] = await tx.insert(workspace).values({ name }).returning({ id: workspace.id, name: workspace.name })
    if (!made) throw new Error('The workspace could not be created.')
    await tx.insert(membership).values({ workspaceId: made.id, userId: user.id, role: 'agent' })
    return { workspaceId: made.id, workspaceName: made.name, role: 'agent' }
  })
}
