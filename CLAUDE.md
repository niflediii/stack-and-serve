# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev         # start dev server (localhost:3000)
npm run dev:reset    # kill anything on :3000, wipe .next/.next-old/.next-runtime caches, then dev
npm run build        # production build — run this before considering any change done
npm run start         # run the production build
npm run lint          # next lint
```

There is no test suite in this repo — validate changes with `npm run build` and by exercising the flow in the browser.

On Windows/OneDrive, the Next.js dev cache can get stuck (stale chunks, hydration errors). Use `npm run dev:reset` when that happens instead of manually deleting `.next`.

## Architecture

Next.js 15 App Router + React 19 + TypeScript, styled with Tailwind. Supabase provides auth (Google OAuth) and Postgres persistence. Path alias `@/*` maps to the repo root.

### Route groups and roles

Routes live under `app/`. The `(app)` group (`app/(app)/...`) shares `app/(app)/layout.tsx`, an `AppShellLayout` client component that reads the current session and renders nav items scoped to one of three roles: `player`, `host`, `admin` (`AppRole` in [lib/mock-platform.ts](lib/mock-platform.ts)). Role comes from `user_metadata.role` on the Supabase session, except admin — see below.

Page-level access control uses `AppRoleGuard` ([components/auth/app-role-guard.tsx](components/auth/app-role-guard.tsx)), wrapped around a page's content with an `allowedRoles` list. It redirects unauthenticated users to `/` and shows an access-restricted screen for wrong roles.

- `/manage`, `/manage/[eventId]` — host dashboard and live queue management
- `/history` — host's past queue sessions
- `/join` — player join flow (writes a `PlayerJoinRecord` to localStorage, see [lib/player-join.ts](lib/player-join.ts))
- `/live` — player-facing live queue board
- `/admin-login`, `/admin` — separate admin auth path (not Supabase)

### Admin auth is a separate system from Supabase Auth

Admin login does not use Supabase. It's a signed-cookie session implemented in [lib/admin-auth.ts](lib/admin-auth.ts) (HMAC-signed token, `ADMIN_SESSION_COOKIE_NAME`, validated via `timingSafeEqual`) and issued/checked by the route handlers in `app/api/admin/session/route.ts`. Credentials come from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars, falling back to hardcoded defaults in `lib/admin-auth.ts` if unset — always set real env vars in production. `AppRoleGuard` and `AppShellLayout` both check for an active admin cookie session (via `/api/admin/session`) before falling back to Supabase session lookup.

`app/api/admin/queues/route.ts` is the one place that uses the Supabase **service role** client ([lib/supabase/service.ts](lib/supabase/service.ts)) to read every host's queues plus `auth.admin.listUsers()` across all owners — gated by a valid admin cookie. Never use the service-role client outside admin-only, server-side routes.

### The queue/stacking engine lives in one file

[lib/host-events.ts](lib/host-events.ts) is the core domain model and almost all business logic for a queue session (a `HostEventRecord`): court assignment, rotation, pause/resume/complete lifecycle, win/lose tracking, and localStorage read/write. Nearly every mutation goes through `normalizeHostEventRecord` to backfill defaults on records that may have been created by an older shape, then through `syncQueueLifecycle`, which auto-transitions `draft → running → completed` based on elapsed time (accounting for `totalPausedMs`) and calls `assignCourtsIfNeeded` to fill open courts.

Court assignment (`assignCourtsIfNeeded` → `selectPlayersForCourt`) picks players by priority (fewest games played, then a seeded pseudo-random shuffle via `stableHash`, never `Math.random`, so assignment is deterministic for a given event/game-count) and, for `rotation: "winLose"` events, groups the pool into unplayed/winners/losers pools before picking. It also avoids repeating a court's last ~8 matchups via `createMatchupSignature`.

When changing rotation/assignment behavior, this file is the single source of truth — UI components consume its exported `derive*`/`apply*` functions rather than reimplementing queue logic.

### Supabase is the source of truth; localStorage is a fallback cache

[lib/supabase/host-queues.ts](lib/supabase/host-queues.ts) wraps every Supabase `host_queues` table operation (list/load/save/delete) with a fallback to the localStorage-backed functions in `lib/host-events.ts` — but only when the failure looks like a network error (`shouldFallbackToLocal`). A missing-table/schema error (`PGRST205`, "relation ... does not exist") instead throws a descriptive error pointing at the migration file, rather than silently falling back. Successful Supabase reads are mirrored into localStorage as a cache. Any new persistence operation on host queues should follow this same pattern: try Supabase, distinguish "network unreachable" from "backend misconfigured," and only fall back to local storage for the former.

The `host_queues` table (`supabase/migrations/20260629_create_host_queues.sql`) stores the full event as a `payload jsonb` column plus a few duplicated columns (`owner_id`, `club_name`, `event_date`, `queue_status`, `visibility`) used for querying/filtering; RLS restricts reads to public rows or rows owned by `auth.uid()`, and all writes to the owner. If you add a new top-level field to `HostEventRecord` that needs to be queryable/filterable, add a migration for a matching column — don't rely on JSON containment queries.

### Supabase clients

Two separate client constructors, never interchangeable:
- [lib/supabase/client.ts](lib/supabase/client.ts) — browser client using the publishable/anon key, session-persisting. Used from client components and `lib/supabase/host-queues.ts`.
- [lib/supabase/service.ts](lib/supabase/service.ts) — server-only (`import "server-only"`) client using the service role key, no session persistence. Only used in admin API routes.
