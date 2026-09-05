# `@pantry/database`

Infrastructure-only package. Canonical SQL lives here. Repository adapters belong later.

## Layout

- `migrations/` — versioned SQLite SQL applied by Wrangler D1 now, and reusable later by a local SQLite / Docker runner (Phase 12). Do not keep a second copy under `apps/web`.
- `schema/` — reserved for future schema notes. Production schema changes ship as migrations, not as ad-hoc SQL.
- `seed/` — development / fixture data only. Never mix seed files into production migrations.

## Apply (D1)

Commands from the repo root. Wrangler config is `apps/web/wrangler.jsonc`.

- `pnpm db:migrate:local` — apply pending migrations to **local simulated** D1
- `pnpm db:migrate:remote` — apply pending migrations to **remote production** D1 (explicit only)
- `pnpm db:migrations:list:local`
- `pnpm db:migrations:list:remote`

`install`, `dev`, `test`, and `build` must not mutate remote D1. Remote apply is always a separate command (suitable later for: typecheck → test → build → `db:migrate:remote` → deploy).

## Portability

Write portable SQLite. Avoid D1-only syntax unless necessary. If a future migration needs D1-specific behavior, isolate it, comment it, and document the local SQLite equivalent in that file.

D1 enforces foreign keys by default. Do not set `PRAGMA foreign_keys = ON` or `OFF`. For complex migrations that temporarily violate FKs, use `PRAGMA defer_foreign_keys = ON`, then verify with `PRAGMA foreign_key_check;` (zero rows = valid).
