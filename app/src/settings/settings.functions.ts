// The Settings screen's server functions. Each runs the signed-in check,
// which also hands it the person's own workspace.
import { createServerFn } from '@tanstack/react-start'
import { signedInOnly } from '@/auth/auth.functions'
import { disconnectInput, limitInput, secondMailboxInput } from './settings.schema'
import { changeAiLimit, connectSecondMailbox, disconnect, settingsView } from './settings.server'

export const getSettingsView = createServerFn({ method: 'GET' })
  .middleware([signedInOnly])
  .handler(({ context }) => settingsView(context.me))

export const saveAiLimit = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(limitInput)
  .handler(({ context, data }) => changeAiLimit(context.me, data.dollars))

export const saveSecondMailbox = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(secondMailboxInput)
  .handler(({ context, data }) => connectSecondMailbox(context.me, data))

export const removeMailbox = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(disconnectInput)
  .handler(({ context, data }) => disconnect(context.me, data.mailboxId))
