// What the worker does with each job, and its loop. Kept apart from
// index.ts so tests can run one pass without starting a process.
import {
  GOOGLE_PART,
  LIST_PEOPLE,
  LIST_READ,
  LIST_SORT,
  LIST_THINK,
  READ_EVERY_MINUTES,
  READ_MAILBOX,
  claimNext,
  enqueue,
  ensureReadsQueued,
  ensureRunJobs,
  fail,
  finish,
  withoutValues,
  giveUpOnPart,
  noteMailboxProblem,
  noteRunProblem,
  readJob,
  readMailbox,
  readRunPage,
  readRunPeople,
  requeueStale,
  resumePausedRuns,
  sortRun,
  thinkBatch,
  tidyFinished,
  tidyListMail,
  workspace,
  type Db,
  type Fetch,
  type ImapReader,
  type ImapTextReader,
  type ImapWindowReader,
  type Job,
  type ListDeps,
  type Thinker,
  type WorkerSettings,
} from '@sunnyday/shared'

export type WorkerDeps = {
  db: Db
  settings: WorkerSettings
  fetch: Fetch
  imap?: ImapReader
  imapWindow?: ImapWindowReader
  imapTexts?: ImapTextReader
  /** The AI List Builder asks. Null when no key is set: the AI is not switched on. */
  thinker?: Thinker | null
  log?: (line: string) => void
}

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000)

/** The AI did not answer. Kept and logged as a kind of failure only: an error from outside could carry words from a message. */
class AiDidNotAnswer extends Error {
  constructor(cause: unknown) {
    const status = typeof (cause as { status?: unknown })?.status === 'number' ? ` (status ${(cause as { status: number }).status})` : ''
    super(`the AI did not answer${status}`)
    this.name = cause instanceof Error ? cause.name : 'AiDidNotAnswer'
  }
}

/** Does one job. Throws if it failed; the caller records that and retries later. */
async function doJob(deps: WorkerDeps, j: Job): Promise<void> {
  const s = deps.settings
  if (!s.CONNECTION_KEY) throw new Error('CONNECTION_KEY is not set, so mailboxes cannot be read')
  const mailboxId = String(j.payload.mailboxId ?? '')
  const runId = String(j.payload.runId ?? '')
  const google = { clientId: s.SIGNIN_GOOGLE_CLIENT_ID, clientSecret: s.SIGNIN_GOOGLE_CLIENT_SECRET }
  const list: ListDeps = {
    db: deps.db,
    connectionKey: s.CONNECTION_KEY,
    google,
    fetch: deps.fetch,
    thinker: deps.thinker ?? null,
    ...(deps.imapWindow ? { imapWindow: deps.imapWindow } : {}),
    ...(deps.imapTexts ? { imapTexts: deps.imapTexts } : {}),
  }
  // A job is marked done before the next one of its kind is added: two waiting jobs with the same key are one job.
  switch (j.kind) {
    case READ_MAILBOX: {
      const result = await readMailbox({ db: deps.db, connectionKey: s.CONNECTION_KEY, google, fetch: deps.fetch, ...(deps.imap ? { imap: deps.imap } : {}) }, j.workspaceId, mailboxId)
      await finish(deps.db, j.id)
      // A connected mailbox is read again in a few minutes; sooner when it is still catching up.
      // One that is gone or needs reconnecting is left alone until the agent acts.
      if (result.outcome === 'read') await enqueue(deps.db, readJob(j.workspaceId, mailboxId, minutesFromNow(result.more ? 0 : READ_EVERY_MINUTES)))
      return
    }
    // List Builder (Build 4): one page of a year's mail, then the next, each a short turn.
    case LIST_READ: {
      const outcome = await readRunPage(list, j.workspaceId, runId, mailboxId)
      await finish(deps.db, j.id)
      if (outcome === 'more') await enqueue(deps.db, { workspaceId: j.workspaceId, kind: LIST_READ, payload: { runId, mailboxId }, dedupe: `${runId}:${mailboxId}` })
      return
    }
    case LIST_PEOPLE:
      await readRunPeople(list, j.workspaceId, runId, mailboxId)
      return finish(deps.db, j.id)
    case LIST_SORT:
      await sortRun(deps.db, j.workspaceId, runId)
      return finish(deps.db, j.id)
    case LIST_THINK: {
      const outcome = await thinkBatch(list, j.workspaceId, runId).catch((err: unknown) => {
        throw new AiDidNotAnswer(err)
      })
      await finish(deps.db, j.id)
      // A few people a turn, so every workspace keeps its fair turn. Paused: housekeeping starts it again when the limit allows.
      if (outcome === 'more') await enqueue(deps.db, { workspaceId: j.workspaceId, kind: LIST_THINK, payload: { runId }, dedupe: runId })
      return
    }
    default:
      throw new Error(`no such kind of job: ${j.kind}`)
  }
}

/** One job may take this long at most; past it, the job counts as failed and the next workspace gets its turn. */
const JOB_DEADLINE_MS = 4 * 60_000

class TookTooLong extends Error {
  constructor() {
    super('the job took too long')
    this.name = 'TookTooLong'
  }
}

async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, no) => (timer = setTimeout(() => no(new TookTooLong()), ms)))])
  } finally {
    clearTimeout(timer)
  }
}

/** A short reason safe to keep and to log: the kind of error, never a customer's words. */
const reasonOf = (err: unknown) => (err instanceof Error ? `${err.name}: ${withoutValues(err.message)}`.slice(0, 200) : 'unknown error')

/** Works through the jobs that are due, for at most `budgetMs`. Returns how many it did. */
export async function workDueJobs(deps: WorkerDeps, budgetMs = 20_000): Promise<{ done: number; failed: number }> {
  const stopAt = Date.now() + budgetMs
  let done = 0
  let failed = 0
  while (Date.now() < stopAt) {
    const j = await claimNext(deps.db)
    if (!j) break
    try {
      await withDeadline(doJob(deps, j), JOB_DEADLINE_MS)
      done++
    } catch (err) {
      failed++
      const outcome = await fail(deps.db, j, reasonOf(err))
      deps.log?.(`[worker] job ${j.id} (${j.kind}) did not finish, ${outcome === 'retry' ? 'will be tried again' : 'given up after five tries'}: ${reasonOf(err)}`)
      if (outcome === 'gave_up') await afterGivingUp(deps, j).catch(() => {})
      // A job given up on must not stop a mailbox being read for good.
      if (outcome === 'gave_up' && j.kind === READ_MAILBOX) {
        const mailboxId = String(j.payload.mailboxId ?? '')
        // Settings must not go on saying all is well.
        await noteMailboxProblem(deps.db, j.workspaceId, mailboxId, 'SunnyDay has not been able to read this mailbox lately. It keeps trying every hour.').catch(() => {})
        await enqueue(deps.db, readJob(j.workspaceId, mailboxId, minutesFromNow(60)))
      }
    }
  }
  return { done, failed }
}

/**
 * List Builder never stalls for good on a job that kept failing. A mailbox
 * (or Google Contacts) that could not be read is set aside with a plain
 * reason and the year carries on with the rest. A sort or an AI look is
 * tried again in an hour, and the card says so meanwhile.
 */
async function afterGivingUp(deps: WorkerDeps, j: Job): Promise<void> {
  const runId = String(j.payload.runId ?? '')
  if (j.kind === LIST_READ) return giveUpOnPart(deps.db, j.workspaceId, runId, String(j.payload.mailboxId ?? ''))
  if (j.kind === LIST_PEOPLE) return giveUpOnPart(deps.db, j.workspaceId, runId, GOOGLE_PART)
  if (j.kind === LIST_SORT || j.kind === LIST_THINK) {
    await noteRunProblem(deps.db, j.workspaceId, runId, 'List Builder hit a problem and is trying again every hour. Nothing has been lost.')
    await enqueue(deps.db, { workspaceId: j.workspaceId, kind: j.kind, payload: { runId }, dedupe: runId, runAt: minutesFromNow(60) })
  }
}

/** Housekeeping: stuck jobs go back in the line, every connected mailbox has a read waiting, a year being read has its next job, a paused year starts again when the limit allows, old records go. */
export async function keepHouse(deps: WorkerDeps): Promise<void> {
  await requeueStale(deps.db)
  const all = await deps.db.select({ id: workspace.id }).from(workspace)
  for (const w of all) {
    await ensureReadsQueued(deps.db, w.id)
    await ensureRunJobs(deps.db, w.id)
    await resumePausedRuns({ db: deps.db, thinker: deps.thinker ?? null }, w.id)
    await tidyListMail(deps.db, w.id)
  }
  await tidyFinished(deps.db)
}
