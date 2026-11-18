// What the Settings forms send. Shared by the browser and the server; the
// server checks it again whatever the browser did.
import { z } from 'zod'

export const limitInput = z.object({ dollars: z.number().int().min(0).max(200) })

export const secondMailboxInput = z.object({
  address: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(500),
  server: z.string().trim().toLowerCase().min(4).max(253),
})

export const disconnectInput = z.object({ mailboxId: z.string().uuid() })

/** The usual mail server name for an address: imap. plus what follows the @. */
export const usualServerFor = (address: string) => {
  const domain = address.trim().toLowerCase().split('@')[1] ?? ''
  return domain ? `imap.${domain}` : ''
}

export type SettingsView = {
  canChange: boolean
  mailReady: boolean
  mailboxes: Array<{ id: string; kind: 'gmail' | 'imap'; role: 'main' | 'read_only'; address: string; status: 'connected' | 'needs_reconnect'; lastReadAt: string | null; lastProblem: string | null }>
  ai: { limitDollars: number; spentDollars: number; paused: boolean }
}

export type Done = { ok: true } | { ok: false; message: string }
