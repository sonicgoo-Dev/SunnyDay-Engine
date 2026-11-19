// The "Build my list" card at the top of Contacts. It says, in plain
// words, where List Builder stands: not started, reading, ready with so
// many people to look at, paused, or done for that year. One year at a
// time: it reads further back only when she taps "Go back another year".
import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/choice'
import { hideListCardFn, startYearFn } from './list.functions'
import type { getListStatus } from './list.functions'
import { COST_PER_YEAR, MAX_YEARS, minutesFor } from './list.schema'

export type Status = Awaited<ReturnType<typeof getListStatus>>

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthOf = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
/** "Nov 2025 to Nov 2026", the same on every computer. */
export const span = (fromIso: string, toIso: string) => `${monthOf(fromIso)} to ${monthOf(toIso)}`
const people = (n: number) => (n === 1 ? '1 person' : `${n} people`)
const COST = `about $${COST_PER_YEAR.low} to $${COST_PER_YEAR.high}`

const linkClass = 'self-start text-sm text-primary underline underline-offset-2 hover:opacity-80'
const goClass =
  'inline-flex min-h-11 items-center justify-center self-start rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function BuildCard({ status }: { status: Status }) {
  const router = useRouter()
  const start = useServerFn(startYearFn)
  const hide = useServerFn(hideListCardFn)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const run = status.run
  const working = run !== null && (run.status === 'reading' || run.status === 'sorting' || run.status === 'thinking')

  // While it works, the card keeps itself up to date.
  useEffect(() => {
    if (!working) return
    const t = setInterval(() => void router.invalidate(), 8000)
    return () => clearInterval(t)
  }, [working])

  async function begin() {
    setBusy(true)
    setProblem(null)
    try {
      const told = await start()
      if (!told.ok) setProblem(told.message)
    } catch {
      setProblem('That did not start. Please try again.')
    }
    setBusy(false)
    await router.invalidate()
  }
  async function tuck(hidden: boolean) {
    await hide({ data: { hidden } })
    await router.invalidate()
  }

  if (status.hidden) {
    return (
      <button type="button" className={linkClass} onClick={() => void tuck(false)}>
        Build my list
      </button>
    )
  }

  const waiting = status.cards > 0
  const extras = (
    <>
      {status.details > 0 && (
        <Link to="/contacts/build" search={{ view: 'details' }} className={linkClass}>
          {people(status.details)} already in your contacts {status.details === 1 ? 'has' : 'have'} a new detail to look at
        </Link>
      )}
      {status.ticks > 0 && (
        <Link to="/contacts/build" search={{ view: 'ticks' }} className={linkClass}>
          {people(status.ticks)} from your own contacts did not turn up in this mail. Choose who belongs
        </Link>
      )}
    </>
  )

  let body: ReactNode
  if (!run) {
    body = (
      <>
        <p>
          SunnyDay can find your people in your mail, so you do not have to type them in. It starts with the last 12 months. It notes who wrote and when, sets newsletters and notices aside, then reads a few messages from each real person to work out who they are to you.
        </p>
        <p className="text-sm text-muted-foreground">Nothing is added to Contacts until you say Yes. Your mailbox is only read, never changed. A year of mail usually costs {COST}, counted against your monthly AI limit.</p>
        {status.contactsMissing && (
          <p className="text-sm text-muted-foreground">
            Your Google Contacts are not included yet. To include them, open{' '}
            <Link to="/settings" className="text-primary underline underline-offset-2">
              Settings
            </Link>{' '}
            and tap “Include my Google Contacts”. Google will show one extra line about contacts. You can also start without them.
          </p>
        )}
        {!status.hasMailbox ? (
          <p className="text-sm">
            Connect your mail in{' '}
            <Link to="/settings" className="text-primary underline underline-offset-2">
              Settings
            </Link>{' '}
            first.
          </p>
        ) : status.canChange ? (
          <Button className="self-start" disabled={busy} onClick={begin}>
            {busy ? 'Starting' : 'Start with the last 12 months'}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Only the agent who owns this workspace can start it.</p>
        )}
      </>
    )
  } else if (working) {
    body = (
      <>
        <p>
          {run.status === 'reading' && `Reading your mail from ${span(run.fromAt, run.toAt)}. ${run.messagesRead.toLocaleString('en-US')} messages so far.`}
          {run.status === 'sorting' && 'Sorting people from newsletters and notices.'}
          {run.status === 'thinking' && `Working out who each person is: ${run.looked} of ${run.toLook} done.`}
        </p>
        <p className="text-sm text-muted-foreground">This takes a while. You can leave this page and come back; it carries on by itself.</p>
        {waiting && (
          <Link to="/contacts/build" className={linkClass}>
            Look at the {status.cards} found so far
          </Link>
        )}
      </>
    )
  } else if (run.status === 'paused') {
    body = (
      <>
        <Notice>
          {run.pausedWhy === 'limit'
            ? 'Paused: this month’s AI spending limit has been reached. Everything found so far is kept. It carries on when you raise the limit in Settings, or on the 1st.'
            : 'Your mail has been read and sorted, but SunnyDay’s AI is not switched on yet. Nothing was lost. It carries on by itself once it is.'}
        </Notice>
        <p className="text-sm text-muted-foreground">
          {run.looked} of {run.toLook} people looked at so far.
        </p>
        {waiting && (
          <Link to="/contacts/build" className={goClass}>
            Look at the {status.cards} found so far
          </Link>
        )}
        {extras}
      </>
    )
  } else if (waiting) {
    body = (
      <>
        <p>
          About {people(status.cards)} to look at, roughly {minutesFor(status.cards)} {minutesFor(status.cards) === 1 ? 'minute' : 'minutes'}. Ten at a time, and you can stop whenever you like.
        </p>
        <p className="text-sm text-muted-foreground">From your mail, {span(run.fromAt, run.toAt)}.</p>
        <Link to="/contacts/build" className={goClass}>
          Look at them
        </Link>
        {extras}
      </>
    )
  } else {
    body = (
      <>
        <p>
          {status.yearsRead >= MAX_YEARS ? `List Builder has read all ${MAX_YEARS} years, back to ${monthOf(run.fromAt)}.` : `You have answered everyone from ${span(run.fromAt, run.toAt)}.`}
        </p>
        {extras}
        {status.canGoBack && status.canChange && (
          <>
            <p className="text-sm text-muted-foreground">
              Going back another year reads the 12 months before {monthOf(run.fromAt)}. It costs {COST}, and only asks about people you have not already answered.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={begin}>
                {busy ? 'Starting' : 'Go back another year'}
              </Button>
              <Button variant="quiet" onClick={() => void tuck(true)}>
                Finished for now
              </Button>
            </div>
          </>
        )}
        {!status.canGoBack && (
          <Button variant="quiet" className="self-start" onClick={() => void tuck(true)}>
            Put this card away
          </Button>
        )}
      </>
    )
  }

  return (
    <section aria-label="Build my list" className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <h2 className="text-lg font-medium">Build my list</h2>
      {body}
      {run?.problems.map((p) => (
        <p key={p} className="text-sm text-warning-foreground">
          {p}
        </p>
      ))}
      {problem && <Notice>{problem}</Notice>}
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t pt-3">
        <Link to="/contacts/build" search={{ view: 'phone' }} className={linkClass}>
          Add contacts from your phone
        </Link>
        {status.notContacts > 0 && (
          <Link to="/contacts/build" search={{ view: 'not' }} className={linkClass}>
            Not contacts ({status.notContacts.toLocaleString('en-US')})
          </Link>
        )}
      </div>
    </section>
  )
}
