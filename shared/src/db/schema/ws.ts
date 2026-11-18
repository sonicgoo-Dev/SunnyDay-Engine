// Everything that belongs to one customer lives in the "ws" schema.
// Rule 1: every table here has workspace_id, and the database itself
// refuses to show a row to any other workspace (the policy is added in the
// migration, and shared/test/wall.test.ts fails if a table lacks it).
import { pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { workspace } from './core.js'

export const wsSchema = pgSchema('ws')

/** The column every "ws" table starts with. */
export const workspaceId = () => uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' })

/** A workspace's own settings, one row per name. The first table behind the wall. */
export const setting = wsSchema.table(
  'setting',
  {
    workspaceId: workspaceId(),
    name: text('name').notNull(),
    value: text('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.name] })],
)
