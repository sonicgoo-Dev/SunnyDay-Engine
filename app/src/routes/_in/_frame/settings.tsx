import { createFileRoute } from '@tanstack/react-router'
import { titleFor } from '@/frame/coming-soon'
import { MAIL_NOTES, SettingsScreen, type MailNote } from '@/settings/settings-screen'
import { getSettingsView } from '@/settings/settings.functions'

export const Route = createFileRoute('/_in/_frame/settings')({
  head: () => titleFor('/settings'),
  // ?mail=connected and the like, set by the trip to Google and back. Anything else is ignored.
  validateSearch: (search): { mail?: MailNote } => (typeof search.mail === 'string' && search.mail in MAIL_NOTES ? { mail: search.mail as MailNote } : {}),
  loader: () => getSettingsView(),
  component: Settings,
})

function Settings() {
  const view = Route.useLoaderData()
  const { mail } = Route.useSearch()
  return <SettingsScreen view={view} {...(mail ? { note: mail } : {})} />
}
