// The frame every screen sits in: a menu down the left on a computer or
// tablet, and on a phone a slim bar with a Menu button that opens the same
// list. One list of screens at every width.
import { IconMenu2, IconX } from '@tabler/icons-react'
import { Link, useLocation, useRouter } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { cn } from '@/lib/utils'
import { SCREENS } from './screens'
import { ThemeSwitch } from './theme-switch'
import { Wordmark } from './wordmark'

export type Who = { name: string; workspaceName: string }

export function Frame({ me, children }: { me: Who; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()

  // Going to another screen closes the phone menu.
  useEffect(() => setMenuOpen(false), [pathname])

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
        <Menu me={me} pathname={pathname} />
      </aside>

      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-card px-4 md:hidden">
        <Wordmark className="text-2xl" />
        <Button variant="outline" aria-expanded={menuOpen} aria-controls="phone-menu" onClick={() => setMenuOpen(true)}>
          <IconMenu2 aria-hidden className="size-5" />
          Menu
        </Button>
      </header>

      {menuOpen && (
        <div id="phone-menu" role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-20 flex flex-col bg-card md:hidden">
          <div className="flex h-14 items-center justify-between border-b px-4">
            <Wordmark className="text-2xl" />
            <Button variant="outline" onClick={() => setMenuOpen(false)}>
              <IconX aria-hidden className="size-5" />
              Close
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <Menu me={me} pathname={pathname} phone />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}

function Menu({ me, pathname, phone = false }: { me: Who; pathname: string; phone?: boolean }) {
  return (
    <>
      {!phone && (
        <div className="flex flex-col gap-1 px-5 pt-7 pb-4">
          <Wordmark className="text-3xl" />
          <span className="text-xs text-muted-foreground">{me.workspaceName}</span>
        </div>
      )}
      <nav aria-label="Screens" className="flex flex-1 flex-col gap-1 px-3 py-3">
        {SCREENS.map((s) => {
          const open = pathname === s.to
          return (
            <Link
              key={s.to}
              to={s.to}
              aria-current={open ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground',
                open && 'bg-secondary text-secondary-foreground hover:bg-secondary',
              )}
            >
              <s.icon aria-hidden className="size-5" />
              {s.name}
            </Link>
          )
        })}
      </nav>
      <div className="flex flex-col gap-3 border-t px-4 py-4 text-xs text-muted-foreground">
        <ThemeSwitch />
        <SignOut name={me.name} />
      </div>
    </>
  )
}

function SignOut({ name }: { name: string }) {
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)
  async function signOut() {
    setLeaving(true)
    await authClient.signOut()
    await router.navigate({ to: '/sign-in' })
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      {name}
      <Button variant="link" className="text-xs" disabled={leaving} onClick={signOut}>
        Sign out
      </Button>
    </span>
  )
}
