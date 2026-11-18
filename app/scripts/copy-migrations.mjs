// After the build: put the table-change files beside the bundled server,
// which is one file and cannot find the shared package's folder by itself.
import { cpSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const from = fileURLToPath(new URL('../../shared/drizzle', import.meta.url))
const to = fileURLToPath(new URL('../.output/server/drizzle', import.meta.url))
if (!existsSync(from)) throw new Error('shared/drizzle is missing; there are no table changes to copy.')
cpSync(from, to, { recursive: true })
console.log('Table changes copied beside the server.')
