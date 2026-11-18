# Build 2 task plan: Mail connections and the engine room

Brief: `docs/briefs/build-02-mail-connections.md`. Branch: `build-02-mail-connections`.

**Goal:** an agent connects Gmail and a read-only second mailbox from
Settings; a background worker reads them in fair turns and changes
nothing; a monthly AI spending limit pauses the agents and says so.

**Global constraints:** rules 1, 3, 4, 7, 8 of `CLAUDE.md`. Mail is read,
never changed. A secret is never stored readable, logged or shown. No
technical words on a screen. Phone width, light and dark.

## Tasks

- [x] 1. **Tables** (change 0003): `ws.mailbox`, `ws.mail_message`,
  `ws.ai_spend` behind the wall; `core.job`; `workspace.last_turn_at`.
- [x] 2. **Sealing** (`crypto/seal.ts`). Tests: opens only with the same
  key and workspace; never readable; refuses a missing key.
- [x] 3. **Job list** (`jobs/queue.ts`). Tests: fair turns; not before its
  time; never taken twice; one waiting job per key; retry then give up;
  a stuck job goes back in the line.
- [x] 4. **Spending limit** (`ai/spend.ts`). Tests: refused before any
  money is spent; plain message; per workspace; per month; $0 is off.
- [x] 5. **Gmail** (`mail/google-token.ts`, `gmail.ts`). Tests against a
  pretend Google: every request to the mailbox is a GET; an unticked
  permission is refused; a withdrawn permission says "reconnect".
- [x] 6. **Second mailbox** (`mail/imap.ts`). Tests: named server and port
  993 only; wrong password stores nothing; read-only mode, envelopes only.
- [x] 7. **Mailboxes** (`mail/mailboxes.ts`): save, read, disconnect,
  one main mailbox per workspace, another workspace sees nothing.
- [x] 8. **Connect flow** (`app/src/mail`, two addresses). Tests: the note
  to Google and back cannot be forged, altered or reused late; both
  addresses check the session first.
- [x] 9. **Settings screen** and its server functions, agent only.
- [x] 10. **Worker** (`worker/src`). Tests: reads, plans the next read,
  survives a failing mailbox, heals a lost job.
- [x] 11. Rulebook, `render.yaml`, `.env.example`, help pages.
- [ ] 12. Fresh reviewer; fix what it finds.
- [ ] 13. Show Eric: his clicks (Google project, one key in Render, the
  worker), his own Gmail connected first, then Amy's two mailboxes.

## Review focus

1. A way in (token or password) reaching a log, an error, a job or the browser.
2. Anything that could change a mailbox.
3. One workspace reading or disconnecting another's mailbox.
4. The trip to Google being replayed or finished by a different person.
5. A stuck or failing mailbox starving other workspaces.

## To verify live, not provable here

- Real Gmail and real olypen reads (first with Eric's own test mailbox).
- Whether Google's Testing status makes a tester reconnect after 7 days.
- That the worker and the app hold the same `CONNECTION_KEY`.
