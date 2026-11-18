// The sign-in page: the name and one button.
import { IconBrandGoogle } from '@tabler/icons-react'
import { createFileRoute, isRedirect, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { getMe } from '@/auth/auth.functions'
import { NOT_INVITED } from '@/auth/may-sign-in'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/frame/wordmark'
import { authClient } from '@/lib/auth-client'

// Better Auth sends the browser back here with ?error= when a sign-in does not finish.
const search = z.object({ error: z.string().max(100).optional() })

export const Route = createFileRoute('/sign-in')({
  validateSearch: search,
  beforeLoad: async ({ search }) => {
    if (search.error === NOT_INVITED) throw redirect({ to: '/not-invited' })
    // Already signed in on this device: straight in.
    let signedIn = false
    try {
      await getMe()
      signedIn = true
    } catch (e) {
      if (!isRedirect(e)) throw e
    }
    if (signedIn) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'SunnyDay · sign in' }] }),
  component: SignIn,
})

function SignIn() {
  const { error } = Route.useSearch()
  const [going, setGoing] = useState(false)

  async function signIn() {
    setGoing(true)
    await authClient.signIn.social({ provider: 'google', callbackURL: '/', errorCallbackURL: '/sign-in' })
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1>
        <Wordmark className="text-6xl" />
      </h1>
      <Button className="min-h-12 px-6 text-base" disabled={going} onClick={signIn}>
        <IconBrandGoogle aria-hidden className="size-5" />
        Sign in with Google
      </Button>
      {error && <p className="text-sm text-muted-foreground">Sign-in did not finish. Press the button to try again.</p>}
    </main>
  )
}
