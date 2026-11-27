# 0004 — IDs: UUIDv7 in Postgres, plus a short public id for URLs

- **Status:** accepted. Primary keys: owner, 18-11 and 19-11-2026. Short public id: owner,
  20-11-2026.
- **Date:** 2026-11-20
- **Deciders:** owner

## Context

Every table needs a primary key. AGENTS.md §7 forbids exposing auto-increment ids, and public
URLs combine a readable slug with a short id (`/nl/q/beste-voetballer-ooit-k3x9ma`). The owner chose
UUIDv7 (18-11-2026) and decided that the database generates it (19-11-2026), which needs
PostgreSQL 18+ for the built-in `uuidv7()`.

## Decision: primary keys (accepted)

- Every entity with a surrogate key uses a **UUIDv7** primary key, stored as native Postgres
  `uuid`. In Prisma: `id String @id @default(dbgenerated("uuidv7()")) @db.Uuid`.
  Exception (task 2.3): Better Auth's own short-lived single-use lock rows in `Verification`
  get a deterministic UUIDv5-shaped id (ADR 0006), so code must never assume `Verification`
  ids are v7 or time-ordered.
- The **database generates** it, so rows inserted outside the api (seed, SQL, migrations) get the
  same kind of id. Production hosting must offer PostgreSQL 18 or newer.
- UUIDv7 starts with a millisecond timestamp, so new rows land at the end of the B-tree index
  (fewer page splits than UUIDv4) and ids sort roughly by creation time. Keyset (cursor)
  pagination still orders by an explicit column such as `createdAt`, with `id` as tiebreaker; it
  never relies on the id alone for time order.
- Because the timestamp is readable from the id, an id reveals when the row was created. That is
  acceptable for content that shows its date anyway (questions, comments), but ids of users and
  other personal records are never put in public URLs, share cards or client-visible payloads
  where the creation time would be new information. Public profiles use the username.
- Natural keys stay natural: `Country.code` (ISO 3166-1 alpha-2), `Region.code` (ISO 3166-2),
  and composite keys such as `QuestionTranslation (questionId, locale)`.
- Foreign keys are `@db.Uuid` as well and get an index (AGENTS.md §7).

## Decision: short public id (accepted)

Only entities with a public URL get a short id. Today that is `Question` (`Question.shortId`,
already in the data model). Others get one when a public URL for them is planned.

- **Format:** 6 characters from a 31-character alphabet of lowercase letters and digits without
  look-alikes (`23456789abcdefghjkmnpqrstuvwxyz`, so no `0 o 1 i l`). About 887 million values.
  Rejected: 4 characters (about 1 million values, too few once there are many questions) and
  8 characters (about 850 billion, longer URLs for no practical gain).
- **Generation:** random, from `crypto.getRandomValues` with rejection sampling (no modulo bias),
  in the api's questions service. Never derived from the UUID or a counter, so ids cannot be
  enumerated or used to estimate the number of questions.
- **Uniqueness:** a `@unique` constraint on `shortId`. On a unique-constraint violation the
  service retries with a new id (at most 5 attempts, then a 500). At a million questions the
  chance of one collision per insert is about 0.1 %, so retries are rare.
- **URLs:** the server looks a question up **by short id only**. The slug is decoration: a
  missing, old or wrong slug answers with a 301 redirect to the canonical URL (the current slug
  in the URL's locale). Changing a question's title therefore never breaks shared links.
- **Privacy:** a short id is not a secret. Group and Dark Corner questions also have one, but
  access is always checked server-side (AGENTS.md §8); knowing the URL grants nothing.

## Consequences

- Task 1.3 models every surrogate key with `@default(dbgenerated("uuidv7()")) @db.Uuid` and
  `Question.shortId String @unique`. The short id length is enforced by the generator and a zod
  schema in `packages/shared` (added with the questions module), not by the column type, so a
  later change of length needs no migration.
- Hosting (phase 12) must provide PostgreSQL 18+.
