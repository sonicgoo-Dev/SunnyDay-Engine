// One person's page: everything she knows about them. At the top their
// names, where they stand, and Call, Text and Email. Below, each part of
// the page, and the story (newest first) with a box for a quick note.
// The private nickname shows here and in search, never anywhere a client
// could see it.
import { IconMail, IconMessage, IconPhone } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Notice, Select, TextArea } from '@/components/ui/choice'
import { Field } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { BUSINESS_ROLES, businessRoleLabel, isBackward, partInput, stagesFor, type Side } from './contacts.schema'
import { addNoteFn, bringBackFn, moveStageFn, putAwayFn, saveContactPartFn } from './contacts.functions'
import type { getContactPage } from './contacts.functions'
import { Card, DatesPart, FoundPart, HouseholdPart, Nothing, OwnFieldsPart, PersonalPart, ReachPart, WantsPart, WaysPart, type Page } from './contact-parts'
import { Initials } from './contacts-screen'
import { useSave } from './use-save'
import { gmailCompose } from './reach-links'

type View = Awaited<ReturnType<typeof getContactPage>>

export function ContactPageScreen({ view }: { view: View }) {
  const { page } = view
  return (
    <div className="flex flex-col gap-5 px-4 py-6 md:px-12 md:py-10">
      <Link to="/contacts" search={page.business ? { tab: 'business' } : { tab: page.tab.tab }} className="self-start text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        Contacts
      </Link>
      {page.putAway && <PutAwayBanner page={page} />}
      <Top view={view} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <WaysPart key={`ways-${page.id}`} page={page} emailFrom={view.emailFrom} />
          {page.business ? (
            <>
              <PersonalPart key={`notes-${page.id}`} page={page} title="Notes" />
              <Card title="Deals worked together">
                <Nothing>Coming with Deals: every sale you worked on together.</Nothing>
              </Card>
            </>
          ) : (
            <>
              <ReachPart key={`reach-${page.id}`} page={page} />
              <HouseholdPart key={`home-${page.id}`} page={page} />
              <DatesPart key={`dates-${page.id}`} page={page} />
              <PersonalPart key={`personal-${page.id}`} page={page} />
              <WantsPart key={`wants-${page.id}`} page={page} />
              <FoundPart key={`found-${page.id}`} page={page} />
              <OwnFieldsPart key={`own-${page.id}`} page={page} />
              <Card title="Their deals">
                <Nothing>Coming with Deals: every purchase and sale, past and present.</Nothing>
              </Card>
              <Card title="What is next">
                <Nothing>Coming soon: the next call, message or deadline for this person.</Nothing>
              </Card>
            </>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Story key={`story-${page.id}`} page={page} />
          {!page.putAway && <PutAway page={page} />}
        </div>
      </div>
    </div>
  )
}

// ---- The top: names, standing, Call, Text, Email ---------------------------

function Top({ view }: { view: View }) {
  const { page } = view
  const save = useServerFn(saveContactPartFn)
  const { busy, problem, setProblem, run } = useSave()
  const [editing, setEditing] = useState(false)
  const [n, setN] = useState({ fullName: '', goesBy: '', nickname: '', company: '', businessRole: 'other' })
  const open = () => {
    setN({ fullName: page.fullName, goesBy: page.goesBy ?? '', nickname: page.nickname ?? '', company: page.company ?? '', businessRole: page.businessRole ?? 'other' })
    setEditing(true)
  }
  async function submit() {
    const part = { part: 'names' as const, ...n, businessRole: page.business ? (n.businessRole as 'lender') : null }
    const checked = partInput.safeParse(part)
    if (!checked.success) return setProblem(checked.error.issues[0]?.message ?? 'Check the names and try again.')
    if (await run(() => save({ data: { contactId: page.id, ...part } }))) setEditing(false)
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      {editing ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(ev) => {
            ev.preventDefault()
            void submit()
          }}
        >
          <Field id="n-full" label="Full name" value={n.fullName} onChange={(ev) => setN({ ...n, fullName: ev.target.value })} />
          {page.business ? (
            <>
              <Field id="n-company" label="Company" value={n.company} onChange={(ev) => setN({ ...n, company: ev.target.value })} />
              <Select id="n-role" label="What they do" value={n.businessRole} onChange={(ev) => setN({ ...n, businessRole: ev.target.value })}>
                {BUSINESS_ROLES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </>
          ) : (
            <Field id="n-goes" label="The name they go by" value={n.goesBy} onChange={(ev) => setN({ ...n, goesBy: ev.target.value })} hint="For example Bob for Robert. Messages to them will use this name." />
          )}
          <Field id="n-nick" label="Your private nickname for them" value={n.nickname} onChange={(ev) => setN({ ...n, nickname: ev.target.value })} hint="Only you see this. It is never used in anything they could see." />
          {problem && <Notice>{problem}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving' : 'Save'}
            </Button>
            <Button variant="quiet" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-4">
          <Initials name={page.fullName} large />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="text-2xl font-medium break-words md:text-3xl">{page.fullName}</h1>
            {page.goesBy && <p className="text-muted-foreground">Goes by {page.goesBy}</p>}
            {page.business && <p className="text-muted-foreground">{[page.company, page.businessRole && businessRoleLabel(page.businessRole)].filter(Boolean).join(' · ')}</p>}
            {page.nickname && (
              <p className="text-sm text-muted-foreground">
                Your private nickname: <span className="font-semibold text-foreground">{page.nickname}</span> <span>(only you see this)</span>
              </p>
            )}
          </div>
          <Button variant="quiet" onClick={open} aria-label="Edit names">
            Edit
          </Button>
        </div>
      )}
      <Reach view={view} />
      {!page.business && <Standing page={page} />}
    </section>
  )
}

/** The phone number and email the buttons use: a mobile first, else the first one listed. */
function firstOf(page: Page, kind: 'phone' | 'email') {
  const ways = page.ways.filter((w) => w.kind === kind)
  return (kind === 'phone' ? ways.find((w) => w.label === 'mobile') : undefined) ?? ways[0] ?? null
}

/**
 * Gmail, already signed in as her main address, with a new message to
 * them (decision 4 and rule 3: never the phone's own mail app, which could
 * be set to her other address).
 */

function Reach({ view }: { view: View }) {
  const { page, emailFrom } = view
  const phone = firstOf(page, 'phone')
  const email = firstOf(page, 'email')
  const digits = phone?.value.replace(/[^\d+]/g, '') ?? ''
  const why = {
    call: phone ? null : 'No phone number yet.',
    text: !phone ? 'No phone number yet.' : page.reach.noText ? 'They asked not to be texted.' : null,
    email: !email ? 'No email address yet.' : page.reach.noEmail ? 'They asked not to be emailed.' : !emailFrom ? 'Connect Gmail in Settings to email from here.' : null,
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <Action href={why.call ? null : `tel:${digits}`} icon={<IconPhone aria-hidden className="size-5" />} label="Call" />
        <Action href={why.text ? null : `sms:${digits}`} icon={<IconMessage aria-hidden className="size-5" />} label="Text" />
        <Action href={why.email || !email || !emailFrom ? null : gmailCompose(emailFrom, email.value)} icon={<IconMail aria-hidden className="size-5" />} label="Email" newTab />
      </div>
      {[why.call, why.text, why.email]
        .filter((w, i, all): w is string => w !== null && all.indexOf(w) === i)
        .map((w) => (
          <p key={w} className="text-sm text-muted-foreground">
            {w}
          </p>
        ))}
    </div>
  )
}

function Action({ href, icon, label, newTab = false }: { href: string | null; icon: ReactNode; label: string; newTab?: boolean }) {
  const look = 'flex min-h-12 items-center justify-center gap-2 rounded-md text-sm font-semibold'
  if (!href)
    return (
      <span aria-disabled="true" className={cn(look, 'border border-border text-muted-foreground opacity-60')}>
        {icon}
        {label}
      </span>
    )
  return (
    <a href={href} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className={cn(look, 'bg-primary text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring')}>
      {icon}
      {label}
    </a>
  )
}

// ---- Stages ----------------------------------------------------------------

function Standing({ page }: { page: Page }) {
  const save = useServerFn(saveContactPartFn)
  const { busy, problem, run } = useSave()
  const [changingSides, setChangingSides] = useState(false)
  const [sides, setSides] = useState({ buyer: true, seller: false })
  const present: Side[] = [...(page.buyerStage !== null ? (['buyer'] as const) : []), ...(page.sellerStage !== null ? (['seller'] as const) : [])]
  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      {present.map((side) => (
        <StageRow key={`${side}-${side === 'buyer' ? page.buyerStage : page.sellerStage}`} page={page} side={side} current={(side === 'buyer' ? page.buyerStage : page.sellerStage)!} />
      ))}
      {changingSides ? (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
          <Check id="sides-buyer" label="Buying" checked={sides.buyer} onChange={(ev) => setSides({ ...sides, buyer: ev.target.checked })} />
          <Check id="sides-seller" label="Selling" checked={sides.seller} onChange={(ev) => setSides({ ...sides, seller: ev.target.checked })} />
          {!sides.buyer && !sides.seller && <p className="text-sm text-warning-foreground">Keep at least one.</p>}
          {problem && <Notice>{problem}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || (!sides.buyer && !sides.seller)}
              onClick={async () => (await run(() => save({ data: { contactId: page.id, part: 'sides', ...sides } }))) && setChangingSides(false)}
            >
              Save
            </Button>
            <Button variant="quiet" onClick={() => setChangingSides(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="link"
          className="self-start text-sm"
          onClick={() => {
            setSides({ buyer: page.buyerStage !== null, seller: page.sellerStage !== null })
            setChangingSides(true)
          }}
        >
          {present.length === 2 ? 'Buying and selling' : present[0] === 'buyer' ? 'Also selling?' : 'Also buying?'}
        </Button>
      )}
    </div>
  )
}

function StageRow({ page, side, current }: { page: Page; side: Side; current: string }) {
  const move = useServerFn(moveStageFn)
  const { busy, problem, setProblem, run } = useSave()
  const [asking, setAsking] = useState<string | null>(null)

  async function go(to: string, confirmBack = false) {
    if (to === current) return
    if (isBackward(side, current, to) && !confirmBack) return setAsking(to)
    const moved = await run(async () => {
      const r = await move({ data: { contactId: page.id, side, to, confirmBack } })
      if (r.ok) return { ok: true }
      return { ok: false, message: r.reason === 'gone' ? 'That person is no longer in your contacts.' : r.reason === 'confirm' ? 'Confirm the move back first.' : 'That stage could not be set.' }
    })
    if (moved) setAsking(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <Select id={`stage-${side}`} label={side === 'buyer' ? 'Buyer stage' : 'Seller stage'} value={current} disabled={busy} onChange={(ev) => void go(ev.target.value)}>
        {stagesFor(side).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      {asking && (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
          <p className="text-sm">
            Move back to {asking}? They are at {current} now.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void go(asking, true)}>
              Yes, move back
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setAsking(null)
                setProblem(null)
              }}
            >
              Keep at {current}
            </Button>
          </div>
        </div>
      )}
      {problem && <Notice>{problem}</Notice>}
    </div>
  )
}

// ---- The story -------------------------------------------------------------

/** A date and time in her own clock. Filled in once the page is in the browser, which knows her time zone. */
function When({ iso }: { iso: string }) {
  const [text, setText] = useState(iso.slice(0, 10))
  useEffect(() => {
    const d = new Date(iso)
    const sameYear = d.getFullYear() === new Date().getFullYear()
    setText(`${d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`)
  }, [iso])
  return <time dateTime={iso}>{text}</time>
}

type Item = Page['story'][number]

function says(e: Item): { title: string; detail?: string | null } {
  const b = e.body
  switch (e.kind) {
    case 'added':
      return { title: 'Added to your contacts', detail: b.text ? `Found you through: ${b.text}` : null }
    case 'stage':
      return b.to ? { title: `${b.side === 'seller' ? 'Seller' : 'Buyer'} stage: ${b.from ? `${b.from} to ${b.to}` : b.to}` } : { title: b.text ?? 'Stage changed' }
    case 'note':
      return { title: 'Note', detail: b.text ?? null }
    case 'found':
      return { title: `How they found you: changed to ${b.to ?? ''}`, detail: b.was ? `First recorded as: ${b.was}` : null }
    case 'household':
      return { title: b.withName ? `Linked as one household with ${b.withName}` : (b.text ?? 'Household changed') }
    case 'put_away':
      return { title: 'Put away' }
    case 'brought_back':
      return { title: 'Brought back' }
    case 'email':
      return {
        title: e.direction === 'out' ? `Email to them from ${e.mailbox}` : `Email from them to ${e.mailbox}`,
        detail: [b.text, e.excerpt].filter(Boolean).join(' · ') || null,
      }
  }
}

function Story({ page }: { page: Page }) {
  const add = useServerFn(addNoteFn)
  const { busy, problem, run } = useSave()
  const [text, setText] = useState('')
  return (
    <Card title="Their story">
      <form
        className="flex flex-col gap-2"
        onSubmit={async (ev) => {
          ev.preventDefault()
          if (!text.trim()) return
          if (await run(() => add({ data: { contactId: page.id, text } }))) setText('')
        }}
      >
        <TextArea id="story-note" label="Add a note" hideLabel rows={2} value={text} onChange={(ev) => setText(ev.target.value)} placeholder="Add a note to their story" />
        <Button type="submit" variant="outline" className="self-start" disabled={busy || !text.trim()}>
          {busy ? 'Saving' : 'Add note'}
        </Button>
        {problem && <Notice>{problem}</Notice>}
      </form>
      <ol className="flex flex-col gap-4 border-t pt-4">
        {page.story.map((e) => {
          const s = says(e)
          return (
            <li key={`${e.kind}-${e.id}`} className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">
                <When iso={e.at} />
              </span>
              <span className="font-semibold">{s.title}</span>
              {s.detail && <span className="break-words whitespace-pre-line text-sm text-muted-foreground">{s.detail}</span>}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

// ---- Put away --------------------------------------------------------------

function PutAway({ page }: { page: Page }) {
  const away = useServerFn(putAwayFn)
  const { busy, problem, run } = useSave()
  const [asking, setAsking] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      {asking ? (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
          <p className="text-sm">Put {page.fullName} away? They are hidden from your lists and search. Nothing is deleted, and you can bring them back.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void run(() => away({ data: { contactId: page.id } }))}>
              Yes, put away
            </Button>
            <Button variant="quiet" onClick={() => setAsking(false)}>
              Keep
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="quiet" className="self-start text-sm" onClick={() => setAsking(true)}>
          Put away
        </Button>
      )}
      {problem && <Notice>{problem}</Notice>}
    </div>
  )
}

function PutAwayBanner({ page }: { page: Page }) {
  const back = useServerFn(bringBackFn)
  const { busy, problem, run } = useSave()
  return (
    <div className="flex flex-col gap-2 rounded-md bg-warning px-4 py-3 text-warning-foreground">
      <p className="text-sm">{page.fullName} is put away: hidden from your lists and search.</p>
      <Button variant="outline" className="self-start" disabled={busy} onClick={() => void run(() => back({ data: { contactId: page.id } }))}>
        Bring back
      </Button>
      {problem && <Notice>{problem}</Notice>}
    </div>
  )
}
