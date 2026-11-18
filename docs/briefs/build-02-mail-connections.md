# Build 2: Mail connections and the engine room

Status: waiting for Eric's approval. Written Nov 17, 2026.

## What you will be able to do

In **Settings**, on a phone:

- **Connect Gmail.** One tap, then Google's own permission screen. Settings
  then shows "Connected" with the time SunnyDay last read the mailbox.
- **Connect a second mailbox, read only** (Amy's olypen address). Either
  by forwarding it to Gmail, or by signing in to it directly; which one
  depends on what olypen's support says.
- **Set the monthly AI spending limit** for the workspace, and see what
  has been spent. At the limit the agents pause and Settings says so in
  plain words.

## What is underneath

- The background worker goes live on Render. It reads each connected
  mailbox on a schedule, giving every workspace a fair turn so one busy
  agent never holds up another.
- Each mailbox connection is stored encrypted, behind the workspace wall.
  The key that unlocks them lives only in Render's settings.
- Mail is read and never changed (rule 4): nothing is marked read, moved,
  labelled or deleted. A test proves the code holds no way to do so.
- SunnyDay keeps only what it needs from each message for now: who, when,
  subject and a short excerpt. Later builds decide what else to keep.
- The spending limit is counted per workspace and checked before any AI
  call. No AI agent exists yet, so the test uses a pretend one.

## Decisions in this brief

1. **Ask Google for all three Gmail permissions now** (read, write a
   draft, send), so Amy is not sent back to reconnect at Build 8. Only
   reading is used in this build. Drafting and sending stay switched off
   in the code until Build 8, and a test holds that.
2. **The Claude API key waits until Build 4**, the first build with a real
   AI agent. Nothing to pay or set up for it now.
3. **Testers will see Google's "this app isn't verified" screen** when
   connecting Gmail. That is expected until Google's review at Build 22;
   the help page will show which two taps get past it.

## Cost

The worker is one more Render service: **$7 a month**, bringing SunnyDay
to about $20 a month. Needs Eric's approval.

## Not in this build

No AI agent runs. No contact or lead is created. Nothing is drafted or
sent. Outlook comes at Build 14.

## Eric's part

- Approve this brief and the $7 a month.
- Amy's OK for SunnyDay to read her two mailboxes and contacts for
  testing: given by Eric on Nov 17, 2026. A one-line email from her, for
  the record, before her mailbox is connected.
- Olypen: ask support whether it can forward to Gmail, and whether it
  allows a direct sign-in from an app (IMAP) if not.
- A few clicks in the Google project (switch on the Gmail service, add the
  three permissions, add Amy as a test user) and one generated key in
  Render. Steps will be click-by-click.

## Checked during this build

Whether Google makes testers reconnect Gmail every seven days while the
project is in Testing, and the cheapest honest way around it.

## Done when

- Amy connects both mailboxes from her phone.
- Settings shows both as connected, with the time of the last read.
- Nothing in either mailbox has been changed.
- A test hits the spending limit and the agents pause with a plain message.
