# Driftmap

> The city is the game, the photos are the save file.

Driftmap turns exploring a real city into a playable game, then turns the
finished run into a cinematic travel film. Choose a personality, follow cryptic
missions to real public places, photograph what you find, and watch the city
reveal itself mission by mission. When the run ends, **Play My Journey**
replays your photos, clues, route, and timestamps as a map-based travel film.

Built for LAYOVER 2026. **Zero-cost by design:** no backend, no accounts, no
paid APIs, no API keys, no AI in the core gameplay loop. Photos never leave
the device.

## Development

```bash
npm install
npm run dev          # local dev server
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run build        # production build
npm run audit:deps   # zero-cost dependency audit (CI gate)
```

Requires Node 20+. No environment variables are needed to build or run — a
stray `.env` would be a zero-cost violation.

## Stack

Next.js (App Router) · TypeScript (strict) · Tailwind CSS · MapLibre GL JS ·
IndexedDB · Vitest

Map tiles (OpenFreeMap) are a progressive enhancement; the game stays playable
offline with a bundled dataset and a schematic fallback map.
