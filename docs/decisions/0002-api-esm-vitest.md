# 0002 — API: ESM-only, Vitest and the shared ESLint config

- **Status:** accepted
- **Date:** 2026-11-19
- **Deciders:** owner

## Context

AGENTS.md planned Jest for the api ("NestJS default") and a CommonJS build. NestJS 12, the current
major, changed its defaults: every `@nestjs/*` package is ESM-only, and `nest new` scaffolds an
ESM project with Vitest for tests and oxlint for linting. Jest only loads ESM through its
experimental mode, or through Node's `require(esm)` in a CommonJS app.

## Decision

- `apps/api` is an ESM package (`"type": "module"`, `module: nodenext`, relative imports end in `.js`).
- Tests use **Vitest**, the same runner as `apps/web` and `packages/shared`. Unit tests are
  `src/**/*.spec.ts`; HTTP e2e tests are `test/**/*.e2e-spec.ts` (`pnpm --filter @guesshive/api test:e2e`).
- Linting uses the shared ESLint flat config from `@guesshive/config`, not oxlint, so the repo has
  one linter and one rule set.
- `packages/shared` only needs an ESM build (with types), since both consumers are ESM.

## Consequences

- One test runner and one mocking API (`vi.fn()`) across the monorepo; the `test-writer` agent and
  AGENTS.md are updated accordingly.
- Integration tests against `postgres-test` (task 1.10) use Vitest.
- We follow the framework's defaults, so future Nest upgrades need less custom config.
- Node 24.15+ is required by the Nest 12 tooling (`@nestjs/schematics` engines).
