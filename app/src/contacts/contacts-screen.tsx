// The Contacts screen: three tabs (Clients, Leads, Business contacts), a
// search box that looks through every detail, and anyone folded away
// ("Not active", "Put away") at the bottom.
import { IconSearch } from '@tabler/icons-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { BuildCard, type Status } from '@/list/build-card'
import { cn } from '@/lib/utils'
import { SEARCH_LIMIT, TABS, businessRoleLabel, type Tab } from './contacts.schema'
import type { getContacts } from './contacts.functions'

type Row = Awaited<ReturnType<typeof getContacts>>[number]
export type ListSearch = { tab?: Tab; q?: string; away?: boolean }

/** Only what the screen understands; anything else in the address is ignored. */
export function readListSearch(s: Record<string, unknown>): ListSearch {
  const out: ListSearch = {}
  if (s.tab === 'clients' || s.tab === 'leads' || s.tab === 'business') out.tab = s.tab
  if (typeof s.q === 'string' && s.q.trim()) out.q = s.q.slice(0, 200)
  if (s.away === true || s.away === 'true' || s.away === 1 || s.away === '1') out.away = true
  return out
}

const EMPTY: Record<Tab, string> = {
  clients: 'No clients yet. Anyone past Talking shows here. Add someone with the Add button.',
  leads: 'No leads yet. New people you add show here until they are past Talking.',
  business: 'No business contacts yet: lenders, title, inspectors, other agents and referral partners.',
}

export function ContactsScreen({ rows, search, list }: { rows: Row[]; search: ListSearch; list: Status }) {
  const tab = search.tab ?? 'clients'
  const searching = Boolean(search.q)
  const active = rows.filter((r) => r.active)
  const resting = rows.filter((r) => !r.active)

  return (
    <div className="flex max-w-3xl flex-col gap-5 px-4 py-8 md:px-12 md:py-12">
      <h1 className="text-3xl font-medium md:text-4xl">Contacts</h1>

      {!searching && !search.away && !list.hidden && <BuildCard status={list} />}

      <SearchBox initial={search.q ?? ''} tab={tab} />

      {search.away ? (
        <PutAwayList rows={rows} />
      ) : searching ? (
        <section aria-label="Search results" className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{rows.length === 0 ? `Nobody matches “${search.q}”.` : `Matching “${search.q}” in every detail, across all tabs.`}</p>
          <List rows={rows} showTab />
          {rows.length >= SEARCH_LIMIT && <p className="text-sm text-muted-foreground">Showing the first {SEARCH_LIMIT}. Add another word to narrow it down.</p>}
        </section>
      ) : (
        <>
          <nav aria-label="Kinds of contact" className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
            {TABS.map((t) => (
              <Link
                key={t.tab}
                to="/contacts"
                search={{ tab: t.tab }}
                aria-current={t.tab === tab ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-semibold text-muted-foreground hover:text-foreground',
                  t.tab === tab && 'bg-card text-foreground shadow-sm',
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          {active.length === 0 ? <p className="rounded-xl border bg-card px-5 py-8 text-center text-muted-foreground">{EMPTY[tab]}</p> : <List rows={active} />}
          {resting.length > 0 && (
            <details className="rounded-xl border bg-card">
              <summary className="flex min-h-11 cursor-pointer items-center px-5 text-sm font-semibold">Not active</summary>
              <p className="px-5 pb-2 text-sm text-muted-foreground">Not now, not a lead, gone quiet or lost.</p>
              <div className="px-2 pb-2">
                <List rows={resting} />
              </div>
            </details>
          )}
          <Link to="/contacts" search={{ away: true }} className="self-start text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
            People you have put away
          </Link>
          {list.hidden && list.canChange && <BuildCard status={list} />}
        </>
      )}
    </div>
  )
}

function SearchBox({ initial, tab }: { initial: string; tab: Tab }) {
  const navigate = useNavigate()
  const [q, setQ] = useState(initial)
  const first = useRef(true)
  const box = useRef<HTMLInputElement>(null)
  // Follows the address (Back, a tab) but never overwrites what she is typing.
  useEffect(() => {
    if (document.activeElement !== box.current) setQ(initial)
  }, [initial])
  // Searches as she types, a moment after she stops.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => void navigate({ to: '/contacts', search: q.trim() ? { q: q.trim() } : { tab }, replace: true }), 300)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="relative">
      <label htmlFor="contact-search" className="sr-only">
        Search contacts
      </label>
      <IconSearch aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
      <input
        id="contact-search"
        ref={box}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by any detail"
        className="min-h-11 w-full rounded-md border border-border bg-card pr-3 pl-10 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
    </div>
  )
}

const TAB_NAME: Record<Tab, string> = { clients: 'Client', leads: 'Lead', business: 'Business contact' }

/** "Buyer · Touring", "Seller · Listed", or the company and role for a business contact. */
export function standing(r: { business: boolean; company: string | null; businessRole: string | null; buyerStage: string | null; sellerStage: string | null }): string {
  if (r.business) return [r.company, r.businessRole && businessRoleLabel(r.businessRole)].filter(Boolean).join(' · ')
  return [r.buyerStage && `Buyer · ${r.buyerStage}`, r.sellerStage && `Seller · ${r.sellerStage}`].filter(Boolean).join('   ')
}

function List({ rows, showTab = false }: { rows: Row[]; showTab?: boolean }) {
  if (rows.length === 0) return null
  return (
    <ul className="flex flex-col divide-y rounded-xl border bg-card">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            to="/contacts/$contactId"
            params={{ contactId: r.id }}
            className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          >
            <Initials name={r.fullName} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">
                {r.fullName}
                {r.goesBy && <span className="font-normal text-muted-foreground"> ({r.goesBy})</span>}
              </span>
              <span className="truncate text-sm text-muted-foreground">
                {showTab && `${r.active ? TAB_NAME[r.tab] : 'Not active'} · `}
                {standing(r)}
              </span>
              {r.nickname && <span className="truncate text-sm text-muted-foreground">Your private nickname: {r.nickname}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function PutAwayList({ rows }: { rows: Row[] }) {
  return (
    <section aria-label="Put away" className="flex flex-col gap-3">
      <h2 className="text-xl font-medium">Put away</h2>
      <p className="text-sm text-muted-foreground">People you have put away are hidden from your lists and search. Nothing about them was deleted. Open someone to bring them back.</p>
      {rows.length === 0 ? <p className="rounded-xl border bg-card px-5 py-8 text-center text-muted-foreground">Nobody is put away.</p> : <List rows={rows} />}
      <Link to="/contacts" className="self-start text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
        Back to Contacts
      </Link>
    </section>
  )
}

export function Initials({ name, large = false }: { name: string; large?: boolean }) {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
  const shown = letters.length > 1 ? letters[0]! + letters.at(-1)! : (letters[0] ?? '?')
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground', large ? 'size-16 text-xl' : 'size-10 text-sm')}>
      {shown}
    </span>
  )
}
