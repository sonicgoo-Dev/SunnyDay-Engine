# Build 4 task plan: List Builder

Brief: `docs/briefs/build-04-list-builder.md` (approved Nov 18, 2026;
decision 1 is Eric's own: one year at a time, up to five). Branch:
`build-04-list-builder`.

**Goal:** a "Build my list" card at the top of Contacts. It reads one
year of mail at a time, sorts senders with no AI, has the AI look only at
likely people, and shows her ten cards at a time: Yes, No, Change.
Nothing becomes a contact without her tap. Each detail says where it came
from.

**Global constraints:** rules 1, 2, 4, 6, 7, 8, 11 of `CLAUDE.md`. Every
new table in `ws`, behind the wall in the same table change. Mail and
Google Contacts are read, never changed. Every AI call goes through
`withAiBudget`. No mail text in a job, a log or an error report. Tests
use made-up mail and a pretend AI; no real mailbox and no paid call.

## The tables (change 0005, all in `ws`, all behind the wall)

- `list_run`: one per year she asks for. Which year (1 to 5), the dates
  it covers, how far along it is (reading, sorting, thinking, paused,
  ready), counts for the progress line, and where each mailbox's reading
  got to.
- `list_mail`: the top lines of each message read for a run (who, when,
  subject, excerpt, and whether it looks automated). A working table:
  rows for automated senders go when sorting ends; the rest go when the
  year is finished or after 90 days. On Yes, that person's rows are
  copied to `mail_message` so their story shows the history.
- `list_person`: one per person or sender found (in mail, Google
  Contacts or the phone file). Their addresses, counts, what List Builder
  proposes and why, the details found with where each came from, and her
  answer. A No keeps the name and address only.
- `detail_source`: for a saved contact, where one detail came from ("an
  email on Mar 3, 2025", "Google Contacts", "your phone contacts").
- `mailbox.can_read_contacts`: whether Google's contacts permission was given.

## Tasks

- [x] 1. **Rules, tests first** (`shared/src/list/rules.ts`, browser-safe):
  the kinds, the stage each kind goes in at (decision 7), what a card
  still needs from her, the automated-sender test, the Zod checks for her
  answers.
- [x] 2. **Tables** (change 0005) and the wall on each.
- [x] 3. **Reading a year of mail, tests first.** Gmail: a page of ids for
  a window, then each message's top lines; the text of one message. The
  second mailbox: envelopes for a window; the text of chosen messages,
  opened read only. Google Contacts (`google-contacts.ts`, asking only).
  The rule-4 test is widened: text may be read, nothing may be changed.
- [x] 4. **Runs and sorting, tests first** (`shared/src/list/`): start a
  year (only the agent, only one at a time, never past five, never
  reaching back before the last year is finished), the read jobs, the
  no-AI sort into people and "Not contacts", matching Google Contacts
  and the phone file by address and phone number.
- [x] 5. **The AI look, tests first** (`shared/src/ai/claude.ts`,
  `shared/src/list/think.ts`): one call per likely person through
  `withAiBudget`, with a pretend AI in tests. At the limit the run
  pauses, keeps everything, and resumes without paying for anyone twice.
- [x] 6. **Her answers, tests first** (`shared/src/list/confirm.ts`): Yes
  (through the same code as Add by hand), No, Change, "Yes to all ten",
  the tick list, "add this detail?", pulling someone out of "Not
  contacts". A test proves this file is the only way a proposal becomes
  a contact.
- [x] 7. **The phone file** (`shared/src/list/vcard.ts`): read a .vcf,
  keep people, throw the file away.
- [x] 8. **Worker**: the new job kinds; housekeeping restarts a paused run
  when the limit allows.
- [x] 9. **Server functions** (`app/src/list/*.functions.ts`), each behind
  `signedInOnly`, agent only, workspace from the session.
- [x] 10. **Screens**: the card on Contacts (each state in plain words),
  the confirm page (ten cards, Keep going / That's enough for today),
  the tick list, "Not contacts", the phone-file upload, where a detail
  came from on the contact page, the contacts line on Settings.
- [x] 11. **Household warning** carried from Build 3.
- [x] 12. **Self-check**: all tests, typecheck, build; the screens at phone
  width in light and dark with made-up mail on a local database; the
  "Done when" as far as possible without a real person; the real cost
  per person worked out from the made-up run's sizes.
- [x] 13. **Fresh reviewer**; fix what it finds.
- [x] 14. Help page, `CLAUDE.md`, `.env.example`, `render.yaml`.
- [x] 15. **Show Eric**, and stop. Approved by Eric, Nov 18, 2026. Not yet
  deployed: that waits for his go-ahead.

## Review focus

1. Any way a contact is created from a proposal without her answer.
2. One workspace reaching another's runs, people or mail lines.
3. Anything that could change a mailbox or Google Contacts.
4. Mail text reaching a job, a log, an error report or the database.
5. An AI call that does not go through the spending limit, or a person
   paid for twice.
6. A year read without her tap, or a sixth year.
7. Words from an email steering what the AI proposes (it only ever
   proposes; every value is checked before it is shown).

## To verify by Eric, not provable here

- The real Claude call: no key exists yet, and a paid call is his to
  approve. The code path is tested with a pretend AI only.
- Google's permission screen with the contacts line, and the People
  service switched on in the Google project.
- The .vcf export from a real iPhone.
- The "Done when" on Amy's real mail.

## Fresh review (Nov 18, 2026)

An independent reviewer read the whole change. Found sound: only her
answer makes a contact; the wall; mail and Google Contacts are only read;
one year per tap and never a sixth; the job list; the names used in
Anthropic's library.

Fixed, each with a test:

1. An AI answer that was declined or cut short threw an error, so its
   cost went unrecorded and the year stalled on that person. Now it
   becomes a card she fills in herself, and the cost is recorded.
2. One message made of unclosed markup could freeze the worker for every
   workspace. Message text is now read in a single pass with a size cap.
3. An older copy of a person could be written back over her answer while
   Google Contacts or the phone file was being taken in. Those steps now
   hold the rows until they are saved.
4. A slow AI turn could outlast the worker's time for one job and be
   started again beside itself, paying twice. A turn now stops taking new
   people after 100 seconds, and checks each person is still waiting
   before asking.
5. A name, company or "referred by" from the AI must now appear in the
   messages, like every other detail.
6. A contact detail must be in what the person wrote, never in her own
   messages (her signature).
7. Two people who share a phone number but have their own addresses stay
   two people.
8. The phone file: a value ending in "=" no longer swallows the next line.
9. Error reports and job reasons never carry the values a database step
   was run with.

Known and left, for Eric to see:

- A call to the AI that times out may be charged by Anthropic without
  SunnyDay recording it (the cost is only known from an answer). One
  retry at most, so it is small.
- An address that came only from Google Contacts or the phone is labelled
  "from an email" when the person was also found in mail.
- A Google contact holding two addresses that were already two separate
  people stays two cards.

## Added after the review (Eric, Nov 18, 2026)

The second mailbox's sent folder is read as well as its inbox, because
the olypen address was Amy's main work mailbox for years. Read only, like
the inbox. The sent folder is found by the server's own mark, or by its
usual names (Sent, Sent Items, Sent Messages, Sent Mail). A server with
no sent folder is simply read without one. To verify on the real olypen
server: that its sent folder is found.

The everyday five-minute read of the second mailbox reads its sent folder
too (Eric, Nov 18, 2026), so her replies from that address show in each
person's story. Each folder keeps its own place. This changes Build 2's
reading; the guard test now allows the inbox and the sent folder only.
