// Google sign-in with Better Auth. Only a Google-verified address on the
// invited list ever gets a session. The check is here on the server: when
// a user would be created, when a session would be created, and again every
// time a session is read (so removing an invite locks that person out).
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  ensureWorkspace,
  isInvited,
  membershipsOf,
  type Db,
  type Role,
  type Settings,
} from '@sunnyday/shared'
import { APIError, betterAuth } from 'better-auth'
import { eq } from 'drizzle-orm'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getDb, getSettings, whenReady } from '@/server/db.server'
import { NOT_INVITED, maySignIn } from './may-sign-in'

const DAY = 60 * 60 * 24

type Candidate = { email?: string | null; emailVerified?: boolean | null } | null | undefined

async function refuseUnlessInvited(db: Db, user: Candidate) {
  const invited = await isInvited(db, user?.email)
  if (!maySignIn(user, invited)) throw new APIError('FORBIDDEN', { code: NOT_INVITED, message: 'SunnyDay is by invitation for now.' })
}

export function createSignIn(db: Db, s: Settings) {
  return betterAuth({
    appName: 'SunnyDay',
    baseURL: s.APP_URL,
    secret: s.SIGNIN_SECRET,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification },
    }),
    // A device stays signed in for 30 days from when it was last used.
    session: { expiresIn: 30 * DAY, updateAge: DAY },
    account: { encryptOAuthTokens: true },
    socialProviders: {
      google: {
        clientId: s.SIGNIN_GOOGLE_CLIENT_ID,
        clientSecret: s.SIGNIN_GOOGLE_CLIENT_SECRET,
        // Always show the account chooser, so the wrong account is easy to swap.
        prompt: 'select_account',
      },
    },
    // Anything that goes wrong in the Google round trip lands on the sign-in page.
    onAPIError: { errorURL: `${s.APP_URL}/sign-in` },
    advanced: { cookiePrefix: 'sunnyday' },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            await refuseUnlessInvited(db, user)
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            // Read straight from the database, so the check never depends on
            // how the session came to be made.
            const [user] = await db
              .select({ email: authUser.email, emailVerified: authUser.emailVerified })
              .from(authUser)
              .where(eq(authUser.id, session.userId))
              .limit(1)
            await refuseUnlessInvited(db, user)
          },
        },
      },
    },
  })
}

type SignIn = ReturnType<typeof createSignIn>
let signIn: SignIn | undefined

export function getSignIn(): SignIn {
  signIn ??= createSignIn(getDb(), getSettings())
  return signIn
}

/** The signed-in person and the one workspace they are working in. */
export type Me = { userId: string; name: string; email: string; workspaceId: string; workspaceName: string; role: Role }

/** The person these request headers belong to, if their session is live and they are still invited. */
export async function signedIn(headers: Headers): Promise<Me | null> {
  await whenReady()
  return whoIs(getSignIn(), getDb(), headers)
}

/** signedIn's work, with the sign-in and database handed in so a test can call it. */
export async function whoIs(auth: SignIn, db: Db, headers: Headers): Promise<Me | null> {
  const found = await auth.api.getSession({ headers })
  if (!found) return null
  // Checked on every page, not only at sign-in: taking an invitation away
  // locks that person out at once, whatever their session says.
  if (!maySignIn(found.user, await isInvited(db, found.user.email))) return null
  // Almost always one quick read; a first sign-in also makes the workspace.
  const member = (await membershipsOf(db, found.user.id))[0] ?? (await ensureWorkspace(db, { id: found.user.id, name: found.user.name }))
  return {
    userId: found.user.id,
    name: found.user.name,
    email: found.user.email,
    workspaceId: member.workspaceId,
    workspaceName: member.workspaceName,
    role: member.role,
  }
}
