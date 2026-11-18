// Everything that belongs to one customer lives in the "ws" schema.
// Rule 1: every table here has workspace_id, and the database itself
// refuses to show a row to any other workspace (the policy is added in the
// migration, and shared/test/wall.test.ts fails if a table lacks it).
import { bigint, index, jsonb, pgSchema, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
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

export const MAILBOX_KINDS = ['gmail', 'imap'] as const
export type MailboxKind = (typeof MAILBOX_KINDS)[number]
/** main = the one mailbox mail goes out from (rule 3). read_only = only ever read. */
export const MAILBOX_ROLES = ['main', 'read_only'] as const
export type MailboxRole = (typeof MAILBOX_ROLES)[number]
export const MAILBOX_STATUSES = ['connected', 'needs_reconnect'] as const
export type MailboxStatus = (typeof MAILBOX_STATUSES)[number]

/** A mailbox an agent has connected. The way in (sealed) is unreadable without the key in the host's settings. */
export const mailbox = wsSchema.table(
  'mailbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    kind: text('kind', { enum: MAILBOX_KINDS }).notNull(),
    role: text('role', { enum: MAILBOX_ROLES }).notNull(),
    address: text('address').notNull(),
    sealed: text('sealed').notNull(),
    status: text('status', { enum: MAILBOX_STATUSES }).notNull().default('connected'),
    // Where reading got to, so the next read starts there.
    cursor: jsonb('cursor').$type<{ afterMs?: number; uidValidity?: string; lastUid?: number }>().notNull().default({}),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    lastProblem: text('last_problem'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('mailbox_one_per_address').on(t.workspaceId, t.address)],
)

export const MAIL_DIRECTIONS = ['in', 'out'] as const
export type MailDirection = (typeof MAIL_DIRECTIONS)[number]

/** What SunnyDay keeps of one message for now: who, when, the subject and a short excerpt. Never the whole message. */
export const mailMessage = wsSchema.table(
  'mail_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    mailboxId: uuid('mailbox_id').notNull().references(() => mailbox.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    threadId: text('thread_id'),
    direction: text('direction', { enum: MAIL_DIRECTIONS }).notNull(),
    fromName: text('from_name'),
    fromEmail: text('from_email'),
    toLine: text('to_line'),
    subject: text('subject'),
    excerpt: text('excerpt'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('mail_message_once').on(t.mailboxId, t.providerId), index('mail_message_recent').on(t.workspaceId, t.sentAt)],
)

/** One row each time an AI agent is paid for. Millionths of a dollar, so small calls add up exactly. */
export const aiSpend = wsSchema.table(
  'ai_spend',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    agent: text('agent').notNull(),
    micros: bigint('micros', { mode: 'number' }).notNull(),
    spentAt: timestamp('spent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_spend_month').on(t.workspaceId, t.spentAt)],
)
