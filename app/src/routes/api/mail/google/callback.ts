// Google sends the browser back here after the permission screen. The
// session, the browser and the workspace are all checked before anything is saved.
import { createFileRoute } from '@tanstack/react-router'
import { finishGmailConnect } from '@/mail/connect.server'

export const Route = createFileRoute('/api/mail/google/callback')({
  server: { handlers: { GET: ({ request }) => finishGmailConnect(request) } },
})
