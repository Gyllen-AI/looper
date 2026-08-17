# The stack

The list, and only the list. `docs/PLAN.md` argues why each of these and not the
alternative — "The stack looper governs". Neither file repeats the other, and
`tests/plan-is-true.test.ts` refuses it if one starts to.

## looper's own — deliberately almost nothing

| | |
|---|---|
| runtime | Node >= 22.18, TypeScript run by type stripping, no build step |
| dependencies | `@babel/parser@8.0.4` — the entire list |
| tests | `node:test`, no framework |

## The stack looper prescribes (depth 2) — backend

| job | tool |
|---|---|
| HTTP API | Hono |
| API contract | Zod schemas emitted as OpenAPI |
| database | PostgreSQL |
| database access | Drizzle |
| validation | Zod, one schema per concept |
| logging | Pino, structured JSON |
| tracing and errors | OpenTelemetry, a vendor behind it |
| tests | Vitest, Playwright end to end |
| workspace | pnpm workspaces, Turborepo |
| formatting | Biome — style only, the law is not a linter |

Front end, for completeness:

| job | tool |
|---|---|
| web | Next.js (App Router) + React |
| mobile | React Native + Expo |

Compiler settings are part of the stack, not a preference:
`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.

## Two entries are load-bearing for the law, not the product

- **Pino** gives the "a failure must be observed" rule a named symbol whose
  provenance can be verified — `logger.warn`, `logger.error`. That is what
  stops a local do-nothing function called `warn` from satisfying it.
- **Drizzle** puts the database schema in TypeScript, so the parser looper
  already has can read it. Prisma's schema is a separate DSL it cannot see.

The prescription is for new services. Existing services in other languages get
depth 1. That asymmetry is deliberate.
