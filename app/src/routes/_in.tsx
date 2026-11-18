// Every screen a signed-in person uses sits inside this group (the folder
// _in/). Before any of them shows, the server checks the session; without
// one, the check sends the browser to /sign-in and nothing of the page is sent.
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { getMe } from '@/auth/auth.functions'

export const Route = createFileRoute('/_in')({
  beforeLoad: async () => ({ me: await getMe() }),
  component: Outlet,
})
