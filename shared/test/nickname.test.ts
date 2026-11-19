// A client's private nickname is for her memory only. It shows on the
// contact page and in search, and never in anything a client could see.
// This holds that in three ways:
//  1. only the few files listed below may touch it (every other file in
//     the repo is read, with comments taken out);
//  2. it lives in its own table, so reading a contact never brings it along;
//  3. the search words saved on a contact never contain it.
// Adding a file to ALLOWED is a decision for Eric, not a chore.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { contact, workspace } from '../src/db/schema/index.js'
import { inWorkspace } from '../src/db/workspace.js'
import { addContact, saveContactPart } from '../src/contacts/store.js'
import { addInput, partInput } from '../src/contacts/input.js'
import { openTestDb } from './db.js'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ALLOWED = [
  'shared/src/db/schema/ws.ts', // the table that holds it
  'shared/src/contacts/input.ts', // the check on what the names editor sends
  'shared/src/contacts/store.ts', // saving it, the contact page and search
  'app/src/contacts/contacts.server.ts', // asks for it for the two screens below, and nothing else
  'app/src/contacts/contact-page.tsx', // shown at the top of the contact page
  'app/src/contacts/contacts-screen.tsx', // shown in search results
]
// Everything that could ever write to a client lives under these.
const LOOK_IN = ['shared/src', 'app/src', 'worker/src', 'agents', 'voice']

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'dist' ? [] : filesUnder(path)
    return /\.(ts|tsx|js|mjs|md|txt|json)$/.test(name) ? [path] : []
  })
}

const code = (file: string) => {
  const text = readFileSync(file, 'utf8')
  if (!/\.(ts|tsx|js|mjs)$/.test(file)) return text
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
}

describe('the private nickname', () => {
  it('is touched only by the files allowed to', () => {
    const touching = LOOK_IN.flatMap((d) => filesUnder(join(ROOT, d)))
      .filter((f) => !f.endsWith('routeTree.gen.ts'))
      .filter((f) => /nickname/i.test(code(f)))
      .map((f) => relative(ROOT, f).split('\\').join('/'))
    expect(touching.filter((f) => !ALLOWED.includes(f))).toEqual([])
    // And it really is looking: each allowed file is found touching it.
    expect([...touching].sort()).toEqual([...ALLOWED].sort())
  })

  it('is not a column of the contact table, so reading a contact never brings it along', () => {
    expect(Object.keys(getTableColumns(contact)).filter((k) => /nick/i.test(k))).toEqual([])
  })

  describe('in the database', () => {
    const { db, close } = openTestDb()
    afterAll(close)

    it('never reaches the saved search words', async () => {
      const [ws] = await db.insert(workspace).values({ name: 'Nickname test' }).returning({ id: workspace.id })
      const { ids } = await addContact(db, ws!.id, addInput.parse({ business: false, fullName: 'Robert Parker', buyer: true, seller: false, foundBy: 'unknown' }), null)
      await saveContactPart(db, ws!.id, ids[0]!, partInput.parse({ part: 'names', fullName: 'Robert Parker', goesBy: 'Bob', nickname: 'Grumpy Bob' }), null)
      const [row] = await inWorkspace(db, ws!.id, (tx) => tx.select().from(contact).where(eq(contact.id, ids[0]!)))
      expect(JSON.stringify(row).toLowerCase()).not.toContain('grumpy')
    })
  })
})
