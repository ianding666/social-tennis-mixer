# Client-side only, statically hosted, browser-persisted

The Social Tennis Mixer is a React + TypeScript + Vite app compiled to static files (hosted on GitHub Pages or any static host) with **no backend**. The Player Directory and Sessions persist locally in IndexedDB, with JSON file export/import for backup and moving between computers, and a service worker (PWA) makes the app installable and fully usable offline after the first load.

We chose this because the tool serves a single organiser at a low-traffic club event and needs no shared server — avoiding hosting cost and operational burden — accepting that data lives per-browser unless exported.

## Consequences

- The **first** load requires internet (to fetch from GitHub Pages); every load afterwards works offline thanks to the service worker cache.
- Data is not synced between devices automatically; the JSON export/import is the deliberate, manual portability mechanism.
