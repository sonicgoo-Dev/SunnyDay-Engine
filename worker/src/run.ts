// What the worker does with each job, and its loop. Kept apart from
// index.ts so tests can run one pass without starting a process.
import {
  READ_EVERY_MINUTES,
  READ_MAILBOX,
  claimNext,
  enqueue,
  ensureReadsQueued,
  fail,
  finish,
  readJob,
  readMailbox,
  requeueStale,
  tidyFinished,
  workspace,
  type Db,
  type Fetch,
  type ImapReader,
  type Job,
  type WorkerSettings,
} from '@sunnyday/shared'

export type WorkerDeps = { db: Db; settings: WorkerSettings; fetch: Fetch; imap?: ImapReader; log?: (line: string) => void }

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000)

/** Does one job. Throws if it failed; the caller records that and retries later. */
async function doJob(deps: WorkerDeps, j: Job): Promise<void> {
  if (j.kind !== READ_MAILBOX) throw new Error(`no such kind of job: ${j.kind}`)
  const mailboxId = String(j.payload.mailboxId ?? '')
  const s = deps.settings
  if (!s.CONNECTION_KEY) throw new Error('CONNECTION_KEY is not set, so mailboxes cannot be read')
  const result = await readMailbox(
    {
      db: deps.db,
      connectionKey: s.CONNECTION_KEY,
      google: { clientId: s.SIGNIN_GOOGLE_CLIENT_ID, clientSecret: s.SIGNIN_GOOGLE_CLIENT_SECRET },
      fetch: deps.fetch,
      ...(deps.imap ? { imap: deps.imap } : {}),
    },
    j.workspaceId,
    mailboxId,
  )
  await finish(deps.db, j.id)
  // A connected mailbox is read again in a few minutes; sooner when it is still catching up.
  // One that is gone or needs reconnecting is left alone until the agent acts.
  if (result.outcome === 'read') await enqueue(deps.db, readJob(j.workspaceId, mailboxId, minutesFromNow(result.more ? 0 : READ_EVERY_MINUTES)))
}

/** A short reason safe to keep and to log: the kind of error, never a customer's words. */
const reasonOf = (err: unknown) => (err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 200) : 'unknown error')

/** Works through the jobs that are due, for at most `budgetMs`. Returns how many it did. */
export async function workDueJobs(deps: WorkerDeps, budgetMs = 20_000): Promise<{ done: number; failed: number }> {
  const stopAt = Date.now() + budgetMs
  let done = 0
  let failed = 0
  while (Date.now() < stopAt) {
    const j = await claimNext(deps.db)
    if (!j) break
    try {
      await doJob(deps, j)
      done++
    } catch (err) {
      failed++
      const outcome = await fail(deps.db, j, reasonOf(err))
      deps.log?.(`[worker] job ${j.id} (${j.kind}) did not finish, ${outcome === 'retry' ? 'will be tried again' : 'given up after five tries'}: ${reasonOf(err)}`)
      // A job given up on must not stop a mailbox being read for good.
      if (outcome === 'gave_up' && j.kind === READ_MAILBOX) await enqueue(deps.db, readJob(j.workspaceId, String(j.payload.mailboxId ?? ''), minutesFromNow(60)))
    }
  }
  return { done, failed }
}

/** Housekeeping: stuck jobs go back in the line, every connected mailbox has a read waiting, old records go. */
export async function keepHouse(deps: WorkerDeps): Promise<void> {
  await requeueStale(deps.db)
  const all = await deps.db.select({ id: workspace.id }).from(workspace)
  for (const w of all) await ensureReadsQueued(deps.db, w.id)
  await tidyFinished(deps.db)
}
