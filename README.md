# Instagram CLI + Mobile — a self-hosted DM client

Read and reply to Instagram **direct messages** from a terminal *and* your phone —
no feed, Reels, or Stories. An always-on **daemon** holds your Instagram session and
realtime (MQTT) connection; thin clients connect to it over WebSocket. When a DM
arrives and no client is connected, the daemon fires a **push notification** to your
phone — so you can reply and move on without opening Instagram. Built on a
reverse-engineered Instagram API as a hands-on way to learn the protocol.

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

- **Daemon architecture** — one long-lived process owns the Instagram session and the
  MQTT realtime stream; clients come and go without tearing it down
- **Two clients, one protocol** — a Go TUI and a React Native (Expo) app both speak the
  same JSON-RPC over WebSocket
- **Push notifications** — when a DM arrives with no client connected, the daemon sends
  an FCM push to your phone; tap it to deep-link straight into the thread
- **Browse / read / reply** to DM threads; **real-time** new messages over MQTT (iris)
- **Unread badges**, read receipts (`markRead`), message pagination (load older history)
- **Persistent session** — logs in once, restores from `session.json`; full login flow
  (password, checkpoint/challenge codes, 2FA via TOTP/SMS)
- **Secure by construction** — every WebSocket connection is authenticated with a
  per-instance pairing token; deploy behind Tailscale with no public port exposed

## Architecture

A hybrid monorepo. The **backend is a standalone daemon** that serves **WebSocket**
only (the legacy stdin/stdout transport was removed). Clients authenticate at the WS
handshake with a pairing token and then exchange JSON-RPC messages — one JSON object
per WebSocket frame.

```
                 ┌─────────────────────────────────────────────┐
                 │  DAEMON  (packages/backend, always-on)        │
   Instagram ◄───┤  InstagramClient + MQTT (realtime)            │
   (MQTT/REST)   │  session • device push tokens • pairing token │
                 │  WebSocket server (token-authed)              │
                 │  sendPush() via firebase-admin (FCM v1)       │
                 └───────┬───────────────────────────┬───────────┘
                         │ ws:// (pairing token)      │ FCM (app closed)
              ┌──────────▼─────────┐        ┌─────────▼──────────┐
              │  Go TUI            │        │  Expo app (Android) │
              │  packages/tui      │        │  packages/mobile    │
              │  dials the daemon  │        │  WS + expo-notifs   │
              └────────────────────┘        └─────────────────────┘
```

- **`packages/backend/`** (Node + TypeScript) — the daemon. `instagram.ts` wraps the
  Instagram API (login, threads, messages, send, realtime); `server.ts` is the
  WebSocket JSON-RPC server (pairing-token auth, event fan-out, zero-client push
  trigger); `push.ts` sends FCM pushes via `firebase-admin`; `types.ts` holds the shared
  shapes. Session state persists to `session.json`.
- **`packages/tui/`** (Go) — a terminal client. `connector.go`/`config.go` dial the
  daemon (address + token); `ipc.go` is the WebSocket JSON-RPC client; `update.go`/
  `views.go`/`models.go` are the Elm-style bubbletea UI.
- **`packages/mobile/`** (React Native / Expo SDK 56) — the phone client. `src/rpc.ts`
  is the same WS JSON-RPC client; `src/notifications.ts` registers an FCM device token
  and handles tapped pushes; screens render the inbox and conversations.

## Prerequisites

- **Node.js** ≥ 18 (developed on v20/v24)
- **Go** ≥ 1.25 (for the TUI)
- A throwaway Instagram account (authenticator-app 2FA recommended — far more reliable
  than email/SMS checkpoints)
- For push: a **Firebase project** with a service-account key (daemon side) and a
  `google-services.json` (app side) — see [Push notifications](#push-notifications)
- For remote access: a **Tailscale** account — see [Deployment](#deployment)

## Build

```bash
# Daemon (TypeScript → dist/)
cd packages/backend
npm install            # also applies patches via patch-package (postinstall)
npm run build          # tsc → dist/

# Go TUI
cd ../tui
go build               # or `go run .`

# Mobile app (see the Mobile section for the EAS dev-build flow)
cd ../mobile
npm install
```

## Running the daemon

```bash
cd packages/backend
node ./dist/server.js
```

A healthy boot logs (to stderr):

```
[backend] started
[push] FCM enabled (project <your-project>)      # or: [push] disabled (no IG_FCM_KEY_PATH)
[ws] listening on :8765 (auth on, 1 token(s))
[session] restored as @your_account              # first run shows the login flow instead
[realtime] connected
```

The daemon holds the session across client churn — quitting and reopening a client does
**not** re-login. On first run there's no session, so a connected client gets the login
screen; after a successful login the session is saved to `session.json` and reused.

### Configuration

Daemon config lives in `packages/backend/.env`:

```ini
IG_USERNAME=your_test_account
IG_PASSWORD=your_password
IG_PAIRING_TOKEN=<32+ random hex bytes>          # required, or all WS connections are rejected
IG_FCM_KEY_PATH=./fcm-service-account.json       # optional; enables push
```

| Variable                          | Purpose                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `IG_USERNAME` / `IG_PASSWORD`     | Login fallback when not passed via the `login` RPC                                        |
| `IG_PAIRING_TOKEN`                | Pairing token validated at the WS handshake (**required** — no token ⇒ all WS rejected)  |
| `IG_PAIRING_TOKENS`               | Comma-separated list of per-device tokens (individually revocable); union with the above |
| `IG_DAEMON_PORT` / `IG_WS_PORT`   | WebSocket port (default `8765`)                                                           |
| `IG_FCM_KEY_PATH`                 | Path to the Firebase service-account JSON; enables push (omit to disable)                 |
| `IG_FCM_DRY_RUN=1`                | Validate FCM sends without delivering (testing)                                           |
| `IG_DEBUG=1`                      | Verbose auth/realtime diagnostics to stderr (**may include tokens**)                      |

The Go TUI client reads its target from `packages/tui/daemon.config.json` (a gitignored
`{ "address": "...", "token": "..." }`) overlaid by env `IG_DAEMON_ADDR` /
`IG_PAIRING_TOKEN`; default address `localhost:8765`. The token is required (an
unauthenticated dial is rejected).

`.env`, `session.json`, `fcm-service-account.json`, `dist/`, and `*.log` are gitignored.

## Deployment

The daemon is meant to run on always-on hardware reachable over a private
[Tailscale](https://tailscale.com) tailnet — **plain `ws://` is fine because WireGuard
encrypts the transport**, and the pairing token authenticates each client. No public
port is exposed.

Reference setup (Oracle Cloud always-free VM, Ubuntu, but any host works):

```bash
# On the VM — install Node, Tailscale, clone, build
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs git
curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up   # browser login
tailscale ip -4                                                          # the daemon's tailnet IP
git clone <this-repo> && cd Instagram-protocol-analysis/packages/backend
npm install && npm run build

# Copy the gitignored secrets from your machine (scp): .env, fcm-service-account.json, session.json
# (copying session.json avoids a fresh datacenter-IP login, which is more checkpoint-prone)
```

Run it 24/7 with a systemd unit (`/etc/systemd/system/ig-daemon.service`):

```ini
[Unit]
Description=Instagram DM daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/Instagram-protocol-analysis/packages/backend
ExecStart=/usr/bin/env node /home/ubuntu/Instagram-protocol-analysis/packages/backend/dist/server.js
Restart=always
RestartSec=10
StandardOutput=append:/home/ubuntu/ig-daemon.log
StandardError=append:/home/ubuntu/ig-daemon.log

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now ig-daemon
```

**Firewall:** keep the cloud security list closed to `8765` (allow only SSH). Tailscale's
`ts-input` chain accepts traffic on the `tailscale0` interface, so clients reach the
daemon over the tailnet while the public catch-all `REJECT` keeps `8765` off the
internet. Point clients at the daemon's **tailnet IP** (`100.x.y.z:8765`).

> ⚠️ **Datacenter-IP note:** running the IG session from a cloud IP is flagged more
> aggressively than a residential one — expect occasional checkpoints (recoverable via
> the in-app challenge/2FA flow). A residential always-on device (Raspberry Pi / mini-PC)
> avoids this. Run only **one** daemon per account — two daemons mean duplicate MQTT
> connections.

## Mobile app

`packages/mobile/` is an Expo (SDK 56) app. Expo Go can't run SDK 56 (and doesn't
support FCM push), so it runs as an **EAS development build**:

```bash
cd packages/mobile
npm install --global eas-cli && eas login
eas init                                  # links the project
eas build --profile development --platform android
# install the resulting APK, then:
npx expo start --tunnel                   # press `s` if it starts in Expo Go mode
```

First launch asks for the **daemon address** (`host:port` on your LAN or tailnet) and the
**pairing token** (stored in the device secure store). With Tailscale on the phone, use
the daemon's tailnet IP and it works from anywhere.

### Push notifications

The daemon sends straight to **FCM v1** via `firebase-admin` (no Expo push service), so
the app needs the **native FCM token** and matching Firebase config:

- **Daemon:** a Firebase **service-account key** → `IG_FCM_KEY_PATH`.
- **App:** a **`google-services.json`** (Firebase Android app, package `com.anonymous.mobile`).
  It's gitignored, and EAS git-archives builds, so it's injected via an EAS file secret:
  `eas env:create --name GOOGLE_SERVICES_JSON --type file --visibility secret --environment development`,
  read by `app.config.js` (`googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json'`).
  The `development` build profile is pinned to the `development` environment so the secret loads.

When a DM arrives and **zero clients are connected**, the daemon pushes; the app's
`registerPushToken` keeps the daemon's device list current on every connect.

## JSON-RPC protocol

One JSON object per WebSocket frame. The pairing token is sent at the handshake via
`Authorization: Bearer <token>`, the `x-pairing-token` header, or a `?token=` query param.

**Request** → daemon: `{ "id": 1, "method": "getThreads", "params": {} }`
**Response** → client: `{ "id": 1, "result": ... }` or `{ "id": 1, "error": { "code": -32001, "message": "..." } }`
**Event** → client (unsolicited, no `id`): `{ "event": "newMessage", "data": { ... } }`

| Method              | Params                          | Result                                  |
| ------------------- | ------------------------------- | --------------------------------------- |
| `login`             | `username`, `password`          | `User` (falls back to `.env`)           |
| `getThreads`        | `cursor?`                       | `{ threads, oldestCursor, hasOlder }`   |
| `getMessages`       | `thread_id`, `cursor?`          | `{ messages, oldestCursor, hasOlder }`  |
| `sendMessage`       | `thread_id`, `text`             | `Message`                               |
| `markRead`          | `thread_id`, `item_id`          | `{ success: true }`                     |
| `registerPushToken` | `token`                         | `{ registered: boolean }`               |
| `submitChallenge`   | `code`                          | `User` (checkpoint verification)        |
| `submitTwoFactor`   | `code`                          | `User` (TOTP/SMS)                       |

| Event             | When                                              |
| ----------------- | ------------------------------------------------- |
| `sessionRestored` | On connect — `{ success, user? }`                 |
| `newMessage`      | A DM arrived over MQTT — `{ threadId, message }`  |
| `realtimeError`   | The MQTT connection errored/closed                |

Error codes: `-32700` parse · `-32600` invalid request · `-32601` method not found ·
`-32602` invalid params · `-32001` auth/session · `-32000` general API. Unauthenticated
WS connections are rejected with **HTTP 401** at the handshake (before any RPC).

## Keybindings (TUI)

Navigation is spatial: **Browse → Read → Compose** (left to right). `h/j/k/l` work as
hidden vim aliases for the arrow keys.

| Context             | Keys                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| **Browse** (threads)| `↑`/`↓` navigate · `→` / `Enter` open · `/` search · `q` quit        |
| **Read** (messages) | `↑`/`↓` scroll · `u`/`d` half-page · `gg` top · `G` bottom · `Enter` reply · `←` / `Esc` back |
| **Compose**         | `Enter` send · `Esc` cancel (stays open after sending)               |
| **Search**          | type to filter by username · `Enter` select · `Esc` cancel          |
| **Login**           | `Enter` next/submit · `Tab` switch field · `Esc` quit               |

## Troubleshooting

- **Client stuck on "Connecting…" / "Failed to connect"** — the daemon must already be
  running and reachable, and the client needs the right **address + pairing token**.
  Over Tailscale, use the daemon's `100.x.y.z` tailnet IP **and** include the `:8765`
  port. Check the daemon log for a connection attempt: a missing one means wrong
  address; an HTTP 401 means wrong token.
- **`Session expired` → login screen** — the session went stale; log in again (the
  daemon keeps running).
- **Stuck on a checkpoint** — Instagram's Bloks challenges are flaky via the library;
  authenticator-app 2FA routes login through the reliable TOTP path. Deleting a corrupt
  `session.json` and retrying also helps.
- **No push** — confirm `[push] FCM enabled` at boot, `IG_FCM_DRY_RUN` is unset, the app
  logged `[push] device token registered`, and the DM arrived with **no client
  connected** (a connected client gets it live instead). Sends from your *other* devices
  are self-echoes and intentionally don't push.
- **A sent test message disappears** — Instagram may shadow-drop messages that look
  automated even though the API returns success. Send normal, human-looking text.

## Development

```bash
cd packages/backend && npm run dev      # ts-node + nodemon hot reload
cd packages/tui && go test ./...        # offline Go tests (rendering + re-login + WS)
npx prettier --write .                  # format (from repo root)
```

Code style: Prettier (2-space, single quotes, 100 cols, trailing commas); TypeScript
`strict`, ES2020. See `CLAUDE.md` for contributor guidance and `PROGRESS.md` for the
session-by-session build log.
