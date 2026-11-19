// What the contact screens send and get back. The checks themselves live
// in shared (browser-safe), so the screens and the server use the same
// ones; the server checks again whatever the browser did.
import { z } from 'zod'
import { contactRef, partInput } from '@sunnyday/shared/rules'

export * from '@sunnyday/shared/rules'

export const partSave = contactRef.and(partInput)

export type Done = { ok: true } | { ok: false; message: string }
export type Added = { ok: true; id: string } | { ok: false; message: string }

export const findInput = z.object({ q: z.string().trim().min(1).max(100), except: z.string().uuid().optional() })
