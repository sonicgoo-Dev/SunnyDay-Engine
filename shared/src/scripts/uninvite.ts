// npm run uninvite -- someone@example.com — takes an invitation away and signs that person out.
import { openDb } from '../db/client.js'
import { removeInvite } from '../db/directory.js'
import { readDatabaseUrl } from '../env.js'

const email = process.argv[2]
if (!email) {
  console.error('Give one email address: npm run uninvite -- someone@example.com')
  process.exit(1)
}
const { db, close } = openDb(readDatabaseUrl(), 1)
try {
  const ok = await removeInvite(db, email)
  console.log(ok ? `${email.trim().toLowerCase()} can no longer sign in, and is signed out everywhere.` : `"${email}" was not on the invited list. Nothing changed.`)
  process.exitCode = ok ? 0 : 1
} finally {
  await close()
}
