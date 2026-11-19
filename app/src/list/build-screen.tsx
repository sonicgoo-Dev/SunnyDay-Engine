// The confirm page of List Builder. Ten people at a time, the surest
// first. Each card shows who List Builder thinks they are, one line of why,
// and each detail it found with where it came from. Yes, No or Change.
// Nothing here becomes a contact without her own tap.
import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Notice, Select } from '@/components/ui/choice'
import { Field } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { span, type Status } from './build-card'
import { addTickedFn, keepDetailsFn, moveBackFn, phoneFileFn, sayNoFn, sayYesFn, yesToAllFn } from './list.functions'
import type { getListPage } from './list.functions'
import {
  BUSINESS_ROLES,
  DETAIL_NAMES,
  FOUND_BY,
  KIND_NAMES,
  MAX_FILE_CHARS,
  TICK_CHOICES,
  YES_KINDS,
  cardNeeds,
  clientStagesFor,
  defaultsFor,
  withoutPhotos,
  yesInput,
  type CardNeed,
  type CardView,
  type TickChoice,
  type YesInput,
  type YesKind,
} from './list.schema'

type Page = Awaited<ReturnType<typeof getListPage>>
export type BuildView = 'cards' | 'details' | 'ticks' | 'not' | 'phone'

const people = (n: number) => (n === 1 ? '1 person' : `${n} people`)
const box = 'flex flex-col gap-3 rounded-xl border bg-card p-5'

export function BuildScreen({ status, page, view, q }: { status: Status; page: Page | null; view: BuildView; q: string }) {
  const tabs: Array<{ view: BuildView; label: string; show: boolean }> = [
    { view: 'cards', label: `People${status.cards ? ` (${status.cards})` : ''}`, show: true },
    { view: 'details', label: `New details (${status.details})`, show: status.details > 0 || view === 'details' },
    { view: 'ticks', label: `From your contacts (${status.ticks})`, show: status.ticks > 0 || view === 'ticks' },
    { view: 'not', label: 'Not contacts', show: status.notContacts > 0 || view === 'not' },
    { view: 'phone', label: 'From your phone', show: true },
  ]
  return (
    <div className="flex max-w-3xl flex-col gap-5 px-4 py-6 md:px-12 md:py-10">
      <Link to="/contacts" className="self-start text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        Contacts
      </Link>
      <h1 className="text-3xl font-medium md:text-4xl">Build my list</h1>
      <nav aria-label="Parts of your list" className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <Link
              key={t.view}
              to="/contacts/build"
              search={t.view === 'cards' ? {} : { view: t.view }}
              aria-current={t.view === view ? 'page' : undefined}
              className={cn('flex min-h-11 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-semibold text-muted-foreground hover:text-foreground', t.view === view && 'bg-card text-foreground shadow-sm')}
            >
              {t.label}
            </Link>
          ))}
      </nav>
      {!status.canChange && <Notice>Only the agent who owns this workspace can answer here.</Notice>}
      {view === 'phone' ? (
        <PhoneFile canChange={status.canChange} />
      ) : page?.view === 'cards' ? (
        <Cards key={page.cards.map((c) => c.id).join()} first={page.cards} total={page.left} status={status} />
      ) : page?.view === 'details' ? (
        <NewDetails people={page.people} canChange={status.canChange} />
      ) : page?.view === 'ticks' ? (
        <Ticks people={page.people} left={page.left} canChange={status.canChange} />
      ) : page?.view === 'not' ? (
        <NotContacts people={page.people} total={page.total} q={q} canChange={status.canChange} />
      ) : null}
    </div>
  )
}

// ---- Ten cards at a time ---------------------------------------------------------

function Cards({ first, total, status }: { first: CardView[]; total: number; status: Status }) {
  const router = useRouter()
  const yesAll = useServerFn(yesToAllFn)
  // The ten she is working through. Answered ones leave; the next ten come only when she asks.
  const [batch, setBatch] = useState(first)
  const [left, setLeft] = useState(total)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const answered = (id: string) => {
    setBatch((b) => b.filter((c) => c.id !== id))
    setLeft((n) => Math.max(0, n - 1))
  }

  async function all() {
    setBusy(true)
    setSaid(null)
    try {
      const told = await yesAll({ data: { personIds: batch.map((c) => c.id) } })
      if (!told.ok) setSaid(told.message)
      else {
        setSaid(told.left > 0 ? `Added ${told.added}. ${told.left === 1 ? 'One still needs' : `${told.left} still need`} something from you: tap Change on ${told.left === 1 ? 'it' : 'each'}.` : null)
        await router.invalidate()
      }
    } catch {
      setSaid('That did not save. Please try again.')
    }
    setBusy(false)
  }

  if (first.length === 0) {
    const run = status.run
    return (
      <section className={box}>
        <p>
          {!run
            ? 'List Builder has not been started yet. Start it from Contacts.'
            : run.status === 'ready'
              ? 'Nobody is waiting for your answer.'
              : run.status === 'paused'
                ? 'Nobody is waiting for your answer just now. List Builder is paused.'
                : 'List Builder is still working. People will appear here as it finds them.'}
        </p>
        <Link to="/contacts" className="self-start text-primary underline underline-offset-2">
          Back to Contacts
        </Link>
      </section>
    )
  }
  if (batch.length === 0) {
    return (
      <section className={box}>
        <h2 className="text-lg font-medium">{left > 0 ? `That is those done. ${people(left)} left.` : 'That is everyone for now.'}</h2>
        <div className="flex flex-wrap gap-2">
          {left > 0 && <Button onClick={() => void router.invalidate()}>Keep going</Button>}
          <Link to="/contacts" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-semibold hover:bg-muted">
            {left > 0 ? 'That’s enough for today' : 'Back to Contacts'}
          </Link>
        </div>
        {left > 0 && <p className="text-sm text-muted-foreground">Your place is kept. Nobody is asked about twice.</p>}
      </section>
    )
  }
  const ready = batch.filter((c) => cardNeeds(c).length === 0).length
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {people(left)} left{status.run ? `, from your mail of ${span(status.run.fromAt, status.run.toAt)}` : ''}. The surest come first.
      </p>
      {batch.map((c) => (
        <PersonCard key={c.id} card={c} canChange={status.canChange} onAnswered={() => answered(c.id)} />
      ))}
      {status.canChange && ready > 1 && (
        <section className={box}>
          <p className="text-sm">Looked through them all? This says Yes to the {ready === batch.length ? `${ready} above` : `${ready} above that are complete`}, as they are shown.</p>
          <Button variant="outline" className="self-start" disabled={busy} onClick={all}>
            {busy ? 'Saving' : `Yes to all ${ready}`}
          </Button>
        </section>
      )}
      {said && <Notice>{said}</Notice>}
    </>
  )
}

const NEED_WORDS: Record<CardNeed, string> = { name: 'their name', kind: 'what they are to you', side: 'buyer or seller', stage: 'the stage they are at' }
const SIDE_WORDS = { buyer: 'Buyer', seller: 'Seller', both: 'Buyer and seller' } as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthOf = (iso: string | null) => (iso ? `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '')

/** "8 emails from them, 5 from you, May 2025 to Nov 2026", or where else they were found. */
function mailLine(c: CardView): string {
  const from = [c.inGoogle && 'Google Contacts', c.inPhone && 'your phone contacts'].filter(Boolean).join(' and ')
  if (!c.inMail) return from ? `In ${from}. Not in this mail.` : ''
  const count = [c.inCount > 0 && `${c.inCount} from them`, c.outCount > 0 && `${c.outCount} from you`].filter(Boolean).join(', ')
  const when = monthOf(c.firstAt) === monthOf(c.lastAt) ? monthOf(c.lastAt) : `${monthOf(c.firstAt)} to ${monthOf(c.lastAt)}`
  return `Emails: ${count}. ${when}.${from ? ` Also in ${from}.` : ''}`
}

function PersonCard({ card, canChange, onAnswered }: { card: CardView; canChange: boolean; onAnswered: () => void }) {
  const yes = useServerFn(sayYesFn)
  const no = useServerFn(sayNoFn)
  const needs = cardNeeds(card)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function send(work: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    setBusy(true)
    setProblem(null)
    try {
      const told = await work()
      if (told.ok) return onAnswered()
      setProblem(told.message)
    } catch {
      setProblem('That did not save. Please try again.')
    }
    setBusy(false)
  }

  return (
    <section aria-label={card.name ?? card.emails[0] ?? 'Someone'} className={box}>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-medium break-words">{card.name ?? card.emails[0] ?? 'No name found'}</h2>
        {card.emails.length > 0 && <p className="text-sm break-all text-muted-foreground">{card.emails.join(', ')}</p>}
      </div>
      <p className="font-semibold">
        {KIND_NAMES[card.kind]}
        {card.kind !== 'business' && card.side && ` · ${SIDE_WORDS[card.side]}`}
        {card.kind === 'business' && [card.businessRole && BUSINESS_ROLES.find((r) => r.key === card.businessRole)?.label, card.company].filter(Boolean).map((x) => ` · ${x}`)}
        {card.sure === 'low' && card.kind !== 'unsure' && <span className="font-normal text-muted-foreground"> (not sure)</span>}
      </p>
      {card.why && <p>{card.why}</p>}
      {mailLine(card) && <p className="text-sm text-muted-foreground">{mailLine(card)}</p>}
      {card.details.length > 0 && !editing && (
        <ul className="flex flex-col gap-2 border-t pt-3">
          {card.details.map((d) => (
            <li key={d.id} className="flex flex-col">
              <span className="text-sm text-muted-foreground">
                {DETAIL_NAMES[d.kind]}
                {d.label ? `, ${d.label}` : ''} · {d.line}
              </span>
              <span className="break-words">{d.value}</span>
            </li>
          ))}
        </ul>
      )}
      {card.foundBy && !editing && <p className="text-sm text-muted-foreground">How they found you: {FOUND_BY.find((f) => f.key === card.foundBy)?.label}{card.foundByOther ? `, ${card.foundByOther}` : ''} (from the mail)</p>}
      {problem && <Notice>{problem}</Notice>}
      {editing ? (
        <Editor card={card} busy={busy} onCancel={() => setEditing(false)} onSave={(answer) => send(() => yes({ data: answer }))} />
      ) : (
        canChange && (
          <>
            {needs.length > 0 && <p className="text-sm text-warning-foreground">Before Yes, this one needs {needs.map((n) => NEED_WORDS[n]).join(' and ')}.</p>}
            <div className="flex flex-wrap gap-2">
              {needs.length === 0 ? (
                <Button disabled={busy} onClick={() => send(() => yes({ data: defaultsFor(card) }))}>
                  Yes
                </Button>
              ) : (
                <Button disabled={busy} onClick={() => setEditing(true)}>
                  Yes, and fill that in
                </Button>
              )}
              <Button variant="outline" disabled={busy} onClick={() => send(() => no({ data: { personId: card.id } }))}>
                No
              </Button>
              {needs.length === 0 && (
                <Button variant="quiet" disabled={busy} onClick={() => setEditing(true)}>
                  Change
                </Button>
              )}
            </div>
          </>
        )
      )}
    </section>
  )
}

/** Change: the kind, buyer or seller, the stage, how they found her, and each detail, before saving. */
function Editor({ card, busy, onCancel, onSave }: { card: CardView; busy: boolean; onCancel: () => void; onSave: (answer: YesInput) => void }) {
  const start = defaultsFor(card)
  const [name, setName] = useState(start.fullName)
  const [kind, setKind] = useState<YesKind | ''>((YES_KINDS as readonly string[]).includes(card.kind) ? (card.kind as YesKind) : '')
  const [buyer, setBuyer] = useState(start.buyer)
  const [seller, setSeller] = useState(start.seller)
  const [buyerStage, setBuyerStage] = useState('')
  const [sellerStage, setSellerStage] = useState('')
  const [role, setRole] = useState(start.businessRole ?? 'other')
  const [company, setCompany] = useState(card.company ?? card.details.find((d) => d.kind === 'company')?.value ?? '')
  const [foundBy, setFoundBy] = useState(start.foundBy)
  const [foundOther, setFoundOther] = useState(start.foundByOther ?? '')
  const [details, setDetails] = useState(card.details.map((d) => ({ ...d, keep: true })))
  const [problem, setProblem] = useState<string | null>(null)
  const id = (part: string) => `${card.id}-${part}`
  const business = kind === 'business'

  function save() {
    if (!kind) return setProblem('Choose what they are to you.')
    const answer: YesInput = {
      personId: card.id,
      fullName: name,
      kind,
      buyer: !business && buyer,
      seller: !business && seller,
      buyerStage: kind === 'client' && buyer ? buyerStage || null : null,
      sellerStage: kind === 'client' && seller ? sellerStage || null : null,
      businessRole: business ? role : null,
      company: business ? company : null,
      foundBy: business ? 'unknown' : foundBy,
      foundByOther: business ? null : foundOther,
      details: details.filter((d) => d.keep && d.value.trim()).map((d) => ({ id: d.id, value: d.value })),
    }
    const checked = yesInput.safeParse(answer)
    if (!checked.success) return setProblem(checked.error.issues[0]?.message ?? 'Check what you chose.')
    setProblem(null)
    onSave(answer)
  }

  return (
    <form
      className="flex flex-col gap-4 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <Field id={id('name')} label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      <Select id={id('kind')} label="They are a" value={kind} onChange={(e) => setKind(e.target.value as YesKind | '')}>
        <option value="">Choose one</option>
        {YES_KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_NAMES[k]}
          </option>
        ))}
      </Select>
      {business ? (
        <>
          <Select id={id('role')} label="What they do" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            {BUSINESS_ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
          <Field id={id('company')} label="Company" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="off" />
        </>
      ) : (
        kind && (
          <>
            <fieldset className="flex flex-col">
              <legend className="text-sm font-semibold">Buying or selling</legend>
              <Check id={id('buyer')} label="Buyer" checked={buyer} onChange={(e) => setBuyer(e.target.checked)} />
              <Check id={id('seller')} label="Seller" checked={seller} onChange={(e) => setSeller(e.target.checked)} />
            </fieldset>
            {kind === 'client' && buyer && (
              <Select id={id('buyer-stage')} label="Buyer stage" value={buyerStage} onChange={(e) => setBuyerStage(e.target.value)}>
                <option value="">Choose the stage</option>
                {clientStagesFor('buyer').map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            )}
            {kind === 'client' && seller && (
              <Select id={id('seller-stage')} label="Seller stage" value={sellerStage} onChange={(e) => setSellerStage(e.target.value)}>
                <option value="">Choose the stage</option>
                {clientStagesFor('seller').map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            )}
            {kind === 'past_client' && <p className="text-sm text-muted-foreground">They go in as “Past client”.</p>}
            {kind === 'lead' && <p className="text-sm text-muted-foreground">They go in as a lead at “Talking”. You can move them later.</p>}
            <Select id={id('found')} label="How did they find you?" value={foundBy} onChange={(e) => setFoundBy(e.target.value as typeof foundBy)}>
              {FOUND_BY.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </Select>
            {(foundBy === 'other' || foundBy === 'referral') && (
              <Field id={id('found-other')} label={foundBy === 'referral' ? 'Who referred them? (if you know)' : 'How?'} value={foundOther} onChange={(e) => setFoundOther(e.target.value)} autoComplete="off" />
            )}
          </>
        )
      )}
      {details.length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-semibold">Details to keep</legend>
          {details.map((d, i) => (
            <div key={d.id} className="flex flex-col gap-1">
              <Check
                id={id(`keep-${d.id}`)}
                label={
                  <span className="text-sm">
                    {DETAIL_NAMES[d.kind]} · {d.line}
                  </span>
                }
                checked={d.keep}
                onChange={(e) => setDetails(details.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))}
              />
              <input
                aria-label={`${DETAIL_NAMES[d.kind]} ${d.line}`}
                className="min-h-11 w-full rounded-md border border-border bg-card px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                value={d.value}
                disabled={!d.keep}
                onChange={(e) => setDetails(details.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              />
            </div>
          ))}
        </fieldset>
      )}
      {problem && <Notice>{problem}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving' : 'Yes, save'}
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// ---- "Add this detail?" -----------------------------------------------------------

type DetailPerson = Extract<Page, { view: 'details' }>['people'][number]

function NewDetails({ people: list, canChange }: { people: DetailPerson[]; canChange: boolean }) {
  if (list.length === 0) return <Empty>No new details to look at.</Empty>
  return (
    <>
      <p className="text-sm text-muted-foreground">These people are already in your contacts. List Builder found something their page does not have yet.</p>
      {list.map((p) => (
        <DetailCard key={p.id} person={p} canChange={canChange} />
      ))}
    </>
  )
}

function DetailCard({ person, canChange }: { person: DetailPerson; canChange: boolean }) {
  const router = useRouter()
  const keep = useServerFn(keepDetailsFn)
  const [kept, setKept] = useState<string[]>(person.details.map((d) => d.id))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  async function send(ids: string[]) {
    setBusy(true)
    try {
      const told = await keep({ data: { personId: person.id, keep: ids } })
      if (!told.ok) setProblem(told.message)
    } catch {
      setProblem('That did not save. Please try again.')
    }
    setBusy(false)
    await router.invalidate()
  }
  return (
    <section className={box}>
      <Link to="/contacts/$contactId" params={{ contactId: person.contactId }} className="self-start text-lg font-medium text-primary underline-offset-2 hover:underline">
        {person.name}
      </Link>
      {person.details.map((d) => (
        <Check
          key={d.id}
          id={`${person.id}-${d.id}`}
          disabled={!canChange}
          checked={kept.includes(d.id)}
          onChange={(e) => setKept(e.target.checked ? [...kept, d.id] : kept.filter((k) => k !== d.id))}
          label={
            <span className="flex flex-col">
              <span className="break-words">{d.value}</span>
              <span className="text-sm text-muted-foreground">
                {DETAIL_NAMES[d.kind]} · {d.line}
              </span>
            </span>
          }
        />
      ))}
      {problem && <Notice>{problem}</Notice>}
      {canChange && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || kept.length === 0} onClick={() => send(kept)}>
            Add to their page
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => send([])}>
            No thanks
          </Button>
        </div>
      )}
    </section>
  )
}

// ---- The tick list ------------------------------------------------------------------

type TickPerson = Extract<Page, { view: 'ticks' }>['people'][number]

function Ticks({ people: list, left, canChange }: { people: TickPerson[]; left: number; canChange: boolean }) {
  const router = useRouter()
  const add = useServerFn(addTickedFn)
  const [picks, setPicks] = useState<Record<string, TickChoice | ''>>({})
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ good: boolean; text: string } | null>(null)
  const chosen = Object.entries(picks).filter((p): p is [string, TickChoice] => p[1] !== '')

  async function send() {
    setBusy(true)
    setSaid(null)
    try {
      const told = await add({ data: { picks: chosen.map(([personId, as]) => ({ personId, as })) } })
      setSaid(told.ok ? { good: true, text: `Added ${people(told.added)} to your contacts.` } : { good: false, text: told.message })
      if (told.ok) setPicks({})
    } catch {
      setSaid({ good: false, text: 'That did not save. Please try again.' })
    }
    setBusy(false)
    await router.invalidate()
  }

  if (list.length === 0) return <Empty>Nobody from your own contacts is waiting here.</Empty>
  return (
    <>
      <p className="text-sm text-muted-foreground">
        These people are in your Google Contacts or your phone, but did not turn up in the mail read so far. Choose what each one is, or leave them out. Anyone left out stays here; nothing is added unless you choose it.
        {left > list.length ? ` Showing the first ${list.length} of ${left}.` : ''}
      </p>
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {list.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold break-words">{p.name}</span>
              <span className="text-sm break-all text-muted-foreground">{p.line}</span>
              <span className="text-sm text-muted-foreground">From {p.from}</span>
            </span>
            <Select id={`tick-${p.id}`} label={`Add ${p.name} as`} hideLabel className="sm:w-56" disabled={!canChange} value={picks[p.id] ?? ''} onChange={(e) => setPicks({ ...picks, [p.id]: e.target.value as TickChoice | '' })}>
              <option value="">Leave out</option>
              {TICK_CHOICES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
          </li>
        ))}
      </ul>
      {said && <Notice good={said.good}>{said.text}</Notice>}
      {canChange && (
        <Button className="self-start" disabled={busy || chosen.length === 0} onClick={send}>
          {busy ? 'Adding' : chosen.length === 0 ? 'Add the ones I chose' : `Add the ${chosen.length} I chose`}
        </Button>
      )}
    </>
  )
}

// ---- Not contacts -------------------------------------------------------------------

type NotPerson = Extract<Page, { view: 'not' }>['people'][number]

function NotContacts({ people: list, total, q, canChange }: { people: NotPerson[]; total: number; q: string; canChange: boolean }) {
  const router = useRouter()
  const back = useServerFn(moveBackFn)
  const [typed, setTyped] = useState(q)
  const [problem, setProblem] = useState<string | null>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => void router.navigate({ to: '/contacts/build', search: typed.trim() ? { view: 'not', q: typed.trim() } : { view: 'not' }, replace: true }), 300)
    return () => clearTimeout(t)
  }, [typed])

  async function move(id: string) {
    setProblem(null)
    try {
      const told = await back({ data: { personId: id } })
      if (!told.ok) setProblem(told.message)
    } catch {
      setProblem('That did not save. Please try again.')
    }
    await router.invalidate()
  }
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Newsletters, notices, receipts and anyone you said No to. They are never proposed again. If someone here is a real contact, move them to your list and they come up as a card to fill in. {total.toLocaleString('en-US')} in all.
      </p>
      <Field id="not-search" label="Search by name or address" type="search" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" />
      {problem && <Notice>{problem}</Notice>}
      {list.length === 0 ? (
        <Empty>{q ? `Nobody here matches “${q}”.` : 'Nobody here.'}</Empty>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border bg-card">
          {list.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold break-words">{p.name ?? p.email ?? 'No name'}</span>
                {p.name && p.email && <span className="text-sm break-all text-muted-foreground">{p.email}</span>}
                {p.saidNo && <span className="text-sm text-muted-foreground">You said No</span>}
              </span>
              {canChange && (
                <Button variant="outline" className="shrink-0" onClick={() => void move(p.id)}>
                  Move to my list
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {list.length >= 100 && <p className="text-sm text-muted-foreground">Showing the first 100. Search to find someone.</p>}
    </>
  )
}

// ---- The phone's contact file ---------------------------------------------------------

function PhoneFile({ canChange }: { canChange: boolean }) {
  const router = useRouter()
  const send = useServerFn(phoneFileFn)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ good: boolean; text: ReactNode } | null>(null)

  async function chosen(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setSaid(null)
    try {
      // Photos are taken out here, in the browser, before anything is sent.
      const text = withoutPhotos(await file.text())
      if (text.length > MAX_FILE_CHARS) setSaid({ good: false, text: 'That file is too big to read in one go. Export your contacts in two or three smaller lists and add each one.' })
      else {
        const told = await send({ data: { text } })
        setSaid(
          told.ok
            ? { good: true, text: `Read ${people(told.read)}. ${told.known} matched someone already found. ${told.fresh} ${told.fresh === 1 ? 'is' : 'are'} new, waiting under “From your contacts” for you to choose who belongs.` }
            : { good: false, text: told.message },
        )
      }
    } catch {
      setSaid({ good: false, text: 'SunnyDay could not read that file. It should be a contact file from your phone, ending in .vcf.' })
    }
    setBusy(false)
    await router.invalidate()
  }

  return (
    <section className={box}>
      <h2 className="text-lg font-medium">Contacts that are only in your phone</h2>
      <p>Your phone can save all its contacts as one file. Choose that file here and SunnyDay reads the names, numbers and addresses in it.</p>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
        <li>On your iPhone, open the Contacts app.</li>
        <li>Tap Lists at the top left.</li>
        <li>Touch and hold “All Contacts”, then tap Export.</li>
        <li>Tap Done, then Save to Files, and save it.</li>
        <li>Come back here and choose that file below.</li>
      </ol>
      <p className="text-sm text-muted-foreground">Nobody is added to Contacts by this. People SunnyDay has not already found wait on a list where you choose who belongs. The file itself is not kept, and photos never leave your phone.</p>
      {canChange && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Your contact file</span>
          <input type="file" accept=".vcf,text/vcard,text/x-vcard" disabled={busy} onChange={(e) => void chosen(e.target.files?.[0])} className="min-h-11 w-full rounded-md border border-border bg-card px-3 py-2 text-base text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-secondary-foreground" />
        </label>
      )}
      {busy && <p className="text-sm text-muted-foreground">Reading the file.</p>}
      {said && <Notice good={said.good}>{said.text}</Notice>}
      {said?.good && (
        <Link to="/contacts/build" search={{ view: 'ticks' }} className="self-start text-primary underline underline-offset-2">
          Choose who belongs
        </Link>
      )}
    </section>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-xl border bg-card px-5 py-8 text-center text-muted-foreground">{children}</p>
