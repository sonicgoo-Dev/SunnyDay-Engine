import { openDb } from '../src/db/client.js'

/** The test database on this computer. An ordinary user (not a superuser), like the hosted one. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://sunnyday_owner:dev@localhost:5432/sunnyday_test'

export const openTestDb = () => openDb(TEST_DATABASE_URL, 4)
