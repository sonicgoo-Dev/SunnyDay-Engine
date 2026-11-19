// Reading the contact file a phone exports (.vcf). Each card becomes a
// person with a name, numbers, addresses and a company. Photos and
// everything else are ignored. The file itself is never stored: it is read
// once, here, and thrown away (decision 9).
import type { OutsidePerson } from '../mail/google-contacts.js'

/** The most cards taken from one file. A phone holds a few thousand at most. */
export const MAX_CARDS = 10_000

const unescape = (s: string) => s.replace(/\\n/gi, ', ').replace(/\\([,;:\\])/g, '$1').trim()

/** "=4A=6F=73=C3=A9" as text (older Android files). */
function quotedPrintable(s: string): string {
  const bytes: number[] = []
  const soft = s.replace(/=\r?\n/g, '')
  for (let i = 0; i < soft.length; i++) {
    const hex = soft[i] === '=' ? soft.slice(i + 1, i + 3) : ''
    if (/^[0-9a-f]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16))
      i += 2
    } else bytes.push(...Buffer.from(soft[i]!, 'utf8'))
  }
  return Buffer.from(bytes).toString('utf8')
}

const labelOf = (params: string) => {
  const p = params.toLowerCase()
  return /cell|mobile|iphone/.test(p) ? 'mobile' : /home/.test(p) ? 'home' : /work/.test(p) ? 'work' : 'other'
}

/** Every person in a contact file. A card with neither a number nor an address is left out. */
export function readContactFile(text: string): OutsidePerson[] {
  // A long line is folded onto the next, which then starts with a space; an old-style line may end with "=".
  const lines = text.replace(/\r\n?/g, '\n').replace(/=\n(?=\S)/g, '').replace(/\n[ \t]/g, '').split('\n')
  const people: OutsidePerson[] = []
  let card: (OutsidePerson & { formatted: string | null; structured: string | null }) | null = null
  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon < 1) continue
    // "item1.TEL;type=CELL" and "TEL;TYPE=CELL" are the same thing.
    const [rawName = '', ...paramParts] = line.slice(0, colon).split(';')
    const name = rawName.replace(/^[^.]*\./, '').toUpperCase()
    const params = paramParts.join(';')
    let value = line.slice(colon + 1)
    if (/quoted-printable/i.test(params)) value = quotedPrintable(value)
    if (name === 'BEGIN' && /^vcard$/i.test(value.trim())) card = { name: null, emails: [], phones: [], addresses: [], company: null, formatted: null, structured: null }
    else if (!card) continue
    else if (name === 'END') {
      const full = (card.formatted ?? card.structured ?? card.company ?? '').replace(/\s+/g, ' ').trim()
      if ((card.emails.length || card.phones.length) && people.length < MAX_CARDS) people.push({ name: full || null, emails: card.emails, phones: card.phones, addresses: card.addresses, company: card.company })
      card = null
    } else if (name === 'FN') card.formatted = unescape(value)
    else if (name === 'N') {
      // Family;Given;Middle;Prefix;Suffix
      const [family = '', given = '', middle = ''] = value.split(';').map(unescape)
      card.structured = [given, middle, family].filter(Boolean).join(' ')
    } else if (name === 'TEL') {
      const number = unescape(value).replace(/^tel:/i, '')
      if (number) card.phones.push({ value: number, label: labelOf(params) })
    } else if (name === 'EMAIL') {
      const email = unescape(value).toLowerCase()
      if (email) card.emails.push(email)
    } else if (name === 'ADR') {
      // PO box;extended;street;city;region;postcode;country
      const address = value.split(';').map(unescape).filter(Boolean).join(', ')
      if (address) card.addresses.push(address)
    } else if (name === 'ORG') card.company = unescape(value.split(';')[0] ?? '') || null
  }
  return people
}
