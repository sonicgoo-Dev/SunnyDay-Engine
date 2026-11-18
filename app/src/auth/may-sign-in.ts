// The one rule for who gets in, kept apart so it can be tested without a
// database or Google: a Google-verified address that is on the invited list.
export const NOT_INVITED = 'NOT_INVITED'

export function maySignIn(user: { emailVerified?: boolean | null } | null | undefined, invited: boolean): boolean {
  return !!user && user.emailVerified === true && invited
}
