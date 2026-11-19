# SunnyDay CRM — Build Plan

A copy for sessions that cannot open the live document. The live version
(https://claude.ai/artifact/25it1q2FM1qYhzq5tNah7e) is newer when they
disagree; tell Eric if you find a difference. This copy: Nov 18, 2026.

SunnyDay is built as 22 small builds in 7 stages, each ending with
something that can be tried on a phone before the next begins. This plan
follows `master-plan.md`; when the two disagree, the master plan wins.

## The routine for every build

1. **Brief.** One page in plain language: what gets built, what it will
   look like, the approvals it will ask for. **Eric approves it.**
2. **Task plan** in `docs/plans/`, written just before the build.
3. **Build** on a branch: tests first, then code. No stopping to ask about
   anything the brief already settles.
4. **Check its own work:** the full tests, the screens at phone width with
   made-up data, the "Done when" test as far as possible without a real
   person, and a fresh reviewer. Fix what is found before showing Eric.
5. **Show it.** What works, what was tested, what could not be checked.
   **Eric tries it and approves.**
6. **Deploy** only after **Eric's go-ahead**; watch it and confirm the
   live app is healthy.
7. **Help pages and tracker.** Help pages for what was added, the
   rulebook (`CLAUDE.md`) updated, the tracker ticked.

## Rules that hold for every build

- One build at a time, finished and confirmed before the next starts.
- Every AI agent starts at Suggest only, on made-up data first, then on
  the first tester's real data.
- Nothing that reaches a client is switched on without the first tester
  reading a week of drafts.
- Any change to the eleven rules is Eric's decision, never a quiet workaround.
- Each "Done when" line is a test Eric can do himself.

## Who does what (Eric, Nov 17, 2026)

Claude Code does every step it is able to do without involving Eric.
Eric's part is approvals, plus the few things only a person can do.

- **Claude Code, without asking:** briefs, task plans, code, tests, help
  pages; running tests and fixing failures; branches and commits; setting
  up services it has access to; researching outside rules; preparing each
  step only Eric can do so his part is one click or one paste.
- **Eric approves:** each brief; the finished build after trying it;
  going live; any new paid service or cost; switching on anything that
  reads a real mailbox or reaches a real client; any change to the eleven
  rules; loosening an AI agent by a notch.
- **Only Eric can:** sign in to his accounts; enter passwords, keys and
  payment details (never in a chat); agree to terms and pay; ask the
  first tester for her time, permission and documents; decide pricing,
  invitations and opening sign-up.

Approvals are grouped: one message at the start of a build (the brief),
one at the end (try it, then go live).

**Never on its own:** send anything to a real client, read a real mailbox
before permission, spend money, publish to a website, delete data, or
touch anything belonging to Oomph Engine.

## Stages and gates

| Stage | Name | Builds | Gate that follows |
| --- | --- | --- | --- |
| 1 | Foundation | 1 to 2 | |
| 2 | Contacts and leads | 3 to 6 | Gate A: the first tester uses it daily |
| 3 | Voice and follow-up | 7 to 9 | |
| 4 | Deals | 10 to 14 | Gates B and C: the test group is invited |
| 5 | Money | 15 to 16 | |
| 6 | Past clients and website | 17 to 19 | |
| 7 | Ready for others | 20 to 22 | Gate D: sign-up opens |

## The builds

### Stage 1: Foundation (done)

**1. Skeleton and sign-in.** Repo, the SunnyDay look, Google sign-in, a
private workspace per agent with the wall enforced by the database, nine
"coming soon" screens, live at app.sunnydaycrm.com, error reporting.

**2. Mail connections and the engine room.** Gmail connection (read,
draft, send) stored encrypted; a read-only second mailbox; the job queue
with fair turns; the monthly AI spending limit; Settings for both.

### Stage 2: Contacts and leads

**3. Contacts and the contact page.** The Contacts screen with its three
tabs (Clients, Leads, Business contacts). The full contact page: names
(full, goes by, private nickname), phones and emails, how to reach them,
household, dates, personal notes, what they want, how they found her, her
own fields, the story timeline. Buyer and seller stages with the
forward-only rule. Add by hand. Search by any detail. Call, Text and
Email buttons.
*Done when:* she adds a couple by hand in under a minute, links them as
one household, moves a stage, and finds them by searching for their dog's name.

**4. List Builder.** The agent that reads her mail one year at a time
(the last 12 months first, further back only when she asks, up to five
years) and Google Contacts, and proposes who is a client, a lead, a
business contact or nobody. The confirm screen: Yes, No, Change, in
batches of ten. Details it found proposed alongside. A contact-file
upload for phone-only contacts. (Brief approved Nov 18, 2026.)
*Done when:* after her first sitting, on the last 12 months, her Contacts
screen holds her current clients. No older year is read without her tap.
Nothing was added without her tap. Each detail shows where it came from.

**5. Lead capture.** Inbox reading for new inquiries on both mailboxes,
the "New lead" alert and the "Not a lead" button that teaches the filter.
The four kinds of lead. The SunnyDay add-on for WordPress, sending form
submissions the moment they happen. Form notice emails as the safety net.
Lead source recorded at capture.
*Done when:* a test submission of each of her four website forms appears
as a lead within a minute, with the form's answers on the contact page. A
test email from a stranger becomes a lead; a supplier newsletter does not.

**6. Notes, Today and the morning email.** The Note button on every
screen and the Notes screen, with the Note Sorter filing each spoken fact
after her approval. Today with its three things, calls and texts, new
leads and people waiting. The morning email. A simple Help button that
answers from the help pages written so far.
*Done when:* she speaks one note about a client and approves where each
fact goes. Today and the morning email show the same list. A quiet
morning still sends "nothing needs you today".

**Gate A, after Build 6:** the first tester uses SunnyDay every day. Two
weeks of her use decide what is adjusted before Stage 3.

### Stage 3: Voice and follow-up

Each build ships with the agents on Suggest only.

**7. Voice Reader and the voice note.** The agent that studies two years
of her sent mail and writes a one-page voice note with real examples. The
page where she reads and corrects it. A short spoken interview to fill
gaps. Her website's written voice rules as a starting point.
*Done when:* she reads the voice note and says "that is me" after her
corrections. Five sample drafts are judged by her, each verdict kept.

**8. Approvals and the Lead Responder.** The Approvals screen: each draft
in full with the person's recent story beside it; Send, Edit, Skip; two
taps to send. Drafts saved in her own Gmail. The checks from Oomph's hard
lessons: never delete a sent or edited draft, check for a reply at the
moment of sending, send once only. The Lead Responder's first reply for
each kind of lead. The "only what is true" check.
*Done when:* a test lead gets a drafted reply she would send with little
or no editing. Send delivers it from her Gmail once. A draft she edits in
Gmail is left alone. A reply from the lead withdraws any waiting draft.

**9. Follow-up Concierge and calls and texts.** The follow-up rhythm for
leads, a set purpose for each touch, never more than one message in three
days. Calls and texts on Today with the words ready: "Use these words" or
"Write my own", and the Settings switch to turn text suggestions off.
Stops when the person replies. The four-notch switch on each agent.
*Done when:* a quiet test lead gets the next touch drafted on the right
day. "Write my own" opens Messages blank to that person. Turning
suggestions off leaves only the reminder.

**Before any real client gets a draft:** she reads one week of drafts on
Suggest only. An agent moves up a notch only after a week needing no edits.

### Stage 4: Deals

**10. Deals and the timeline.** The Deals screen and deal page: property,
side, client, everyone involved, price, earnest money, expected
commission, documents. The timeline with Northwest MLS step names. Quick
entry. Deadlines on Today and in the morning email. Date changes re-plan reminders.
*Done when:* she enters a live deal by hand in a few minutes and sees its
next deadline on Today. Changing the closing date moves every dependent reminder.

**11. Contract reader.** Upload or forward a signed Northwest MLS purchase
and sale agreement and addenda. The Deal Coordinator proposes parties,
price and every deadline, unsure dates in amber. The day-counting rules,
checked against the current forms. Approval before a timeline goes live.
*Done when:* on her test contracts, every proposed date matches the date
she works out herself, or is amber. No timeline goes live without her Approve.

**12. Deal messages.** The kickoff email (the whole process, the people,
the dates). Milestone updates. Deadline reminders. Check-in notes to
lender, title and the other agent. The "dates have changed" note. All
through Approvals.
*Done when:* for one live deal she approves a kickoff email she is happy
to send, and a milestone update appears as a draft when she marks a step done.

**13. Listings and the seller report.** Uploading the Northwest MLS
listing sheet to start a listing. The listing-side timeline. The weekly
seller report. The Paperless Pipeline report upload, only if still needed
after the brokerage move.
*Done when:* a listing sheet upload fills in the listing correctly. A
weekly seller report draft arrives on the day she chose.

**14. Outlook mail.** The Outlook connection (read, draft, send) with the
same rules as Gmail. Microsoft's approval step, checked and completed if required.
*Done when:* a tester with Outlook connects from a phone, gets a new-lead
alert, and sends an approved draft from their own Outlook.

**Gate B, after Build 13:** the Gmail-using testers are invited.
**Gate C, after Build 14:** the Outlook-using testers are invited.

### Stages 5 and 6: Money, past clients and website

These can be reordered to suit what the testers ask for first.

**15. Commissions.** Expected commission from under contract; actual at
closing. Brokerages with start dates and their own fees, split or cap.
Referral fees. The Money screen: earned, expected, a chart by month.
*Done when:* a closed test deal shows the right take-home under the
brokerage it closed with. Deals before and after a brokerage change are
reported separately.

**16. Expenses and reports.** Receipt photos read by the Receipt Reader,
confirmed in one tap. Forwarded email receipts. Mileage at the year's
rate. Recurring costs. Expenses tied to a deal or listing. Month, quarter
and year-to-date views. The accountant download with every receipt.
*Done when:* she photographs three receipts in under a minute and each
lands in the right category. The accountant download's totals match the screen.

**17. Keep-in-Touch.** After-closing check-ins, the review ask,
home-purchase anniversaries and birthdays, through Approvals. The
"Remember" strip on the contact page before a call.
*Done when:* a closed test client gets the right notes drafted on the
right days. A birthday note uses the "goes by" name, never the private nickname.

**18. Website screen and Website Reader.** Connections to Google Analytics
and Search Console. Two or three plain lines on how the site is doing,
and which pages leads came from.
*Done when:* the numbers match her existing "Real Insights" email for the
same days, so that separate task can retire.

**19. Content Writer.** "Polish my words" and "Draft for me". Blog posts
and market updates sent to her site as drafts through the add-on; listing
descriptions and posts shown to copy. The fair-housing check and the
"only what is true" check on every draft. Content ideas from her notes and deals.
*Done when:* she speaks a rough post, approves the polished version, and
finds it on her website as an unpublished draft, her meaning unchanged.

### Stage 7: Ready for others

**20. Helpers and the remaining screens.** Sign-in for an assistant or
transaction coordinator: edit, never send; Money and personal notes
hidden unless the agent allows. The workspace switcher. The Agents screen
and the Settings screen, complete.
*Done when:* a helper signs in, edits a draft and a deal, and has no Send
button anywhere. A test proves a helper cannot open Money when it is off.

**21. The SunnyDay Guide and self-serve setup.** The full Guide: knows the
screen she is on, jumps to the right place, answers questions about her
own workspace, never acts. "Send this to support". The weekly list of
questions it could not answer. The guided first-time setup. A check that
blocks a release when a screen changed and its help page did not.
*Done when:* a new tester goes from invitation to a confirmed contact
list and a voice note without contacting Eric. Ten common questions all
get correct answers.

**22. Launch readiness.** Privacy page and terms. Export everything and
delete everything from Settings. Stripe billing in test mode, then live.
Google's verification and security assessment started and passed. A
public page at sunnydaycrm.com. Pricing decided from 60 days of tester use.
*Done when:* a test customer signs up, pays, uses SunnyDay, exports their
data and deletes their account. Google shows the app as verified.

**Gate D, after Build 22:** sign-up opens beyond the invited group. Eric's
decision alone.

## Tracker

Stage 1 is finished (Nov 18, 2026). A build is ticked only when its "Done
when" test has passed and its help pages are written.

- [x] 1. Skeleton and sign-in (live Nov 17, 2026)
- [x] 2. Mail connections and the engine room (live Nov 18, 2026; the
  first tester's Gmail and olypen mailboxes are both being read)
- [x] 3. Contacts and the contact page (live Nov 18, 2026; Done when
  passed on Eric's iPhone, Email opens Gmail as the main address)
- [ ] 4. List Builder (live Nov 18, 2026; not ticked until its Done when
  passes on the first tester's real mail)
- [ ] 5. Lead capture
- [ ] 6. Notes, Today and the morning email
- [ ] Gate A: the first tester uses it daily
- [ ] 7. Voice Reader and the voice note
- [ ] 8. Approvals and the Lead Responder
- [ ] 9. Follow-up Concierge and calls and texts
- [ ] 10. Deals and the timeline
- [ ] 11. Contract reader
- [ ] 12. Deal messages
- [ ] 13. Listings and the seller report
- [ ] Gate B: Gmail testers invited
- [ ] 14. Outlook mail
- [ ] Gate C: Outlook testers invited
- [ ] 15. Commissions
- [ ] 16. Expenses and reports
- [ ] 17. Keep-in-Touch
- [ ] 18. Website screen and Website Reader
- [ ] 19. Content Writer
- [ ] 20. Helpers and the remaining screens
- [ ] 21. The SunnyDay Guide and self-serve setup
- [ ] 22. Launch readiness
- [ ] Gate D: sign-up opens

## Still needed, from whom, by which build

| Needed | From | By build |
| --- | --- | --- |
| A contact-file export from her phone, if she wants phone-only contacts brought in | First tester | 4 |
| A new Claude API workspace and key for SunnyDay, with a monthly limit | Eric | 4 |
| OK to install the SunnyDay add-on on amyhempelrealty.com | Eric | 5 |
| An email sender for system mail at sunnydaycrm.com (Amazon SES) | Eric | 6 |
| A sitting to read and correct the voice note | First tester | 7 |
| One week of reading drafts on Suggest only | First tester | 8 and 9 |
| One or two finished Northwest MLS contracts, with permission, and the form numbers she uses most | First tester | 11 |
| Does Best Choice Realty use Paperless Pipeline? If yes, one sample report | First tester | 13 |
| How many of the ten testers use Outlook, and which kind | Eric | 14 |
| The fees at Real (to Dec 31, 2026) and at Best Choice Realty (from Jan 1, 2027) | First tester | 15 |
| Access to her Google Analytics and Search Console | Eric | 18 |
| The name and email of her assistant or coordinator, if she has one | First tester | 20 |
| A Stripe account for SunnyDay; the pricing decision | Eric | 22 |

Settled: olypen.com cannot forward yet but allows a direct read-only
sign-in, which is what Build 2 uses. The first tester's OK to read her
mailboxes was given through Eric on Nov 17, 2026.

Watching: whether Google makes testers reconnect Gmail after seven days
while the Google project is in Testing (first check about Nov 25, 2026).
