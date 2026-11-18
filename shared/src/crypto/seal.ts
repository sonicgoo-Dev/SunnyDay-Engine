// Sealing a mailbox's way in (rule 7): what is stored in the database is
// unreadable without CONNECTION_KEY, which lives only in the host's
// settings. Each sealed value is tied to its workspace, so a row copied
// into another workspace will not open there.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

export class SealError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SealError'
  }
}

const VERSION = 'v1'

function keyFor(connectionKey: string): Buffer {
  if (connectionKey.length < 32) throw new SealError('CONNECTION_KEY is not set, or is shorter than 32 characters.')
  return Buffer.from(hkdfSync('sha256', connectionKey, 'sunnyday', 'mailbox-connection', 32))
}

export function seal(connectionKey: string, workspaceId: string, plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFor(connectionKey), iv)
  cipher.setAAD(Buffer.from(workspaceId))
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

/** Opens a sealed value. Throws SealError (never the value) if the key, the workspace or the text is wrong. */
export function unseal(connectionKey: string, workspaceId: string, sealed: string): string {
  const [version, iv, tag, body] = sealed.split('.')
  if (version !== VERSION || !iv || !tag || !body) throw new SealError('This stored connection is not in a form SunnyDay can open.')
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFor(connectionKey), Buffer.from(iv, 'base64url'))
    decipher.setAAD(Buffer.from(workspaceId))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
  } catch (err) {
    if (err instanceof SealError) throw err
    throw new SealError('This stored connection could not be opened with the current key.')
  }
}
