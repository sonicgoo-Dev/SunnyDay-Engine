# Build 3 task plan: Contacts and the contact page

Brief: `docs/briefs/build-03-contacts.md` (approved Nov 18, 2026, all
seven decisions as suggested). Branch: `build-03-contacts`.

**Goal:** the Contacts screen with three tabs, the full contact page,
Add by hand from every screen, buyer and seller stages with the
forward-only rule, search by any word, and Call, Text and Email.

**Global constraints:** rules 1, 3, 6 of `CLAUDE.md`. Every new table in
`ws`, behind the wall in the same table change. The private nickname
never reaches anything a client could see. No technical words on a
screen. Phone width, light and dark. No AI in this build.

## The tables (change 0004, all in `ws`, all behind the wall)

- `contact`: one per person. Names (full, goes by), person or business,
  buyer and seller stage, how to reach them, addresses, dates, personal
  notes, what they want (buyer and seller details), how they found her
  (with the time it was recorded), who referred them, household, put
  away. A `search_text` the server rebuilds on every change (never the
  nickname).
- `nickname`: the private nickname, in a table of its own so that only
  the files allowed to read it can.
- `contact_way`: each phone and email, with a label.
- `household` and `family_member`: a household shared by linked
  contacts, plus children and family who are not contacts.
- `custom_field` and `custom_value`: her own fields, shared across all
  her contacts; text or yes/no.
- `story_event`: added, stage moved, note, how-found changed, household
  linked. Emails are not copied in; the story reads them from
  `mail_message` by address.

## Tasks

- [x] 1. **Rules, tests first** (`shared/src/contacts/rules.ts`, pure,
  also exported to the screens as `@sunnyday/shared/rules`): the stage
  lists, which tab a person is in, which moves are forward, who may move
  back, the found-by list, `clientName` (goes by, else first name; never
  the nickname).
- [x] 2. **Tables** (change 0004) and the wall on each.
- [x] 3. **Contacts store, tests first** (`shared/src/contacts/store.ts`):
  add (with a partner in one household), read the page, save each part,
  stages (forward freely; back only by her, after "Move back?"), notes,
  household link and unlink, family, her own fields, put away and bring
  back, search by any word including the nickname, the story with the
  matching emails. Tests: another workspace sees nothing; the dog's name
  finds the couple; found-by kept in the story when changed; an
  automatic move back is refused.
- [x] 4. **Nickname guard test**: fails if any file outside the allowed
  few reads the nickname, and `clientName` can never return it.
- [x] 5. **Server functions** (`app/src/contacts/*.functions.ts`), each
  behind `signedInOnly`; workspace from the session only.
- [x] 6. **Screens**: Contacts (tabs, search, folded "Not active"), the
  contact page (every part, editable in place, Call, Text, Email, the
  story), Add (from the Add button on every screen, "Add their partner
  too"), business contact pages.
- [x] 7. **Self-check**: all tests, typecheck, build; the screens at phone
  width in light and dark with made-up people on a local database; the
  "Done when" run through by hand.
- [x] 8. **Fresh reviewer**; fix what it finds.
- [x] 9. Help page (`docs/help/contacts.md`), `CLAUDE.md` (plans now in
  `docs/plan/`; the contacts section).
- [ ] 10. **Show Eric**, and stop.

## Review focus

1. One workspace reading or changing another's contacts (including by a
   guessed id passed from the browser).
2. The nickname reaching anything other than the contact page and search.
3. A stage moving backward without her.
4. How-found being lost or silently rewritten.
5. Search or the story matching another person's mail by a loose match.

## To verify by Eric, not provable here

- The "Done when" on his phone with made-up people: a couple in under a
  minute, one household, a stage moved, found by the dog's name.
- The Email button opening Gmail from the main address on an iPhone.

## Review outcome (Nov 18, 2026)

A fresh reviewer read the whole build. No way found for one workspace to
reach another's contacts. Seventeen findings; sixteen fixed with a test
where one could be written:

- The nickname now leaves the store only when a screen asks for it (the
  contact page, and a search whose words were inside it). The list
  without a search never carries it. `app/src/contacts/contacts.server.ts`
  is added to the nickname allowlist: it is the one place that asks.
- Emails in the story match whole addresses only (no "bob@x.com" in
  "jimbob@x.com"); incoming by sender, outgoing by recipient.
- Changing how they found her keeps the original time it was recorded,
  and the story keeps the full old answer, including the referrer's name.
- A referrer's name is stored at the moment of capture.
- Turning a side back on restores the stage it had.
- Linking a household locks both people, so two at once cannot split it.
- Leaving a household refuses when nobody else is in it.
- Removing a family member asks first, and the story records it.
- A household is searched as one: a dog on one partner's page finds both.
- Dates must exist on the calendar; every limit has a plain message.
- Tabs are filtered in the database; search shows at most 100 and says so.
- Searches travel as POST, so the words typed never sit in a web address
  or a host's log.
- A referrer may be a business contact (a referral partner); a partner
  may not.
- The search box never overwrites what she is typing.
- The person picker says "Could not search just now" when it fails.

## Carried forward

- Warn before linking two people who each already have a household
  (today the two households quietly become one, with everyone and all
  family in it). Small; next time the household card is touched.
- Verify on an iPhone that the Email button opens Gmail as the main
  address (Eric).
