# `@pantry/database`

Infrastructure-only package. Canonical SQL and D1 repository adapters live here.

## Layout

- `migrations/` — versioned SQLite SQL applied by Wrangler D1 now, and reusable later by a local SQLite / Docker runner (Phase 12). Do not keep a second copy under `apps/web`.
- `adapters/d1/` — Cloudflare D1 implementations of `@pantry/core` ports.
- `schema/` — reserved for future schema notes. Production schema changes ship as migrations, not as ad-hoc SQL.
- `seed/` — development / fixture data only. Never mix seed files into production migrations.

## Apply (D1)

Commands from the repo root. Wrangler config is `apps/web/wrangler.jsonc`.

- `pnpm db:migrate:local` — apply pending migrations to **local simulated** D1
- `pnpm db:migrate:remote` — apply pending migrations to **remote production** D1 (explicit only)
- `pnpm db:migrations:list:local`
- `pnpm db:migrations:list:remote`

`install`, `dev`, `test`, and `build` must not mutate remote D1. Remote apply is always a separate command (suitable later for: typecheck → test → build → `db:migrate:remote` → deploy).

## Application tables

`0003_profiles.sql` creates `profiles`, keyed by Better Auth `"user"."id"` (`ON DELETE CASCADE`).

`0004_households.sql` creates `households`, `household_members`, and `locations`, then adds `profiles.active_household_id` → `households(id)` `ON DELETE SET NULL` via `ALTER TABLE ADD COLUMN`. Invitations are deferred.

`0005_inventory_mvp.sql` creates `products`, `inventory_lots`, `inventory_history`, `inventory_settings`, and `inventory_conflict_abort` (a persistence-only CHECK guard used to abort stale consumption batches).

`0006_open_facts.sql` adds nullable Open Facts metadata on `products` (`image_url`, `external_catalog`, `external_product_type`, `package_quantity`, `package_unit`, `external_fetched_at`) and `product_nutrition` (source per-100g / serving nutrients; missing values stay NULL). Existing inventory rows are not rebuilt. `products.source = 'open_food_facts'` remains the historical Open Facts import path; `external_catalog` distinguishes Open Food Facts from Open Products Facts.

`0008_ai_cook.sql` creates `recipes`, `recipe_ingredients`, `recipe_nutrition`, `recipe_cooks`, and `ai_rate_limits`.

`0009_product_polish.sql` rebuilds `inventory_history` so `action` may be `move`, copies existing rows, and adds `inventory_lots_household_expires_idx`. `inventory_settings.minimum_quantity` is unchanged.

`0010_household_sharing.sql` creates `invites` with `token_hash` (SHA-256 of the raw link token). Raw tokens are never stored. Invitation role is `member` only.

D1 adapters live in `adapters/d1/` and implement `@pantry/core` ports. They must not be imported from `packages/core`.

## Portability

Write portable SQLite. Avoid D1-only syntax unless necessary. If a future migration needs D1-specific behavior, isolate it, comment it, and document the local SQLite equivalent in that file.

D1 enforces foreign keys by default. Do not set `PRAGMA foreign_keys = ON` or `OFF`. For complex migrations that temporarily violate FKs, use `PRAGMA defer_foreign_keys = ON`, then verify with `PRAGMA foreign_key_check;` (zero rows = valid).
