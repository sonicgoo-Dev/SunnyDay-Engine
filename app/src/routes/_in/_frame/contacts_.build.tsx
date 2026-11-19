import { createFileRoute } from '@tanstack/react-router'
import { BuildScreen, type BuildView } from '@/list/build-screen'
import { getListPage, getListStatus } from '@/list/list.functions'

const VIEWS: readonly BuildView[] = ['cards', 'details', 'ticks', 'not', 'phone']

export const Route = createFileRoute('/_in/_frame/contacts_/build')({
  head: () => ({ meta: [{ title: 'Build my list · SunnyDay' }] }),
  // Only what the page understands; anything else in the address is ignored.
  validateSearch: (s: Record<string, unknown>): { view?: BuildView; q?: string } => ({
    ...(VIEWS.includes(s.view as BuildView) && s.view !== 'cards' ? { view: s.view as BuildView } : {}),
    ...(typeof s.q === 'string' && s.q.trim() ? { q: s.q.slice(0, 100) } : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const view = deps.view ?? 'cards'
    const [status, page] = await Promise.all([getListStatus(), view === 'phone' ? null : getListPage({ data: { view, ...(view === 'not' && deps.q ? { q: deps.q } : {}) } })])
    return { status, page }
  },
  component: Build,
})

function Build() {
  const { status, page } = Route.useLoaderData()
  const search = Route.useSearch()
  return <BuildScreen status={status} page={page} view={search.view ?? 'cards'} q={search.q ?? ''} />
}
