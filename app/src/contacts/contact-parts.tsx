// The parts of a contact page, each shown plainly with an Edit button that
// opens it for changing in place. Every part is optional.
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Notice, Select, TextArea } from '@/components/ui/choice'
import { Field } from '@/components/ui/field'
import { FOUND_BY, RELATIONS, WAY_LABELS, foundByLabel, partInput, type PartInput } from './contacts.schema'
import { addFamilyFn, addFieldFn, joinHouseholdFn, leaveHouseholdFn, removeFamilyFn, saveContactPartFn, setFieldValueFn } from './contacts.functions'
import type { getContactPage } from './contacts.functions'
import { PersonPicker } from './person-picker'
import { gmailCompose, phoneDigits } from './reach-links'
import { useSave } from './use-save'

export type Page = Awaited<ReturnType<typeof getContactPage>>['page']

// ---- Shared pieces ---------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** "June 1, 1970" from "1970-06-01", the same on every computer. */
export const longDate = (d: string | null) => {
  if (!d) return null
  const [y, m, day] = d.split('-').map(Number)
  return `${MONTHS[(m ?? 1) - 1]} ${day}, ${y}`
}

export function Card({ title, onEdit, editing, children }: { title: string; onEdit?: () => void; editing?: boolean; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">{title}</h2>
        {onEdit && !editing && (
          <Button variant="quiet" onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}>
            Edit
          </Button>
        )}
      </div>
      {children}
    </section>
  )
}

/** Label and value, or nothing at all when the value is empty. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '' || children === false) return null
  return (
    <div className="flex flex-col">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="break-words whitespace-pre-line">{children}</span>
    </div>
  )
}

export const Nothing = ({ children = 'Nothing yet.' }: { children?: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>

/** The Save and Cancel pair under every editor, with any problem above it. */
function SaveBar({ busy, problem, onCancel }: { busy: boolean; problem: string | null; onCancel: () => void }) {
  return (
    <>
      {problem && <Notice>{problem}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving' : 'Save'}
        </Button>
        <Button variant="quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </>
  )
}

/** An editor for one part: checks it as the server will, saves it, and closes. */
function useEditor(contactId: string) {
  const save = useServerFn(saveContactPartFn)
  const { busy, problem, setProblem, run } = useSave()
  const [editing, setEditing] = useState(false)
  async function submit(part: PartInput) {
    const checked = partInput.safeParse(part)
    if (!checked.success) return setProblem(checked.error.issues[0]?.message ?? 'Check what you typed and try again.')
    if (await run(() => save({ data: { contactId, ...part } as never }))) setEditing(false)
  }
  return { editing, setEditing, busy, problem, submit }
}

// ---- Contact (phones, emails, addresses) -----------------------------------

type Way = { kind: 'phone' | 'email'; value: string; label: string }

export function WaysPart({ page, emailFrom }: { page: Page; emailFrom: string | null }) {
  const e = useEditor(page.id)
  const [ways, setWays] = useState<Way[]>([])
  const [mailing, setMailing] = useState('')
  const [home, setHome] = useState('')
  const open = () => {
    setWays(page.ways.map(({ kind, value, label }) => ({ kind, value, label })))
    setMailing(page.mailingAddress ?? '')
    setHome(page.homeAddress ?? '')
    e.setEditing(true)
  }
  const change = (i: number, w: Partial<Way>) => setWays(ways.map((x, j) => (j === i ? { ...x, ...w } : x)))

  return (
    <Card title="Contact" onEdit={open} editing={e.editing}>
      {e.editing ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(ev) => {
            ev.preventDefault()
            void e.submit({ part: 'ways', ways: ways.filter((w) => w.value.trim()) as never, mailingAddress: mailing, homeAddress: home })
          }}
        >
          {ways.map((w, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border p-3">
              <Field
                id={`way-${i}`}
                label={w.kind === 'phone' ? 'Phone' : 'Email'}
                type={w.kind === 'phone' ? 'tel' : 'email'}
                value={w.value}
                onChange={(ev) => change(i, { value: ev.target.value })}
              />
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select id={`way-label-${i}`} label="Label" value={w.label} onChange={(ev) => change(i, { label: ev.target.value })}>
                    {WAY_LABELS.map((l) => (
                      <option key={l} value={l}>
                        {l[0]!.toUpperCase() + l.slice(1)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button variant="outline" aria-label={`Remove ${w.value || w.kind}`} onClick={() => setWays(ways.filter((_, j) => j !== i))}>
                  <IconTrash aria-hidden className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setWays([...ways, { kind: 'phone', value: '', label: 'mobile' }])}>
              <IconPlus aria-hidden className="size-4" />
              Phone
            </Button>
            <Button variant="outline" onClick={() => setWays([...ways, { kind: 'email', value: '', label: 'other' }])}>
              <IconPlus aria-hidden className="size-4" />
              Email
            </Button>
          </div>
          <TextArea id="mailing" label="Mailing address" rows={2} value={mailing} onChange={(ev) => setMailing(ev.target.value)} />
          <TextArea id="home" label="Current home address" rows={2} value={home} onChange={(ev) => setHome(ev.target.value)} />
          <SaveBar busy={e.busy} problem={e.problem} onCancel={() => e.setEditing(false)} />
        </form>
      ) : page.ways.length === 0 && !page.mailingAddress && !page.homeAddress ? (
        <Nothing>No phone or email yet.</Nothing>
      ) : (
        <div className="flex flex-col gap-3">
          {page.ways.map((w) => (
            <div key={w.id} className="flex flex-col">
              <span className="text-sm text-muted-foreground">{w.label[0]!.toUpperCase() + w.label.slice(1)}</span>
              {w.kind === 'phone' ? (
                <a href={`tel:${phoneDigits(w.value)}`} className="break-all text-primary underline-offset-2 hover:underline">
                  {w.value}
                </a>
              ) : emailFrom && !page.reach.noEmail ? (
                // Same as the Email button: Gmail, as the main address.
                <a href={gmailCompose(emailFrom, w.value)} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline-offset-2 hover:underline">
                  {w.value}
                </a>
              ) : (
                <span className="break-all">{w.value}</span>
              )}
            </div>
          ))}
          <Detail label="Mailing address">{page.mailingAddress}</Detail>
          <Detail label="Current home address">{page.homeAddress}</Detail>
        </div>
      )}
    </Card>
  )
}

// ---- How to reach them -----------------------------------------------------

const WAY_NAMES: Record<string, string> = { call: 'A call', text: 'A text', email: 'An email' }

export function ReachPart({ page }: { page: Page }) {
  const e = useEditor(page.id)
  const [r, setR] = useState(page.reach)
  const open = () => {
    setR(page.reach)
    e.setEditing(true)
  }
  const r0 = page.reach
  return (
    <Card title="How to reach them" onEdit={open} editing={e.editing}>
      {e.editing ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(ev) => {
            ev.preventDefault()
            void e.submit({ part: 'reach', ...r, preferredWay: (r.preferredWay || null) as never })
          }}
        >
          <Select id="reach-way" label="Preferred way" value={r.preferredWay ?? ''} onChange={(ev) => setR({ ...r, preferredWay: ev.target.value || null })}>
            <option value="">Not known</option>
            <option value="call">A call</option>
            <option value="text">A text</option>
            <option value="email">An email</option>
          </Select>
          <Field id="reach-times" label="Best times" value={r.bestTimes ?? ''} onChange={(ev) => setR({ ...r, bestTimes: ev.target.value })} placeholder="Evenings, not before 9" />
          <Check id="reach-no-text" label="They asked not to be texted" checked={r.noText} onChange={(ev) => setR({ ...r, noText: ev.target.checked })} />
          <Check id="reach-no-email" label="They asked not to be emailed" checked={r.noEmail} onChange={(ev) => setR({ ...r, noEmail: ev.target.checked })} />
          <SaveBar busy={e.busy} problem={e.problem} onCancel={() => e.setEditing(false)} />
        </form>
      ) : !r0.preferredWay && !r0.bestTimes && !r0.noText && !r0.noEmail ? (
        <Nothing />
      ) : (
        <div className="flex flex-col gap-3">
          <Detail label="Preferred way">{r0.preferredWay && WAY_NAMES[r0.preferredWay]}</Detail>
          <Detail label="Best times">{r0.bestTimes}</Detail>
          {r0.noText && <p>Asked not to be texted.</p>}
          {r0.noEmail && <p>Asked not to be emailed.</p>}
        </div>
      )}
    </Card>
  )
}

// ---- Household -------------------------------------------------------------

const RELATION_NAMES: Record<string, string> = { partner: 'Partner', child: 'Child', parent: 'Parent', other: 'Family' }

export function HouseholdPart({ page }: { page: Page }) {
  const join = useServerFn(joinHouseholdFn)
  const leave = useServerFn(leaveHouseholdFn)
  const addFam = useServerFn(addFamilyFn)
  const removeFam = useServerFn(removeFamilyFn)
  const { busy, problem, run } = useSave()
  const [mode, setMode] = useState<'none' | 'link' | 'family' | 'leave'>('none')
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
  const [fam, setFam] = useState({ name: '', relation: 'child', birthday: '' })
  const home = page.household

  return (
    <Card title="Household">
      {!home || (home.contacts.length === 0 && home.family.length === 0) ? (
        <Nothing>No partner or family yet.</Nothing>
      ) : (
        <ul className="flex flex-col gap-2">
          {home.contacts.map((c) => (
            <li key={c.id}>
              <Link to="/contacts/$contactId" params={{ contactId: c.id }} className="font-semibold text-primary underline-offset-2 hover:underline">
                {c.fullName}
              </Link>
              <span className="text-sm text-muted-foreground"> · in your contacts</span>
            </li>
          ))}
          {home.family.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2">
              <span>
                <span className="font-semibold">{f.name}</span>
                <span className="text-sm text-muted-foreground">
                  {' '}
                  · {RELATION_NAMES[f.relation] ?? 'Family'}
                  {f.birthday && `, born ${longDate(f.birthday)}`}
                </span>
              </span>
              <Button variant="quiet" aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => setRemoving({ id: f.id, name: f.name })}>
                <IconTrash aria-hidden className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {removing && (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
          <p className="text-sm">Remove {removing.name} from this household? Their name and birthday are taken off every page in it.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={async () => (await run(() => removeFam({ data: { contactId: page.id, familyId: removing.id } }))) && setRemoving(null)}>
              Yes, remove
            </Button>
            <Button variant="quiet" onClick={() => setRemoving(null)}>
              Keep {removing.name}
            </Button>
          </div>
        </div>
      )}

      {mode === 'link' && (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
          <PersonPicker
            id="household-pick"
            label="Who shares their home?"
            except={page.id}
            hint="Someone already in your contacts. Their two pages will share one household."
            onPick={async (p) => {
              if (await run(() => join({ data: { contactId: page.id, otherId: p.id } }))) setMode('none')
            }}
          />
          <Button variant="quiet" className="self-start" onClick={() => setMode('none')}>
            Cancel
          </Button>
        </div>
      )}

      {mode === 'family' && (
        <form
          className="flex flex-col gap-3 rounded-md bg-muted p-3"
          onSubmit={async (ev) => {
            ev.preventDefault()
            if (!fam.name.trim()) return
            if (await run(() => addFam({ data: { contactId: page.id, name: fam.name, relation: fam.relation as 'child', birthday: fam.birthday || null } }))) {
              setFam({ name: '', relation: 'child', birthday: '' })
              setMode('none')
            }
          }}
        >
          <Field id="fam-name" label="Name" value={fam.name} onChange={(ev) => setFam({ ...fam, name: ev.target.value })} />
          <Select id="fam-relation" label="Who they are" value={fam.relation} onChange={(ev) => setFam({ ...fam, relation: ev.target.value })}>
            {RELATIONS.map((r) => (
              <option key={r} value={r}>
                {RELATION_NAMES[r]}
              </option>
            ))}
          </Select>
          <Field id="fam-birthday" label="Birthday, if you know it" type="date" value={fam.birthday} onChange={(ev) => setFam({ ...fam, birthday: ev.target.value })} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving' : 'Add'}
            </Button>
            <Button variant="quiet" onClick={() => setMode('none')}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {mode === 'leave' && (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
          <p className="text-sm">Take {page.fullName} out of this household? The others keep it, with its family.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={async () => (await run(() => leave({ data: { contactId: page.id } }))) && setMode('none')}>
              Yes, take them out
            </Button>
            <Button variant="quiet" onClick={() => setMode('none')}>
              Keep them in
            </Button>
          </div>
        </div>
      )}

      {problem && <Notice>{problem}</Notice>}
      {mode === 'none' && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setMode('link')}>
            Link a partner
          </Button>
          <Button variant="outline" onClick={() => setMode('family')}>
            Add child or family
          </Button>
          {home && home.contacts.length > 0 && (
            <Button variant="quiet" onClick={() => setMode('leave')}>
              Leave household
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

// ---- Dates -----------------------------------------------------------------

const DATE_PARTS = [
  ['birthday', 'Birthday'],
  ['weddingAnniversary', 'Wedding anniversary'],
  ['homePurchaseDate', 'Bought their home'],
  ['clientSince', 'Became a client'],
] as const

export function DatesPart({ page }: { page: Page }) {
  const e = useEditor(page.id)
  const [d, setD] = useState(page.dates)
  const open = () => {
    setD(page.dates)
    e.setEditing(true)
  }
  const any = DATE_PARTS.some(([k]) => page.dates[k])
  return (
    <Card title="Dates" onEdit={open} editing={e.editing}>
      {e.editing ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(ev) => {
            ev.preventDefault()
            void e.submit({ part: 'dates', ...d })
          }}
        >
          {DATE_PARTS.map(([k, label]) => (
            <Field key={k} id={`date-${k}`} label={label} type="date" value={d[k] ?? ''} onChange={(ev) => setD({ ...d, [k]: ev.target.value || null })} />
          ))}
          <SaveBar busy={e.busy} problem={e.problem} onCancel={() => e.setEditing(false)} />
        </form>
      ) : any ? (
        <div className="flex flex-col gap-3">
          {DATE_PARTS.map(([k, label]) => (
            <Detail key={k} label={label}>
              {longDate(page.dates[k])}
            </Detail>
          ))}
        </div>
      ) : (
        <Nothing />
      )}
    </Card>
  )
}

// ---- Personal notes --------------------------------------------------------

export function PersonalPart({ page, title = 'Personal notes' }: { page: Page; title?: string }) {
  const e = useEditor(page.id)
  const [text, setText] = useState('')
  const open = () => {
    setText(page.personalNotes ?? '')
    e.setEditing(true)
  }
  return (
    <Card title={title} onEdit={open} editing={e.editing}>
      {e.editing ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(ev) => {
            ev.preventDefault()
            void e.submit({ part: 'personal', personalNotes: text })
          }}
        >
          <TextArea id="personal" label={title} hideLabel rows={6} value={text} onChange={(ev) => setText(ev.target.value)} hint="Pets, work, hobbies, where they moved from, how they take their coffee." />
          <SaveBar busy={e.busy} problem={e.problem} onCancel={() => e.setEditing(false)} />
        </form>
      ) : page.personalNotes ? (
        <p className="break-words whitespace-pre-line">{page.personalNotes}</p>
      ) : (
        <Nothing>Pets, work, hobbies, where they moved from: anything you want to remember.</Nothing>
      )}
    </Card>
  )
}

// ---- What they want --------------------------------------------------------

const money = (n: number | null | undefined) => (typeof n === 'number' ? `$${n.toLocaleString('en-US')}` : null)
const toNumber = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ''))
  return s.trim() && Number.isFinite(n) ? Math.round(n) : null
}

export function WantsPart({ page }: { page: Page }) {
  const e = useEditor(page.id)
  const [b, setB] = useState(page.buyerWants)
  const [s, setS] = useState(page.sellerWants)
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const isBuyer = page.buyerStage !== null
  const isSeller = page.sellerStage !== null
  const open = () => {
    setB(page.buyerWants)
    setS(page.sellerWants)
    setPriceMin(page.buyerWants.priceMin?.toString() ?? '')
    setPriceMax(page.buyerWants.priceMax?.toString() ?? '')
    e.setEditing(true)
  }
  const bw = page.buyerWants
  const sw = page.sellerWants
  const range = bw.priceMin || bw.priceMax ? [money(bw.priceMin) ?? 'any', money(bw.priceMax) ?? 'any'].join(' to ') : null
  const buyerAny = range || bw.towns || bw.mustHaves || bw.dealBreakers || bw.preApproved != null || bw.lender || bw.timeframe || bw.relocatingFrom
  const sellerAny = sw.property || sw.why || sw.when || sw.whatMatters
  const text = (id: string, label: string, value: string | undefined, set: (v: string) => void, area = false) =>
    area ? <TextArea id={id} label={label} rows={2} value={value ?? ''} onChange={(ev) => set(ev.target.value)} /> : <Field id={id} label={label} value={value ?? ''} onChange={(ev) => set(ev.target.value)} />

  return (
    <Card title="What they want" onEdit={open} editing={e.editing}>
      {e.editing ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(ev) => {
            ev.preventDefault()
            void e.submit({ part: 'wants', buyerWants: { ...b, priceMin: toNumber(priceMin), priceMax: toNumber(priceMax) }, sellerWants: s })
          }}
        >
          {isBuyer && (
            <fieldset className="flex flex-col gap-4">
              <legend className="mb-2 text-base font-semibold">Buying</legend>
              <div className="grid grid-cols-2 gap-3">
                <Field id="w-min" label="Price from" inputMode="numeric" value={priceMin} onChange={(ev) => setPriceMin(ev.target.value)} placeholder="$400,000" />
                <Field id="w-max" label="Price up to" inputMode="numeric" value={priceMax} onChange={(ev) => setPriceMax(ev.target.value)} placeholder="$550,000" />
              </div>
              {text('w-towns', 'Towns and neighbourhoods', b.towns, (v) => setB({ ...b, towns: v }))}
              {text('w-must', 'Must-haves', b.mustHaves, (v) => setB({ ...b, mustHaves: v }), true)}
              {text('w-breakers', 'Deal-breakers', b.dealBreakers, (v) => setB({ ...b, dealBreakers: v }), true)}
              <Select id="w-pre" label="Pre-approved" value={b.preApproved === true ? 'yes' : b.preApproved === false ? 'no' : ''} onChange={(ev) => setB({ ...b, preApproved: ev.target.value === '' ? null : ev.target.value === 'yes' })}>
                <option value="">Not known</option>
                <option value="yes">Yes</option>
                <option value="no">Not yet</option>
              </Select>
              {text('w-lender', 'Lender', b.lender, (v) => setB({ ...b, lender: v }))}
              {text('w-time', 'When they want to move', b.timeframe, (v) => setB({ ...b, timeframe: v }))}
              {text('w-from', 'Relocating from', b.relocatingFrom, (v) => setB({ ...b, relocatingFrom: v }))}
            </fieldset>
          )}
          {isSeller && (
            <fieldset className="flex flex-col gap-4">
              <legend className="mb-2 text-base font-semibold">Selling</legend>
              {text('w-prop', 'The property', s.property, (v) => setS({ ...s, property: v }), true)}
              {text('w-why', 'Why they are selling', s.why, (v) => setS({ ...s, why: v }), true)}
              {text('w-when', 'When', s.when, (v) => setS({ ...s, when: v }))}
              {text('w-matters', 'What matters most to them', s.whatMatters, (v) => setS({ ...s, whatMatters: v }), true)}
            </fieldset>
          )}
          <SaveBar busy={e.busy} problem={e.problem} onCancel={() => e.setEditing(false)} />
        </form>
      ) : !buyerAny && !sellerAny ? (
        <Nothing />
      ) : (
        <div className="flex flex-col gap-4">
          {isBuyer && buyerAny && (
            <div className="flex flex-col gap-3">
              {isSeller && <h3 className="font-semibold">Buying</h3>}
              <Detail label="Price">{range}</Detail>
              <Detail label="Towns and neighbourhoods">{bw.towns}</Detail>
              <Detail label="Must-haves">{bw.mustHaves}</Detail>
              <Detail label="Deal-breakers">{bw.dealBreakers}</Detail>
              <Detail label="Pre-approved">{bw.preApproved === true ? 'Yes' : bw.preApproved === false ? 'Not yet' : null}</Detail>
              <Detail label="Lender">{bw.lender}</Detail>
              <Detail label="When they want to move">{bw.timeframe}</Detail>
              <Detail label="Relocating from">{bw.relocatingFrom}</Detail>
            </div>
          )}
          {isSeller && sellerAny && (
            <div className="flex flex-col gap-3">
              {isBuyer && <h3 className="font-semibold">Selling</h3>}
              <Detail label="The property">{sw.property}</Detail>
              <Detail label="Why they are selling">{sw.why}</Detail>
              <Detail label="When">{sw.when}</Detail>
              <Detail label="What matters most to them">{sw.whatMatters}</Detail>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ---- How they found you ----------------------------------------------------

export function FoundPart({ page }: { page: Page }) {
  const e = useEditor(page.id)
  const f = page.found
  const [foundBy, setFoundBy] = useState(f.foundBy ?? '')
  const [other, setOther] = useState('')
  const [referrer, setReferrer] = useState<{ id: string; fullName: string } | null>(null)
  const [name, setName] = useState('')
  const open = () => {
    setFoundBy(f.foundBy ?? '')
    setOther(f.foundByOther ?? '')
    setReferrer(f.referredBy)
    setName(f.referredByName ?? '')
    e.setEditing(true)
  }
  return (
    <Card title="How they found you" onEdit={open} editing={e.editing}>
      {e.editing ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(ev) => {
            ev.preventDefault()
            void e.submit({
              part: 'found',
              foundBy: foundBy as 'referral',
              foundByOther: foundBy === 'other' ? other : null,
              referredById: foundBy === 'referral' ? (referrer?.id ?? null) : null,
              referredByName: foundBy === 'referral' && !referrer ? name : null,
            })
          }}
        >
          <Notice>What you first recorded stays in their story.</Notice>
          <Select id="found-by" label="How they found you" value={foundBy} onChange={(ev) => setFoundBy(ev.target.value)}>
            <option value="" disabled>
              Choose one
            </option>
            {FOUND_BY.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
          {foundBy === 'other' && <Field id="found-other" label="How, in a few words" value={other} onChange={(ev) => setOther(ev.target.value)} />}
          {foundBy === 'referral' &&
            (referrer ? (
              <div className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2">
                <span>
                  Referred by <strong>{referrer.fullName}</strong>
                </span>
                <Button variant="quiet" onClick={() => setReferrer(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <PersonPicker id="found-referrer" label="Who referred them?" except={page.id} forReferral onPick={setReferrer} />
                <Field id="found-name" label="Or their name, if they are not in your contacts" value={name} onChange={(ev) => setName(ev.target.value)} />
              </>
            ))}
          <SaveBar busy={e.busy} problem={e.problem} onCancel={() => e.setEditing(false)} />
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          {f.foundBy ? <p>{[foundByLabel(f.foundBy), f.foundByOther].filter(Boolean).join(': ')}</p> : <Nothing>Not recorded.</Nothing>}
          {f.referredBy && (
            <Detail label="Referred by">
              <Link to="/contacts/$contactId" params={{ contactId: f.referredBy.id }} className="text-primary underline-offset-2 hover:underline">
                {f.referredBy.fullName}
              </Link>
            </Detail>
          )}
          <Detail label="Referred by">{!f.referredBy && f.referredByName}</Detail>
          {page.referred.length > 0 && (
            <Detail label="They have referred">
              <span className="flex flex-wrap gap-x-3">
                {page.referred.map((r) => (
                  <Link key={r.id} to="/contacts/$contactId" params={{ contactId: r.id }} className="text-primary underline-offset-2 hover:underline">
                    {r.fullName}
                  </Link>
                ))}
              </span>
            </Detail>
          )}
        </div>
      )}
    </Card>
  )
}

// ---- Her own fields --------------------------------------------------------

export function OwnFieldsPart({ page }: { page: Page }) {
  const setValue = useServerFn(setFieldValueFn)
  const addField = useServerFn(addFieldFn)
  const { busy, problem, run } = useSave()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<'text' | 'yesno'>('yesno')
  return (
    <Card title="Your own fields">
      {page.fields.length === 0 && !adding && <Nothing>Track anything else, such as “holiday card list”. A field you add shows on every contact.</Nothing>}
      {page.fields.map((f) =>
        f.type === 'yesno' ? (
          <Check
            key={f.id}
            id={`own-${f.id}`}
            label={f.name}
            checked={f.value === 'yes'}
            disabled={busy}
            onChange={(ev) => void run(() => setValue({ data: { contactId: page.id, fieldId: f.id, value: ev.target.checked ? 'yes' : null } }))}
          />
        ) : (
          <OwnText key={`${f.id}-${f.value ?? ''}`} id={f.id} name={f.name} value={f.value} onSave={(v) => run(() => setValue({ data: { contactId: page.id, fieldId: f.id, value: v } }))} />
        ),
      )}
      {adding ? (
        <form
          className="flex flex-col gap-3 rounded-md bg-muted p-3"
          onSubmit={async (ev) => {
            ev.preventDefault()
            if (!name.trim()) return
            if (await run(() => addField({ data: { name, type } }))) {
              setName('')
              setAdding(false)
            }
          }}
        >
          <Field id="own-new-name" label="Field name" value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Holiday card list" />
          <Select id="own-new-type" label="Kind" value={type} onChange={(ev) => setType(ev.target.value as 'text' | 'yesno')}>
            <option value="yesno">A tick: yes or no</option>
            <option value="text">Words</option>
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              Add field
            </Button>
            <Button variant="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>
          <IconPlus aria-hidden className="size-4" />
          Add a field
        </Button>
      )}
      {problem && <Notice>{problem}</Notice>}
    </Card>
  )
}

function OwnText({ id, name, value, onSave }: { id: string; name: string; value: string | null; onSave: (v: string | null) => Promise<boolean> }) {
  const [text, setText] = useState(value ?? '')
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(ev) => {
        ev.preventDefault()
        void onSave(text.trim() || null)
      }}
    >
      <div className="flex-1">
        <Field id={`own-${id}`} label={name} value={text} onChange={(ev) => setText(ev.target.value)} onBlur={() => (text.trim() || null) !== value && void onSave(text.trim() || null)} />
      </div>
    </form>
  )
}
