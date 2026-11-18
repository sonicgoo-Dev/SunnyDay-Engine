# Build 1 task plan: Skeleton and sign-in

Brief: `docs/briefs/build-01-skeleton-and-sign-in.md`. Branch: `build-01-skeleton`.

**Goal:** a deployable app with invite-only Google sign-in, the nine-screen
frame, and the workspace wall, with tests that hold each of them.

**Global constraints:** Node 22; nothing imported from Oomph Engine or
PlainSend; secrets only in settings; no technical words or exclamation
marks on a screen; phone width, light and dark; semantic color tokens only.

## Tasks

- [x] 1. **Repo and workspaces.** `shared`, `app`, `worker`; `.npmrc`,
  `.env.example`, `tsconfig.base.json`.
- [x] 2. **Settings check** (`shared/src/env.ts`). Tests: a missing setting
  is named, a value is never printed.
- [x] 3. **Schema and the wall** (`shared/src/db`, `shared/drizzle`). Tests:
  a `ws` row is invisible outside its workspace and with no workspace set;
  a write to another workspace is refused; every `ws` table has the wall;
  a superuser connection is refused.
- [x] 4. **Invited list and workspaces** (`directory.ts`). Tests: addresses
  normalised; `FIRST_INVITES` seeding; one workspace per agent even when
  two sign-ins race.
- [x] 5. **Startup** (`app/server/boot.ts`): wall check, table changes,
  first invites, ready flag; exit on failure. `/healthz` 503 until ready.
- [x] 6. **Sign-in** (`app/src/auth`). Tests: uninvited refused; unverified
  refused; invited let in whatever the capitals; invitation removed means
  no new session.
- [x] 7. **Frame and nine screens** (`app/src/frame`, `app/src/routes`).
  Tests: the nine in the plan's order, each with a page, honest wording.
- [x] 8. **Guard test**: every `createServerFn` uses `signedInOnly`; no
  page opens the database.
- [x] 9. **Worker** starts, checks the wall, idles, stops cleanly.
- [x] 10. **Rulebook, readme, `render.yaml`, help pages.**
- [x] 11. **Self-check and fresh reviewer**; fix what they find. Reviewer found no blockers; its ten findings are fixed (pool survives a database restart, a removed invitation stays removed, errors reach Sentry, visitors wait for startup, safer startup messages, wider tests).
- [ ] 12. **Show Eric.** Cost approval, his four click jobs, deploy on his
  go-ahead, his sign-in on a phone.

## Review focus

1. A signed-in person whose invitation is removed mid-session.
2. Two first sign-ins at the same moment (one workspace, not two).
3. A database user able to bypass the wall.
4. A setting missing on the host (plain message, no value printed).
5. Google returns an unverified address.

## To verify at deploy, not provable here

- Render's database user is neither superuser nor BYPASSRLS (else startup
  refuses, by design; fix is a second, ordinary user).
- Google sign-in end to end with the real client.
- Google "Testing" status: whether a tester's sign-in lapses after 7 days
  (sign-in scopes only; expected not to, but watch it before Build 2).
