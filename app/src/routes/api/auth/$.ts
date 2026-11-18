// Google sends the browser back here after sign-in, and sign-out posts
// here. Everything under /api/auth/ is Better Auth's own.
import { createFileRoute } from '@tanstack/react-router'
import { getSignIn } from '@/auth/auth.server'
import { whenReady } from '@/server/db.server'

const handle = async (request: Request) => {
  await whenReady()
  return getSignIn().handler(request)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
})
