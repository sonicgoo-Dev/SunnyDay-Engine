# Build 3: Contacts and the contact page

Status: waiting for Eric's approval.

## What you will be able to do

On a phone, in **Contacts**:

- **Three tabs:** Clients, Leads, Business contacts. Each person shows
  their name, buyer or seller (or both) and their stage.
- **Add someone in a few taps** from the Add button, which now sits on
  every screen: a name, a phone or email, how they found her, buyer or
  seller. "Add their partner too" puts the second person in the same
  household in the same step.
- **Open anyone's contact page.** It holds everything the Master Plan
  lists: full name, the name they go by, a private nickname; phones and
  emails with labels; addresses; how to reach them (preferred way, best
  times, "do not text", "do not email"); household (partner linked to
  their own page, children and family with birthdays); dates; personal
  notes; what they want (buyer or seller details); how they found her, who
  referred them and who they have referred; her own fields; and the story.
  Every part is optional and can be changed directly.
- **Move a stage.** Buyer and seller stages, and the four closed ones, as
  in the Master Plan. Someone can be a buyer and a seller at once.
- **Search by any detail**, including the dog's name in personal notes.
- **Call, Text and Email** buttons at the top of every page. Call and Text
  open the phone itself. A "do not text" or "do not email" greys out that
  button.
- **Business contacts** (lenders, title, inspectors, other agents,
  referral partners) get the simpler page: company, details, notes.

## What is underneath

- Every new table sits behind the workspace wall from the moment it is
  created, and a test proves one workspace cannot see another's people.
- **The nickname stays private.** It lives apart from the other names.
  Everything that will ever write to a client (from Build 8 on) must get
  the name from one place that can only give the "goes by" or first name.
  A test holds that, and another fails if any file outside the contact
  page and search reads the nickname.
- **How they found her** is saved at the moment someone is added, with
  the date (rule 6). If it is changed later, the story keeps the original.
- **The story** records each stage change, each note she types on the
  page, the day they were added, and the emails SunnyDay already reads
  (see question 5).
- A stage only moves backward when she does it herself. No AI agent
  exists yet, but the rule is in the server now, for when they arrive.

## Decisions in this brief

1. **Which tab a person is in is set by their stage.** Leads: New,
   Written to, Talking. Clients: everything after that, including Past
   client. The four closed stages (Not now, Not a lead, Gone quiet, Lost)
   sit folded away at the bottom of Leads. *Suggested: yes.*
2. **"How did they find you?" must be answered when adding someone**, from
   a short list: Referral (then who), Past client, Friend or family, Her
   website, Open house, Sign call, Online listing site, Other (type it),
   Don't remember. *Suggested: yes, and Amy may change the list.*
3. **Moving someone back a stage** asks once, "Move back to Talking?", and
   the story records it. *Suggested: yes.*
4. **The Email button opens a new message in Gmail, from her main
   address**, not the phone's default mail app, which could be set to her
   olypen address (rule 3). *Suggested: yes.*
5. **The story shows the emails already read from both mailboxes**,
   matched by email address: who, when, subject and the short excerpt
   SunnyDay already keeps. Nothing more is read. *Suggested: yes.*
6. **Her own fields are shared across all her contacts**, so "holiday
   card list" appears on every page once she adds it. Each is either text
   or a yes/no tick. *Suggested: yes.*
7. **No permanent delete yet.** "Put away" hides someone and can be
   undone. Delete for good comes with "export and delete everything" in
   Build 22. *Suggested: yes.*

## Cost

Nothing new. No AI is used in this build.

## Not in this build

- Search by meaning ("the couple with the golden retriever"). This build
  finds words; meaning needs AI, which arrives in Build 4.
- Photos (initials only for now; private file storage comes with deals).
- Anything filled in for her: from mail (Build 4), forms (Build 5),
  voice notes (Build 6). Their deals (Build 10). What is next (Builds 6
  and 9). These parts of the page say honestly what is coming.
- Calls and texts in the story: SunnyDay cannot see her phone.
- Helpers and who sees personal notes (Build 20).

## Eric's part

- Approve this brief (reply like "1 yes, 2 yes ...").
- Optional: ask Amy whether the list in question 2 matches how people
  find her.
- At the end: try it on your phone with made-up people, then say "go".

## Also in this build

CLAUDE.md is updated to say the plans now live in `docs/plan/` (with the
live versions still winning when they differ).

## Done when

Amy adds a couple by hand in under a minute, links them as one household,
moves a stage, and finds them by searching for their dog's name.
