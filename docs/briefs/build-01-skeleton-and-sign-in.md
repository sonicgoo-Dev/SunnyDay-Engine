# Build 1: Skeleton and sign-in

Approved by Eric on Nov 17, 2026 ("1 yes. 2 cloudflare. 3 I can click").

## What you will be able to do

Open app.sunnydaycrm.com on a phone or a computer, sign in with Google, and
see SunnyDay's frame: the name, nine screens you can tap between, light and
dark. Each screen says honestly what is coming. Someone who has not been
invited is turned away politely.

## What is underneath

- A new repo, nothing shared with Oomph Engine or PlainSend.
- Sign-in with Google, by invitation only. Checked on the server when an
  account would be made, when a sign-in would start, and every time a page
  is opened; removing an invitation locks that person out at once.
- A private workspace made for each agent the first time they sign in.
- The workspace wall: the database itself refuses to show one workspace's
  rows to another, and SunnyDay will not start if the wall could be bypassed.
- Settings checked at startup; a missing one is named in plain words.
- A health address (`/healthz`) for the host, and error reports to Sentry.

## Not in this build

Any real feature: contacts, deals, mail, agents, money, the Guide. No mail
is read. Nothing is sent to anyone. Billing stays off.

## Eric's part

Approve this brief; create the GitHub repo; later, by clicking: a Google
sign-in client, one DNS record at Cloudflare, a Sentry project, and the
keys pasted into Render. Then try it, and say when it goes live.

## Done when

- All tests pass, including: the wall holds for every `ws` table; an
  uninvited or unverified person never gets a session; every server
  function checks the session; the nine screens match their pages.
- Eric has signed in on his phone and tapped through the nine screens.
