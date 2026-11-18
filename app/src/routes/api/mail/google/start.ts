// "Connect Gmail" in Settings sends the browser here; it checks the session
// itself and passes the agent on to Google's permission screen.
import { createFileRoute } from '@tanstack/react-router'
import { startGmailConnect } from '@/mail/connect.server'

export const Route = createFileRoute('/api/mail/google/start')({
  server: { handlers: { GET: ({ request }) => startGmailConnect(request) } },
})
