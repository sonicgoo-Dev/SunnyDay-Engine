// What Settings reads and changes. Every function takes the workspace from
// the session (handed in by the caller), never from the browser.
import {
  ImapSignInRefused,
  ImapUnreachable,
  aiBudget,
  disconnectMailbox,
  imapWayIn,
  listMailboxes,
  saveImapConnection,
  setAiLimit,
} from '@sunnyday/shared'
import type { Me } from '@/auth/auth.server'
import { getDb, getSettings } from '@/server/db.server'
import type { Done, SettingsView } from './settings.schema'

const AGENT_ONLY: Done = { ok: false, message: 'Only the agent who owns this workspace can change this.' }
const NOT_READY: Done = { ok: false, message: 'Mail connections are not switched on yet.' }

export async function settingsView(me: Me): Promise<SettingsView> {
  const db = getDb()
  const [boxes, budget] = await Promise.all([listMailboxes(db, me.workspaceId), aiBudget(db, me.workspaceId)])
  return {
    canChange: me.role === 'agent',
    mailReady: getSettings().CONNECTION_KEY !== '',
    mailboxes: boxes.map((b) => ({ ...b, lastReadAt: b.lastReadAt?.toISOString() ?? null })),
    ai: { limitDollars: budget.limitCents / 100, spentDollars: Math.round(budget.spentCents) / 100, paused: budget.paused },
  }
}

export async function changeAiLimit(me: Me, dollars: number): Promise<Done> {
  if (me.role !== 'agent') return AGENT_ONLY
  await setAiLimit(getDb(), me.workspaceId, dollars * 100)
  return { ok: true }
}

export async function connectSecondMailbox(me: Me, input: { address: string; password: string; server: string }): Promise<Done> {
  if (me.role !== 'agent') return AGENT_ONLY
  const key = getSettings().CONNECTION_KEY
  if (!key) return NOT_READY
  const wayIn = imapWayIn.safeParse({ host: input.server, port: 993, user: input.address, pass: input.password })
  if (!wayIn.success) return { ok: false, message: 'That mail server name does not look right. It usually reads like imap.example.com.' }
  const boxes = await listMailboxes(getDb(), me.workspaceId)
  if (boxes.some((b) => b.role === 'main' && b.address === input.address)) return { ok: false, message: 'That address is already connected as your main mailbox.' }
  try {
    await saveImapConnection({ db: getDb(), connectionKey: key }, me.workspaceId, input.address, wayIn.data)
    return { ok: true }
  } catch (err) {
    if (err instanceof ImapSignInRefused) return { ok: false, message: 'The mail server did not accept that address and password. Check both and try again.' }
    if (err instanceof ImapUnreachable) return { ok: false, message: 'SunnyDay could not reach that mail server. Check the server name.' }
    throw err
  }
}

export async function disconnect(me: Me, mailboxId: string): Promise<Done> {
  if (me.role !== 'agent') return AGENT_ONLY
  const gone = await disconnectMailbox({ db: getDb(), connectionKey: getSettings().CONNECTION_KEY, fetch }, me.workspaceId, mailboxId)
  return gone ? { ok: true } : { ok: false, message: 'That mailbox is no longer connected.' }
}
