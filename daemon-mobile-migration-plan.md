# Daemon + Mobile Migration Plan

**Status:** Planning handoff for Claude Code. Not a single session — a sequenced set of milestones, each meant to be run as its own session with `/update-progress` at the end.

**Grounded against source** read on 2026-06-09 (`ipc.go`, `backend.go`, `server.ts`). The standing rule still applies: **the agent must re-verify against the live repo before writing code** — these notes can go stale between sessions.

---

## Why this work exists

The product goal is "notification → reply → move on, without opening Instagram." That requires a push to a phone *while the app is closed*. A closed app has no open connection, so something else must be awake, listening to Instagram, and able to fire a push. That "something" is a persistent **daemon** on always-on hardware. The phone OS will not host it (it suspends background processes), so the daemon lives on a laptop-that-stays-on or a cheap cloud VM.

Today the backend is **not** a daemon: `backend.go` spawns `node dist/server.js` and talks to it over stdin/stdout pipes; the backend lives and dies with the TUI, with exactly one client. The work below turns it into a standalone, network-reachable, always-on daemon and then builds the phone client on top.

---

## Decisions already made (do not relitigate)

1. **Migrate, not dual transport.** The TUI moves to WebSocket too. We are *not* keeping the stdio-spawn path as a permanent second transport. Rationale: the daemon is structurally forced by the push requirement, so once it exists the stdio path is legacy weight, and a dual setup risks two backends hitting one Instagram account (duplicate MQTT, fingerprint risk — exactly what the self-hosted model avoids). A thin *dev-only* helper that spawns a local daemon is fine; a second permanent protocol is not.

2. **Daemon receives once, then routes.** The daemon owns the single MQTT connection. On an incoming DM it decides: connected client(s) → push down the socket(s); nobody connected → fire an FCM push. The daemon is a **trigger, not a message store** — Instagram stays source of truth; clients sync via existing `getThreads`/`getMessages` on connect. Daemon state is only: session, MQTT connection, device push tokens, connected sockets, pairing token(s).

3. **"No client connected" = push.** Heuristic: count open authenticated WebSocket connections. Zero on incoming DM → push. This handles phone foreground/background for free (backgrounding drops the socket). Accepted v1 simplification: an open laptop TUI suppresses the phone push. A "push the phone unless the phone is foreground" policy is a later refinement.

4. **Raw FCM, not the Expo push service**, for sending. FCM is in the path either way; Expo only adds itself in front. For a self-hosted, privacy-motivated tool, going direct keeps "no third party beyond the one Android forces on me" true. **Use the `firebase-admin` Node SDK** — it talks straight to FCM v1 and handles the service-account OAuth token exchange for you, so "raw FCM" is nearly as little daemon code as the Expo POST would be. `expo-notifications` on the *client* is push-service agnostic, so the app can still use Expo's client APIs while the daemon sends via FCM directly.

5. **Auth = pairing token on top of Tailscale.** Tailscale/WireGuard is layer one (restricts who can reach the port *and* encrypts in transit, so plain `ws://` over the tailnet is fine — no TLS certs to manage). The daemon **also** authenticates every connection with a per-instance pairing token validated at the WS handshake (constant-time compare, never logged), because network position is not identity. The pairing token (access to the daemon) and the Instagram session (daemon acts as the account) are separate secrets at separate layers.

---

## Target architecture

```
                 ┌─────────────────────────────────────────┐
                 │  DAEMON  (always-on hardware, on tailnet) │
                 │                                           │
   Instagram ◄───┤  InstagramClient + MQTT (startRealtime)   │
   (MQTT/REST)   │  session • device push tokens • sockets   │
                 │  WebSocket server  (pairing-token auth)   │
                 │  sendPush() via firebase-admin (FCM v1)   │
                 └───────┬──────────────────────┬────────────┘
                         │ ws:// over tailnet    │ FCM (closed app)
              ┌──────────▼─────────┐   ┌─────────▼──────────┐
              │  Go TUI (laptop)   │   │  Expo app (Android) │
              │  ipc.go over WS    │   │  thin WS client +   │
              │                    │   │  expo-notifications │
              └────────────────────┘   └─────────────────────┘
```

The wire protocol is unchanged from today — the same three message shapes, just carried in WebSocket frames instead of newline-delimited stdout:

- **Request:** `{ "id": number, "method": string, "params": object }`
- **Response:** `{ "id": number, "result"?: any, "error"?: { code, message } }`
- **Event:** `{ "event": string, "data": any }` (server-initiated, no `id`)

One framing change: a WebSocket frame is already message-delimited, so the `\n` terminator and the `bufio.Scanner` line-splitting go away. Each frame is exactly one JSON object.

---

## Milestones

Each is build-green (TS `tsc --noEmit`; Go `go build ./...` + `go vet ./...` + `go test ./...` all clean) and ends with a `PROGRESS.md` update via `/update-progress`.

### M0 — Verify the foundation (no code)
The entire push feature sits on MQTT live-receive working. This is still the one unchecked item in `PROGRESS.md`.
- **Do:** run the current TUI logged in, DM the account from a phone, watch the bubble appear live.
- **DoD:** live realtime-receive confirmed by eyeball, logged in `PROGRESS.md`. If it fails, fix *before* any other milestone.

### M1 — Daemon transport on the backend (add WS; keep stdio temporarily)
Decouple `server.ts` from stdio without breaking the working TUI yet.
- Add a WebSocket server (`ws` package). Keep the existing stdio path alive in parallel for now so M0's TUI keeps working until M3 migrates it.
- Make the routing reusable: `handleRequest` is already transport-neutral — refactor `sendResponse`/`sendError` to write to the **requesting connection**, and `sendEvent` to **fan out to all connected authenticated sockets** (today it's a single `console.log`). A per-connection writer abstraction is the cleanest shape.
- Move session load + `startRealtimeListener()` to **daemon boot** (`init`), owned by the daemon lifecycle, not triggered per-client. The existing bind-once handlers make repeated `startRealtime` safe, but realtime should come up once and stay up across client churn.
- Keep self-echo drop as-is.
- **DoD:** daemon boots standalone, holds session + MQTT with zero clients; a WS client can connect, issue the full method set, and receive `newMessage` events; stdio path still works; builds green.

### M2 — Auth on the socket (same milestone discipline as M1; never ship an unauthenticated networked build)
- Pairing token from per-instance env config (alongside IG creds). Validate at the WS handshake before honoring any RPC; reject otherwise. Constant-time compare; never log the token.
- v1 may use a single shared token; **per-device tokens** (small list the daemon stores, individually revocable) are a modest upgrade and the better fit — implement if cheap, else note as a follow-up.
- **DoD:** unauthenticated/wrong-token connections are rejected at handshake; authenticated connections work end-to-end; builds green.

### M3 — Migrate the Go TUI to a WebSocket client, then remove stdio
- Swap `RPCClient`'s underlying `io.Writer`/`io.Reader` for a WebSocket connection (`coder/websocket` or `gorilla/websocket`). **Keep** the pending-map, `Events` channel, timeouts, and the response-vs-event peek logic — only the read/write substrate and the `\n` framing change.
- Replace `StartBackend`/`Stop` spawn logic with a **dial-daemon connector** that reads server address + pairing token from local config. Add a thin dev-only helper to spawn+connect a local daemon in one step (optional convenience, not a second transport).
- Update `bringup_test.go` for the new connector.
- Once the TUI is fully working over WS, **remove the stdio transport** from `server.ts`.
- **DoD:** TUI connects to the daemon over WS (localhost), full core loop (login incl. challenge/2FA, threads, paginated messages, send, markRead, realtime receive) behaves identically to the stdio version; quitting/reopening the TUI no longer tears down the session (daemon held it); stdio removed; builds + tests green.

### M4 — Push trigger + FCM on the daemon (the spiky one)
**Prerequisite (manual, no code):** create a Firebase project, generate a service-account private key (JSON), store it as per-instance daemon env config. One Firebase project + one app build is shared across a friend group; IG creds and messages stay per-daemon.
- Add a `registerPushToken` WS method; daemon stores device tokens.
- Track connected authenticated sockets. In the `newMessage` path: if zero clients connected, call `sendPush()`.
- `sendPush()` uses `firebase-admin` `messaging().send()`, **high priority** (better Doze penetration), minimal payload (sender + preview pulled from the MQTT event — no storage needed).
- **DoD:** with no client connected, a DM to the account delivers an FCM push to a test device (real device or emulator *with* Google Play services); with a client connected, it delivers live and does not double-push.

### M5 — Networking + deployment
- Put the daemon on always-on hardware, enrolled in the tailnet. Reliable always-free VM options: Oracle Cloud, Google Cloud (Render hibernates on idle; Railway/Fly.io are no longer truly free always-on).
- Confirm a remote client reaches the daemon over Tailscale with the pairing token, plain `ws://` (WireGuard provides the encryption).
- **DoD:** TUI (and later the app) reaches the daemon over the tailnet from off-network; no public port exposed.

### M6 — React Native / Expo client (the actual app — last, because everything it needs is now proven)
- First-launch config: server address + pairing token, entered via **QR scan** (daemon prints a QR encoding address+token) with manual entry as fallback.
- WS client reusing the exact same protocol/message shapes.
- `expo-notifications`: request notification permission (Android 13+ runtime permission), register the device token to the daemon, handle incoming pushes, deep-link from a tapped notification straight into the thread.
- Messaging UI (can sub-phase: read-only first, then send).
- **DoD:** closed-app DM produces a notification; tap opens the thread; reply works; defined in `PROGRESS.md`.

---

## Honest risks / what won't be perfect

- **Background delivery isn't guaranteed instant.** Android Doze/App Standby can delay or drop pushes. High-priority FCM mitigates but does not eliminate this. The "must always arrive instantly" bar is stricter than what Android offers for background delivery — calibrate expectations.
- **Self-hosted has one shared seam.** Push delivery *is* a Google service, so a shared Firebase project/app build is unavoidable. The line held: shared push transport, but no shared custody of IG credentials or messages.
- **Go migration touches working code** (`ipc.go`). Low risk because the protocol is unchanged and the migration happens behind the already-proven daemon, but it's nonzero — lean on `bringup_test.go`.
- **Multi-client state can diverge.** If TUI and phone are both connected, unread counts/read state may drift; v1 accepts eventual consistency via re-fetch on connect.
- **Self-echo drop** means sends from your *other* devices won't push (intentional; they surface on next reload).
- **`getThreads` pagination** uses library-internal `(feed as any).cursor` — pre-existing fragility noted in `PROGRESS.md`; don't destabilize it during the refactor, and watch it on any lib upgrade.
- **Ban risk persists** and a daemon holds a *persistent* MQTT connection (more "always on" than the spawn model). Keep using the burner account; be aware of the changed footprint.

---

## Suggested first move

Run **M0** by itself — it's a five-minute eyeball that de-risks everything downstream. Only after it's green is it worth lifting **M1** into its own Claude Code session.
