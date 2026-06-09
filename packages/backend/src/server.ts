import * as readline from 'readline';
import 'dotenv/config';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { InstagramClient } from './instagram';
import { AuthenticationError, SessionError, InstagramAPIError, User } from './types';

const client = new InstagramClient();

// Daemon mode: the backend is a standalone, network-reachable daemon that holds
// the session + MQTT across client churn. In daemon mode, stdin EOF does NOT end
// the process (stdio is just one transport); SIGTERM/SIGINT are the real shutdown
// signals. Without the flag we behave as the legacy stdio-spawned backend so the
// current TUI keeps working unchanged (M1: keep both transports in parallel).
const DAEMON_MODE = process.env.IG_DAEMON === '1';
const WS_PORT = Number(process.env.IG_DAEMON_PORT ?? process.env.IG_WS_PORT ?? 8765);

interface JsonRpcResponse {
  id: number;
  result?: unknown;
  error?: JsonRpcError;
}

interface JsonRpcError {
  code: number;
  message: string;
}

// Server-initiated events (no id, nobody asked for these)
interface JsonRpcEvent {
  event: string;
  data: unknown;
}

interface Request {
  id: number;
  method: string;
  params: Record<string, unknown>;
}

type Outbound = JsonRpcResponse | JsonRpcEvent;

// A single client transport. Each connection (the one stdio pipe, or any number
// of WebSocket clients) writes through its own send(); responses go to the
// requesting connection, events fan out to all of them.
interface Connection {
  id: number;
  kind: 'stdio' | 'ws';
  send(msg: Outbound): void;
}

const connections = new Set<Connection>();
let nextConnId = 1;

// Last known session user, so a WebSocket client that connects AFTER boot still
// learns the session state (the boot-time sessionRestored broadcast already fired).
let currentUser: User | undefined;

function sendResponse(conn: Connection, id: number, result: unknown): void {
  conn.send({ id, result });
}

function sendError(conn: Connection, id: number, code: number, message: string): void {
  conn.send({ id, error: { code, message } });
}

// Fan an event out to every connected client.
function broadcast(event: string, data: unknown): void {
  const msg: JsonRpcEvent = { event, data };
  for (const conn of connections) {
    conn.send(msg);
  }
}

// ---- stdio transport (legacy; kept in parallel until M3 migrates the TUI) ----

const stdioConnection: Connection = {
  id: 0,
  kind: 'stdio',
  send(msg) {
    console.log(JSON.stringify(msg));
  },
};
connections.add(stdioConnection);

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false, //not interactive terminl
});

rl.on('line', async (line: string) => {
  //goal: dont allow any input other then a valid input
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    sendError(stdioConnection, 0, -32700, 'Parse Error');
    return;
  }
  if (typeof request.id !== 'number' || typeof request.method !== 'string') {
    sendError(stdioConnection, request.id ?? 0, -32600, 'Invalid request');
    return;
  }

  await handleRequest(stdioConnection, request);
});

// ---- WebSocket transport (the daemon's primary transport going forward) ----

function handleWsConnection(ws: WebSocket): void {
  const conn: Connection = {
    id: nextConnId++,
    kind: 'ws',
    send(msg) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
  };
  connections.add(conn);
  infoLog(`[ws] client connected (#${conn.id}); ${connections.size} total`);

  // The boot-time sessionRestored broadcast already fired before this client
  // joined, so hand it the current state directly.
  conn.send({ event: 'sessionRestored', data: { success: !!currentUser, user: currentUser } });

  ws.on('message', (data: RawData) => {
    let request;
    try {
      request = JSON.parse(data.toString());
    } catch {
      sendError(conn, 0, -32700, 'Parse Error');
      return;
    }
    if (typeof request.id !== 'number' || typeof request.method !== 'string') {
      sendError(conn, request.id ?? 0, -32600, 'Invalid request');
      return;
    }
    void handleRequest(conn, request);
  });

  ws.on('close', () => {
    connections.delete(conn);
    infoLog(`[ws] client disconnected (#${conn.id}); ${connections.size} total`);
  });
  ws.on('error', () => {
    connections.delete(conn);
  });
}

function startWebSocketServer(): void {
  const wss = new WebSocketServer({ port: WS_PORT });
  wss.on('listening', () => infoLog(`[ws] listening on :${WS_PORT}`));
  wss.on('connection', (ws) => handleWsConnection(ws));
  wss.on('error', (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (DAEMON_MODE) {
      // The WS server IS the daemon — a bind failure is fatal.
      process.stderr.write(`[ws] fatal: ${msg}\n`);
      process.exit(1);
    }
    // Legacy stdio run (e.g. the current TUI spawned us and a port is taken):
    // the WS server is a bonus, not required — keep serving stdio.
    process.stderr.write(`[ws] disabled (${msg}) — stdio transport still active\n`);
  });
}

// infoLog/debugLog live in instagram.ts; mirror the always-on lifecycle line here
// without importing private helpers — keep secrets out (only structural lines).
function infoLog(line: string): void {
  process.stderr.write(`${line}\n`);
}

// ---- lifecycle ----

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await client.stopRealtime();
  } catch {
    // Ignore teardown errors — we're exiting anyway.
  }
  process.exit(0);
}

// Stdin EOF means our input pipe closed. In legacy stdio mode that's the TUI
// telling us to exit (without this, the live MQTT connection would keep the event
// loop alive and we'd linger as an orphan). In daemon mode stdio is just one
// transport among many — its EOF only removes that connection; the daemon lives
// on for WebSocket clients (and the zero-client resting state). SIGTERM/SIGINT
// cover an explicit kill in both modes.
rl.on('close', () => {
  if (DAEMON_MODE) {
    connections.delete(stdioConnection);
    infoLog('[stdio] input closed (daemon keeps running)');
  } else {
    void shutdown();
  }
});
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

async function handleRequest(conn: Connection, req: Request): Promise<void> {
  try {
    let result: unknown;

    switch (req.method) {
      case 'login': {
        const username = (req.params.username as string) || process.env.IG_USERNAME;
        const password = (req.params.password as string) || process.env.IG_PASSWORD;
        result = await client.login(username!, password!);
        currentUser = result as User;
        startRealtimeListener();
        break;
      }
      case 'getThreads': {
        result = await client.getThreads(req.params.cursor as string | undefined);
        break;
      }
      case 'getMessages': {
        result = await client.getMessages(
          req.params.thread_id as string,
          req.params.cursor as string | undefined,
        );

        break;
      }
      case 'sendMessage': {
        result = await client.sendMessage(
          req.params.thread_id as string,
          req.params.text as string,
        );
        break;
      }
      case 'markRead': {
        await client.markRead(req.params.thread_id as string, req.params.item_id as string);
        result = { success: true };
        break;
      }
      case 'submitChallenge': {
        const code = req.params.code as string;
        if (!code) {
          sendError(conn, req.id, -32602, 'Missing verification code');
          return;
        }
        result = await client.submitChallengeCode(code);
        currentUser = result as User;
        startRealtimeListener();
        break;
      }
      case 'submitTwoFactor': {
        const code = req.params.code as string;
        if (!code) {
          sendError(conn, req.id, -32602, 'Missing 2FA code');
          return;
        }
        result = await client.submitTwoFactorCode(code);
        currentUser = result as User;
        startRealtimeListener();
        break;
      }

      default:
        sendError(conn, req.id, -32601, `Method not found: ${req.method}`);
        return;
    }
    sendResponse(conn, req.id, result);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendError(conn, req.id, -32001, error.message);
    } else if (error instanceof SessionError) {
      sendError(conn, req.id, -32001, error.message);
    } else if (error instanceof InstagramAPIError) {
      sendError(conn, req.id, -32000, error.message);
    } else {
      sendError(conn, req.id, -32000, error instanceof Error ? error.message : 'unknown error');
    }
  }
}

// Realtime is owned by the daemon lifecycle: it comes up once at boot (init) when
// a session exists, or right after a successful login/challenge/2FA, and then
// stays up across client churn. The bind-once handlers in InstagramClient make
// repeated startRealtime calls safe (callbacks are refreshed, handlers are not
// re-bound). Events fan out to whoever is connected; self-echo drop is unchanged.
function startRealtimeListener(): void {
  client.startRealtime(
    (threadId, message) => {
      broadcast('newMessage', { threadId, message });
    },
    (error) => {
      broadcast('realtimeError', { error });
    },
  );
}

async function init(): Promise<void> {
  infoLog('[backend] started');
  startWebSocketServer();
  const user = await client.loadSession();
  currentUser = user ?? undefined;
  broadcast('sessionRestored', { success: !!user, user: user || undefined });
  if (user) {
    startRealtimeListener();
  }
}

init();
