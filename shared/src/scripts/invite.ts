// npm run invite -- someone@example.com — adds an address to the invited list.
import { openDb } from '../db/client.js'
import { addInvite } from '../db/directory.js'
import { readDatabaseUrl } from '../env.js'

const email = process.argv[2]
if (!email) {
  console.error('Give one email address: npm run invite -- someone@example.com')
  process.exit(1)
}
const { db, close } = openDb(readDatabaseUrl(), 1)
try {
  const ok = await addInvite(db, email, 'invited by hand')
  console.log(ok ? `${email.trim().toLowerCase()} may now sign in.` : `"${email}" is not an email address. Nothing was added.`)
  process.exitCode = ok ? 0 : 1
} finally {
  await close()
}
