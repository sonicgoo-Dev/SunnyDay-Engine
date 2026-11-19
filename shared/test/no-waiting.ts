// Tests never really wait for the Gmail pace: the clock just moves on.
import { gmailClock } from '../src/mail/gmail.js'

let skipped = 0
gmailClock.now = () => Date.now() + skipped
gmailClock.sleep = async (ms) => {
  skipped += ms
}
