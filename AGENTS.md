# AGENTS.md — GuessHive

Instructions for AI coding agents (Claude Code, Codex, Cursor, …) working in this repository.
Read this file fully before starting any task. `PLAN.md` holds the work to be done.

## 1. What we are building

**GuessHive** is a social platform where people give their opinion and make predictions, without money.

- **Opinions**: "Who is the best footballer?", "What is your favourite dinner?"
- **Predictions**: "Will Ajax win the Eredivisie?", "Will it snow at Christmas?", scored on accuracy with points instead of money.
- **Local per country**: every country has its own questions and its own results ("What does the Netherlands think?"), and global questions can be compared country by country, for example on a world map.
- **Fun and social**: follow people, compare with friends ("you agree 72% with Sam"), comments, streaks, badges, leaderboards, and share cards.

Product principles. Use them to decide when something is unclear:

1. **Vote first, then see results.** Results and comments stay hidden until the user has voted, forecast, or explicitly skipped. Skipping reveals results but locks out voting on that question. Guests can browse everything, and their first tap opens the sign-up sheet, after which the vote is submitted for them.
2. **Fast and fun beats complete.** Voting must take one tap. Every extra step costs users. The tone is playful and warm (honey yellow, rounded shapes, a bee mascot). See "UX-beslissingen" in PLAN.md, which is binding for UI work.
3. **Local feels local.** Country questions are in the local language and about local topics.
4. **Trustworthy numbers.** One person gets one vote, there are no fake accounts, and small groups are never exposed (see privacy rules).
5. **No real money, ever.** No paid points, no crypto, no money flowing through GuessHive. Friends may "bet" with group points, and may optionally write a stake note between themselves, but GuessHive never handles or settles money.

## 2. Tech stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Runtime | Node.js LTS (24.x), TypeScript `strict` everywhere |
| Frontend | SvelteKit 2 + **Svelte 5 (runes)**, SSR on, `adapter-node` (or `adapter-vercel`, decided at launch) |
| UI | Tailwind CSS v4 + shadcn-svelte (Bits UI), lucide-svelte icons, self-hosted fonts (Fredoka + Nunito via @fontsource, never a font CDN) |
| i18n | Paraglide JS (via `sv add paraglide`), locale-prefixed routes `/nl/...`, `/en/...` |
| Backend | NestJS (latest major), REST, OpenAPI via `@nestjs/swagger` |
| Validation | zod schemas in `packages/shared`, used by both web and api (`nestjs-zod` in api) |
| Database | PostgreSQL 16+ with Prisma ORM and Prisma Migrate |
| Cache/jobs | Redis + BullMQ (rate limits, leaderboards, scheduled jobs, notifications) |
| Auth | Better Auth in the api: Google, Apple, email magic link, email + password |
| Email | Resend (prod), Mailpit (local) |
| Files | S3-compatible storage (Cloudflare R2), MinIO locally |
| Bot protection | Cloudflare Turnstile on sign-up and sensitive actions |
| Tests | Vitest (web, shared), Jest (api, NestJS default), Playwright (e2e) |
| Quality | ESLint + Prettier, husky + lint-staged, GitHub Actions CI |
| Observability | Sentry (errors), Umami or Plausible (cookieless analytics) |

Do **not** introduce React, Next.js, or another UI framework. Do not swap a core choice above without asking the owner first and recording the decision in `docs/decisions/`.

Library APIs change quickly (Svelte 5, Tailwind 4, Prisma, NestJS, Better Auth). **Look up current docs (context7 MCP or official docs) before using an API you are not certain about.** Do not write Svelte 4 syntax (`export let`, `$:`, `on:click`, stores for local state). Use runes (`$state`, `$derived`, `$effect`, `$props`) and `onclick`.

## 3. Repository layout

```
GuessHive/
├─ apps/
│  ├─ web/                 SvelteKit app (pages, UI, server load functions, /api proxy)
│  └─ api/                 NestJS app (business logic, auth, database, jobs)
├─ packages/
│  ├─ shared/              zod schemas, shared types, enums, constants (countries, locales)
│  └─ config/              shared eslint / tsconfig / prettier config
├─ docs/
│  └─ decisions/           ADRs: NNNN-short-title.md
├─ .claude/
│  └─ agents/              specialised subagents (see §6)
├─ docker-compose.yml      postgres, redis, mailpit, minio for local dev
├─ AGENTS.md               this file
├─ CLAUDE.md               points to this file
└─ PLAN.md                 the roadmap and task checklist
```

### Request flow

The browser only talks to the SvelteKit origin (e.g. `guesshive.com`):

- Pages are rendered server-side. `+page.server.ts` load functions and form actions call the NestJS api over HTTP, forwarding the session cookie.
- Client-side calls go to `/api/*` on the SvelteKit origin, and `hooks.server.ts` proxies them to NestJS. This avoids CORS and keeps auth cookies first-party.
- NestJS owns **all** business rules, authorization and database access. SvelteKit never talks to Postgres directly.

### NestJS module layout

Use one module per domain: `auth`, `users`, `questions`, `votes`, `forecasts`, `results`, `scoring`, `social` (follows, comments, reactions), `notifications`, `gamification`, `moderation`, `admin`, `health`.

- Controllers stay thin: parse and validate input, call a service, map the output.
- Services hold the logic. Prisma is accessed only through services (or repositories inside a module).
- Use guards for auth and roles (`@Roles('ADMIN')`). Never check roles ad hoc inside controllers.

## 4. Commands

These become available after PLAN.md phase 0. Keep this section up to date when scripts change.

```bash
pnpm install              # install everything
docker compose up -d      # start postgres, redis, mailpit, minio
pnpm dev                  # run web + api in watch mode (turbo)
pnpm lint                 # eslint all packages
pnpm typecheck            # tsc / svelte-check all packages
pnpm test                 # unit + integration tests
pnpm test:e2e             # playwright
pnpm build                # production build
pnpm --filter api db:migrate   # create/apply a prisma migration (dev)
pnpm --filter api db:seed      # seed local data
```

## 5. How to work

1. **Follow `PLAN.md` in order.** Pick the first unchecked task unless the owner says otherwise. Read the whole phase before starting it.
2. **One task at a time.** Finish it, verify it, tick the box `[x]` in PLAN.md, then move on.
3. **Definition of done** for every task:
   - Code compiles: `pnpm typecheck` and `pnpm lint` pass.
   - Tests are written or updated, and `pnpm test` passes.
   - The review gate from §6 has passed, with no open 🔴 findings.
   - UI changes are checked in a browser (desktop and mobile width, light and dark).
   - User-facing strings exist in both `nl` and `en`.
   - PLAN.md is updated (box ticked, notes added if something changed).
4. **Git**: follow the branch model in "Git workflow" below. You may commit, merge and push on your own, within the rules below.
5. **Ask, don't guess.** The owner makes every real decision. See "Decisions: always consult the owner" below.
6. **Record decisions.** Any significant technical choice (new dependency of consequence, architectural change) gets a short ADR in `docs/decisions/`.
7. **Do not add dependencies casually.** Prefer the platform and existing deps. When adding one, say why in the commit message.
8. **Leave the repo runnable.** Never leave `main` broken, and never commit commented-out code or stray debug logs.

### Decisions: always consult the owner

The owner wants to be consulted on every real choice. This applies to the main agent **and** to every subagent. Never pick an option silently because it seems reasonable.

**Needs the owner** (ask first):

- Anything user-visible that PLAN.md does not already specify: flows, copy tone, layout, which data is shown, defaults, limits, notification behaviour.
- The data model differing from the "Datamodel" section in PLAN.md (new tables, removed fields, changed relations).
- A new runtime dependency, a new external service, or anything that costs money or needs an account.
- Deviating from PLAN.md or AGENTS.md: skipping, merging or reordering tasks, or changing the stack.
- Security or privacy trade-offs, such as relaxing a rule, a weaker but simpler option, or accepting a 🟡 finding instead of fixing it.
- Reviewer findings where several fixes are reasonable and they differ in behaviour.

**Does not need the owner** (decide yourself, within the conventions):

- Internal naming, file structure inside a module, refactors without behaviour change.
- Choosing between equivalent implementations with identical behaviour.
- Fixing a clear bug or a 🔴 finding with one obvious fix.
- Test structure and test data.

**Subagents never ask the owner directly.** When a subagent hits a decision, it stops on that point and includes a block in its output:

```
DECISION NEEDED: <question>
Options: A) … B) … C) …
Recommendation: <option> because <reason>
Blocks: <what cannot continue until answered>
```

The main agent collects these and asks the owner.

**How to ask:**

1. Write the question in PLAN.md under "Open questions": the context in 1–2 sentences, 2–4 options with trade-offs, your recommendation, and the task it blocks.
2. Ask with `AskUserQuestion`: up to 4 questions per call, recommended option first and marked "(Recommended)", in Dutch, and with a `preview` mockup for UI choices. Remote Control is on, so the owner can answer from the Claude mobile app.
3. Send one `PushNotification` (Dutch, under 200 characters, for example "GuessHive: 2 vragen over de feed-layout wachten op je antwoord"), so the question reaches the owner's phone.
4. **Keep working while you wait, if you can.**
   - If other unblocked tasks exist, park the question (steps 1 and 3 only) and continue with them. Ask the parked questions in one batch when you reach a natural stop: end of a task, or before pausing.
   - If nothing unblocked remains, ask right away. Set `.agent-state.json` to `waiting_for_owner` and wait for the answer. Waiting does not use up quota.
5. After the answer: record it under "Vastgelegde beslissingen" or "UX-beslissingen" in PLAN.md (or in an ADR for technical choices), remove it from "Open questions", and continue.

### Git workflow

```
main ─────────────●─────────────────────────●──────────   stable, finished phases only (tag phase-N-done)
                   \                       /
phase/1-database    ●───────●───────●─────●                one branch per phase, from main
                     \     / \     /
task/1.3-schema       ●─●─●   \   /                        one branch per PLAN.md task, from the phase branch
task/1.4-seed                  ●─●
```

| Branch | Created from | Merged into | When |
|---|---|---|---|
| `main` | — | — | Always runnable. Only receives finished phases. |
| `phase/<N>-<slug>` (e.g. `phase/0-foundation`) | `main` | `main`, with `--no-ff` | After the phase gate (§6) passes and all acceptance criteria are met. Tag it `phase-<N>-done`. |
| `task/<N.M>-<slug>` (e.g. `task/1.3-schema`) | its phase branch | phase branch, with `--no-ff` | After the task's review gate passes. Delete the task branch after merging. |

Rules:

- **Every PLAN.md task gets its own `task/` branch.** Exception: trivial changes (a one-line config tweak, a docs-only update, ticking boxes in PLAN.md) may go straight onto the phase branch.
- Commit often on task branches: each commit is one logical step and should compile.
- Commit messages follow Conventional Commits (`feat(votes): cast single-choice vote`, `fix(web): ...`, `test(api): ...`, `chore: ...`, `docs: ...`) and end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before every merge, `pnpm lint`, `pnpm typecheck` and `pnpm test` must pass on the source branch.
- Never force-push, never rewrite history that has been pushed, and never commit secrets or `.env` files.
- **Pushing** to GitHub (`origin`) is approved by the owner. Push task and phase branches after each merge into them, and push `main` plus the `phase-N-done` tag right after a phase merge. Never push `main` at any other time.

### Usage limits: pause cleanly, resume automatically

The owner is on a Claude **Pro** subscription, which has a 5-hour usage window and a weekly limit. Subagents count toward the same limits, and all of them run on Opus, so the review gate is expensive. Never let a limit cut you off in the middle of an edit.

**Check usage** with the `get_usage` tool (`mcp__ccd_session_mgmt__get_usage`, Claude desktop app) at these moments:

- before starting a new task,
- before launching the review gate,
- every ~30 minutes of continuous work.

If the tool is not available (e.g. plain CLI), work in small steps and keep the handoff note current after every task, so a hard stop never loses work.

**Thresholds**, based on the higher of the 5-hour and weekly percentages:

| Usage | Action |
|---|---|
| < 75% | Work normally. |
| 75–89% | Do not start a new task. Finish the current one if it is small, or bring it to a stable point (compiles, tests green or the failing test noted). Then pause. |
| ≥ 90% | Stop at the next stable point, even mid-task. Do not launch subagents. Pause. |

**Pausing** means:

1. Make sure the working tree is in a stable state: it compiles, with no half-written files.
2. Update the **"Laatste stand" (handoff)** section at the top of PLAN.md: current task id, what is done, what is left (including whether the review gate still has to run), uncommitted files, and any open questions.
3. Mark the current task `[~]` in PLAN.md.
4. Schedule the resume. Using the desktop app's scheduled-tasks tool (`create_scheduled_task` with `fireAt`), create a **one-time** task 5 minutes after the relevant `resetsAt`: the 5-hour reset normally, or the weekly reset if the weekly limit is the one that is full. Use the task id `guesshive-resume`, replacing any existing one. Its prompt must be self-contained:

   > Continue the GuessHive project in `<absolute repo path>`. Read AGENTS.md and the "Laatste stand" section of PLAN.md, then resume work from there following AGENTS.md. Check usage first.

5. Tell the owner, in Dutch, where you stopped and when work resumes.

**Resuming**: read "Laatste stand" first, verify the working tree matches it (`git status`, current branch), finish the `[~]` task (including its review gate), clear the handoff note, then continue with PLAN.md as usual.

The owner has authorised this pause-and-resume scheduling as standing policy for this project. Scheduled tasks only run while the Claude desktop app is open. If the computer is off, the task runs at the next launch.

### Autonomous runs and the session lock

The owner leaves the PC on so work continues on its own across 5-hour windows. Two scheduled tasks drive this:

- `guesshive-resume`: one-time, set by the agent when pausing (see above). This is the main driver.
- `guesshive-watchdog`: recurring every 3 hours. It is a safety net in case the chain breaks (crash, error, missed schedule).

To make sure **only one session works on the repo at a time**, every session uses the state file `.agent-state.json` in the repo root (gitignored):

```json
{
  "status": "working | waiting_for_owner | paused | blocked | done",
  "since": "2026-10-11T21:00:00+02:00",
  "resumeAt": "2026-10-12T01:35:00+02:00 or null",
  "task": "1.3",
  "note": "short human-readable reason"
}
```

**At the start of every autonomous run** (resume or watchdog), check the state file before doing anything else:

| State file says | Action |
|---|---|
| `working` and `since` less than 6 hours ago | Another session is active. **Exit immediately** without touching anything. |
| `paused` and `resumeAt` still in the future | **Exit immediately.** The resume task will handle it. |
| `waiting_for_owner`, `blocked` or `done` | **Exit immediately**, regardless of age. Another session is waiting for an answer, or only the owner can unblock. |
| Missing, `paused` with `resumeAt` in the past, or a stale `working` (6 hours or older) | Check usage. If it is below 75%, write `working` with `since` = now and the task id, then resume. Otherwise schedule `guesshive-resume` at the reset and exit. |

**While working**: keep `task` up to date. **On pause**: write `paused` with `resumeAt`. **On finishing everything that can be done unattended**: write `done`.

**Interactive sessions** (the owner chatting with you) also read the file. If an autonomous session is `working`, do not edit the repo. Tell the owner and let them decide. When the owner asks you to do PLAN.md work interactively, you become the working session: write `working` yourself.

**What autonomous runs may and may not do:**

- **May**: everything in PLAN.md phases 0–11, branches, local commits and merges, `pnpm install`, `docker compose up` / `down`, running tests, and the subagents.
- **Must not**:
  - force-push, or push `main` outside a phase merge;
  - create external accounts or enter credentials;
  - register domains or buy anything;
  - deploy to production;
  - delete anything outside the repo;
  - change global system settings.
- **Tasks that need the owner** (OAuth app credentials, hosting choice, legal texts, domains): build everything possible with env-var placeholders and mocks, add the required owner action to "Open questions" in PLAN.md, and continue with the next task. Only if **no** unblocked task remains: write `blocked`, notify the owner, and do not schedule a resume.
- **Phase 12 (launch)** is never done unattended.

## 6. Subagents and the review gate

Specialised subagents live in `.claude/agents/`. Claude Code loads them automatically. Other tools can read the same files as checklists. The main agent **implements**, and subagents **research, test and review**. This keeps the main context small and gives every change a second pair of eyes that did not write the code.

### Roster

| Agent | Role | Writes code? |
|---|---|---|
| `docs-researcher` | Looks up current library docs (Svelte 5, NestJS, Prisma, Better Auth, Tailwind 4, …) and returns a short, version-correct summary with examples | No |
| `test-writer` | Writes unit, integration and e2e tests for a finished feature, runs them, reports failures | Tests only |
| `code-reviewer` | Correctness, edge cases, and compliance with this file (conventions, layering, i18n, pagination) | No |
| `security-reviewer` | Defensive review against §8 and §9: authZ, input validation, injection, XSS/CSRF, secrets, rate limits, privacy rules, dependency audit | No |
| `db-reviewer` | Prisma schema and migration review: constraints, indexes, migration safety, query performance | No |
| `ux-reviewer` | **Mandatory for every UX/GUI change.** Reviews with the `frontend-design` skill, plus accessibility, mobile-first layout, i18n completeness, light and dark mode, and SEO tags on new pages | No |

All subagents run on **Opus**. The owner chose quality over cost, so do not downgrade them. Because they are expensive, follow the usage rules in §5.

Reviewers are **read-only**. They report findings and the main agent fixes them. Findings use this format, ranked most severe first:

```
🔴 blocker | 🟡 should fix | 🔵 nit — path:line — problem — suggested fix
```

### When to delegate

- **Before** using an API you are not sure about, ask `docs-researcher`. Never code from memory against fast-moving libraries.
- **Broad searches** across the codebase ("where is X used", "map this module") go to a subagent (`Explore`), so file dumps stay out of the main context.
- **Independent work runs in parallel.** Launch reviewers together in one message, not one after another.
- **Do not delegate** small, obvious edits, or work that needs the conversation's full context to get right. The briefing costs more than doing it.
- Brief every subagent with: the task id from PLAN.md, the changed files (or `git diff main...HEAD`), what to focus on, and what output you expect. Subagents start without your context.

### The review gate (per task)

1. Implement the task (main agent).
2. `test-writer` adds or extends tests until `pnpm test` is green.
3. Run the reviewers **in parallel**, choosing them by what changed:

   | Change touches | Reviewers |
   |---|---|
   | Any code | `code-reviewer` |
   | Endpoints, auth, sessions, user input, uploads, comments, env/config, new dependencies | `security-reviewer` |
   | `schema.prisma` or migrations | `db-reviewer` |
   | **Anything a user can see**: Svelte components, styles, routes, messages, icons, copy, design mockups or canvases | `ux-reviewer` (**always**, see the UI rule below) |

4. Fix every 🔴 and 🟡, or note in PLAN.md why a 🟡 is deferred. Re-run a reviewer only on the fixed areas.
5. Tick the task.

### UI rule (owner requirement)

**Every change to UX or GUI is checked by the `ux-reviewer` subagent using the `frontend-design` skill**: Svelte code, CSS, copy, icons, and also design mockups and canvases (such as task 3.0). This applies to small tweaks and to fixes made after an earlier review: after fixing UI findings, run `ux-reviewer` again on the changed parts. A UI change is not done until `ux-reviewer` returns `Verdict: PASS`.

- The `frontend-design` skill comes from the `frontend-design` plugin (claude-plugins-official). If it is not available, `ux-reviewer` falls back to the checklist in its own file and says so. In that case, tell the owner.
- `ux-reviewer` cannot see a rendered page. If a change is hard to judge from code alone, also check it in the browser (desktop and mobile width, light and dark) as the definition of done requires.

### Phase gate

At the end of every phase, before ticking its acceptance criteria:

- Run `security-reviewer` over the full phase diff (`git diff <phase-start>...HEAD`) plus `pnpm audit`.
- Run `code-reviewer` over the full phase diff, looking for cross-task inconsistencies.
- Record the outcome in PLAN.md under the phase ("Phase review: 0 blockers, 2 deferred — see notes").

Security reviews in this project are **defensive** and limited to GuessHive's own code, its own local or staging environments, and its dependencies.

## 7. Code conventions

### General
- Code, identifiers, comments, commit messages and docs: **English**. Talk to the owner in **Dutch**.
- TypeScript `strict`. No `any` (use `unknown` and narrow). No non-null `!` unless truly proven.
- Validate every external input (HTTP body and params, query, env vars, webhook payloads) with zod at the boundary.
- Env vars are parsed once at startup with a zod schema. Fail fast on missing config. Keep `.env.example` up to date and never commit `.env`.
- Dates are stored as UTC `timestamptz`. Display them in the user's locale and timezone.
- Countries use ISO 3166-1 alpha-2 (`NL`, `BE`, `DE`). Regions use ISO 3166-2 (`NL-UT`). Locales use BCP 47 (`nl`, `en`).
- IDs are `cuid2` or UUIDv7 strings (decided in phase 1 and then used everywhere). Never expose auto-increment ids.
- Public URLs use slugs plus a short id: `/nl/q/beste-voetballer-ooit-k3x9`.

### Svelte / SvelteKit
- Svelte 5 runes only. Components are `PascalCase.svelte`.
- Data loading happens in `+page.server.ts` / `+layout.server.ts`. Use form actions with progressive enhancement (`use:enhance`) for mutations where possible.
- Put shared UI in `apps/web/src/lib/components/`, with shadcn-svelte primitives under `lib/components/ui/`.
- Every page sets `<title>`, a meta description, canonical, hreflang alternates and OG tags.
- Accessibility: semantic HTML, labelled controls, keyboard usable, contrast AA, respects `prefers-reduced-motion`.
- Mobile-first. Most users vote on a phone.

### NestJS / Prisma
- DTOs come from zod schemas in `packages/shared` (`createZodDto`). Do not define types twice.
- Errors use Nest HTTP exceptions with a stable machine-readable `code` (e.g. `VOTE_ALREADY_CAST`) that the web app maps to translated messages.
- Prisma migrations are generated with `prisma migrate dev`. **Never edit a migration that has been merged to `main`.** Add a new one instead.
- Every query that lists data is paginated (cursor-based for feeds).
- Use transactions for multi-step writes, such as casting a vote and updating aggregates.
- Add indexes for every foreign key and for every column used in feed filters or sorting.

## 8. Security rules (non-negotiable)

- The server enforces **one vote/forecast per user per question**, with a DB unique constraint plus a service check. The client is never trusted for counts, country, scores or roles.
- Every endpoint has explicit authorization. Default deny: guards on by default, with `@Public()` to opt out.
- Rate-limit voting, commenting, sign-up, login, magic-link requests and question submission (Redis-backed).
- Hash passwords with argon2 or scrypt (Better Auth default). Never log passwords, tokens, magic links or full emails.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`. Protect state-changing requests against CSRF (same-origin proxy plus origin check).
- Sanitize user-generated content. Render comments as plain text (or a safe markdown subset), and never use `{@html}` with user input.
- Set security headers: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`.
- Keep secrets only in env vars or the secret store. If you find a secret in code, stop and tell the owner.

## 9. Privacy rules (GDPR, EU-first)

- **Individual votes are private by default.** Others only see aggregates and agreement percentages, unless the user explicitly makes a vote public.
- **k-anonymity threshold**: never show a demographic or geographic breakdown for a group smaller than **10 voters**. Show "not enough votes yet" instead. Enforce this in the api, not only in the UI.
- **Private groups are the one exception**: inside a private group, members see each other's votes and forecasts, because they explicitly consented when joining (`GroupMember.consentAt`). Nothing from a group may leak to public feeds, search, SEO or share cards.
- Demographic fields (birth date, gender, region) are **optional** and used only for aggregate breakdowns. Birth date is also used for the 18+ check. Never expose it, only the age bucket.
- Minimum age is 16. The **Dark Corner is 18+**: invisible to guests, minors and anyone who has not opted in, never indexed, never in share cards or push.
- Uploaded images are only shown after moderation (automated scan plus a CSAM hash check plus human review for flagged items). Strip EXIF metadata.
- Users can export all their data and delete their account (hard delete of personal data, anonymised votes kept for aggregates).
- No third-party tracking cookies, so no cookie wall is needed. Use cookieless analytics only.
- Store user data in the EU (EU hosting region for DB and api).

## 10. i18n rules

- No hard-coded user-facing strings in components or api error messages. Use Paraglide message keys.
- Every new key is added to **both** `nl` and `en` in the same change.
- **UI language** (interface) and **content language** (question text) are separate concepts. Questions have translations (`QuestionTranslation`) and a `defaultLocale`. Fall back to `defaultLocale` when a translation is missing.
- Format numbers, percentages and dates with `Intl` and the active locale.

## 11. Testing rules

- **Unit tests** cover pure logic: scoring (Brier and points), aggregation, k-anonymity filtering, slug generation, permission helpers.
- **Integration tests (api)** run against a real Postgres (docker compose test DB) and cover voting, forecasting, resolution and auth flows.
- **E2E (Playwright)** covers critical journeys: sign up → onboarding → vote → see results; forecast → admin resolves → points awarded.
- Any bug fix starts with a failing test that reproduces it.

## 12. Out of scope (unless PLAN.md says otherwise)

- Real money, payments, crypto, betting odds.
- Native iOS/Android apps (we ship a PWA first).
- Languages other than `nl` and `en` at launch. Keep everything ready for more.
