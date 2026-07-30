# Stack & Serve

A pickleball court management and player queue system, built with Next.js App Router + Tailwind CSS + lucide-react.

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000

## Routes

- `/` — Split-screen Player + Super Admin login
- `/live` — Live court status board (6 courts, time-remaining bars, next-up queue, weather widget)
- `/join` — Multi-step "join the queue" flow (skill level, player type, group size)
- `/manage` — Staff dashboard: assign queued players to open courts, clear finished courts
- `/profile` — Player profile with bento-box stats and color-coded DUPR match history

## Notes

- All "live" data (courts, queue, stats) is mocked in-component with React state — wire up your own API/DB to make it persistent.
- Background images are pulled from Unsplash via `next/image` remote patterns configured in `next.config.ts`. Swap in your own facility photos if you'd like.
- Theme tokens (colors, fonts) live in `tailwind.config.ts` and `app/layout.tsx` — change `volt`, `ink`, `panel`, `mist` to retheme everything at once.
