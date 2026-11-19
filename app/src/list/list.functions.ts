// The List Builder screens' server functions. Each runs the signed-in
// check, which also hands it the person's own workspace.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { signedInOnly } from '@/auth/auth.functions'
import { detailsInput, fileInput, listPageInput, manyRef, personRef, ticksInput, yesInput } from './list.schema'
import { details, hide, moveBack, no, page, phoneFile, start, status, ticks, yes, yesAll } from './list.server'

export const getListStatus = createServerFn({ method: 'GET' })
  .middleware([signedInOnly])
  .handler(({ context }) => status(context.me))

// POST, so a word typed into the "Not contacts" search never sits in a web address or a host's log.
export const getListPage = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(listPageInput)
  .handler(({ context, data }) => page(context.me, data.view, data.q))

export const startYearFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .handler(({ context }) => start(context.me))

export const sayYesFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(yesInput)
  .handler(({ context, data }) => yes(context.me, data))

export const sayNoFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(personRef)
  .handler(({ context, data }) => no(context.me, data.personId))

export const yesToAllFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(manyRef)
  .handler(({ context, data }) => yesAll(context.me, data.personIds))

export const moveBackFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(personRef)
  .handler(({ context, data }) => moveBack(context.me, data.personId))

export const keepDetailsFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(detailsInput)
  .handler(({ context, data }) => details(context.me, data.personId, data.keep))

export const addTickedFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(ticksInput)
  .handler(({ context, data }) => ticks(context.me, data.picks))

export const phoneFileFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(fileInput)
  .handler(({ context, data }) => phoneFile(context.me, data.text))

export const hideListCardFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(z.object({ hidden: z.boolean() }))
  .handler(({ context, data }) => hide(context.me, data.hidden))
