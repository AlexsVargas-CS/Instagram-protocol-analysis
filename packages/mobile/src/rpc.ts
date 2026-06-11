// WebSocket JSON-RPC client for the daemon. Mirrors the Go TUI's ipc.go: a
// pending-map for request/response correlation, an events callback for
// server-initiated messages, per-request timeouts, and auto-reconnect. Each WS
// frame is exactly one JSON object (no newline framing).

export type ConnStatus = 'connecting' | 'open' | 'closed';

interface Pending {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface RpcClientOptions {
  address: string;
  token: string;
  onEvent: (event: string, data: any) => void;
  onStatus: (status: ConnStatus) => void;
}

const DEFAULT_TIMEOUT = 30000;
const AUTH_TIMEOUT = 120000;
const RECONNECT_DELAY = 3000;

export class RpcClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly token: string;
  private readonly onEvent: (event: string, data: any) => void;
  private readonly onStatus: (status: ConnStatus) => void;

  private nextId = 1;
  private pending = new Map<number, Pending>();
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: RpcClientOptions) {
    this.url = normalizeWsUrl(opts.address);
    this.token = opts.token;
    this.onEvent = opts.onEvent;
    this.onStatus = opts.onStatus;
  }

  connect(): void {
    this.closedByUser = false;
    this.openSocket();
  }

  private openSocket(): void {
    this.onStatus('connecting');
    // React Native's WebSocket accepts a third options arg with headers, so we
    // send the pairing token as Authorization: Bearer (the daemon also accepts
    // ?token=, used as a fallback in the URL for safety).
    const url = appendToken(this.url, this.token);
    // React Native's WebSocket accepts a 3rd options arg (headers) that the DOM
    // type doesn't declare — cast the constructor; the instance stays typed.
    const ws: WebSocket = new (WebSocket as any)(url, undefined, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    this.ws = ws;

    ws.onopen = () => this.onStatus('open');
    ws.onmessage = (e: any) => this.handleMessage(e?.data);
    ws.onerror = () => {
      // onclose fires next; reconnect is handled there.
    };
    ws.onclose = () => {
      this.failAllPending(new Error('connection closed'));
      this.onStatus('closed');
      if (!this.closedByUser) this.scheduleReconnect();
    };
  }

  private handleMessage(raw: any): void {
    let msg: any;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch {
      return;
    }
    if (typeof msg.event === 'string') {
      this.onEvent(msg.event, msg.data);
      return;
    }
    if (typeof msg.id === 'number') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) {
        p.reject(new Error(`rpc error ${msg.error.code}: ${msg.error.message}`));
      } else {
        p.resolve(msg.result);
      }
    }
  }

  send(method: string, params: Record<string, unknown> = {}, timeout = DEFAULT_TIMEOUT): Promise<any> {
    return new Promise((resolve, reject) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('not connected'));
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`rpc timeout: ${method}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Auth methods chain several Instagram requests and need a longer budget.
  sendAuth(method: string, params: Record<string, unknown> = {}): Promise<any> {
    return this.send(method, params, AUTH_TIMEOUT);
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.failAllPending(new Error('client closed'));
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUser) this.openSocket();
    }, RECONNECT_DELAY);
  }

  private failAllPending(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}

// Turn a config address into a ws:// or wss:// URL. Bare host:port → ws://host:port.
// Plain string ops only — React Native's URL implementation is partial.
export function normalizeWsUrl(address: string): string {
  let addr = address.trim();
  if (!/^[a-z]+:\/\//i.test(addr)) addr = `ws://${addr}`;
  addr = addr.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
  return addr;
}

function appendToken(url: string, token: string): string {
  // Fallback auth channel in case a platform drops custom WS headers; the daemon
  // accepts the token via Authorization: Bearer OR ?token=.
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}
