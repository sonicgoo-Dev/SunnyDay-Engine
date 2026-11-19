// The links that reach a person. Email always opens Gmail as the agent's
// main address (rule 3): never a plain mailto link, which a phone hands to
// whatever mail account it prefers. app/test/mail-links.test.ts holds this.

export const gmailCompose = (from: string, to: string) =>
  `https://mail.google.com/mail/?authuser=${encodeURIComponent(from)}&view=cm&fs=1&to=${encodeURIComponent(to)}`

export const phoneDigits = (value: string) => value.replace(/[^\d+]/g, '')
