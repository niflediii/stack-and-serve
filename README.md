# Stack & Serve

Stack & Serve is a full-stack pickleball queue and stacking app built with Next.js, Supabase, and Tailwind CSS. Hosts can create and run live queues, assign players to courts, rotate matchups, track game history, and manage queue flow in real time.

## What the app does

- Google sign-in for host and player access through Supabase Auth
- Host dashboard for creating and managing queue sessions
- Dedicated queue detail screen with:
  - live court assignments
  - next matchup preview
  - queue timer
  - winner selection
  - player swap flow
  - leaderboard popup
- Queue history view for past sessions
- Admin login and platform overview
- Supabase-backed persistence for host queues and completed games

## Tech stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase Auth + database
- Lucide React icons

## Main routes

- `/` - Google sign-in entry page
- `/manage` - host dashboard
- `/manage/[eventId]` - live queue management page
- `/history` - host queue history
- `/join` - player join flow
- `/live` - player-facing live queue board
- `/admin-login` - admin sign-in
- `/admin` - admin console

## Local setup

1. Install dependencies

```bash
npm install
```

2. Copy env values into `.env.local`

Use `.env.example` as your starting point.

3. Run the app

```bash
npm run dev
```

4. Open:

```text
http://localhost:3000
```

If the Next.js dev cache gets stuck in this Windows/OneDrive workspace, use:

```bash
npm run dev:reset
```

## Environment variables

The app expects these values:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_USERNAME=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
NEXT_PUBLIC_ENABLE_EMAIL_RECOVERY=
```

Notes:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the browser-safe Supabase key used by the frontend
- `SUPABASE_SERVICE_ROLE_KEY` is required for the admin API routes and must never be exposed publicly
- `ADMIN_SESSION_SECRET` should be a long random string in production
- `NEXT_PUBLIC_ENABLE_EMAIL_RECOVERY=false` keeps email recovery off until SMTP is fully configured

## Supabase setup

### 1. Create the database table

Run the SQL migration inside:

```text
supabase/migrations/20260629_create_host_queues.sql
```

This creates the `public.host_queues` table, indexes, trigger, and RLS policies used by the app.

### 2. Configure Google Auth

In Supabase:

- enable the `Google` provider
- add your Google client ID and client secret
- keep the Supabase callback URL shown in the provider settings registered in Google Cloud

The app uses `window.location.origin` as the OAuth redirect base, so your allowed URLs in Supabase must include every environment you plan to use.

Recommended redirect URLs:

- `http://localhost:3000`
- your Vercel production URL
- your Vercel preview URL pattern if you want preview logins to work

### 3. URL configuration

In Supabase Auth URL settings:

- Site URL: your production Vercel domain
- Redirect URLs:
  - `http://localhost:3000`
  - your Vercel production URL
  - any preview URLs you want to support

## Vercel deployment prep

This repo is already set up to build on Vercel with:

- a passing `npm run build`
- a Node version pinned through `package.json` and `.nvmrc`
- public and server env values documented in `.env.example`

### Deploy checklist

1. Import the GitHub repo into Vercel
2. Add the production environment variables from `.env.example`
3. Set the production domain in Supabase Auth URL settings
4. Confirm the Google OAuth provider in Supabase allows the production domain
5. Redeploy after env vars are saved

### Production envs to add in Vercel

Copy these into the Vercel project settings:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this
ADMIN_SESSION_SECRET=use-a-long-random-secret
NEXT_PUBLIC_ENABLE_EMAIL_RECOVERY=false
```

## Admin login

The admin area is separate from Google sign-in.

- Route: `/admin-login`
- Credentials come from:
  - `ADMIN_USERNAME`
  - `ADMIN_PASSWORD`

If those env vars are missing, the app falls back to defaults defined in `lib/admin-auth.ts`. For production, set your own secure values in Vercel.

## Validation

Before deployment, run:

```bash
npm run build
```

This confirms the App Router pages, API routes, and TypeScript build are ready for production.

## Repo notes

- `.env.local`, `node_modules`, `.next`, and local logs are ignored from git
- the repo currently keeps the `/profile` page in code even though it is no longer used in the host nav
- the project works best outside OneDrive cache conflicts, but it can still be developed here with `npm run dev:reset` when needed

