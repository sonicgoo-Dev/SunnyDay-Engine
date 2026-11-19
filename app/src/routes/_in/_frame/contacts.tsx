import { createFileRoute } from '@tanstack/react-router'
import { titleFor } from '@/frame/coming-soon'
import { ContactsScreen, readListSearch } from '@/contacts/contacts-screen'
import { getContacts } from '@/contacts/contacts.functions'
import { getListStatus } from '@/list/list.functions'

export const Route = createFileRoute('/_in/_frame/contacts')({
  head: () => titleFor('/contacts'),
  validateSearch: readListSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [rows, list] = await Promise.all([getContacts({ data: { tab: deps.tab ?? 'clients', ...(deps.q ? { q: deps.q } : {}), ...(deps.away ? { putAway: true } : {}) } }), getListStatus()])
    return { rows, list }
  },
  component: Contacts,
})

function Contacts() {
  const { rows, list } = Route.useLoaderData()
  const search = Route.useSearch()
  return <ContactsScreen rows={rows} search={search} list={list} />
}
