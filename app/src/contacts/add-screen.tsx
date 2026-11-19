// Add someone by hand, in a few taps: a name, a phone or email, buyer or
// seller, and how they found you (rule 6: asked now, because it cannot be
// worked out later). "Add their partner too" puts a second person in the
// same household in the same step.
import { IconX } from '@tabler/icons-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Notice, Select } from '@/components/ui/choice'
import { Field } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { BUSINESS_ROLES, BUYER_STAGES, CLOSED_STAGES, FOUND_BY, SELLER_STAGES, addInput, type AddInput } from './contacts.schema'
import { addContactFn } from './contacts.functions'
import { PersonPicker } from './person-picker'

export function AddScreen({ startAsBusiness }: { startAsBusiness: boolean }) {
  const navigate = useNavigate()
  const add = useServerFn(addContactFn)
  const [business, setBusiness] = useState(startAsBusiness)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [buyer, setBuyer] = useState(true)
  const [seller, setSeller] = useState(false)
  const [buyerStage, setBuyerStage] = useState('New')
  const [sellerStage, setSellerStage] = useState('New')
  const [foundBy, setFoundBy] = useState('')
  const [foundByOther, setFoundByOther] = useState('')
  const [referrer, setReferrer] = useState<{ id: string; fullName: string } | null>(null)
  const [referredByName, setReferredByName] = useState('')
  const [withPartner, setWithPartner] = useState(false)
  const [partner, setPartner] = useState({ fullName: '', phone: '', email: '' })
  const [company, setCompany] = useState('')
  const [businessRole, setBusinessRole] = useState('lender')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const input: AddInput = business
      ? { business: true, fullName, phone, email, company, businessRole: businessRole as 'lender' }
      : {
          business: false,
          fullName,
          phone,
          email,
          buyer,
          seller,
          buyerStage: buyer ? buyerStage : null,
          sellerStage: seller ? sellerStage : null,
          foundBy: foundBy as 'referral',
          foundByOther: foundBy === 'other' ? foundByOther : null,
          referredById: foundBy === 'referral' ? (referrer?.id ?? null) : null,
          referredByName: foundBy === 'referral' && !referrer ? referredByName : null,
          partner: withPartner ? partner : null,
        }
    const checked = addInput.safeParse(input)
    if (!checked.success) {
      const issue = checked.error.issues[0]
      return setProblem(issue?.path[0] === 'foundBy' ? 'Choose how they found you.' : (issue?.message ?? 'Check the details and try again.'))
    }
    setBusy(true)
    setProblem(null)
    try {
      const done = await add({ data: input })
      if (!done.ok) return setProblem(done.message)
      await navigate({ to: '/contacts/$contactId', params: { contactId: done.id } })
    } catch {
      setProblem('That did not save. Check the details and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6 px-4 py-8 md:px-12 md:py-12" noValidate>
      <h1 className="text-3xl font-medium md:text-4xl">Add someone</h1>

      <Toggle
        label="Who is this?"
        options={[
          { value: false, text: 'A client or lead' },
          { value: true, text: 'A business contact' },
        ]}
        value={business}
        onChange={setBusiness}
      />

      <Section>
        <Field id="add-name" label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" required />
        <Field id="add-phone" label="Phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
        <Field id="add-email" label="Email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
      </Section>

      {business ? (
        <Section>
          <Field id="add-company" label="Company" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="off" />
          <Select id="add-role" label="What they do" value={businessRole} onChange={(e) => setBusinessRole(e.target.value)}>
            {BUSINESS_ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
        </Section>
      ) : (
        <>
          <Section>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-semibold">Buying, selling or both</legend>
              <div className="grid grid-cols-2 gap-2">
                <Pressed on={buyer} onClick={() => setBuyer(!buyer)}>
                  Buyer
                </Pressed>
                <Pressed on={seller} onClick={() => setSeller(!seller)}>
                  Seller
                </Pressed>
              </div>
            </fieldset>
            {buyer && <StagePick id="add-buyer-stage" label="Buyer stage" stages={[...BUYER_STAGES, ...CLOSED_STAGES]} value={buyerStage} onChange={setBuyerStage} />}
            {seller && <StagePick id="add-seller-stage" label="Seller stage" stages={[...SELLER_STAGES, ...CLOSED_STAGES]} value={sellerStage} onChange={setSellerStage} />}
          </Section>

          <Section>
            <Select id="add-found" label="How did they find you?" value={foundBy} onChange={(e) => setFoundBy(e.target.value)} hint="Asked now, because it is hard to remember later.">
              <option value="" disabled>
                Choose one
              </option>
              {FOUND_BY.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </Select>
            {foundBy === 'other' && <Field id="add-found-other" label="How, in a few words" value={foundByOther} onChange={(e) => setFoundByOther(e.target.value)} />}
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
                  <PersonPicker id="add-referrer" label="Who referred them?" onPick={setReferrer} hint="Someone in your contacts, or type their name below." />
                  <Field id="add-referrer-name" label="Or their name, if they are not in your contacts" value={referredByName} onChange={(e) => setReferredByName(e.target.value)} />
                </>
              ))}
          </Section>

          {withPartner ? (
            <Section>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Their partner</h2>
                <Button variant="quiet" onClick={() => setWithPartner(false)}>
                  <IconX aria-hidden className="size-4" />
                  Remove
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Same household, same stage, same way they found you.</p>
              <Field id="add-partner-name" label="Partner's full name" value={partner.fullName} onChange={(e) => setPartner({ ...partner, fullName: e.target.value })} autoComplete="off" />
              <Field id="add-partner-phone" label="Partner's phone" type="tel" inputMode="tel" value={partner.phone} onChange={(e) => setPartner({ ...partner, phone: e.target.value })} autoComplete="off" />
              <Field id="add-partner-email" label="Partner's email" type="email" inputMode="email" value={partner.email} onChange={(e) => setPartner({ ...partner, email: e.target.value })} autoComplete="off" />
            </Section>
          ) : (
            <Button variant="outline" className="self-start" onClick={() => setWithPartner(true)}>
              Add their partner too
            </Button>
          )}
        </>
      )}

      {problem && <Notice>{problem}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving' : 'Save'}
        </Button>
        <Link to="/contacts" className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
          Cancel
        </Link>
      </div>
    </form>
  )
}

function Section({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">{children}</section>
}

function Pressed({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-md border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

function Toggle<T extends boolean>({ label, options, value, onChange }: { label: string; options: Array<{ value: T; text: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{label}</legend>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn('min-h-11 rounded-md px-3 text-sm font-semibold text-muted-foreground', o.value === value && 'bg-card text-foreground shadow-sm')}
          >
            {o.text}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function StagePick({ id, label, stages, value, onChange }: { id: string; label: string; stages: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select id={id} label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {stages.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </Select>
  )
}
