# Instagram CLI

A terminal Instagram **DM client** — read and reply to direct messages without the
feed, Reels, or Stories. It's a personal-utility tool: a fast, keyboard-driven
inbox you can actually use daily, built on a reverse-engineered Instagram API as a
hands-on way to learn the protocol.

> ⚠️ Uses an **unofficial** Instagram API (`instagram-private-api` + `instagram_mqtt`).
> Not affiliated with or endorsed by Instagram. Use a throwaway/test account — automated
> access can get accounts checkpointed or suspended. For personal/educational use only.

```
 Instagram TUI                                          Connected... | @you
 INSTAGRAM TUI                  │ alexs_2552                         @alexs_2552 ⋮
 ● Connected as you             │ Active now
                                │ ─────────────────────────────────────────────
 CHATS                        2 │                              ╭──────────────╮
                                │                              │ yes it does  │
 │ alexs_2552      3:30 PM      │                              ╰──────────────╯
 │ Yuh it works                 │                                    3:30 PM ✓✓
   natb4466        2  2:17 PM    │ ● alexs_2552
   See you then                 │ ╭──────────────╮
                                │ │ Yuh it works │
                                │ ╰──────────────╯
 ──────────────────────────────│ ╭──────────────────────────────────╮ ╭──────╮
 STATUS                         │ │ Type a message... (Enter to send)│ │ Send │
 ✓ API: Connected               │ ╰──────────────────────────────────╯ ╰──────╯
 ↑↓ navigate   → open   / search   q quit                              BROWSE
```

## Features

- **Browse / read / reply** to DM threads in a split-panel TUI
- **Real-time messages** over Instagram's MQTT (iris) stream — new DMs appear live
- **Unread badges**, read receipts (`markRead`), message pagination (load older history)
- **Persistent session** — logs in once, restores from `session.json` after that
- **Full login flow** — password, checkpoint/challenge codes, and 2FA (TOTP/SMS)
- **Vim-style, keyboard-only** navigation; search threads by username
- No feed, no Reels, no Stories — just messages

## Architecture

A hybrid monorepo. A Go TUI spawns a TypeScript backend as a child process and
talks to it over **newline-delimited JSON-RPC on stdin/stdout** — no ports, no
daemon.

```
┌─────────────────────────┐        JSON-RPC over stdin/stdout       ┌──────────────────────────┐
│  packages/tui  (Go)     │  ── request: {id,method,params} ─────▶  │ packages/backend  (TS)   │
│  bubbletea + lipgloss   │  ◀──── response: {id,result|error} ──   │ instagram-private-api    │
│  split-panel UI         │  ◀──── event: {event,data} ──────────   │ + instagram_mqtt         │
└─────────────────────────┘                                         └──────────────────────────┘
        spawns `node dist/server.js`                                  talks to Instagram (HTTPS + MQTT)
```

- **`packages/backend/`** (Node + TypeScript) — `instagram.ts` wraps the Instagram
  API (login, threads, messages, send, realtime); `server.ts` is the JSON-RPC server
  reading stdin and emitting events; `types.ts` holds the shared shapes. Session state
  is persisted to `session.json` and restored on startup.
- **`packages/tui/`** (Go) — `backend.go` spawns/manages the Node process; `ipc.go` is
  the JSON-RPC client; `commands.go` bridges RPC to bubbletea; `update.go`/`views.go`/
  `models.go` are the Elm-style UI.

## Prerequisites

- **Node.js** ≥ 18 (developed on v24)
- **Go** ≥ 1.25
- A throwaway Instagram account (2FA via an authenticator app is recommended — it makes
  login far more reliable than email/SMS checkpoints)

## Setup & build

The TUI runs the **compiled** backend (`node dist/server.js`), so build the backend first.

```bash
# 1. Backend — install deps and compile TypeScript → dist/
cd packages/backend
npm install            # also applies patches via patch-package (postinstall)
npm run build          # tsc → dist/

# 2. TUI — build the Go binary
cd ../tui
go build               # or run directly with `go run .`
```

## Running

```bash
cd packages/tui
go run .               # spawns the backend automatically
```

On first run there's no session, so you'll get the login screen. After a successful
login the session is saved to `packages/backend/session.json` and reused on every
subsequent launch — no re-login until it expires.

### Configuration

Create `packages/backend/.env` for an optional credential fallback (the login screen
also accepts them interactively):

```ini
IG_USERNAME=your_test_account
IG_PASSWORD=your_password
```

| Variable      | Purpose                                                              |
| ------------- | ------------------------------------------------------------------- |
| `IG_USERNAME` | Username fallback for `login` when none is passed                   |
| `IG_PASSWORD` | Password fallback for `login` when none is passed                   |
| `IG_DEBUG=1`  | Verbose auth/realtime diagnostics to stderr (**may include tokens** — diagnostics only) |

`.env`, `session.json`, `dist/`, and `*.log` are gitignored.

## Keybindings

Navigation is spatial: **Browse → Read → Compose** (left to right). `h/j/k/l` work as
hidden vim aliases for the arrow keys.

| Context             | Keys                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| **Browse** (threads)| `↑`/`↓` navigate · `→` / `Enter` open · `/` search · `q` quit        |
| **Read** (messages) | `↑`/`↓` scroll · `u`/`d` half-page · `gg` top · `G` bottom · `Enter` reply · `←` / `Esc` back |
| **Compose**         | `Enter` send · `Esc` cancel (stays open after sending)               |
| **Search**          | type to filter by username · `Enter` select · `Esc` cancel          |
| **Login**           | `Enter` next/submit · `Tab` switch field · `Esc` quit               |

## JSON-RPC protocol

Communication is one JSON object per line.

**Request** → backend: `{ "id": 1, "method": "getThreads", "params": {} }`
**Response** → TUI: `{ "id": 1, "result": ... }` or `{ "id": 1, "error": { "code": -32001, "message": "..." } }`
**Event** → TUI (unsolicited, no `id`): `{ "event": "newMessage", "data": { ... } }`

| Method            | Params                          | Result                                  |
| ----------------- | ------------------------------- | --------------------------------------- |
| `login`           | `username`, `password`          | `User` (falls back to `.env`)           |
| `getThreads`      | `cursor?`                       | `{ threads, oldestCursor, hasOlder }`   |
| `getMessages`     | `thread_id`, `cursor?`          | `{ messages, oldestCursor, hasOlder }`  |
| `sendMessage`     | `thread_id`, `text`             | `Message`                               |
| `markRead`        | `thread_id`, `item_id`          | `{ success: true }`                     |
| `submitChallenge` | `code`                          | `User` (checkpoint verification)        |
| `submitTwoFactor` | `code`                          | `User` (TOTP/SMS)                       |

| Event             | When                                              |
| ----------------- | ------------------------------------------------- |
| `sessionRestored` | On startup — `{ success, user? }`                 |
| `newMessage`      | A DM arrived over MQTT — `{ threadId, message }`  |
| `realtimeError`   | The MQTT connection errored/closed                |

Error codes: `-32700` parse error · `-32600` invalid request · `-32601` method not found ·
`-32602` invalid params · `-32001` auth/session error · `-32000` general API error.

## Troubleshooting

- **`node not found on PATH`** — the TUI shells out to `node`; install Node and ensure
  it's on `PATH`.
- **Backend won't talk / blank threads** — make sure you ran `npm run build`; the TUI
  runs `dist/server.js`, not the TypeScript source.
- **Check `packages/tui/backend.log`** — the backend's stderr is mirrored here. A healthy
  run shows `[backend] started`, `[session] restored as @…`, `[realtime] connected`. Run
  with `IG_DEBUG=1` for deep auth/realtime traces.
- **"Session expired" → login screen** — the session went stale; just log in again (the
  username is pre-filled). The backend stays running.
- **Stuck on a checkpoint** — Instagram's modern Bloks challenges are flaky via the
  library. Enabling **authenticator-app 2FA** on the account routes login through the
  reliable TOTP path instead. Deleting a corrupt `session.json` and retrying also helps.
- **A test message you sent disappears** — Instagram may shadow-drop messages that look
  automated (even though the API returns success). Send normal, human-looking text.

## Development

```bash
cd packages/backend && npm run dev      # ts-node + nodemon hot reload
cd packages/tui && go test ./...        # offline Go tests (rendering + re-login)
npx prettier --write .                  # format (from repo root)
```

Code style: Prettier (2-space, single quotes, 100 cols, trailing commas); TypeScript
`strict`, ES2020. See `CLAUDE.md` for contributor guidance and `PROGRESS.md` for the
session-by-session build log.
