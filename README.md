# 🍣 Sushi Counter

A cute little sushi counter with user accounts. Tap the big sushi every time you eat
one (mis-tapped? there's a **−1** button too) — set a goal, watch the timer, and keep
an eye on your **SPM** (sushi per minute).

Progress is stored per-user in **SQLite** on the server, with sessions handled by
[Better Auth](https://better-auth.com) (email + password). Your data never leaves
your own server.

## Features

- 🍣 **Counter** — one big tappable sushi with pop animations, plus a −1 button for miscounts
- 🎯 **Goals** — set a session goal and watch the fish swim across the progress bar
- ⏱️ **Timer** — starts automatically on your first sushi; pause / reset any time
- 📊 **Stats** — sushi per minute, all-time total, best session, session count
- 🔐 **Accounts** — email + password auth via Better Auth; progress synced to the server
- 👑 **Admin** — the **first account created becomes the admin** and gets a dashboard
  with global stats (users, total sushi, total sessions, best session ever) and a user
  table with per-user data and delete
- 💾 **SQLite backend** — one file at `DB_PATH` (Docker volume `/data`), survives restarts

## Run with Docker

```bash
docker compose up -d
# → open http://localhost:8080 and create the first (admin) account
```

or without compose:

```bash
docker build -t sushi-counter .
docker run -d -p 8080:8080 -v sushi-data:/data sushi-counter
```

### Configuration (environment variables)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `DB_PATH` | `/data/sushi.db` (Docker) | SQLite database file |
| `BETTER_AUTH_SECRET` | auto-generated, stored next to the DB | session signing secret |
| `BETTER_AUTH_URL` | `http://localhost:8080` | public origin of the app |
| `TRUSTED_ORIGINS` | `http://localhost:8080` | comma-separated allowed origins |

If you serve the app on anything other than `http://localhost:8080`, set
`BETTER_AUTH_URL` and `TRUSTED_ORIGINS` to that origin.

## Run without Docker

```bash
cd server && npm install && node server.js
# → http://localhost:8080 (SQLite file: server/sushi.db)
```

## Project layout

```
app/     static frontend (index.html, admin.html — no build step)
server/  Express + Better Auth + better-sqlite3 API server
tests/   Playwright end-to-end tests
```

## API

- `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`,
  `POST /api/auth/sign-out` … Better Auth endpoints under `/api/auth/*`
- `GET /api/me` — current user (id, name, email, role)
- `GET /api/state` / `PUT /api/state` — the signed-in user's counter state
- `GET /api/admin/stats`, `GET /api/admin/users`,
  `DELETE /api/admin/users/:id` — admin only

## Tests

End-to-end tests (auth, counting, minus, timer, goals, persistence, admin
permissions, user deletion) run with Playwright against a fresh instance:

```bash
docker compose up -d --build   # fresh DB volume recommended
cd tests && npm install && npm test
```
