import { createFileRoute } from '@tanstack/react-router'
import { titleFor } from '@/frame/coming-soon'
import { ContactsScreen, readListSearch } from '@/contacts/contacts-screen'
import { getContacts } from '@/contacts/contacts.functions'

export const Route = createFileRoute('/_in/_frame/contacts')({
  head: () => titleFor('/contacts'),
  validateSearch: readListSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getContacts({ data: { tab: deps.tab ?? 'clients', ...(deps.q ? { q: deps.q } : {}), ...(deps.away ? { putAway: true } : {}) } }),
  component: Contacts,
})

function Contacts() {
  const rows = Route.useLoaderData()
  const search = Route.useSearch()
  return <ContactsScreen rows={rows} search={search} />
}
