# The stack

The list, and only the list. `docs/PLAN.md` argues why each of these and not the
alternative — "The stack looper governs". Neither file repeats the other, and
`tests/plan-is-true.test.ts` refuses it if one starts to.

## looper's own — deliberately almost nothing

| | |
|---|---|
| runtime | Node >= 22.18, TypeScript run by type stripping, no build step |
| entry point when installed | `bin/looper.js`, plain JavaScript, strips the types at startup because Node will not do it under `node_modules` |
| dependencies | `@babel/parser@8.0.4` — the entire npm list |
| tests | `node:test`, no framework |
| reading Rust | an engine under `vendor/rust-law`, copied in under 0BSD, built once with the `cargo` a Rust project already has |
| its four crates | `syn`, `proc-macro2`, `serde`, `toml` — vendored with it, and nothing else |

A project with no `Cargo.toml` never touches the Rust half: it is not installed,
not built and not mentioned.

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
| desktop | Tauri 2, with the interface in TypeScript |

## The Rust backend it also governs

Governed at the same depth as the TypeScript one — 29 rules, judged on every
edit and every commit — so this is a prescription rather than a courtesy.

| job | tool |
|---|---|
| HTTP API | Axum |
| async runtime | Tokio |
| middleware | Tower and tower-http |
| database | PostgreSQL |
| database access | SQLx, queries checked against the real schema at compile time |
| serialisation | Serde |
| HTTP client | reqwest over rustls, no OpenSSL |
| logging | `tracing`, structured |
| errors | `thiserror` |
| secrets in memory | `secrecy` |
| identifiers and time | `uuid`, `time` |

Compiler settings are part of the stack, not a preference:
`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.

## The Python backend it also governs

An adopter ships Python behind a TypeScript front end, which is the condition
`docs/PLAN.md` sets for reading a language at all. Seven rules are named there
and one — `PY-ERROR:1`, the swallowed error — is built and enforced on every
edit and every commit. The other six are named and open.

| job | tool |
|---|---|
| HTTP API | FastAPI, emitting OpenAPI from the models that validate |
| validation | Pydantic, one model per concept |
| server | Uvicorn |
| database | PostgreSQL |
| database access | SQLAlchemy 2.0, typed models |
| migrations | Alembic |
| logging | structlog, structured JSON |
| errors | an exception class per failure |
| tracing | OpenTelemetry |
| tests | pytest |
| packaging | `uv`, with `pyproject.toml` |
| formatting | Ruff — style only, the law is not a linter |
| type checking | mypy, strict |

Reading it costs no dependency: Python ships its own parser as the `ast` module,
driven over the same protocol as the Rust engine. The only requirement is that
`python3` exists, and a repository with no `.py` files never looks for it.

## Seven entries are load-bearing for the law, not the product

- **Pino** gives the "a failure must be observed" rule a named symbol whose
  provenance can be verified — `logger.warn`, `logger.error`. That is what stops
  a local do-nothing function called `warn` from satisfying it.
- **`tracing`** does the same job on the Rust side, and is the default that
  `RUST-ERROR:4` accepts as an observed recovery. Swap in your own logger's
  symbols under `[truth] trace_symbols`; never remove the requirement.
- **Drizzle** puts the database schema in TypeScript, so the parser looper
  already has can read it. Prisma's schema is a separate DSL it cannot see.
- **`thiserror`** is what makes `RUST-TYPE:1` actionable. That rule bans an error
  type that says nothing — `String`, `Box<dyn Error>`, `anyhow` — and the legal
  spelling it hands back is an enum with a variant per failure.
- **structlog** is the Python side of the same requirement Pino carries, for the
  same reason: a named symbol whose origin can be verified.
- **Pydantic** is the legal spelling `PY-ERROR:2` will hand back. A rule that
  refuses an unvalidated request is only fair where validating one is obvious.
- **mypy strict** is not a preference but the whole of it. Python's annotations
  mean nothing unless something checks them, so the setting is the check.

The prescription is for new services. An existing service in a language looper
cannot read is governed by everything except the law: the rule sets, the secrets
gate and the staleness check all still apply. **TypeScript and Rust are both read
in full** — that used to be one language, and the sentence saying otherwise
outlived the fact.
