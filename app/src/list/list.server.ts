// What the List Builder screens read and change. Every function takes the
// workspace from the session (handed in by the caller), never from the
// browser. Only the agent who owns the workspace starts a year or answers
// a card: a Yes here is what makes a contact, so it must be her own.
import {
  ListRefused,
  addTicked,
  hideListCard,
  keepDetails,
  listPage,
  listStatus,
  pullOut,
  readContactFile,
  sayNo,
  sayYes,
  startYear,
  takeInPeople,
  inWorkspace,
  yesToAll,
  type ListPage,
  type ListStatus,
} from '@sunnyday/shared'
import type { Me } from '@/auth/auth.server'
import { getDb } from '@/server/db.server'
import type { Done, TickChoice, Told, YesData } from './list.schema'

const AGENT_ONLY = { ok: false as const, message: 'Only the agent who owns this workspace can build the list.' }

/** Turns a refusal into its plain sentence; anything else is a real fault and goes to Sentry. */
async function told<T extends object>(me: Me, work: () => Promise<T>): Promise<Told<T>> {
  if (me.role !== 'agent') return AGENT_ONLY
  try {
    return { ok: true, ...(await work()) }
  } catch (err) {
    if (err instanceof ListRefused) return { ok: false, message: err.message }
    throw err
  }
}
const done = (me: Me, work: () => Promise<unknown>): Promise<Done> => told(me, async () => (await work(), {}))

export type StatusView = ListStatus & { canChange: boolean }
export const status = async (me: Me): Promise<StatusView> => ({ ...(await listStatus(getDb(), me.workspaceId)), canChange: me.role === 'agent' })
export const page = (me: Me, view: 'cards' | 'details' | 'ticks' | 'not', q?: string): Promise<ListPage> => listPage(getDb(), me.workspaceId, view, q)

/** Her tap, and nothing else, starts a year's read. */
export const start = (me: Me) => told(me, () => startYear(getDb(), me.workspaceId, me.userId).then(({ year }) => ({ year })))
export const yes = (me: Me, answer: YesData) => told(me, () => sayYes(getDb(), me.workspaceId, answer, me.userId))
export const no = (me: Me, personId: string) => done(me, () => sayNo(getDb(), me.workspaceId, personId))
export const yesAll = (me: Me, personIds: string[]) => told(me, () => yesToAll(getDb(), me.workspaceId, personIds, me.userId))
export const moveBack = (me: Me, personId: string) => done(me, () => pullOut(getDb(), me.workspaceId, personId))
export const details = (me: Me, personId: string, keep: string[]) => done(me, () => keepDetails(getDb(), me.workspaceId, personId, keep))
export const ticks = (me: Me, picks: Array<{ personId: string; as: TickChoice }>) => told(me, () => addTicked(getDb(), me.workspaceId, picks, me.userId))
export const hide = (me: Me, hidden: boolean) => done(me, () => hideListCard(getDb(), me.workspaceId, hidden))

/** The phone's contact file: read once, here, and never stored. Only the people in it are kept, waiting for her. */
export const phoneFile = (me: Me, text: string) =>
  told(me, async () => {
    const people = readContactFile(text)
    if (people.length === 0) throw new ListRefused('SunnyDay could not find any contacts in that file. It should be a contact file from your phone, ending in .vcf.')
    const db = getDb()
    const got = await inWorkspace(db, me.workspaceId, (tx) => takeInPeople(tx, me.workspaceId, 'phone', people))
    return { read: people.length, ...got }
  })
