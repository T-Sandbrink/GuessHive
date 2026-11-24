# GuessHive

A social platform where people share opinions and make predictions, without money.
Vote in one tap, see what your country thinks, compare with friends, and score points for
accurate forecasts. Local content per country (NL and BE first), playful honey-and-bee design,
and strict privacy (GDPR, no breakdowns below 10 voters).

| Path | What |
|---|---|
| `apps/web` | SvelteKit 3 + Svelte 5 frontend (SSR, Tailwind v4) |
| `apps/api` | NestJS 12 api (ESM): all business rules, auth and database access |
| `packages/shared` | zod schemas, types and constants used by web and api |
| `packages/config` | shared TypeScript, ESLint and Prettier config |
| `docs/decisions` | architecture decision records (ADRs) |

How we work: [AGENTS.md](AGENTS.md) (conventions and rules) and [PLAN.md](PLAN.md) (roadmap, in Dutch).

## Run it locally in 5 steps

**Prerequisites:** Node.js 26 LTS, pnpm 10 and Docker Desktop.

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Create your env files** (all gitignored; the defaults work for local development)

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

3. **Start the local services** (Postgres, a test Postgres, Redis, Mailpit and SeaweedFS for S3)

   ```bash
   docker compose up -d
   ```

4. **Run web and api in watch mode**

   ```bash
   pnpm dev
   ```

5. **Open the app**: web on <http://localhost:5173>, api on <http://localhost:3000> (it answers 404 until the health endpoint arrives in phase 1).

### Local services

| Service | Address | Notes |
|---|---|---|
| Postgres | `localhost:5440` | user/password/db `guesshive` |
| Postgres (tests) | `localhost:5441` | data lives in memory, empty after every restart |
| Redis | `localhost:6379` | |
| Mailpit | <http://localhost:8025> | catches all outgoing email (SMTP on `1025`) |
| SeaweedFS (S3) | `http://localhost:8333` | access key `guesshive`, secret `guesshive-dev-only` |

All ports bind to `127.0.0.1` only. Change them in a root `.env` file (see `.env.example`).

## Checks

```bash
pnpm lint              # Prettier + ESLint in every package
pnpm typecheck         # tsc / svelte-check
pnpm test              # Vitest (web component tests need: pnpm --filter web exec playwright install chromium)
pnpm test:e2e          # Playwright (web) and HTTP tests (api)
pnpm test:integration  # api tests against the postgres-test container and Redis (docker compose up -d first)
pnpm build             # production build
```

The integration tests empty every table of the test database. They use `postgresql://guesshive:guesshive@localhost:5441/guesshive_test` and Redis db 15; override with `TEST_DATABASE_URL` / `TEST_REDIS_URL` in your shell (not `.env`). The database URL must point to localhost and its name must end in `_test`, otherwise the suite refuses to run.

## Troubleshooting

- **Turborepo telemetry.** Turborepo sends anonymous usage data by default. CI turns it off;
  locally, run `pnpm turbo telemetry disable` once.

- **`Unable to find package manager binary: cannot find binary path` (Windows).** Turborepo
  could not find `pnpm` on your `PATH`. Check that `where pnpm` finds it, and look for a broken
  entry in your system `PATH` (for example a stray `"`): Turborepo stops searching at the first
  invalid entry.
- **A port is already in use.** Another local project may use the same port. Set a different
  port in the root `.env` (services) or in `apps/api/.env` (`PORT`).
