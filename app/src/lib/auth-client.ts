// The browser's side of sign-in: the Google button and Sign out. It talks
// to /api/auth/ on the same address; nothing secret is here.
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient()
