// The directory: who may sign in, which workspaces exist, and who belongs
// to which. These three tables are read only by the sign-in code, before a
// workspace is known, so they sit outside the wall. Nothing a customer
// types about their clients ever goes here; that all lives in "ws".
import { pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authUser } from './auth.js'

export const coreSchema = pgSchema('core')

/** One per agent's business. The id is the "workspace number" of rule 1. */
export const workspace = coreSchema.table('workspace', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const ROLES = ['agent', 'helper'] as const
export type Role = (typeof ROLES)[number]

/** Who is in which workspace. "agent" owns it and can send; "helper" can edit and never sends. */
export const membership = coreSchema.table(
  'membership',
  {
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ROLES }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
)

/** The invited list. An email not here cannot sign in. Always stored lowercased and trimmed. */
export const invite = coreSchema.table('invite', {
  email: text('email').primaryKey(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
