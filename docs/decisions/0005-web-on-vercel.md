# 0005 — Web app on Vercel (`adapter-vercel`, region `fra1`) with Vercel Web Analytics

- **Status:** accepted (owner, 2026-11-20). Implemented in task 1.13 on 2026-11-24.
- **Date:** 2026-11-24
- **Deciders:** owner
- **Supersedes:** the `adapter-node` choice for the web app in ADR 0001.

## Context

The SvelteKit web app needs hosting with preview URLs per branch and a fast path to production.
The api, PostgreSQL and Redis must stay in the EU (AGENTS.md §9) and are not part of this
decision: they run at an EU host (open question "Productie-hosting"). Analytics must be
cookieless, so no cookie wall is needed (AGENTS.md §9), and the owner chose Vercel Web
Analytics over Umami/Plausible (2026-11-20).

## Decision

- **Adapter:** `@sveltejs/adapter-vercel` (configured in `apps/web/vite.config.ts`, since Kit 3
  has no `svelte.config.js`) with `runtime: 'nodejs26.x'` (same major as the repo's Node) and
  `regions: ['fra1']` (Frankfurt), so server-side rendering runs close to the EU api.
- **Plan:** Vercel **Hobby** for now. Hobby is for non-commercial use only, so the project moves
  to **Pro before launch with premium** (phase 12/13), and in any case before anything
  commercial (sponsored questions, partner embeds, premium) goes live.
- **Deployments:** a preview deployment per branch. `main` is **not** promoted to production
  before launch (phase 12). How that is enforced (production branch tracking pointing at a
  branch that does not exist yet, and/or `git.deploymentEnabled` in `apps/web/vercel.json`) is
  an open question for the owner, settled when the project is linked.
- **Monorepo build on Vercel:** Root Directory `apps/web`, build command `turbo run build`
  (builds `@guesshive/shared` first), "include files outside the root directory" on. Turbo
  caches `.vercel/output/**`.
- **Analytics:** `@vercel/analytics` core API (`inject` + `pageview`; the package's SvelteKit
  helper still imports `$app/stores`, which Kit 3 removed). Production builds only. Page views
  carry the route id and the path **without** query string or fragment. Private sections
  (Dark Corner, groups, settings, notifications, admin, auth, own account) are never sent: they
  are filtered before the call and again in `beforeSend` (`apps/web/src/lib/analytics.ts`). No
  custom events yet; any later `track()` call must never carry question text, ids of private
  content or personal data.
- **Linking** the repository to the owner's Vercel account happens interactively with the
  owner, never in an autonomous run.

## Consequences

- Vercel (a US company) processes request data for the web app and for analytics. Before
  production: a data processing agreement with Vercel and a check of the EU-US Data Privacy
  Framework transfer, recorded in `docs/privacy/processing-register.md`.
- The web server is serverless: no long-lived connections or in-memory state in the web app.
  That already matches the architecture (all state lives behind the api).
- `vite preview` and the Playwright e2e tests keep working locally; `.vercel/` output is
  gitignored.
- Hobby → Pro is a cost the owner takes on before launch.
