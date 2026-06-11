import * as SecureStore from 'expo-secure-store';

// How the app reaches the daemon: a network address and the pairing token the
// daemon validates at the WS handshake. Stored in the OS secure store (the token
// is a secret). Mirrors the Go TUI's DaemonConfig.
export interface DaemonConfig {
  address: string; // host:port or a full ws:// / wss:// URL
  token: string;
}

const ADDR_KEY = 'daemon_address';
const TOKEN_KEY = 'daemon_token';

export async function loadConfig(): Promise<DaemonConfig | null> {
  const address = await SecureStore.getItemAsync(ADDR_KEY);
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (address && token) return { address, token };
  return null;
}

export async function saveConfig(cfg: DaemonConfig): Promise<void> {
  await SecureStore.setItemAsync(ADDR_KEY, cfg.address.trim());
  await SecureStore.setItemAsync(TOKEN_KEY, cfg.token.trim());
}

export async function clearConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(ADDR_KEY);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// Pairing QR payload — kept in lockstep with the daemon generator
// (packages/backend/src/pair-qr.ts). The `t` type tag lets the scanner reject
// unrelated QR codes; `v` allows the format to evolve.
const PAYLOAD_TYPE = 'igdaemon-pair';

// Parse a scanned QR string into a DaemonConfig, or null if it isn't a valid
// pairing payload (wrong type, malformed JSON, or missing fields).
export function parsePairingPayload(raw: string): DaemonConfig | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  if (o.t !== PAYLOAD_TYPE) return null;
  const address = typeof o.address === 'string' ? o.address.trim() : '';
  const token = typeof o.token === 'string' ? o.token.trim() : '';
  if (!address || !token) return null;
  return { address, token };
}
