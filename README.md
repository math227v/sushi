# 🍣 Sushi Counter

A cute little sushi counter. Tap the big sushi every time you eat one — set a goal,
watch the timer, and keep an eye on your **SPM** (sushi per minute).

All data is stored in your browser's `localStorage` — nothing ever leaves your device.

## Features

- 🍣 **Counter** — one big tappable sushi with cute pop animations
- 🎯 **Goals** — set a session goal and watch the fish swim across the progress bar
- ⏱️ **Timer** — starts automatically on your first sushi; pause / reset any time
- 📊 **Stats** — sushi per minute, all-time total, best session, session count
- 🏠 **Local-only data** — persists across reloads via `localStorage`

## Run with Docker

```bash
docker compose up -d
# → open http://localhost:8080
```

or without compose:

```bash
docker build -t sushi-counter .
docker run -d -p 8080:80 sushi-counter
```

## Run without Docker

It's a static site — any web server works:

```bash
cd app && python3 -m http.server 8080
```

## Development / tests

The app is plain HTML/CSS/JS in `app/` — no build step. Browser tests live in
`tests/` and run with Playwright:

```bash
cd tests && npm install && npm test
```
