# Social Tennis Mixer

A pure client-side (no backend) web app for running Tennis Auckland Masters social tennis sessions. Import your players once, then for each session pick who's there and generate balanced, re-mixed doubles draws round by round.

See [CONTEXT.md](CONTEXT.md) for the domain glossary and [docs/adr/](docs/adr/) for the key design decisions. Open **"How it works"** in the app for the full draw rules.

## Features

- **Player Directory** — persistent list of people (Name, Grade, Gender, Phone) stored in your browser. Import by pasting from Excel or CSV; export/import a JSON backup to move between computers.
- **Sessions** — build a roster by searching the directory by name or phone; mark who's present per round.
- **Draw generation** — per round, choose **Balanced** (similar-grade courts) or **Mixed** (strong + weak pairs). Matches are kept even (within a configurable tolerance), avoid 2-men-vs-2-women, and rotate partners/opponents. Byes equalise play time and avoid back-to-back sit-outs. Spare courts run as Singles or Uneven (1v2) to keep byes to a minimum.
- **Round-by-round** — generate Round 1 up front, the rest on demand as people arrive/leave.
- **Manual override** — click any two players to swap them; live evenness (Δ) and warnings update instantly.
- **Print** — print-friendly court draw.
- **Offline PWA** — installable; works offline after the first load.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
```

## Build & deploy

```sh
npm run build    # outputs static files to dist/
npm run preview  # preview the production build
```

`dist/` is a static site (relative paths) — host it anywhere, e.g. GitHub Pages. It needs the internet only for the first load; afterwards the service worker serves it offline and your data lives in the browser (IndexedDB).
