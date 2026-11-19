// Every setting the app and the worker read, checked once at startup
// (rule 10: no host-specific code, everything from settings). A missing or
// malformed setting stops the process with a message that names the
// setting and never prints a value (rule 7).
import { z } from 'zod'

const url = z.string().url()

const schema = z.object({
  DATABASE_URL: z.string().min(1).refine((v) => /^postgres(ql)?:\/\//.test(v), 'must start with postgres://'),
  APP_URL: url.refine((v) => !v.endsWith('/'), 'must not end with a slash'),
  SIGNIN_SECRET: z.string().min(32, 'must be at least 32 characters'),
  SIGNIN_GOOGLE_CLIENT_ID: z.string().min(1),
  SIGNIN_GOOGLE_CLIENT_SECRET: z.string().min(1),
  FIRST_INVITES: z.string().default(''),
  SENTRY_DSN: z.string().default(''),
  // Seals each mailbox connection. Empty = mail connections are not switched
  // on yet; the app still starts and Settings says so.
  CONNECTION_KEY: z.string().default('').refine((v) => v === '' || v.length >= 32, 'must be at least 32 characters'),
})

export type Settings = z.infer<typeof schema>

export class SettingsError extends Error {
  constructor(readonly problems: string[]) {
    super(`Settings are missing or wrong: ${problems.join('; ')}. Fix them in the host's settings (or .env on this computer).`)
    this.name = 'SettingsError'
  }
}

/** Reads and checks the settings. Throws SettingsError naming each bad setting, never its value. */
export function readSettings(source: Record<string, string | undefined> = process.env): Settings {
  const parsed = schema.safeParse(source)
  if (parsed.success) return parsed.data
  const problems = parsed.error.issues.map((i) => {
    const name = i.path.join('.') || 'settings'
    const missing = source[name] === undefined || source[name] === ''
    return missing ? `${name} is not set` : `${name} ${i.message}`
  })
  throw new SettingsError([...new Set(problems)])
}

/** Only the database address: what the worker and the scripts need. */
export function readDatabaseUrl(source: Record<string, string | undefined> = process.env): string {
  const v = source.DATABASE_URL
  if (!v || !/^postgres(ql)?:\/\//.test(v)) throw new SettingsError(['DATABASE_URL is not set'])
  return v
}

const workerSchema = schema.pick({ DATABASE_URL: true, SENTRY_DSN: true, CONNECTION_KEY: true }).extend({
  // The worker renews Gmail connections, so it needs the same Google client as the app.
  SIGNIN_GOOGLE_CLIENT_ID: z.string().default(''),
  SIGNIN_GOOGLE_CLIENT_SECRET: z.string().default(''),
  // The Claude API key (Build 4). Only the worker holds it. Empty = the AI is
  // not switched on: List Builder still reads and sorts, then waits and says so.
  ANTHROPIC_API_KEY: z.string().default(''),
})
export type WorkerSettings = z.infer<typeof workerSchema>

/** The worker's settings. Only the database is required; without the rest it starts and does no mail work. */
export function readWorkerSettings(source: Record<string, string | undefined> = process.env): WorkerSettings {
  const parsed = workerSchema.safeParse(source)
  if (parsed.success) return parsed.data
  throw new SettingsError([...new Set(parsed.error.issues.map((i) => `${i.path.join('.') || 'settings'} ${i.message}`))])
}
