# 0006 — Better Auth in NestJS through our own thin integration

- **Status:** accepted. Better Auth is the stack choice (ADR 0001, AGENTS.md §2); the owner
  answered the open profile, photo and session questions on 2026-11-27. Implemented in task 2.1.
- **Date:** 2026-11-27
- **Deciders:** owner (product questions), agent (integration details)

## Context

AGENTS.md §2 picks Better Auth for authentication in the NestJS api. Research for task 2.1
(2026-11-24) found that Better Auth 1.7 works with NestJS 12 (ESM), Prisma 7 and our generated
client. The community package `@thallesp/nestjs-better-auth` mounts Better Auth as plain Express
middleware, outside Nest's guards, so our rate limits (and later Turnstile and the auth guard)
would not apply to the sign-in routes (review note 1.9).

## Decision

- **Own integration, no extra Nest package.** `better-auth` (1.7) is the only new dependency.
  - `AuthController` (`/api/auth/*`) hands every request to Better Auth's `toNodeHandler`. It is
    a normal Nest controller, so global guards and `@RateLimit()` apply.
  - Nest's normal JSON and urlencoded parsers (100 kb limit) also run on `/api/auth/*`; Better
    Auth reuses the parsed body (also Apple's form posts). A body the parsers skip (another
    content type) is refused with 415, because Better Auth would otherwise stream it without a
    size limit.
  - `SessionMiddleware` resolves the session cookie for every other route and sets `req.user`
    (`id`, `role`, `status`, `emailVerified`) and `req.authSession` **before any guard runs**, so
    rate limits count signed-in users by id and the auth guard (2.8) can decide. It never
    refreshes the session (the new cookie would be lost); the web app keeps sessions alive
    through `/api/auth/get-session` (phase 3). A session revoked mid-request counts as a guest.
  - `createAuth()` only accepts sign-in methods and plugins (`AuthExtensions`); the base options
    are applied last, so a later task cannot silently drop cookies, hooks or privacy settings.
- **Paths and origin.** Better Auth's `basePath` is `/api/auth` and `baseURL` is the public web
  origin (`BETTER_AUTH_URL`). The SvelteKit proxy (phase 3) must forward `/api/auth/*` to the api
  **with the path unchanged**. Only that origin is trusted: the origin and CSRF checks are
  switched on explicitly (Better Auth skips them under `NODE_ENV=test` or `TEST`), and
  `BETTER_AUTH_TRUSTED_ORIGINS` is refused at startup.
- **Database.** Prisma adapter on our own `PrismaService`. `Session`, `Account` and
  `Verification` follow Better Auth's field names; ids come from Postgres `uuidv7()`
  (`advanced.database.generateId: false`, ADR 0004). `User.name`/`image` map to
  `displayUsername`/`avatarUrl`. Sessions and verification values live **only in Postgres**
  (owner, 2026-11-27): no `secondaryStorage`, no cookie cache, so revocation is immediate and a
  Redis outage never breaks sign-in.
- **Privacy.**
  - IP tracking is disabled and a CHECK keeps `Session.ipAddress` NULL (AGENTS.md §9).
  - A new account gets a temporary profile (`databaseHooks.user.create.before`): username
    `bij_` + 10 random characters, country NL (IP country once the proxy forwards it, 3.4), the
    UI language from `Accept-Language`, timezone `Europe/Amsterdam`. A provider's name and photo
    are never stored (owner, 2026-11-27); onboarding (2.11) is mandatory.
  - `databaseHooks.user.update.before` drops `name`, `image` and `username`, account linking does
    not copy provider info, and `/update-user` is disabled: profile changes go through our own
    validated `/me` (2.12). Session listing, account linking and provider-token endpoints are
    disabled until their tasks; changing email and deleting the account stay off (Better Auth
    defaults) until their own tasks.
  - Magic-link and reset values are stored hashed (`verification.storeIdentifier`).
- **Cookies.** Prefix `guesshive` (`guesshive.session_token`), `HttpOnly`, `SameSite=Lax`,
  `Secure` (with the `__Secure-` prefix) in production.
- **Rate limits.** Better Auth's own limiter is off; our Redis `RateLimitGuard` runs on the auth
  controller (stricter per-route limits in 2.10).
- **Telemetry** of Better Auth is off.

## Consequences

- One small adapter layer to maintain when Better Auth changes its handler or session API.
- Better Auth answers `/api/auth/*` with its own error codes (e.g. `USER_ALREADY_EXISTS`), not
  our `ApiErrorBody`; the web app (phase 3) maps those codes to Paraglide messages.
- The Prisma adapter supports Prisma 5–7: do not upgrade Prisma to 8 before Better Auth supports
  it.
- Sign-in methods (email + password, magic link, Google, Apple) are switched on by tasks 2.2–2.5.

## Alternatives considered

- **`@thallesp/nestjs-better-auth`**: less code, but its routes bypass Nest guards (no rate limits
  or Turnstile on sign-in) and it adds a dependency.
- **Passport + own session handling**: more code for email verification, magic links, account
  linking and OAuth, which Better Auth already provides.
