// Reading her Google Contacts for List Builder (Build 4). Read, never
// changed: the one request here can only ask (GET), and the permission
// SunnyDay holds ("see and download your contacts") allows nothing else.
// A test fails if this file ever gains a way to write.
import { z } from 'zod'
import { GOOGLE_TIMEOUT_MS, GoogleError, ReconnectNeeded, type Fetch } from './google-token.js'

const API = 'https://people.googleapis.com/v1/people/me/connections'

/** Google will not show the contacts: the permission was not given, or the service is not switched on. */
export class ContactsNotAllowed extends Error {
  constructor() {
    super('Google did not allow SunnyDay to read the contacts.')
    this.name = 'ContactsNotAllowed'
  }
}

export type OutsidePerson = { name: string | null; emails: string[]; phones: Array<{ value: string; label: string }>; addresses: string[]; company: string | null }

const text = z.string().optional()
const connections = z.object({
  connections: z
    .array(
      z.object({
        names: z.array(z.object({ displayName: text })).optional(),
        emailAddresses: z.array(z.object({ value: text })).optional(),
        phoneNumbers: z.array(z.object({ value: text, type: text })).optional(),
        addresses: z.array(z.object({ formattedValue: text })).optional(),
        organizations: z.array(z.object({ name: text })).optional(),
      }),
    )
    .default([]),
  nextPageToken: z.string().optional(),
})

const labelOf = (type: string | undefined) => (type === 'mobile' || type === 'home' || type === 'work' ? type : 'other')

/** One page of her contacts, with the mark for the next page. */
export async function googleContactsPage(doFetch: Fetch, accessToken: string, pageToken?: string): Promise<{ people: OutsidePerson[]; next: string | null }> {
  const q = new URLSearchParams({ personFields: 'names,emailAddresses,phoneNumbers,addresses,organizations', pageSize: '1000', ...(pageToken ? { pageToken } : {}) })
  const res = await doFetch(`${API}?${q}`, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) })
  if (res.status === 401) throw new ReconnectNeeded()
  if (res.status === 403) throw new ContactsNotAllowed()
  if (!res.ok) throw new GoogleError('reading the contacts', res.status)
  const got = connections.parse(await res.json())
  const people = got.connections.map((c) => ({
    name: c.names?.[0]?.displayName?.trim() || null,
    emails: (c.emailAddresses ?? []).map((e) => e.value?.trim().toLowerCase() ?? '').filter(Boolean),
    phones: (c.phoneNumbers ?? []).filter((p) => p.value?.trim()).map((p) => ({ value: p.value!.trim(), label: labelOf(p.type) })),
    addresses: (c.addresses ?? []).map((a) => a.formattedValue?.replace(/\s*\n\s*/g, ', ').trim() ?? '').filter(Boolean),
    company: c.organizations?.[0]?.name?.trim() || null,
  }))
  return { people, next: got.nextPageToken ?? null }
}
