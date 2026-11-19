// What an error may say once it leaves the server's memory (a log, the job
// list, an error report). A failed database step names the values it was
// run with, and those can be a customer's words: they are cut off here.

/** A database error's message without the values the step was run with. */
export const withoutValues = (message: string): string => message.replace(/\nparams:[\s\S]*$/, '')

type Report = { message?: string; exception?: { values?: Array<{ value?: string }> } }

/** For the error reporter's "before sending" step: no report carries a query's values. */
export function scrubReport<T extends Report>(event: T): T {
  if (event.message) event.message = withoutValues(event.message)
  for (const v of event.exception?.values ?? []) if (v.value) v.value = withoutValues(v.value)
  return event
}
