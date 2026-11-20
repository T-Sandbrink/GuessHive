# 0003 — API validation: NestJS 12 Standard Schema instead of nestjs-zod

- **Status:** accepted
- **Date:** 2026-11-19
- **Deciders:** owner

## Context

AGENTS.md planned `nestjs-zod` for request validation and OpenAPI DTOs in the api. Its latest
release (5.6.0) officially supports NestJS 10/11 and `@nestjs/swagger` up to 11; we run NestJS 12.
NestJS 12 ships validation for any Standard Schema library (zod 4 included) without classes or
decorator metadata: `@Body({ schema })`, `@Param('id', { schema })` and `StandardSchemaValidationPipe`.

## Decision

- The api validates bodies, params and queries with the zod schemas from `packages/shared` through
  NestJS 12's built-in Standard Schema validation. `nestjs-zod` is not used.
- A validation failure returns `400` with `{ code: "VALIDATION_FAILED", message, issues }`, where
  `issues` is `[{ location, path, code }]`: the part of the request (`body`, `query` or `params`),
  the field path and the kind of error, never the submitted value (owner decision, 2026-11-19;
  `location` added 2026-11-20). For a single named argument such as `@Param('id', { schema })`,
  the path starts with that name (`{ location: 'params', path: ['id'] }`), so body paths map
  one-to-one to form fields and a bad route param is never mistaken for a bad body. Nest validates
  a handler's arguments in parallel and stops at the first failure, so `issues` covers only the
  first argument that failed, not the whole request.

## Consequences

- One dependency fewer, and no version mismatch with NestJS 12.
- Task 1.6 must show that `@nestjs/swagger` can describe these schemas (for example from zod's
  JSON Schema output). If it cannot, the agent asks the owner before adding a library.
- The web app reuses the same schemas for client-side form validation.
