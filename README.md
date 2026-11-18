# SunnyDay Engine

A CRM for busy solo real estate agents. Each agent has a private workspace;
AI agents draft, the human approves.

Plans: the "SunnyDay CRM" Claude project (Master Plan, Build Plan).
Rules for anyone working in this repo: `CLAUDE.md`.

## Where it stands

Build 1 of 22: sign-in (Google, by invitation), the nine screens as honest
placeholders, the workspace wall in the database.

## Running it on a computer

Needs Node 22 and PostgreSQL 16.

```
npm install
cp .env.example .env      # then fill it in; never commit .env
npm run build
npm start                 # http://localhost:3000
```

The database user in `DATABASE_URL` must be an ordinary one (not a
superuser); SunnyDay refuses to start otherwise.

Tests use a second, empty database (`TEST_DATABASE_URL`, default
`postgres://sunnyday_owner:dev@localhost:5432/sunnyday_test`):

```
npm test
```

## Inviting a tester

```
npm run invite -- tester@example.com
```
