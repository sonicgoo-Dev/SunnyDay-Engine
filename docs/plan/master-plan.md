# SunnyDay CRM — Master Plan

Nov 17, 2026 · @Eric Hempel

## Purpose and the one design law

SunnyDay is rebuilt as an assistant for a busy solo real estate agent: it keeps track of every client, every lead and every deal, and drafts the messages that keep people informed, in the agent's own voice. It is a paid product for many agents from the first day, tested first by a small invited group.

The old SunnyDay stored records but did not do the three jobs that matter: tracking clients, tracking transactions, and capturing leads from email and the website. The rebuild starts with those three.

**The one design law** (carried over from Oomph): what the agent touches is simple and obvious. Everything technical lives behind it, run by AI agents.

- One screen opens first and shows the few things that need her today.
- Agents do the remembering, scheduling, drafting and checking. She talks to clients and says yes or no.
- Nothing arrives as a blank page. Every message shows up already drafted.
- No technical words on any screen.
- Quiet by default: no badges, no red dots.
- Adding information takes one tap or one spoken sentence.

**The test for every feature:** does this add something she has to remember, configure or learn? If yes, an agent does it or it does not get built.

## Goals, non-goals and what failure looks like

**Goals**

- Every client, lead and deal is in one place, and she can see where each one stands in seconds.
- No lead from Gmail or the website goes unseen. Each gets a drafted reply.
- Every deal has a timeline, and no deadline passes without a reminder.
- Clients hear from her at every step of a sale or purchase, without her writing from scratch.
- Past clients hear from her after closing and each year.
- Commissions and expenses are recorded as they happen, with a tidy report for the accountant.
- It works well on a phone.
- A new agent can sign up, connect Gmail and be useful the same day.

**Non-goals for now**

- Bought-lead handling, lead routing, dialers and team lead pools.
- A public home-search website (IDX).
- E-signatures and a forms library. Those stay in the brokerage's tools.
- Texting from inside SunnyDay. It writes the words; her own phone sends them.
- Zapier and reZEN connections.
- Bank feeds and QuickBooks links.
- A native App Store app. The web app runs on the phone.

**It has failed if**

- She has to type the same thing twice, or keep a second list somewhere else.
- Anything reaches a client that she did not approve.
- A message sounds like a robot instead of her.
- One agent can ever see another agent's clients.
- Building SunnyDay breaks or changes Oomph Engine in any way.

## What we learned

No product found does all three jobs (follow-up in the agent's voice, deal timelines, and the money side) for a solo, referral-based agent on a phone. That gap is what SunnyDay fills.

**From the old SunnyDay (iPhone app and website)**

- It was a record-keeper: clients, appointments, tasks, notes. Nothing read email, drafted anything or said what needed attention.
- Two separate apps had to be kept identical by hand, and most of the effort went into that plumbing.
- The deal record held only an address, a price, a status and three dates.
- Kept as ideas: the client details (lead source, referred by, co-clients, preferred contact method), voice notes, and the brand look.

**From Oomph Engine**

- Today, Approvals, Notes by voice, the morning email, stages that only move forward, and agents built as folders of plain-English instructions all carry over as patterns.
- Nothing is shared with it: no code, no database, no hosting account settings.

**From the commercial products (checked November 2026)**

| Product | What it is known for | Price signal |
| --- | --- | --- |
| [Follow Up Boss](https://theclose.com/follow-up-boss-review/) | Lead follow-up: smart lists, action plans, calling and texting | $69 per user a month |
| [Wise Agent](https://dupple.com/learn/best-crm-for-real-estate) | Budget all-in-one for solo agents | $49 a month |
| [Lofty and BoldTrail](https://dupple.com/learn/best-crm-for-real-estate) | Website, CRM and AI follow-up for teams | By quote; about $499+ a month |
| [Rechat](https://aitoolsatlas.ai/blog/15-best-ai-tools-for-real-estate-agents-in-2026) | CRM, transactions and marketing in one | Not published |
| [ListedKit](https://www.listedkit.com/ai-transaction-coordinator) | AI reads the contract and tracks every deadline | [$14.99 per contract](https://www.listedkit.com/trackxi-alternative) |
| [AgentXpense](https://www.g2.com/products/agent-xpense/discuss) | Expenses and income tied to deals | Low monthly |

The large CRMs are built around buying and chasing internet leads, which is not how a referral-based agent works. Their AI mostly suggests; it does not draft a full update in the agent's voice. Timelines and money each live in a separate tool.

**Two rules from the outside world**

- Texting clients from software needs written consent and carrier registration, with [fines of $500 to $1,500 per violation](https://c21redwood.helpscoutdocs.com/article/401-tcpa-rules-change-delayed-until-january-26-2026). SunnyDay avoids this by handing the words to her own phone.
- An app that reads Gmail must pass [Google's verification and a yearly security assessment](https://developer.nylas.com/docs/dev-guide/provider-guides/google/google-verification-security-assessment-guide) before public launch. The [first 100 users can connect before that review](https://nango.dev/docs/api-integrations/google-shared/google-security-review), which covers the test group.

## Approaches considered

Chosen on Nov 17, 2026: **A, a fresh SunnyDay repo built on the Oomph Engine pattern.** Eric's reason: no mix-up with Oomph Engine.

| Approach | What it means | Trade-off | Decision |
| --- | --- | --- | --- |
| A. Fresh repo, Oomph pattern | New code, same stack and ideas, with "which customer is this?" on every table from day one. One web app that also runs on the phone. | Some things Oomph already has get rebuilt. | Chosen |
| B. Shared platform with Oomph Engine | One codebase runs both businesses. | Every SunnyDay change could break the live travel engine; Oomph's own rules are woven through it. | Rejected |
| C. Keep the old SunnyDay and add agents | Existing screens stay on Firebase. | Keeps the structure Eric does not like; a poor fit for agents, scheduled jobs and money reports. | Rejected |

The old `sunnyday-web` and `sunnyday-ios` repos stay untouched as a reference. The new repo keeps the SunnyDay name and look: the Sunny*Day* wordmark, Fraunces and Manrope type, and the sun and ink colours.

The new repo is `SunnyDay-Engine` and the product lives at sunnydaycrm.com. Proposed split: the app at `app.sunnydaycrm.com`, with the bare address kept for a public page about the product.

## The screens

Nine screens, with Today opening first. A Note button, an Add button and a Help button sit on every screen.

| Screen | What it shows | What she does there |
| --- | --- | --- |
| Today | The three things that most need her, then calls and texts to make, new leads, deadlines this week, people waiting on her | Done, Skip, tap to call, text with the suggested words or her own |
| Approvals | Every drafted message, in full, with the person's recent history beside it | Send, Edit, Skip (two taps to send) |
| Contacts | Buyers, sellers, past clients and referral partners, each with a stage | Find anyone, open their detailed page, see their whole story, move a stage |
| Deals | One card per transaction with its timeline and who is involved | See what is next, mark a step done, upload a contract |
| Notes | Spoken or typed notes waiting to be filed, then filed notes by person and deal | Approve where a note goes |
| Money | Commissions earned and expected, expenses, mileage; by month, quarter and year to date | Snap a receipt, download the accountant report |
| Website | How her site is doing in plain words, content drafts waiting, ideas for what to write next | Approve a draft to her site, jot a content idea |
| Agents | One page per AI agent: what it does, what it did this week, its on/off notch | Read, correct in plain English, loosen or tighten |
| Settings | Her details, email and website connections, brokerage fees, helper access, spending limit | Set once |

**The morning email** arrives every day with the same list as Today and a link into the app. A quiet morning still sends a short "nothing needs you today" so silence never means broken.

**The Today order**, until three items are found: a deal deadline today or tomorrow, a new lead not yet answered, a person waiting on her reply, the first call on the list, then the week's task.

## Contacts, stages and lead capture

Every person has one record, one stage and one running history, and SunnyDay builds the first list for her because today it lives in her phone, her Gmail and her head.

**The two names used in this plan:** **Contacts** is the screen that lists everyone. A **contact page** is the detailed page for one of them. Contacts has three tabs: Clients (active and past), Leads, and Business contacts (lenders, title, inspectors, other agents).

**Building the first list**

1. She connects Gmail and Google Contacts.
2. An agent reads her mail one year at a time (the last 12 months first, further back only when she asks, up to five years) and proposes who is a past client, an active client, a lead, another agent, a lender or title contact, or not a contact at all.
3. She confirms in batches: Yes, No, or Change. Nothing is added without her tap.
4. Phone-only contacts come in through a contact file export or one at a time by voice.

**Kinds of lead:** buyer, seller, relocating (a buyer moving from elsewhere, with where from and when), and home-value request (a seller with an address and a timeframe).

**Buyer stages:** New, Written to, Talking, Pre-approved, Touring, Offer out, Under contract, Closed, Past client.

**Seller stages:** New, Written to, Talking, Listing appointment, Signed, Listed, Under contract, Closed, Past client.

**Closed stages for both:** Not now, Not a lead, Gone quiet, Lost.

A stage never moves backward on its own. Agents may move someone forward; only she moves someone back. A person can be a buyer and a seller at once, with a stage for each.

**How a lead gets in**

| Door | How it works |
| --- | --- |
| Email | New mail from someone not yet in Contacts is read. A real inquiry becomes a lead with a drafted reply and a "New lead" alert. Every alert has a "Not a lead" button that teaches the filter. |
| Website form | A small add-on on the agent's site sends each form submission to SunnyDay the moment it happens, with all of the form's answers. The form's notice email in her mailbox is the safety net if the add-on is ever down. |
| By hand or voice | Add on any screen: a name, a phone or email, how they found her, what they want. Or say it into a note. |

How the person found her and who referred them are recorded at that moment, because they cannot be reconstructed later.

**Two mailboxes in, one out**

- SunnyDay reads both of an agent's mailboxes: a Google mailbox and a second, older address. For the first tester these are her Google mailbox at her own domain and an olypen.com address.
- Every outgoing message goes from Gmail, including replies to mail that arrived at the old address. The old address is never sent from.
- Recommended setup for the old address: turn on forwarding at olypen.com so its mail arrives in Gmail, and SunnyDay reads it there. If olypen.com cannot forward, SunnyDay signs in to that mailbox directly, read-only.
- Each person's record shows which address they wrote to, so nothing looks lost.
- An email thread with no written reply is never called ignored or unanswered. Agents often answer by phone.

## The contact page

Every client has one detailed page that holds everything she knows about them, and SunnyDay fills most of it in for her. Information is king: the page is the heart of the CRM. Added Nov 17, 2026 at Eric's request.

**What the page holds**

| Part | Details |
| --- | --- |
| At the top | Full name, the name they go by (for example "Bob" for Robert), a private nickname that only she sees, photo or initials, buyer, seller or both, current stage, and three buttons: Call, Text, Email |
| Contact | Every phone number and email address with a label (mobile, work, home), mailing address, current home address |
| How to reach them | Preferred way (call, text or email), best times, "do not text" or "do not email" if they said so |
| Household | Spouse or partner, children, and other family, each with a name and, when known, a birthday. A partner who is also a client is linked to their own page, and the two share one household. |
| Dates | Birthday, wedding anniversary, home-purchase anniversary, the day they first became a client |
| Personal notes | Pets and their names, work, hobbies, where they moved from, how they take their coffee: anything she wants to remember |
| What they want | Buyers: price range, towns and neighbourhoods, must-haves, deal-breakers, pre-approval and lender, move timeframe. Sellers: the property, why and when they are selling, what matters most to them. |
| How they found her | Lead source, who referred them, and who they have referred |
| Their deals | Every purchase and sale, past and present, each linking to its Deal page |
| The story | One running timeline of every email, call, text, note, meeting and stage change, newest first |
| What is next | The next call, message or deadline for this person |
| Her own fields | Any extra detail she wants to track, added in one tap (for example "holiday card list") |

**How it gets filled in without typing**

- **From her mail.** When a client's email mentions a new phone number, a partner's name or a birthday, an agent proposes it: "Add Biscuit, their dog, to the Parkers' page?" She taps Yes or No.
- **From her voice.** She says "The Parkers have a golden retriever named Biscuit and their daughter starts college in the fall," and the Note Sorter files each fact in the right place on their page.
- **From forms and contracts.** Website forms, contracts and listing sheets fill in addresses, phones and co-buyers.
- **By hand.** Every part can be typed or corrected directly, and every field is optional.

Nothing an agent proposes is saved until she approves it, and each saved detail shows where it came from.

**How the details are used**

- Keep-in-Touch uses birthdays, anniversaries and the home-purchase date for its notes.
- Drafts use the "goes by" name and the preferred way to reach them. The nickname is never used in any draft, text suggestion or message.
- Before a call, the page opens with a short "Remember" strip: partner's name, children, pets, and the last thing they talked about.
- Search finds anyone by any detail: "the couple with the golden retriever", "moved from Sacramento".

**Care with personal details**

- The nickname is for her memory only: it shows on the contact page and in search, and never appears in anything a client could see. A personal note is for her memory too. A draft uses one only when it is plainly friendly (a pet's name, a new job) and never anything about health, money, family trouble or beliefs.
- Nothing about a client's household is ever used to decide which homes or neighbourhoods to suggest. That is a fair-housing rule, checked on every draft.
- She chooses whether her assistant or coordinator can see personal notes.
- A client's whole page can be exported or deleted on request.

**Business contacts get pages too:** lenders, title and escrow officers, inspectors, other agents and referral partners each have a simpler page (company, contact details, deals worked together, notes), so the right person is one tap away during a deal.

## Voice and the agents

Each agent's voice is learned from the emails she wrote herself, written down on one page she approves, and read by every AI agent before it drafts anything.

**How the voice is built**

1. A voice reader studies her sent Gmail from the last two years: how she opens and closes, how long she writes, the words she uses and never uses, how she delivers good and bad news.
2. It writes a one-page voice note with real examples.
3. She reads it and corrects anything that is not her. A short spoken interview fills gaps.
4. Every edit she makes to a draft in Approvals becomes a new example. The voice note changes only with her approval.

This differs from Oomph on purpose. Oomph uses spoken interviews because Eric's emails were AI-drafted. Here the first tester wrote her own, so her sent mail is the source.

**How an agent is made:** a folder holding a job description in plain English, the knowledge it may read, and examples of good and bad output. Changing an agent means editing a page, not code. Each customer gets their own copy of the voice and examples.

**The four-notch switch on every agent:** Off, Suggest only, Draft for approval, Run on its own. Anything that reaches a client stays at Draft for approval. Reading, sorting, filing and reminding may run on their own.

**The starting agents**

| Agent | Job | Reaches a client? |
| --- | --- | --- |
| List Builder | Proposes the first client list from Gmail and contacts | No |
| Voice Reader | Writes and maintains the voice note | No |
| Lead Responder | Spots new inquiries and drafts the first reply | Draft only |
| Follow-up Concierge | Keeps leads warm on a set rhythm; puts calls and texts on Today with words ready | Draft only |
| Deal Coordinator | Reads the contract, builds the timeline, drafts the kickoff email, milestone updates and reminders | Draft only |
| Seller Reporter | Drafts the weekly update for each listed seller | Draft only |
| Keep-in-Touch | After-closing check-ins, the review ask, home anniversaries and birthdays | Draft only |
| Note Sorter | Splits spoken notes and suggests where each belongs | No |
| Receipt Reader | Reads receipt photos and forwarded receipts into expenses | No |
| Website Reader | Reads her site's visitor and Google search numbers and says what changed in one or two sentences | No |
| Content Writer | Drafts blog posts, neighbourhood and market pages, listing descriptions and Google Business Profile posts in her voice | Draft only; she publishes |
| SunnyDay Guide | Answers "how do I…" questions about using SunnyDay, from the Help button on any screen | No; it talks only to the user |

**Rules every drafting agent follows**

- Only what is true. It never claims she saw, heard or did something that is not in her notes or mail.
- No legal, lending or price advice in her name. Facts about dates and steps come from the contract and the timeline.
- It stops the moment the person replies, and hands the thread to her.
- Texts are hers first. Each text on Today offers two buttons: "Use these words" opens her Messages app with the suggestion filled in, and "Write my own" opens it blank to that person. A switch in Settings turns text suggestions off entirely, leaving just the reminder of who to text and why.
- Never more than one message to the same person in three days unless a deadline requires it.

## Deals: intake, timeline and client messages

A deal enters SunnyDay four ways, becomes a timeline she approves once, and from then on the Deal Coordinator drafts every update and reminder.

**Four ways in**

| Way in | What happens |
| --- | --- |
| Upload the signed contract | The Deal Coordinator reads the purchase agreement and proposes the parties, price, dates and every deadline. |
| Forward the email | She forwards the contract email to her private SunnyDay address; it is read the same way. |
| Upload a Paperless Pipeline report | A report file fills in or updates deals in bulk. Needs one sample file to build against. |
| Quick entry | A short form: address, buyer or seller side, price, key dates. |

Whatever was read is shown as a proposal. She checks the dates and taps Approve before any timeline goes live. Dates the reader was unsure of are marked in amber.

**What a deal holds**

- The property, which side she represents, and the client.
- Everyone involved: the other agent, lender, title and escrow, inspector, and the assistant or coordinator.
- Price, earnest money, and her expected commission.
- The timeline: mutual acceptance, earnest money due, inspection period, financing and appraisal dates, title review, final walk-through, closing, possession.
- Documents she uploaded and every message sent about it.

Deadlines are counted from the contract's own terms.

**Built for Northwest MLS first.** Every agent in the test group uses Northwest MLS (Eric, Nov 17, 2026), so the first version handles one set of paperwork very well instead of every state's loosely.

- The contract reader is tuned on the Northwest MLS purchase and sale agreement and its common addenda: financing, inspection, title, and the optional clauses.
- The timeline uses the names and steps those forms use, so what she sees matches the paperwork in front of her.
- The way the forms count days (including how weekends and holidays are treated) is built in and checked against the current forms before any timeline is trusted.
- The Northwest MLS listing sheet is the one listing format read at launch.
- SunnyDay reads the signed copies an agent uploads. It does not store or hand out blank Northwest MLS forms, which belong to the MLS.
- A live listing feed from Northwest MLS needs signed data agreements through the brokerage. It is a later option, not part of this plan.
- Other MLS areas come after the test group, one at a time.

**Listing side, before a contract:** a listed home has its own short timeline (photos, live date, open houses, price reviews) and feeds the weekly seller report.

**The messages the Deal Coordinator drafts**

| Message | When | To |
| --- | --- | --- |
| Kickoff email | When the timeline is approved | The client |
| Milestone update | Each step completed: inspection done, appraisal in, clear to close | The client |
| Deadline reminder | Before any date the client must act on | The client |
| Weekly seller report | Once a week while listed | The seller |
| Check-in note | When something is due from them | Lender, title, the other agent |

**The kickoff email** lays out the whole process from start to finish in her voice: each step in order with its date, who is involved and how to reach them, what the client needs to do and when, and what happens on closing day. It is the one message Eric asked for by name.

A date change on the timeline re-plans the reminders and offers a drafted "dates have changed" note. After closing, the deal hands the client to Keep-in-Touch and the commission to Money.

## Money: commissions, receipts and reports

The Money screen answers two questions at a glance, what she has earned and what she has spent, by month, quarter and year to date, and produces one tidy report for the accountant.

**Commissions**

- Each deal carries its expected commission from the day it goes under contract, and its actual commission at closing.
- Brokerage costs are set in Settings, and each brokerage has a start date, because agents change brokerages. The first tester is with Real until Dec 31, 2026 and joins Best Choice Realty on Jan 1, 2027: a deal uses the fees of the brokerage it closes under, and reports show each brokerage separately. Every agent can enter their own fees, split or cap.
- Referral fees paid to or received from another agent are recorded on the deal.
- The screen shows a list of commissions earned, a list expected from open deals, and a simple chart by month.

**Expenses**

| How it gets in | What happens |
| --- | --- |
| Receipt photo | The Receipt Reader pulls the store, date, amount and a tax category. She confirms with one tap. |
| Forwarded email receipt | Forward it to her private SunnyDay address; filed the same way. |
| Mileage | A quick trip entry, or offered from a showing on a deal. Valued at the IRS rate for the year, set in Settings ([72.5 cents a mile for 2026](https://www.fylehq.com/blog/real-estate-expense-management)). |
| Recurring costs | MLS dues, brokerage fees and subscriptions entered once and repeated. |

An expense can be tied to a deal or a listing, so she can see what each one cost her. Categories follow the lines an accountant uses for a self-employed agent's return. The receipt image is kept with the entry.

**Reports**

- On screen: income, expenses and what is left, for the month, the quarter and the year to date.
- For the accountant: one download with every commission and every expense by category, each with its receipt, for any date range.

**Not included:** bank connections, invoicing, payroll, or tax advice. SunnyDay keeps the records; the accountant does the taxes.

Money is stored as whole cents, and nothing in Money is ever seen by the assistant or coordinator unless the agent turns that on.

## Website and content

The Website screen shows how her site is doing in plain words and keeps a steady supply of content drafted in her voice, which she approves before anything appears on her site. Added Nov 17, 2026 at Eric's request, modelled on the "Content and websites" part of the Oomph Dashboard.

**What the screen shows**

- Two or three lines on the site: real visitors this week, how often it showed up in Google, and one sentence on what changed.
- Leads that came from the site, and which page they came from.
- Content drafts waiting for her.
- A short list of ideas for what to write next, drawn from her notes, her deals and what people search for.

**What the Content Writer drafts**

| Kind | Where it comes from | Where it goes |
| --- | --- | --- |
| Blog post | Her spoken notes, questions clients ask, local topics | A draft on her website |
| Neighbourhood or market update | Her own observations and figures she supplies | A draft on her website |
| Listing description | The details of a home she is listing | Shown for her to copy into the listing |
| "Just listed" and "just sold" posts | A deal reaching that step, only with the client's OK | Shown for her to copy or post |
| Google Business Profile post | A rotating list of topics | Shown for her to paste |

**Rules for website content**

- Draft only. A website post is created as a draft and is never published or scheduled by SunnyDay. Publishing is always hers.
- Fair housing. Content describes homes and places, never the kind of people who live there or who a home would suit. This is a written check on every draft.
- Only what is true. No invented prices, statistics or sales. Market figures come from what she supplies or a source she names.
- No client's name, address or sale appears without her confirming the client agreed.
- Photos are hers. SunnyDay does not pull images from listing services or the web.

**Connections:** her website (WordPress first, through the SunnyDay add-on described below), Google Analytics and Google Search Console. Each agent connects their own in Settings. An agent with no website can still use the listing descriptions and posts.

**Still not included:** building or hosting the agent's website, and home search on it. SunnyDay feeds the site she already has.

**What the first tester's site taught us** (amyhempelrealty.com and its repo, read Nov 17, 2026)

| What is there today | What it means for SunnyDay |
| --- | --- |
| WordPress on SiteGround with four Fluent Forms: Contact, Home value request, Relocation inquiry, Buyer inquiry | Four ready-made lead doors. Each form's answers map straight onto a lead: buying, selling or relocating, the property address, and when they plan to sell. |
| Form emails already arrive at her own-domain Google mailbox, with the form and page named in the subject | Website leads can be caught from her mail on day one with no site changes, as a safety net under the direct connection. |
| SiteGround blocks automated requests from outside servers, including to WordPress itself | SunnyDay cannot reach into her site. The site must send to SunnyDay and fetch from it. This shapes the connection below. |
| Relocation is her specialty: a relocation hub, four guides, long-distance buyers by video | People need a "relocating from" place and a move timeframe, and relocation is its own kind of lead beside buyer and seller. |
| She writes her own posts in a strong, funny voice; her words are the source of truth and nothing is invented | The Content Writer has two settings: **Polish my words** (tidy and format what she wrote or spoke, change nothing she said) and **Draft for me**. Hers starts on Polish. |
| Her own listings only, with Active, Pending and Sold; built from a folder holding the photos and the MLS listing sheet | Uploading the MLS listing sheet becomes the way a listing enters Deals, and a deal's status can keep the site listing in step, as a draft change she approves. |
| A three-times-a-week "Real Insights" email and dashboard from Search Console and Analytics already exists | The Website screen is the built-in version of that, so the separate task can retire once it matches. |
| The site's voice rules and local facts are already written down | They seed her voice note, alongside her sent mail. |

**How the website connection works:** a small SunnyDay add-on is installed on the agent's WordPress site. It sends each form submission to SunnyDay the moment it happens, and it asks SunnyDay a few times a day whether an approved draft is waiting, then saves it on the site as a draft. SunnyDay never calls the site, so a host that blocks outside servers does not matter.

## Tech stack and the non-negotiable rules

SunnyDay uses the same tools as Oomph Engine, in its own repo, its own database and its own hosting services, built for many customers from the first table.

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript on Node, everywhere | One language; replaces the old Swift-plus-web pair |
| Screens | TanStack Start with Tailwind and shadcn/ui | Same as the Oomph Dashboard; works at phone width; dark mode from day one |
| On the phone | An installable web app (added to the home screen) | One codebase; an App Store wrapper can come later |
| Voice notes | The phone keyboard's own microphone key | No sound is ever stored, as in Oomph |
| Database | PostgreSQL with Drizzle | Good at reports and money sums; replaces Firebase |
| Keeping customers apart | A workspace number on every table, enforced by the database itself | A missed filter in code still cannot leak another agent's data |
| Background work | A job queue inside PostgreSQL, with fair turns per customer | Oomph's single one-minute clock serves one user; this serves many |
| AI | Claude, called with Anthropic's own library | Changed from the Vercel AI SDK on Nov 18, 2026 (Build 4 brief, decision 12); cheap model for sorting, strong model for drafting |
| Checking inputs | Zod at every boundary | Same as Oomph |
| Sign-in | Better Auth with Google sign-in | Same as Oomph, opened to many users |
| Email | Gmail connection per agent for reading, drafting and sending; a read-only connection for a second mailbox | Drafts live in her own Gmail |
| System email | Amazon SES for the morning email and alerts | Same as Oomph |
| Files | Private file storage for contracts and receipts | Never public links |
| Billing | Stripe subscriptions, built in but switched off during testing | SaaS from day one |
| Hosting | Render: one web service, one worker, one database, all separate from Oomph's | Same host Eric already uses |
| Monitoring and tests | Sentry; Vitest for logic; Playwright for screens | Same as Oomph |

**The non-negotiable rules**

1. Every table has a workspace number, every query filters on it, and the database enforces it. A test proves one workspace cannot read another.
2. Nothing reaches a client, lender, title company or other agent without the agent's own approval. Helpers can edit; only the agent sends.
3. Outgoing mail goes only from the agent's one main mailbox (Gmail, or Outlook for agents who use it). A second mailbox is read, never sent from.
4. Mail is read and never changed. A draft that was sent, or that she edited, is never deleted (the lesson from Oomph's Fix A).
5. A timeline goes live only after she approves the dates read from a contract.
6. Lead source and referral are recorded at the moment of capture.
7. Secrets live only in the host's settings. Each customer's email connection is stored encrypted and never shown on a screen or in a log.
8. Every workspace has a monthly AI spending limit. At the limit the agents pause and say so.
9. No code, database, key or setting is shared with Oomph Engine or PlainSend.
10. No host-specific code: everything reads from settings checked at startup.
11. Client documents and mail are never used to train anything, and a customer who leaves can export and delete everything.

## SaaS from day one

Every agent who signs up gets a private workspace, and everything needed to charge for it and keep customers apart is built before the first tester logs in, even where it stays switched off.

**Workspaces and roles**

| Role | Can do | Cannot do |
| --- | --- | --- |
| Agent (owner) | Everything, including Send |  |
| Assistant or transaction coordinator | See contacts and deals, edit drafts and deal details, upload documents, file notes | Send anything, see Money (unless the agent allows it), change agents or settings |

A coordinator who works for several agents gets one sign-in and a switcher between workspaces. Each workspace stays separate.

**Sign-up during testing:** invite-only and free. Eric invites each agent; the test group is about ten. Billing is built with Stripe and switched off.

**Getting started in one sitting**

1. Sign in with Google.
2. Connect Gmail and contacts; add a second mailbox if she has one.
3. Confirm the proposed client list.
4. Read and correct the voice note.
5. Enter brokerage fees.
6. Upload one live contract or add one listing.

**Pricing** is not set. A flat monthly price per agent with the helper seat included is the working assumption, to be checked against the $49 to $69 a month agents already pay, once testers have used it for 60 days.

**Google's review before public launch**

- The test group fits within the first 100 connected users, so no review is needed to start.
- Before opening sign-up: Google verification plus a yearly security assessment, [roughly $540 to $1,000 a year and 2 to 8 weeks](https://www.unipile.com/integrating-google-oauth-2-0-user-authentication-into-your-app/) by one 2026 guide.
- To confirm in Stage 1: how to avoid testers having to reconnect Gmail every seven days, which is [a limit of Google's "Testing" status](https://singhamandeep.com/google-oauth-internal-vs-external-user-type/).
- Some of the ten testers use Outlook, so Outlook mail is part of the test build: it follows Gmail and is ready before those testers are invited. Microsoft has its own approval step for apps that read mail, to be checked when that work is briefed.

**Privacy and trust**

- A plain-English privacy page and terms before any tester who is not family connects mail.
- Client mail and documents are used only to serve that agent.
- Export everything and delete everything, on request, from Settings.
- Each agent stays responsible for what is sent in their name; SunnyDay drafts, the agent approves.

**Support:** Eric has a hospital job, so setup must be self-serve, the SunnyDay Guide answers first, and the test group stays small until both work.

## The SunnyDay Guide: built-in help

Every screen has a Help button that opens the SunnyDay Guide, an AI assistant that knows the product and walks the user through anything in plain words. Added Nov 17, 2026 at Eric's request. It is also the main answer to the support-time risk.

**What it does**

- Answers "how do I…" and "where is…" questions, typed or spoken, with short numbered steps.
- Knows which screen the user is on, so "what is this?" gets an answer about that screen.
- Offers a button that takes the user straight to the right place ("Open Settings, Brokerage fees").
- Walks a new agent through setup the first time, one step at a time.
- Answers simple questions about her own workspace: "what is due this week?", "where is the Smith deal?"
- Explains why something happened: "why did this draft not send?", "why is this date amber?"

**What it never does**

- Send, approve or delete anything. It points to the button; the user taps it.
- Give legal, tax, lending or pricing advice. It says so and suggests who to ask.
- See or mention any other agent's workspace.
- Guess. When it does not know, it says so and offers "Send this to support".

**How it knows the product**

- A set of plain-English help pages, one per screen and per task, written as each stage is built. These are the only source it answers from, so its answers match the product as it is today.
- The same pages are readable as an ordinary help centre for people who prefer to read.
- A release cannot ship if a screen has changed and its help page has not.

**When it cannot help:** "Send this to support" passes the question, the screen and the Guide's attempted answer to Eric in one email, so he never has to ask "what were you trying to do?". Questions it could not answer are listed each week, and each one becomes a new or better help page.

**Cost:** the Guide runs on the cheap model and has its own small allowance, so reaching the monthly AI limit never switches off help.

## Build order

Seven stages, each ending with something the first tester can use and a stop for Eric to try it before the next begins. No dates are set yet.

1. **Foundation.** New repo, the SunnyDay look, sign-in, workspaces with the wall between customers proven by a test, hosting on Render, Gmail connect, the second-mailbox reader, the spending limit.
   - *She can:* sign in on her phone, connect both mailboxes, see an honest "coming soon" on each screen.
2. **Contacts and leads.** The List Builder and its confirm screen, Contacts and the contact page, with buyer and seller stages, lead capture from email and the website form, Add by hand, Notes by voice, Today, the morning email.
   - *She can:* see every client and lead in one place, get a new-lead alert, speak a note and file it.
3. **Voice and follow-up.** The Voice Reader and voice note, the Lead Responder, the Follow-up Concierge, Approvals with Send, Edit and Skip, tap-to-text.
   - *She can:* approve drafted replies that sound like her, from her phone.
4. **Deals.** Contract upload and forwarding, the proposed timeline and its approval, quick entry, the kickoff email, milestone updates, reminders, notes to the other parties, listings and the weekly seller report, the Paperless Pipeline report upload.
   - *She can:* run a live transaction from acceptance to closing with every update drafted.
5. **Money.** Commissions from deals, brokerage fees, receipt photos and forwarded receipts, mileage, recurring costs, the month, quarter and year views, the accountant report.
   - *She can:* snap a receipt and see the year so far.
6. **Past clients and website.** Keep-in-Touch: after-closing check-ins, the review ask, home anniversaries and birthdays. Then the Website screen: the Website Reader, the Content Writer and drafts sent to her site.
   - *She can:* stay in touch with every past client without a list of her own, and approve a blog draft for her site.
7. **Ready for others.** Helper sign-in and roles, the self-serve setup flow, the Agents and Settings screens complete, the SunnyDay Guide with its full set of help pages and "Send this to support", privacy page and terms, billing ready to switch on, Google's review started.
   - *She can:* add her assistant; Eric can invite the rest of the test group.

**Rules for every stage**

- Plan first, in plain language, then build, then stop for Eric to try it.
- Each stage has its own short written brief and deploy checklist, as in Oomph, and ends with the help pages for what it added. A simple Help button that answers from those pages arrives with Stage 2.
- Agents start at Suggest only and move up a notch after a week of drafts needing no edits.
- The wider test group is invited after Stage 4 at the earliest, so they meet a product that already tracks clients, leads and deals. Outlook users are invited once Outlook mail works, which is built right after Stage 4.

## Risks, open questions and decisions

The largest risk is a wrong date read from a contract, so no timeline goes live without her approval and unsure dates are marked.

**Risks**

| Risk | What guards against it |
| --- | --- |
| A deadline is read wrongly from a contract | She approves every timeline; unsure dates in amber; "check with your broker" wording; quick entry as a fallback |
| A draft goes out sounding wrong or saying something untrue | Nothing sends without her tap; "only what is true" check; the voice note she approved |
| One agent sees another's data | Enforced by the database, proven by a test in Stage 1 |
| Google's review delays public launch | Test group fits the 100-user allowance; review starts in Stage 7 |
| The old olypen.com mailbox cannot be read reliably | Forwarding to Gmail is the first choice; direct read-only sign-in is the fallback |
| AI cost per agent runs high during the first mail read | Per-workspace spending limit; the first read uses the cheap model and a date cut-off |
| Support time, given Eric's hospital job | Self-serve setup; the SunnyDay Guide answers first; small invited group; Stage 7 before growth |

**Open questions**

- [ ] Can olypen.com forward mail to Gmail, or does SunnyDay need to sign in to it directly?
- [ ] A sample Paperless Pipeline report file, to see which details it carries.
- [ ] One or two finished contracts (with her permission) to tune the contract reader on Northwest MLS forms, plus the form numbers she uses most.
- [ ] The exact fees at Real (through Dec 31, 2026) and the flat and per-transaction fees at Best Choice Realty (from Jan 1, 2027).
- [ ] How many of the ten testers use Outlook, and is it Outlook.com or a work Microsoft 365 account?
- [ ] Does Best Choice Realty use Paperless Pipeline, or is that Real's tool? It decides whether the report upload is still needed after Jan 1.

**Answered Nov 17, 2026:** the repo is `SunnyDay-Engine`; the web address is sunnydaycrm.com; the test group is about ten agents and some use Outlook; the first tester is with Real until Dec 31, 2026 and joins Best Choice Realty on Jan 1, 2027.

**Decisions so far (Nov 17, 2026)**

| Decision | Detail |
| --- | --- |
| Approach | A: fresh repo on the Oomph pattern, nothing shared with Oomph Engine |
| Name and look | SunnyDay, same wordmark, type and colours |
| Customers | SaaS from day one; solo agent plus an assistant or coordinator |
| Helper rights | Edit only; the agent sends |
| Phone | Installable web app; no App Store app for now |
| Mail | Read Gmail and a second mailbox; send only from Gmail |
| Voice | From her own sent mail, confirmed on one page |
| Lead capture | Gmail reading, direct website form, by hand or voice |
| Deal intake | Contract upload, forwarded email, Paperless Pipeline report upload, quick entry |
| Dropped | Zapier and reZEN |
| Texting | Sent from her own phone. Suggested words are optional: "Use these words" or "Write my own" on every text, and a Settings switch to turn suggestions off |
| Client messages | Kickoff email, milestone updates, deadline reminders, weekly seller report, notes to other parties |
| Past clients | After-closing check-ins, review ask, home anniversary, birthday |
| Money | Flat and per-deal fees; receipts, mileage, recurring costs; month, quarter and year views; accountant report |
| Daily rhythm | Morning email plus the Today screen |
| Test group | Invite-only, free, billing built but off |

**Sources**

- [Follow Up Boss review, The Close](https://theclose.com/follow-up-boss-review/)
- [Real estate CRM comparison, Dupple](https://dupple.com/learn/best-crm-for-real-estate)
- [ListedKit AI transaction coordinator](https://www.listedkit.com/ai-transaction-coordinator)
- [Paperless Pipeline: API through Zapier](https://help.paperlesspipeline.com/help/paperless-pipeline-api-through-zapier)
- [Lofty on the texting consent rules](https://lofty.com/blog/tcpa)
- [Nylas: Google verification and security assessment guide](https://developer.nylas.com/docs/dev-guide/provider-guides/google/google-verification-security-assessment-guide)
- [Nango: Google security review](https://nango.dev/docs/api-integrations/google-shared/google-security-review)
