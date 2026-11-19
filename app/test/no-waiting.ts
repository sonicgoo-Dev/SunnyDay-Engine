// Tests never really wait for the Gmail pace: the clock just moves on.
import { gmailClock } from '@sunnyday/shared'

let skipped = 0
gmailClock.now = () => Date.now() + skipped
gmailClock.sleep = async (ms) => {
  skipped += ms
}
