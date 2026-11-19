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

The plans are in `docs/plan/`: `master-plan.md` (what and why) and
`build-plan.md` (22 builds, Gates A to D, the tracker). They are copies of
the two live documents in the "SunnyDay CRM" Claude project; when a live
document is newer, it wins, and the copy here is brought up to date. When
the plans disagree with this file, the plans win; update this file to match.

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
Sentry, Anthropic's own library (`@anthropic-ai/sdk`, in `shared` only).
Hosted on Render. `.npmrc` sets `legacy-peer-deps=true`; keep it.

## Layout

```
shared/   settings check, database schema and table changes, the wall, the invited list
app/      the screens and sign-in (TanStack Start)
worker/   the background worker: works through the job list, a fair turn per workspace
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

## Mail connections and the engine room (Build 2)

- **Mailboxes** (`ws.mailbox`): one `main` Gmail mailbox per workspace
  (the only one mail will ever go out from) and any `read_only` second
  mailbox, read by signing in to its mail server (IMAP, port 993 only).
  The way in is stored sealed (`shared/src/crypto/seal.ts`) with
  `CONNECTION_KEY`, tied to its workspace. The app and the worker hold the
  same key; never change it once mailboxes are connected.
- **Reading only.** `shared/src/mail/gmail.ts` can only ask (one function,
  GET). `imap.ts` opens a folder in the server's read-only mode: the inbox,
  and for List Builder the sent folder too (Eric, Nov 18, 2026). The
  everyday read asks for the inbox's envelopes only. Tests read both files and fail on any call that
  marks, moves, drafts, sends or deletes. Drafting and sending arrive in
  Build 8, in their own file, behind Approvals.
- **What is kept** (`ws.mail_message`): who, when, subject and a short
  excerpt. Never the whole message. A first read looks back 14 days.
- **Google permissions**: read, plus draft and send, asked for once
  (Eric, Nov 17, 2026). The same Google client as sign-in, with a second
  return address: `/api/mail/google/callback`.
- **The job list** (`core.job`) sits outside the wall so the worker can be
  fair across workspaces; so a job holds a kind and ids only, never a
  customer's words. `claimNext` always serves the workspace that has
  waited longest. A mailbox is read every 5 minutes; a failed job is
  retried with a growing wait, and a read is never lost for good.
- **AI spending** (rule 8): every AI call goes through `withAiBudget`
  (`shared/src/ai/spend.ts`). Default limit $20 a month, set in Settings,
  $0 to $200. No AI agent exists yet; the first arrives in Build 4.
- **Only the agent** (never a helper) connects or disconnects a mailbox
  or changes the limit. Checked on the server.
- Addresses the browser travels to itself (`/api/mail/google/start` and
  `/callback`) check the session first; `app/test/guard.test.ts` lists
  them and holds them to it.

## Contacts (Build 3)

- **Where it lives**: `shared/src/contacts/` (`rules.ts` stages and tabs,
  `input.ts` the Zod checks, `store.ts` everything that reads or writes).
  `rules.ts` and `input.ts` are browser-safe and reach the screens as
  `@sunnyday/shared/rules`; never import the package root into the browser.
- **Tables** (`ws`, all behind the wall): `contact`, `nickname`,
  `contact_way`, `household`, `family_member`, `custom_field`,
  `custom_value`, `story_event`. Emails in the story are read from
  `mail_message` by whole address, never copied.
- **Ids from the browser**: a foreign key ignores the wall, so any id a
  browser sends to be stored as a link (referrer, partner, field) is
  looked up inside `inWorkspace` first.
- **Stages**: only forward on the main path when automatic (`mayMove`);
  she moves back only after "Move back?" (`confirmBack`). Lead = New,
  Written to, Talking; past that, client; all sides closed = "Not active".
- **The nickname** lives in its own table. Anything that writes to a
  client uses `clientName()` (goes by, else first name).
  `shared/test/nickname.test.ts` lists the only files allowed to touch it;
  adding one is Eric's decision.
- **How they found her** (rule 6) is required when adding a person; a
  change keeps the original in the story.
- **Put away** hides, never deletes. Delete for good arrives with Build 22.

## List Builder (Build 4)

- **Where it lives**: `shared/src/list/` (`rules.ts` browser-safe,
  `runs.ts` starting and reading a year, `sort.ts` the no-AI sort,
  `think.ts` the AI look, `confirm.ts` her answers, `vcard.ts` the phone
  file), `shared/src/ai/claude.ts`, `app/src/list/`. The card sits at the
  top of Contacts; the confirm page is `/contacts/build`.
- **Only her tap reads a year** (`startYear`): one year at a time, never
  more than five, never a new year while one is working or cards wait.
- **Only `confirm.ts` makes a contact from a proposal**, through the same
  code as Add by hand (`addContactIn`). A test holds this. Every List
  Builder action is the agent's alone, never a helper's.
- **Tables** (`ws`, behind the wall): `list_run`, `list_mail` (a working
  copy of top lines, tidied away), `list_person`, `detail_source`; and
  `mailbox.can_read_contacts`.
- **Mail text is read for the AI and never kept**: not in the database, a
  job, a log or an error report. Machine mail is never sent. At most 8
  messages a person.
- **The AI only proposes.** Every detail it returns must appear in the
  text it was shown (`holdToTheMail`) and pass `cleanDetail`. How they
  found her (rule 6) is filled only when the mail plainly says it; the
  default is "Don't remember".
- **The one file that calls Claude** is `shared/src/ai/claude.ts`
  (`claude-haiku-5-5`). Callers wrap it in `withAiBudget`; a test fails
  any other import. `ANTHROPIC_API_KEY` is set on the worker only; with
  none, a run reads and sorts, then pauses and says so.
- **At the limit** a run pauses, keeps everything, and carries on from
  where it stopped; nobody is paid for twice.
- **Google Contacts** are read with a read-only permission
  (`google-contacts.ts`, asking only). The phone file (.vcf) has its
  photos taken out in the browser and is never stored.
- **Where a detail came from** is kept per detail (`detail_source`) and
  shown on the contact page.

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
and PlainSend): web service `sunnyday-app` database `sunnyday-db`
(Postgres 16) and, from Build 2, background worker `sunnyday-worker`, Oregon. Answers at `app.sunnydaycrm.com` (DNS at
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
