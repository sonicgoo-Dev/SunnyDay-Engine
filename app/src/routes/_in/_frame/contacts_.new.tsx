import { createFileRoute } from '@tanstack/react-router'
import { AddScreen } from '@/contacts/add-screen'

export const Route = createFileRoute('/_in/_frame/contacts_/new')({
  head: () => ({ meta: [{ title: 'Add someone · SunnyDay' }] }),
  validateSearch: (s: Record<string, unknown>): { business?: boolean } => (s.business === true || s.business === 'true' ? { business: true } : {}),
  component: Add,
})

function Add() {
  const { business } = Route.useSearch()
  return <AddScreen startAsBusiness={business === true} />
}
