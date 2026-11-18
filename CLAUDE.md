# CLAUDE.md — SunnyDay Engine

## Read this first

You are working with Eric Hempel. He is technical and learning, not a
developer, and he has ADD. The first user is his wife Amy, a real estate
broker in Port Angeles and Sequim, WA; about ten agents will test with her.

- Plain language. No unexplained jargon.
- Commands in copy boxes, with the folder to run them in and what success
  looks like. Click-by-click steps for anything he does himself.
- Do every step you can without him. He approves; he does not operate.
- Stop at each build's "show Eric" step. Never build ahead of the approved brief.
- If something in this file turns out to be a bad idea, say so.

The plans live in the "SunnyDay CRM" Claude project: **Master Plan** (what
and why) and **Build Plan** (22 builds, Gates A to D). When they disagree
with this file, the plans are newer and win; update this file to match.

## What this is

SunnyDay is a CRM for busy solo real estate agents, sold as a service from
day one: each agent has a private workspace. Agents (the AI kind) draft;
the human agent approves. One screen opens first.

**Nothing here is shared with Oomph Engine or PlainSend.** No code import,
no database, no key, no setting, no host service. The old Firebase
SunnyDay (`sunnyday-web`, `sunnyday-ios`) is reference only.

## The eleven rules (non-negotiable)

1. **The workspace wall.** Every table of customer data lives in the `ws`
   schema, has `workspace_id`, and is behind the database's own row
   security (`core.put_behind_wall`). All access goes through
   `inWorkspace(db, workspaceId, fn)`. The app refuses to start as a
   database user that can bypass the wall. A new `ws` table without the
   wall fails a test.
2. **Nothing reaches a client without the agent's approval.** Helpers
   (assistant, transaction coordinator) may edit; only the agent sends.
3. **Mail goes out only from the agent's main mailbox.** Other mailboxes
   (Amy's olypen address) are read only.
4. **A mailbox is read, never changed.** Never delete a sent email or a
   draft the agent edited.
5. **A deal's timeline is live only after the agent approves it.**
6. **Where a lead came from is recorded at the moment of capture.**
7. **Secrets live only in the host's settings** and Eric's password
   manager. Never in the repo, a screen, a log or a chat.
8. **Every workspace has its own AI spend limit.** At the limit the
   agents pause and say so.
9. **Nothing shared with Oomph Engine or PlainSend.**
10. **No host-specific code.** Settings come from the environment,
    checked at startup; `render.yaml` only describes the services.
11. **No training on client data.** Every workspace can export and delete
    its data.

Claude Code never, on its own: sends anything to a real client, reads a
real mailbox before permission, spends money, publishes to a website,
deletes data, or goes live. Those wait for Eric.

## Stack

TypeScript on Node 22, npm workspaces. TanStack Start (React, Vite, Nitro
`node-server`), Tailwind v4 with semantic tokens, TanStack Query, Drizzle
on PostgreSQL, Better Auth (Google), Zod at every boundary, Vitest,
Sentry. Hosted on Render. `.npmrc` sets `legacy-peer-deps=true`; keep it.

## Layout

```
shared/   settings check, database schema and table changes, the wall, the invited list
app/      the screens and sign-in (TanStack Start)
worker/   background jobs (idle until Build 2)
agents/   one folder per AI agent (later builds)
voice/    how each agent sounds (later builds; never committed with client text)
docs/     briefs/, plans/, help/ (the pages the in-app Guide reads)
```

Database schemas: `auth` (sign-in), `core` (workspaces, memberships,
invited list; no customer data), `ws` (all customer data, behind the wall).

In `app/`, a feature splits three ways: `name.schema.ts` (Zod),
`name.server.ts` (database, server only), `name.functions.ts`
(`createServerFn`, each with `.middleware([signedInOnly])`). A test fails
any server function without that check, and any page that opens the
database itself. Routes stay thin.

Anything that must run at startup goes in a Nitro plugin (`app/server/`).
State the server keeps (database pool, ready flag) hangs off one
`globalThis` symbol, because the bundle can hold two copies of a module.

## Screens

Nine, in this order: Today, Approvals, Contacts, Deals, Notes, Money,
Website, Agents, Settings. The list is `app/src/frame/screens.ts`; a test
holds it to the route files. A screen not yet built says honestly what is
coming. No technical words on any screen, no exclamation marks, no
badges or unread counts. Every screen works at phone width, light and dark.
Semantic color tokens only. A client's nickname is internal: it never
appears in anything a client could see.

## Hosting (Render)

Its own Render workspace, "SunnyDay" (never the one holding Oomph Engine
and PlainSend): web service `sunnyday-app` and database `sunnyday-db`
(Postgres 16), Oregon. Answers at `app.sunnydaycrm.com` (DNS at
Cloudflare, a DNS-only CNAME to `sunnyday-app.onrender.com`). Health check
`/healthz`. Live since Nov 17, 2026.

Known and harmless: at startup the sign-in library may warn that its
secret "appears low-entropy". `SIGNIN_SECRET` is Render's generated value;
the library's guess counts distinct characters and misjudges it. Leave it.

## Commands (run in the repo's top folder)

```
npm install          # once
npm run build        # builds shared, app, worker
npm test             # needs a local Postgres; see README
npm run typecheck
npm run db:generate  # after changing shared/src/db/schema
npm run invite -- someone@example.com
npm run uninvite -- someone@example.com   # takes it away and signs them out
```

## The build routine

Brief (Eric approves) → task plan in `docs/plans/` → build on a branch,
tests first → self-check and a fresh reviewer → show Eric (he approves) →
deploy on his go-ahead → help pages and the tracker in the Build Plan.

Git: small commits, plain messages. Work on a branch; Eric says when it
goes to `main`. A push to `main` deploys. Settings that turn something on
are set by hand in Render, never in `render.yaml`.

## Don't

- Don't put a secret in the repo, a screen, a log or a chat.
- Don't read or write a `ws` table outside `inWorkspace`.
- Don't add a paid service without Eric's approval of the cost.
- Don't touch anything belonging to Oomph Engine or PlainSend.
