import { defineConfig } from 'drizzle-kit'

// Table changes are generated from src/db/schema into drizzle/ and applied
// by `npm run db:migrate`. The wall's policies are hand-written SQL in the
// same folder (drizzle-kit generate --custom).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  schemaFilter: ['auth', 'core', 'ws'],
})
