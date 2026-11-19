import { Link, createFileRoute } from '@tanstack/react-router'
import { ContactPageScreen } from '@/contacts/contact-page'
import { getContactPage } from '@/contacts/contacts.functions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const Route = createFileRoute('/_in/_frame/contacts_/$contactId')({
  loader: ({ params }) => {
    if (!UUID.test(params.contactId)) return null
    return getContactPage({ data: { contactId: params.contactId } })
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.page.fullName ?? 'Contact'} · SunnyDay` }] }),
  component: Contact,
  notFoundComponent: Missing,
})

function Contact() {
  const view = Route.useLoaderData()
  if (!view) return <Missing />
  return <ContactPageScreen view={view} />
}

function Missing() {
  return (
    <div className="flex max-w-2xl flex-col gap-4 px-4 py-8 md:px-12 md:py-12">
      <h1 className="text-3xl font-medium">Not found</h1>
      <p className="text-muted-foreground">That person is not in your contacts.</p>
      <Link to="/contacts" className="self-start text-primary underline underline-offset-2">
        Back to Contacts
      </Link>
    </div>
  )
}
