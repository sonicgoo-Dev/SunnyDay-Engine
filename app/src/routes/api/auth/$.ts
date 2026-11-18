// Google sends the browser back here after sign-in, and sign-out posts
// here. Everything under /api/auth/ is Better Auth's own.
import { createFileRoute } from '@tanstack/react-router'
import { getSignIn } from '@/auth/auth.server'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => getSignIn().handler(request),
      POST: ({ request }) => getSignIn().handler(request),
    },
  },
})
