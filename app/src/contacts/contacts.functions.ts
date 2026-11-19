// The contact screens' server functions. Each runs the signed-in check,
// which also hands it the person's own workspace.
import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { signedInOnly } from '@/auth/auth.functions'
import {
  addInput,
  contactRef,
  familyInput,
  familyRef,
  fieldInput,
  findInput,
  householdInput,
  listInput,
  noteInput,
  partSave,
  stageInput,
  valueInput,
} from './contacts.schema'
import { addPerson, away, back, contactPage, contactsList, family, field, fieldValue, findPeople, join, leave, note, savePart, stage, unfamily } from './contacts.server'

// Searches travel as POST so the words typed never sit in a web address or a host's log.
export const getContacts = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(listInput)
  .handler(({ context, data }) => contactsList(context.me, data))

export const getContactPage = createServerFn({ method: 'GET' })
  .middleware([signedInOnly])
  .validator(contactRef)
  .handler(async ({ context, data }) => {
    const view = await contactPage(context.me, data.contactId)
    if (!view) throw notFound()
    return view
  })

export const findContacts = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(findInput)
  .handler(({ context, data }) => findPeople(context.me, data.q, data.except, data.forReferral))

export const addContactFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(addInput)
  .handler(({ context, data }) => addPerson(context.me, data))

export const saveContactPartFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(partSave)
  .handler(({ context, data }) => {
    const { contactId, ...part } = data
    return savePart(context.me, contactId, part)
  })

export const moveStageFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(stageInput)
  .handler(({ context, data }) => stage(context.me, data))

export const addNoteFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(noteInput)
  .handler(({ context, data }) => note(context.me, data.contactId, data.text))

export const joinHouseholdFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(householdInput)
  .handler(({ context, data }) => join(context.me, data.contactId, data.otherId))

export const leaveHouseholdFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(contactRef)
  .handler(({ context, data }) => leave(context.me, data.contactId))

export const addFamilyFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(familyInput)
  .handler(({ context, data }) => family(context.me, data.contactId, data))

export const removeFamilyFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(familyRef)
  .handler(({ context, data }) => unfamily(context.me, data.contactId, data.familyId))

export const addFieldFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(fieldInput)
  .handler(({ context, data }) => field(context.me, data))

export const setFieldValueFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(valueInput)
  .handler(({ context, data }) => fieldValue(context.me, data.contactId, data.fieldId, data.value))

export const putAwayFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(contactRef)
  .handler(({ context, data }) => away(context.me, data.contactId))

export const bringBackFn = createServerFn({ method: 'POST' })
  .middleware([signedInOnly])
  .validator(contactRef)
  .handler(({ context, data }) => back(context.me, data.contactId))
