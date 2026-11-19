# Fix: List Builder reads Gmail too fast, and gives up with a year half read

Nov 18 to 19, 2026. Branch: `fix-list-reading-pace`. A fix to Build 4, not a new build.

## What happened

The first real List Builder run, on the first tester's mailboxes (times Pacific, Nov 18):

- About 10:14 PM the Build 4 worker started. The year's reading began some time after.
- 10:48 PM: Google began answering "403" to Gmail requests. The everyday
  read failed once and recovered.
- 10:51, 10:53, 10:57, 11:06, 11:22 PM: the List Builder's read job failed
  five times with the same answer, and at 11:22:19 gave up on Gmail for
  the year, after 16,394 messages. The year then went on with only the
  newest part of her Gmail.
- 11:25 PM: Eric suspended the worker.

## Why

1. Gmail was read six messages at a time with no pause, page after page:
   at about Google's limit for one mailbox (roughly 50 requests a second).
2. One refused request failed the whole page of 500 and threw away
   everything fetched for it, so each retry repeated the page at the same
   speed and was refused again.
3. Five failures gave up on the mailbox. Nothing could pick it up again.
4. The log kept "status 403" but not Google's reason, so the cause could
   only be inferred.

## What changed

- `gmail.ts`: one pace for each mailbox (`GMAIL_PER_SECOND`), a "slow
  down" answer waits and retries that one request (2, 4, 8, 16 seconds, or
  what Google asks, up to 30), then raises `GoogleBusy`. Google's own
  reason code is kept; never anything else from the answer.
- `runs.ts`: Gmail top lines are saved 60 at a time. If Google has
  forgotten the place in its list, reading restarts just above the oldest
  message kept. `pickUpLeftOutMail` puts a set-aside mailbox back to
  reading (three times at most).
- `sort.ts` and `list_mail.sorted` (table change 0006): a year sorted in
  two goes counts each message once.
- `queue.ts` `postpone`, and the worker: `GoogleBusy` is a five-minute
  wait that is not counted as a try; the card says Google is limiting the
  speed and that it will carry on by itself.

## Tests

`shared/test/pace.test.ts` replays the night: the pace, each kind of "slow
down", a page interrupted half-way, the year given up on and picked up
again with nothing counted twice and her answers standing, the lost place
in Google's list. `worker/test/run.test.ts`: eight "slow down" answers in
a row never count as a failure.

## Not provable here

- That 403 was a rate limit: inferred from the code and the timing. The
  new log line will say Google's reason the next time.
- That the saved place in Google's list is still good after hours
  suspended. If not, the restart-above-the-oldest path is used.
- Whether the first sort had run before the worker was suspended. Both
  cases are handled and tested.

## Putting it live

1. Merge to `main`; the app applies table change 0006 at startup.
2. Eric resumes `sunnyday-worker` in Render. Its first housekeeping picks
   the Gmail reading back up.
3. Watch the worker log for "picked a set-aside mailbox back up" and for
   any "slow down" lines. A year of mail takes an hour or two at this pace.

## From the fresh review (no blockers; all fixed)

- **Never pay the AI twice in one year.** In a second go, someone the AI
  already gave a verdict on (a proposal, or "nobody") keeps it and is not
  looked at again. Trade-off, accepted: in a second go of a later year, a
  contact from an earlier year who appears only in the newly read part is
  not looked at for new details.
- **Waiting has a ceiling.** After 24 waits in a row (two hours) "slow
  down" counts as an ordinary failure. Google's own trouble (5xx) is tried
  a few times in place and then counts as a failure at once.
- **The pace is per mailbox**, not per pass (`paceAs`), so a wait carries
  from one job to the next.
- **Only newly kept messages are counted**, so a turn tried twice cannot
  count one twice. The oldest message read is noted as reading goes, for
  the lost-place restart.
- **The AI look** lets a "slow down" through, so its turn waits instead of
  running past its time.

## Order when putting it live

The app must have applied table change 0006 before the worker starts, and
the worker must start on this code, not the old one. So: merge, confirm
the app is live, then resume the worker and confirm which commit it runs.
