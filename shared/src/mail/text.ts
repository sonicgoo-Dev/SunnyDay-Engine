// Turning one message's body into the short plain text List Builder's AI
// reads: no markup, no quoted earlier replies, no endless whitespace, and
// never more than a set length. The text is used once and never stored.

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/** A web-page style body as plain words. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<blockquote[\s\S]*$/i, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? (/^#\d+$/.test(name) ? String.fromCodePoint(Number(name.slice(1))) : whole))
}

/** Cuts the earlier messages quoted under a reply, keeps the signature, trims, and caps the length. */
export function tidyMailText(raw: string, max = 2000): string {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const kept: string[] = []
  for (const line of lines) {
    // "On Mon, Mar 3, 2025, Pat wrote:" or "-----Original Message-----" starts the quoted part.
    if (/^\s*On .{5,200} wrote:\s*$/.test(line) || /^\s*-{2,}\s*(Original|Forwarded) Message\s*-{2,}/i.test(line) || /^\s*From:\s.+/.test(line) && kept.length > 2) break
    if (/^\s*>/.test(line)) continue
    kept.push(line.replace(/[ \t]+/g, ' ').trimEnd())
  }
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}
