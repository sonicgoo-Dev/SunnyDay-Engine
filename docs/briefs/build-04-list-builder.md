# Build 4: List Builder

Status: awaiting Eric's approval (written Nov 18, 2026). Nothing is built yet.

This is the first build with a real AI agent, and the first that reads
years of Amy's real mail. So this brief is longer than the last three.
The thirteen decisions are at the end; most are a plain "yes".

## What you will be able to do

On a phone, in **Contacts**:

- **Tap "Build my list".** SunnyDay shows what it is about to read, how
  far back, and roughly what it will cost. Nothing far back is read until
  that tap.
- **Leave it to work.** It reads in the background. This is not instant:
  a full mailbox may take an hour or more. Contacts shows how far along
  it is. (SunnyDay cannot email her "ready" yet; that arrives in Build 6.)
- **Confirm in one sitting.** People come up ten at a time, the surest
  first. Each card shows the name, what List Builder thinks they are
  (client, lead, business contact), one line of why ("31 emails, 2024 to
  2025, about the sale of a home on Elm Street"), and the details it
  found. Each card has **Yes**, **No** and **Change**. Change lets her
  fix the kind, buyer or seller, the stage, or any detail before saving.
- **See where every detail came from.** A phone number says "from an
  email on Mar 3, 2025" or "from Google Contacts" or "from your phone
  contacts". The same line stays on the contact page afterwards.
- **Skip the noise.** Newsletters, receipts, showing-service notices and
  the like are never shown as cards. They sit in one folded list, "Not
  contacts", which she can search and pull a person out of.
- **Bring in phone-only contacts.** She exports her phone's contacts as
  one file and uploads it. People SunnyDay has not already found appear
  as a tick list; she ticks the ones who belong.
- **Stop and come back.** Her place is kept. Nobody is asked about twice.

## How it works underneath

1. **Sorting by sender, with no AI.** SunnyDay reads only the top lines
   of each message (who, when, subject) and groups them by person.
   Automated senders are set aside here, for free.
2. **The AI reads only the likely people.** For each person she has
   actually corresponded with, List Builder reads a few of their
   messages and proposes: what they are, and any contact details.
3. **Google Contacts and the phone file** are matched to those people by
   email address and phone number, so one person is one card.
4. **Nothing is a contact until her tap.** Proposals wait in their own
   place behind the workspace wall. Yes creates the contact through the
   same code as Add by hand, so every Build 3 rule still holds.

## The things this build has to face plainly

**Reading real mail.** Claude Code never reads Amy's mailbox. The build
is written and tested on made-up mail only. On the live app, the long
read starts only when Amy taps "Build my list" herself, after you have
tried it on made-up data and said "go". If something goes wrong on live,
I look at counts and error names, never at her mail. No mail text is
ever written to a log.

**The mailbox is still read only (rule 4).** Nothing is marked read,
moved, labelled or deleted. Reading a message's text is new, so the test
that guards the mail files is widened to cover it, including on olypen,
where a careless read would mark a message as read.

**Google Contacts needs a new Google permission.** Today SunnyDay asks
Google for three things: read mail, write drafts, send. This build adds a
fourth: "See and download your contacts". What changes for Amy:

- Mail reading keeps working exactly as now until she reconnects.
- In Settings she taps Connect Gmail again. Google's screen shows the
  same "not verified" warning as before, then one extra line about
  contacts. She taps Allow.
- Her Google Contacts are read, never changed. SunnyDay cannot write to them.

**How they found her (rule 6).** For someone found in old mail, the
honest answer is often not known. The card proposes a source only when
the mail plainly shows it (a website form notice, "Sarah gave me your
name"). Otherwise it is saved as "Don't remember", which she can change.
The story always records the true origin of the record itself: "Added
from List Builder, Nov 2026".

**What is sent to the AI, and what is kept (rule 11).**

- Sent to Anthropic (the makers of Claude): for each likely person, the
  top lines and the text of up to eight messages between them and Amy,
  plus that person's entry from her contacts if there is one.
- Never sent: attachments (contracts stay unopened), mail from automated
  senders, anything from another workspace.
- Kept by SunnyDay: the proposal only. The kind, the details, where each
  came from, and the one-line why. Not the message text. The short line
  per message that SunnyDay already keeps (who, when, subject, excerpt)
  is kept for people she says Yes to, so their story shows the history.
- Training: Anthropic's terms for paid API use say they do not train
  their models on what is sent, and delete it after a short period. I
  will confirm the current wording during the build and quote it, with a
  link, in the help page. SunnyDay itself trains nothing on anything.
- Personal care: List Builder proposes contact facts only (phones,
  emails, addresses, a partner's name, a company). It is told not to
  propose anything about health, money, family trouble or beliefs.

**The spending limit partway through.** Every AI call goes through the
workspace's limit (`withAiBudget`). If the $20 is reached mid-run:

- List Builder pauses. Contacts and Settings both say so in plain words.
- Everything already proposed stays, and she can keep confirming it.
- It picks up where it stopped when the limit is raised or on the 1st.
  No person is ever paid for twice.

## Cost

- **The first read of Amy's mail: an estimated $2 to $5**, on the cheap
  model. It is an estimate because I cannot see how many people are in
  her mail. The build measures the real cost on made-up mail, and the
  app shows her an estimate before she taps Start.
- The stronger model would cost about twenty times as much ($40 to $100)
  and blow through the limit, for a sorting job the cheap one does well.
- Nothing new on Render. Google's contacts service is free.
- This is the first money SunnyDay spends on AI. It needs your approval
  and a Claude API key (below).

## Not in this build

- Proposals from new mail as it arrives ("Add Biscuit, their dog?").
  This build is the first list. Ongoing proposals come with Builds 5 and 6.
- Personal notes filled in by the AI. Contact facts only, for now.
- Search by meaning. The Build 3 brief said it would arrive here; the
  Build Plan does not list it, and it deserves its own decision. Later.
- Keeping Google Contacts or the phone in step afterwards. They are read
  once, and again only when she taps.
- Writing anything back to Google Contacts or her phone. Never.
- Reading attachments. Sent mail in the olypen mailbox (see decision 2).
- Outlook (Build 14). The full Agents screen (Build 20).
- An email telling her the list is ready (Build 6).

## Also in this build

Carried over from Build 3: a warning before linking two people who each
already have a household, since today the two quietly become one.

## Decisions

1. **How far back: three years** (to November 2023). Real estate moves
   slowly, and past clients are the point. Going back further costs
   almost nothing extra, because step 1 uses no AI. *Suggested: three years.*
2. **Both mailboxes.** Gmail: everything, including mail she sent, which
   is the best sign someone is real. Olypen: its inbox only, since that
   is all SunnyDay can open there. *Suggested: both.*
3. **The AI may read the text of up to eight messages per likely
   person**, never attachments, and SunnyDay keeps only the proposal.
   Without the text it cannot find phone numbers or tell a client from a
   lender. *Suggested: yes.*
4. **The cheap model (Claude Haiku 5.5) does all of List Builder.**
   *Suggested: yes.*
5. **Ask Google for "See and download your contacts"**, read only, and
   have Amy reconnect once. *Suggested: yes.*
6. **Ten cards at a time, each with its own Yes, No, Change, plus one
   "Yes to all ten" button** at the bottom of a page she has scrolled
   through. Still her tap, and it makes one sitting possible.
   *Suggested: yes. Say no if you would rather every person gets their own tap.*
7. **Stages on the way in.** Past client goes in as "Past client". A
   lead goes in as "Talking" (she has plainly corresponded). For someone
   who looks like a client right now, the card asks her to pick the
   stage in one tap; List Builder does not guess it. *Suggested: yes.*
8. **How they found her** is proposed only when the mail plainly shows
   it, otherwise "Don't remember", as described above. *Suggested: yes.*
9. **The phone file is a standard contact file (.vcf)**, which an iPhone
   makes from the Contacts app. People not already found show as a tick
   list, nothing ticked. The file is thrown away once read.
   *Suggested: yes.*
10. **A "No" is remembered** (the address only), so that person is not
    proposed again here or as a new lead in Build 5. She can undo it
    from the "Not contacts" list. *Suggested: yes.*
11. **At the limit: pause, keep everything, resume**, as described
    above. The limit stays at $20 for now. *Suggested: yes.*
12. **Call Claude with Anthropic's own code library** rather than the
    "Vercel AI SDK" the Master Plan names. It is the maker's own, it has
    fewer moving parts, and SunnyDay uses only Claude. This changes one
    line of the Master Plan, so it is yours to decide. *Suggested: yes.*
13. **Only Amy's own tap starts the long read**, after you have tried
    the build on made-up mail and said "go". *Suggested: yes.*

## Eric's part

Before the build is switched on (I will give click-by-click steps for
each at the time; none are needed to approve this brief):

- **A Claude API key for SunnyDay.** In the Anthropic Console, a new
  workspace named SunnyDay (nothing shared with Oomph), a monthly limit
  on it as a backstop (suggested $50), and one key, pasted by hand into
  Render on `sunnyday-worker`. Never into a chat or the repo.
- **Two clicks in the Google project:** switch on the contacts service
  and add the contacts permission to the permission screen.
- **Ask Amy:** is she comfortable with three years of both mailboxes
  being read, and the text of some messages going to the AI as described
  above? Her earlier OK covered reading; this goes further, so it is
  worth asking again.
- **Ask Amy,** if she wants phone-only contacts: export them from her
  phone (I will write the steps for her iPhone).
- **A sitting from Amy** to confirm her list. My guess is 30 to 45
  minutes; I will know better after the made-up run.
- At the end: try it on your phone with made-up mail, then say "go".

## Done when

- Amy's Contacts screen holds her real clients after one sitting of
  confirming.
- Nothing was added without her tap. A test proves no contact can be
  created from a proposal any other way.
- Each detail shows where it came from, on the card and on the contact page.
- Nothing in either mailbox, or in her Google Contacts, has been changed.
- A test hits the spending limit partway through a run; List Builder
  pauses with a plain message and picks up without paying twice.
