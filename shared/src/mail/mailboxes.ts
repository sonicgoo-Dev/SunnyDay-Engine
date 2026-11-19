// Connected mailboxes: saving a connection, reading one, and disconnecting.
// Everything here runs inside inWorkspace, so one workspace can never read
// or use another's mailbox.
import { and, eq, inArray, sql } from 'drizzle-orm'
import { seal, unseal } from '../crypto/seal.js'
import type { Db } from '../db/client.js'
import { mailMessage, mailbox, type MailboxKind, type MailboxRole, type MailboxStatus } from '../db/schema/index.js'
import { inWorkspace } from '../db/workspace.js'
import { enqueue } from '../jobs/queue.js'
import { messageIdsSince, messageSummary, paceAs, type MessageSummary } from './gmail.js'
import { ImapSignInRefused, NO_FOLDER, imapWayIn, readImapInbox, type ImapReader, type ImapWayIn } from './imap.js'
import { ReconnectNeeded, accessTokenFrom, revoke, type Fetch, type GoogleClient } from './google-token.js'

export const READ_MAILBOX = 'mail.read'
/** How often a connected mailbox is read. */
export const READ_EVERY_MINUTES = 5
/** A first read looks back this far. The List Builder (Build 4) is what reads years. */
const FIRST_READ_DAYS = 14
/** At most this many messages a turn, so one full mailbox never holds up other workspaces. */
const PER_TURN = 150

export type MailboxView = { id: string; kind: MailboxKind; role: MailboxRole; address: string; status: MailboxStatus; lastReadAt: Date | null; lastProblem: string | null; canReadContacts: boolean }

const view = {
  id: mailbox.id,
  kind: mailbox.kind,
  role: mailbox.role,
  address: mailbox.address,
  status: mailbox.status,
  lastReadAt: mailbox.lastReadAt,
  lastProblem: mailbox.lastProblem,
  canReadContacts: mailbox.canReadContacts,
}

/** What Settings shows. Never the stored way in. */
export async function listMailboxes(db: Db, workspaceId: string): Promise<MailboxView[]> {
  return inWorkspace(db, workspaceId, (tx) => tx.select(view).from(mailbox).orderBy(mailbox.createdAt))
}

export const readJob = (workspaceId: string, mailboxId: string, runAt = new Date()) => ({
  workspaceId,
  kind: READ_MAILBOX,
  payload: { mailboxId },
  dedupe: mailboxId,
  runAt,
})

export class SecondMainMailbox extends Error {
  constructor(readonly existing: string) {
    super(`This workspace already sends from ${existing}. Disconnect it first to change which Gmail account SunnyDay uses.`)
    this.name = 'SecondMainMailbox'
  }
}

/**
 * Saves a Gmail connection as the workspace's main mailbox (rule 3: one
 * mailbox mail goes out from) and queues its first read. Connecting the
 * same address again replaces the stored way in.
 */
export async function saveGmailConnection(db: Db, connectionKey: string, workspaceId: string, c: { address: string; refreshToken: string; canReadContacts?: boolean }): Promise<string> {
  const canReadContacts = c.canReadContacts ?? false
  const sealed = seal(connectionKey, workspaceId, c.refreshToken)
  return inWorkspace(db, workspaceId, async (tx) => {
    const mains = await tx.select({ address: mailbox.address }).from(mailbox).where(eq(mailbox.role, 'main'))
    const other = mains.find((m) => m.address !== c.address)
    if (other) throw new SecondMainMailbox(other.address)
    const [saved] = await tx
      .insert(mailbox)
      .values({ workspaceId, kind: 'gmail', role: 'main', address: c.address, sealed, canReadContacts })
      // If this address was the read-only second mailbox, it becomes the main one, read afresh.
      .onConflictDoUpdate({
        target: [mailbox.workspaceId, mailbox.address],
        set: { sealed, kind: 'gmail', role: 'main', status: 'connected', lastProblem: null, canReadContacts, cursor: sql`case when ${mailbox.kind} = 'gmail' then ${mailbox.cursor} else '{}'::jsonb end` },
      })
      .returning({ id: mailbox.id })
    await enqueue(tx, readJob(workspaceId, saved!.id))
    return saved!.id
  })
}

/**
 * Saves a second mailbox as read only (rule 3). The way in is tried first:
 * a wrong password or server name is refused here and nothing is stored.
 */
export async function saveImapConnection(deps: { db: Db; connectionKey: string; imap?: ImapReader }, workspaceId: string, address: string, wayIn: ImapWayIn): Promise<string> {
  const checked = imapWayIn.parse(wayIn)
  const read = deps.imap ?? readImapInbox
  // Reads nothing (cap 0): only proves the sign-in works and notes where the inbox stands.
  await read(checked, {}, { firstReadSince: new Date(Date.now() - FIRST_READ_DAYS * 86_400_000), cap: 0 })
  const sealed = seal(deps.connectionKey, workspaceId, JSON.stringify(checked))
  return inWorkspace(deps.db, workspaceId, async (tx) => {
    const [saved] = await tx
      .insert(mailbox)
      .values({ workspaceId, kind: 'imap', role: 'read_only', address: address.trim().toLowerCase(), sealed })
      .onConflictDoUpdate({ target: [mailbox.workspaceId, mailbox.address], set: { sealed, kind: 'imap', role: 'read_only', status: 'connected', lastProblem: null, canReadContacts: false, cursor: {} } })
      .returning({ id: mailbox.id })
    await enqueue(tx, readJob(workspaceId, saved!.id))
    return saved!.id
  })
}

export type ReadResult = { outcome: 'read'; added: number; more: boolean } | { outcome: 'needs_reconnect' } | { outcome: 'gone' }

/**
 * Reads one mailbox: asks Gmail for what is new since last time and keeps a
 * short summary of each message. Changes nothing in the mailbox. Network
 * calls happen outside any database transaction.
 */
export async function readMailbox(deps: { db: Db; connectionKey: string; google: GoogleClient; fetch: Fetch; imap?: ImapReader; now?: () => Date }, workspaceId: string, mailboxId: string): Promise<ReadResult> {
  const { db, connectionKey, google } = deps
  const now = deps.now ?? (() => new Date())
  const [box] = await inWorkspace(db, workspaceId, (tx) => tx.select().from(mailbox).where(eq(mailbox.id, mailboxId)))
  if (!box || box.status !== 'connected') return { outcome: 'gone' }
  if (box.kind === 'imap') return readImapBox(deps, workspaceId, box, now())

  try {
    const accessToken = await accessTokenFrom(deps.fetch, google, unseal(connectionKey, workspaceId, box.sealed))
    paceAs(accessToken, mailboxId)
    const afterMs = box.cursor.afterMs ?? now().getTime() - FIRST_READ_DAYS * 86_400_000
    // A minute of overlap, so nothing that arrived mid-read is missed; duplicates are ignored on insert.
    const ids = await messageIdsSince(deps.fetch, accessToken, afterMs - 60_000)
    const known = new Set<string>()
    for (let i = 0; i < ids.length; i += 1000) {
      const some = ids.slice(i, i + 1000)
      const rows = await inWorkspace(db, workspaceId, (tx) =>
        tx.select({ providerId: mailMessage.providerId }).from(mailMessage).where(and(eq(mailMessage.mailboxId, mailboxId), inArray(mailMessage.providerId, some))),
      )
      for (const r of rows) known.add(r.providerId)
    }
    const fresh = ids.filter((id) => !known.has(id))
    const batch = fresh.slice(0, PER_TURN)
    const summaries: MessageSummary[] = []
    for (const id of batch) summaries.push(await messageSummary(deps.fetch, accessToken, id))

    const more = fresh.length > batch.length
    const newest = summaries.reduce((max, s) => Math.max(max, s.sentAt.getTime()), afterMs)
    await inWorkspace(db, workspaceId, async (tx) => {
      if (summaries.length) await tx.insert(mailMessage).values(summaries.map((s) => ({ ...s, workspaceId, mailboxId }))).onConflictDoNothing()
      await tx
        .update(mailbox)
        // Caught up: next time start from now. Still catching up: start from the newest one kept.
        .set({ cursor: { afterMs: more ? newest : Math.max(newest, now().getTime() - 60_000) }, lastReadAt: sql`now()`, lastProblem: null })
        .where(eq(mailbox.id, mailboxId))
    })
    return { outcome: 'read', added: summaries.length, more }
  } catch (err) {
    if (!(err instanceof ReconnectNeeded)) throw err
    await inWorkspace(db, workspaceId, (tx) =>
      tx.update(mailbox).set({ status: 'needs_reconnect', lastProblem: 'Google no longer accepts this connection.' }).where(eq(mailbox.id, mailboxId)),
    )
    return { outcome: 'needs_reconnect' }
  }
}

async function readImapBox(
  deps: { db: Db; connectionKey: string; imap?: ImapReader },
  workspaceId: string,
  box: typeof mailbox.$inferSelect,
  now: Date,
): Promise<ReadResult> {
  const read = deps.imap ?? readImapInbox
  try {
    const wayIn = imapWayIn.parse(JSON.parse(unseal(deps.connectionKey, workspaceId, box.sealed)))
    const firstReadSince = new Date(now.getTime() - FIRST_READ_DAYS * 86_400_000)
    const got = await read(wayIn, { uidValidity: box.cursor.uidValidity, lastUid: box.cursor.lastUid }, { firstReadSince, cap: PER_TURN, folder: 'inbox' })
    const inbox = { uidValidity: got.uidValidity, lastUid: got.lastUid }
    await inWorkspace(deps.db, workspaceId, async (tx) => {
      if (got.messages.length) await tx.insert(mailMessage).values(got.messages.map((s) => ({ ...s, workspaceId, mailboxId: box.id }))).onConflictDoNothing()
      await tx
        .update(mailbox)
        .set({ cursor: { ...inbox, ...(box.cursor.sent ? { sent: box.cursor.sent } : {}) }, lastReadAt: sql`now()`, lastProblem: null })
        .where(eq(mailbox.id, box.id))
    })
    // Then what she sent from this address (Eric, Nov 18, 2026), so her replies show in each person's story. Read only, like the inbox.
    const sent = await read(wayIn, box.cursor.sent ?? {}, { firstReadSince, cap: PER_TURN, folder: 'sent' })
    if (sent.uidValidity !== NO_FOLDER) {
      await inWorkspace(deps.db, workspaceId, async (tx) => {
        if (sent.messages.length) await tx.insert(mailMessage).values(sent.messages.map((s) => ({ ...s, workspaceId, mailboxId: box.id }))).onConflictDoNothing()
        await tx
          .update(mailbox)
          .set({ cursor: { ...inbox, sent: { uidValidity: sent.uidValidity, lastUid: sent.lastUid } } })
          .where(eq(mailbox.id, box.id))
      })
    }
    return { outcome: 'read', added: got.messages.length + sent.messages.length, more: got.more || sent.more }
  } catch (err) {
    if (!(err instanceof ImapSignInRefused)) throw err
    await inWorkspace(deps.db, workspaceId, (tx) =>
      tx.update(mailbox).set({ status: 'needs_reconnect', lastProblem: 'The mail server no longer accepts the saved password.' }).where(eq(mailbox.id, box.id)),
    )
    return { outcome: 'needs_reconnect' }
  }
}

/**
 * Disconnects a mailbox: asks Google to forget the permission, then removes
 * the stored way in and the summaries read from it. Nothing in the mailbox
 * itself is touched. Returns false when there was no such mailbox.
 */
export async function disconnectMailbox(deps: { db: Db; connectionKey: string; fetch: Fetch }, workspaceId: string, mailboxId: string): Promise<boolean> {
  const [box] = await inWorkspace(deps.db, workspaceId, (tx) => tx.select().from(mailbox).where(eq(mailbox.id, mailboxId)))
  if (!box) return false
  if (box.kind === 'gmail') {
    try {
      await revoke(deps.fetch, unseal(deps.connectionKey, workspaceId, box.sealed))
    } catch {
      // A connection that cannot be opened is removed all the same.
    }
  }
  await inWorkspace(deps.db, workspaceId, (tx) => tx.delete(mailbox).where(and(eq(mailbox.id, mailboxId), eq(mailbox.workspaceId, workspaceId))))
  return true
}

/** Every connected mailbox in a workspace has a read waiting. Run at worker start, so a lost job heals itself. */
export async function ensureReadsQueued(db: Db, workspaceId: string): Promise<number> {
  return inWorkspace(db, workspaceId, async (tx) => {
    const boxes = await tx.select({ id: mailbox.id }).from(mailbox).where(eq(mailbox.status, 'connected'))
    for (const b of boxes) await enqueue(tx, readJob(workspaceId, b.id))
    return boxes.length
  })
}

/** Settings shows this beside a mailbox the worker keeps failing to read. Cleared by the next good read. */
export async function noteMailboxProblem(db: Db, workspaceId: string, mailboxId: string, problem: string): Promise<void> {
  await inWorkspace(db, workspaceId, (tx) => tx.update(mailbox).set({ lastProblem: problem }).where(eq(mailbox.id, mailboxId)))
}
