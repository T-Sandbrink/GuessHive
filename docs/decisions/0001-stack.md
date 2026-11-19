# 0001 — Stack: SvelteKit + NestJS + Prisma

- **Status:** accepted
- **Date:** 2026-11-19 (choices made by the owner during planning, 2026-10 and 2026-11-18)
- **Deciders:** owner

## Context

GuessHive is a mobile-first social voting and prediction platform with SEO-relevant public pages,
local content per country, strict privacy rules (GDPR, k-anonymity) and a small team: one owner,
with AI agents doing most of the implementation. The stack has to be productive for agents,
type-safe end to end, cheap to host in the EU, and boring enough to maintain for years.

## Decision

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | One repo for web, api and shared code; fast, cached task runs |
| Language | TypeScript (strict) everywhere | One language across web, api and shared schemas |
| Web | SvelteKit 3 + Svelte 5 runes, SSR, `adapter-node` | Small bundles and fast phones; SSR for SEO and share cards; form actions give progressive enhancement. SvelteKit 3 is the current major since 2026-10-01 |
| UI | Tailwind CSS v4 + shadcn-svelte, self-hosted fonts | Fast iteration on a custom, playful look without a heavy component framework |
| i18n | Paraglide JS, locale-prefixed routes | Type-safe, tree-shaken messages; NL + EN at launch |
| API | NestJS, REST + OpenAPI | Clear module boundaries per domain, guards for default-deny authorization, mature ecosystem (throttler, BullMQ, swagger) |
| Validation | zod schemas in `packages/shared` (built with tsup, ESM + types; see ADR 0002) | One schema for web forms, api DTOs and OpenAPI |
| Database | PostgreSQL + Prisma Migrate | Relational data with strong constraints (one vote per user per question); readable schema and safe migrations |
| IDs | UUIDv7 primary keys + short public ids for URLs | Time-sortable, native `uuid` type, no exposed counters (details in a later ADR, task 1.2) |
| Cache / jobs | Redis + BullMQ | Rate limits, leaderboards, scheduled resolution and notifications |
| Auth | Better Auth inside the api | Google, Apple, magic link and password in one library, sessions owned by our own database |
| Hosting | Docker-portable, EU region; provider decided before phase 12 | Keeps GDPR data residency and avoids early lock-in |

The browser only talks to the SvelteKit origin. SvelteKit proxies `/api/*` to NestJS, which owns all
business rules and database access. This keeps cookies first-party and avoids CORS.

## Alternatives considered

- **Next.js / React**: larger client bundles for a phone-first app; AGENTS.md rules out React. Rejected.
- **SvelteKit-only (no separate api)**: simpler at first, but business rules, jobs and the
  future native apps and partner embeds are cleaner behind a dedicated api. Rejected.
- **tRPC instead of REST**: tighter coupling to TypeScript clients; partners and embeds need a
  plain documented REST api. Rejected.
- **Drizzle / TypeORM instead of Prisma**: viable; Prisma chosen for its migration workflow and
  readable schema.

## Consequences

- Two deployable apps (web and api) plus Postgres and Redis to host.
- Shared zod schemas must stay framework-neutral and are built before web and api (Turborepo `^build`).
- Library APIs move fast (Svelte 5, Tailwind 4, NestJS, Prisma, Better Auth): agents look up current
  docs before coding against them (AGENTS.md §2).
- Changing any core choice needs the owner and a new ADR.
