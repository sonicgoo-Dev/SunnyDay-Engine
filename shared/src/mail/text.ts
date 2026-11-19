// Turning one message's body into the short plain text List Builder's AI
// reads: no markup, no quoted earlier replies, no endless whitespace, and
// never more than a set length. The text is used once and never stored.

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/** No body is read past this many characters: the AI is shown 2,000 at most, and mail is written by strangers. */
const MAX_BODY = 200_000

/**
 * Takes out every <style>, <script> and <head> with what is inside, and
 * every other tag. Written as one pass from left to right, not as a
 * pattern: a pattern here takes hours on a message made of "<" alone, and
 * anyone can send her one.
 */
function withoutTags(html: string): string {
  const lower = html.toLowerCase()
  let out = ''
  let i = 0
  while (i < html.length) {
    const open = html.indexOf('<', i)
    if (open < 0) return out + html.slice(i)
    out += html.slice(i, open)
    const close = html.indexOf('>', open)
    // A "<" that never closes: nothing after it is a tag, so the rest is plain words.
    if (close < 0) return out + html.slice(open)
    const tag = /^<(\/?)([a-z0-9]+)/.exec(lower.slice(open, open + 16))
    const name = tag?.[2] ?? ''
    i = close + 1
    if (!tag?.[1] && (name === 'style' || name === 'script' || name === 'head')) {
      const end = lower.indexOf(`</${name}`, i)
      // Never closed: everything after it is that style or script, not words.
      if (end < 0) return out
      const endClose = html.indexOf('>', end)
      if (endClose < 0) return out
      i = endClose + 1
      out += ' '
    } else out += name === 'br' || (tag?.[1] && /^(p|div|tr|li|h\d)$/.test(name)) ? '\n' : ' '
  }
  return out
}

/** A web-page style body as plain words. */
export function htmlToText(html: string): string {
  const quoted = html.slice(0, MAX_BODY).search(/<blockquote/i)
  return withoutTags(quoted < 0 ? html.slice(0, MAX_BODY) : html.slice(0, quoted))
    .replace(/&(#?\w+);/g, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? (/^#\d+$/.test(name) ? String.fromCodePoint(Number(name.slice(1))) : whole))
}

/** Cuts the earlier messages quoted under a reply, keeps the signature, trims, and caps the length. */
export function tidyMailText(raw: string, max = 2000): string {
  const lines = raw.slice(0, MAX_BODY).replace(/\r\n?/g, '\n').split('\n')
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
