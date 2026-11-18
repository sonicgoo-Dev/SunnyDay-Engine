// The Settings screen as of Build 2: mail connections and the monthly AI
// spending limit. More sections join in later builds.
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { removeMailbox, saveAiLimit, saveSecondMailbox } from './settings.functions'
import { usualServerFor, type Done, type SettingsView } from './settings.schema'

type Mailbox = SettingsView['mailboxes'][number]

/** What Settings says after the trip to Google and back. */
export const MAIL_NOTES = {
  connected: { good: true, text: 'Gmail is connected. SunnyDay is reading it for the first time now.' },
  cancelled: { good: false, text: 'Gmail was not connected. Nothing has changed.' },
  permission: { good: false, text: 'Gmail was not connected, because a box on Google’s screen was left unticked. SunnyDay needs every box ticked. Tap Connect Gmail to try again.' },
  second: { good: false, text: 'A different Gmail account is already connected. Disconnect it first to switch accounts.' },
  not_ready: { good: false, text: 'Mail connections are not switched on yet.' },
  failed: { good: false, text: 'Gmail was not connected. Please try again.' },
} as const
export type MailNote = keyof typeof MAIL_NOTES

const dollars = (n: number) => `$${n.toFixed(2)}`

export function SettingsScreen({ view, note }: { view: SettingsView; note?: MailNote }) {
  const main = view.mailboxes.find((m) => m.role === 'main')
  const second = view.mailboxes.find((m) => m.role === 'read_only')
  return (
    <div className="flex max-w-2xl flex-col gap-6 px-4 py-8 md:px-12 md:py-12">
      <h1 className="text-3xl font-medium md:text-4xl">Settings</h1>
      {note && <Notice good={MAIL_NOTES[note].good}>{MAIL_NOTES[note].text}</Notice>}

      <Card title="Mail" intro="SunnyDay reads your mail to catch new leads and keep each person's story up to date. It only reads: nothing in your mailbox is ever marked, moved or deleted.">
        {!view.mailReady && <Notice>Mail connections are being switched on. Check back shortly.</Notice>}
        <Part title="Your main mailbox" about="Gmail. The one mailbox SunnyDay will send from, once you approve a message.">
          {main ? (
            <Connected box={main} canChange={view.canChange} reconnect={<ConnectGmail label="Connect again" />} />
          ) : view.canChange && view.mailReady ? (
            <ConnectGmail label="Connect Gmail" />
          ) : (
            <p className="text-sm text-muted-foreground">Not connected.</p>
          )}
        </Part>
        <Part title="A second mailbox" about="An older address you still get mail at. SunnyDay reads it and never sends from it.">
          {second ? (
            <Connected box={second} canChange={view.canChange} reconnect={<p className="text-sm">Disconnect it, then connect it again with the current password.</p>} />
          ) : view.canChange && view.mailReady ? (
            <SecondMailboxForm />
          ) : (
            <p className="text-sm text-muted-foreground">Not connected.</p>
          )}
        </Part>
      </Card>

      <Card title="AI spending" intro="Your agents cost a little each time they read or draft. This is the most they may spend in a month. At the limit they pause until you raise it or the next month starts.">
        <AiLimit ai={view.ai} canChange={view.canChange} />
      </Card>
    </div>
  )
}

function Card({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-xl border bg-card p-5 md:p-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </div>
      {children}
    </section>
  )
}

function Part({ title, about, children }: { title: string; about: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t pt-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{about}</p>
      </div>
      {children}
    </div>
  )
}

function Notice({ good = false, children }: { good?: boolean; children: ReactNode }) {
  return (
    <p role="status" className={good ? 'rounded-md bg-secondary px-4 py-3 text-sm text-secondary-foreground' : 'rounded-md bg-warning px-4 py-3 text-sm text-warning-foreground'}>
      {children}
    </p>
  )
}

// A plain link, not a button: the browser itself must travel to Google.
function ConnectGmail({ label }: { label: string }) {
  return (
    <a
      href="/api/mail/google/start"
      className="inline-flex min-h-11 items-center justify-center self-start rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {label}
    </a>
  )
}

/** A time in the reader's own clock. Shown only once the page is in the browser, which knows the time zone. */
function LastRead({ iso }: { iso: string | null }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    if (!iso) return setText(null)
    const when = new Date(iso)
    const today = new Date().toDateString() === when.toDateString()
    const time = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    setText(today ? `today at ${time}` : `${when.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`)
  }, [iso])
  if (!iso) return <>Reading for the first time. This takes a few minutes.</>
  return <>Last read {text ?? 'recently'}.</>
}

function Connected({ box, canChange, reconnect }: { box: Mailbox; canChange: boolean; reconnect: ReactNode }) {
  const router = useRouter()
  const remove = useServerFn(removeMailbox)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function disconnect() {
    setBusy(true)
    const done = await remove({ data: { mailboxId: box.id } })
    setBusy(false)
    setAsking(false)
    if (!done.ok) setProblem(done.message)
    await router.invalidate()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold break-all">{box.address}</p>
        {box.status === 'connected' ? (
          <p className="text-sm text-muted-foreground">
            Connected. <LastRead iso={box.lastReadAt} />
          </p>
        ) : (
          <p className="text-sm text-warning-foreground">Needs reconnecting. {box.lastProblem}</p>
        )}
      </div>
      {box.status !== 'connected' && canChange && reconnect}
      {problem && <Notice>{problem}</Notice>}
      {canChange &&
        (asking ? (
          <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
            <p className="text-sm">Disconnect {box.address}? SunnyDay stops reading it and forgets what it read from it. Your mailbox itself is not touched.</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={disconnect}>
                {busy ? 'Disconnecting' : 'Yes, disconnect'}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setAsking(false)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="self-start" onClick={() => setAsking(true)}>
            Disconnect
          </Button>
        ))}
    </div>
  )
}

function SecondMailboxForm() {
  const router = useRouter()
  const save = useServerFn(saveSecondMailbox)
  const [address, setAddress] = useState('')
  const [password, setPassword] = useState('')
  const [server, setServer] = useState('')
  const [serverTouched, setServerTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const shownServer = serverTouched ? server : usualServerFor(address)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    let done: Done
    try {
      done = await save({ data: { address, password, server: shownServer } })
    } catch {
      done = { ok: false, message: 'Check the address, the password and the server name, then try again.' }
    }
    setBusy(false)
    if (!done.ok) return setProblem(done.message)
    setPassword('')
    await router.invalidate()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field id="second-address" label="Email address" type="email" autoComplete="off" autoCapitalize="none" required value={address} onChange={(e) => setAddress(e.target.value)} />
      <Field
        id="second-password"
        label="Password for that mailbox"
        type="password"
        autoComplete="off"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="Stored sealed, and used only to read this mailbox."
      />
      <Field
        id="second-server"
        label="Mail server"
        autoComplete="off"
        autoCapitalize="none"
        required
        value={shownServer}
        onChange={(e) => {
          setServerTouched(true)
          setServer(e.target.value)
        }}
        hint="Filled in for you. Change it only if your mail provider gave you a different one."
      />
      {problem && <Notice>{problem}</Notice>}
      <Button type="submit" className="self-start" disabled={busy}>
        {busy ? 'Checking the mailbox' : 'Connect this mailbox'}
      </Button>
    </form>
  )
}

function AiLimit({ ai, canChange }: { ai: SettingsView['ai']; canChange: boolean }) {
  const router = useRouter()
  const save = useServerFn(saveAiLimit)
  const [value, setValue] = useState(String(ai.limitDollars))
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ good: boolean; text: string } | null>(null)
  const used = ai.limitDollars > 0 ? Math.min(100, Math.round((ai.spentDollars / ai.limitDollars) * 100)) : 100

  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = Number(value)
    if (!Number.isInteger(n) || n < 0 || n > 200) return setSaid({ good: false, text: 'Enter a whole number of dollars from 0 to 200.' })
    setBusy(true)
    const done = await save({ data: { dollars: n } })
    setBusy(false)
    setSaid(done.ok ? { good: true, text: n === 0 ? 'Saved. Your agents are switched off.' : `Saved. Your agents may spend up to ${dollars(n)} a month.` } : { good: false, text: done.message })
    await router.invalidate()
  }

  return (
    <div className="flex flex-col gap-4 border-t pt-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm">
          <span className="font-semibold">{dollars(ai.spentDollars)}</span> of {dollars(ai.limitDollars)} used this month.
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="AI spending this month" aria-valuemin={0} aria-valuemax={100} aria-valuenow={used}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${used}%` }} />
        </div>
      </div>
      {ai.paused && (
        <Notice>{ai.limitDollars === 0 ? 'Your agents are switched off, because the limit is $0.' : 'This month’s limit has been reached, so your agents are paused. Raise the limit, or they start again on the 1st.'}</Notice>
      )}
      {canChange && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field id="ai-limit" label="Monthly limit, in dollars" inputMode="numeric" pattern="[0-9]*" className="max-w-32" value={value} onChange={(e) => setValue(e.target.value)} hint="From 0 to 200. Zero switches the agents off." />
          {said && <Notice good={said.good}>{said.text}</Notice>}
          <Button type="submit" variant="outline" className="self-start" disabled={busy}>
            {busy ? 'Saving' : 'Save limit'}
          </Button>
        </form>
      )}
    </div>
  )
}
