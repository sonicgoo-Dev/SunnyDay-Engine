// The session check every server function runs: no live session, or
// someone no longer invited, and the function refuses by sending the
// browser to the sign-in page. It also hands each function the workspace
// it must work in, so no function ever takes a workspace number from the
// browser. A test reads every *.functions.ts file and fails if a server
// function is made without it.
import { redirect } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { signedIn } from './auth.server'

export const signedInOnly = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const me = await signedIn(new Headers(getRequestHeaders()))
  if (!me) throw redirect({ to: '/sign-in' })
  return next({ context: { me } })
})

/** Who is signed in. Pages call it before they show anything. Only what the screen needs. */
export const getMe = createServerFn({ method: 'GET' })
  .middleware([signedInOnly])
  .handler(({ context }) => ({ name: context.me.name, workspaceName: context.me.workspaceName, role: context.me.role }))
