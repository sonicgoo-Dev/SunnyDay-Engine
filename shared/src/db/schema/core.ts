// The directory: who may sign in, which workspaces exist, and who belongs
// to which. These three tables are read only by the sign-in code, before a
// workspace is known, so they sit outside the wall. Nothing a customer
// types about their clients ever goes here; that all lives in "ws".
import { sql } from 'drizzle-orm'
import { bigserial, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { authUser } from './auth.js'

export const coreSchema = pgSchema('core')

/** One per agent's business. The id is the "workspace number" of rule 1. */
export const workspace = coreSchema.table('workspace', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // When the worker last did a job for this workspace. The workspace that
  // has waited longest goes next, so one busy agent never holds up another.
  lastTurnAt: timestamp('last_turn_at', { withTimezone: true }),
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
  // Set when an invitation is taken away. The row stays, so FIRST_INVITES
  // at the next start cannot quietly let that person back in.
  removedAt: timestamp('removed_at', { withTimezone: true }),
})

export const JOB_STATUSES = ['queued', 'running', 'done', 'failed'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

/**
 * The worker's to-do list. It sits outside the wall because the worker
 * must see every workspace's jobs to share its time fairly. So a job holds
 * only what to do and for whom (a kind and ids), never a customer's words.
 */
export const job = coreSchema.table(
  'job',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    // Two waiting jobs with the same key are one job (e.g. "read this mailbox").
    dedupe: text('dedupe'),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status', { enum: JOB_STATUSES }).notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('job_due').on(t.status, t.runAt),
    uniqueIndex('job_one_waiting').on(t.workspaceId, t.kind, t.dedupe).where(sql`status in ('queued', 'running')`),
  ],
)
