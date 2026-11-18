// Where a Google account that is not on the invited list lands.
import { Link, createFileRoute } from '@tanstack/react-router'
import { Wordmark } from '@/frame/wordmark'

export const Route = createFileRoute('/not-invited')({
  head: () => ({ meta: [{ title: 'SunnyDay · by invitation' }] }),
  component: NotInvited,
})

function NotInvited() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 p-8 text-center">
      <Wordmark className="text-5xl" />
      <h1 className="text-2xl font-medium">SunnyDay is by invitation for now</h1>
      <p className="text-muted-foreground">
        That Google account is not on the invited list. If you were invited, sign in with the email address your invitation was sent to.
      </p>
      <Link className="font-semibold text-primary underline underline-offset-2" to="/sign-in">
        Try a different account
      </Link>
    </main>
  )
}
