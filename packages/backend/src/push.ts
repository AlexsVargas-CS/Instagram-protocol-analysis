import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging, type Messaging, type MulticastMessage } from 'firebase-admin/messaging';
import * as fs from 'fs';
import type { Message } from './types';

// FCM push sending for the daemon. The daemon fires a push when a DM arrives and
// no client is connected (see server.ts). Sends go straight to FCM v1 via the
// firebase-admin SDK, which handles the service-account OAuth token exchange.
//
// IG_FCM_KEY_PATH  — path to the service-account private-key JSON (gitignored).
// IG_FCM_DRY_RUN=1 — validate sends against FCM without delivering (M4 option A).

let messaging: Messaging | undefined;
let pushEnabled = false;
const DRY_RUN = process.env.IG_FCM_DRY_RUN === '1';

// In-memory set of device FCM registration tokens. v1 does not persist these
// across restarts — clients re-register on launch / token refresh. (Persisting to
// a gitignored file is a cheap follow-up if restart churn becomes a problem.)
const deviceTokens = new Set<string>();

function infoLog(line: string): void {
  process.stderr.write(`${line}\n`);
}

// Initialize FCM from the service-account key, if configured. Safe to call once at
// boot; without a key (or on failure) the push feature degrades to a no-op so the
// daemon still runs.
export function initPush(): void {
  const keyPath = process.env.IG_FCM_KEY_PATH;
  if (!keyPath) {
    infoLog('[push] disabled (no IG_FCM_KEY_PATH configured)');
    return;
  }
  try {
    initializeApp({ credential: cert(keyPath) });
    messaging = getMessaging();
    pushEnabled = true;
    let project = '';
    try {
      project = JSON.parse(fs.readFileSync(keyPath, 'utf-8')).project_id ?? '';
    } catch {
      // best-effort project label only
    }
    infoLog(`[push] FCM enabled${project ? ` (project ${project})` : ''}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  } catch (err) {
    infoLog(`[push] disabled (failed to init FCM: ${err instanceof Error ? err.message : err})`);
  }
}

// Register a device's FCM token so future pushes reach it.
export function registerPushToken(token: string): { registered: boolean } {
  const t = (token || '').trim();
  if (!t) return { registered: false };
  deviceTokens.add(t);
  infoLog(`[push] device token registered; ${deviceTokens.size} device(s) total`);
  return { registered: true };
}

export function pushTokenCount(): number {
  return deviceTokens.size;
}

export function isPushEnabled(): boolean {
  return pushEnabled;
}

// Fire a push for an incoming DM. Minimal payload pulled straight from the MQTT
// event — a short preview plus the thread id for deep-linking — so no message
// storage is needed. High priority improves Android Doze penetration. Tokens FCM
// reports as permanently invalid are pruned.
export async function sendPush(threadId: string, message: Message): Promise<void> {
  if (!pushEnabled || !messaging) return;
  if (deviceTokens.size === 0) {
    infoLog('[push] incoming DM but no registered devices — skipping');
    return;
  }

  const preview = (message.text || 'New message').slice(0, 140);
  const tokens = [...deviceTokens];

  const payload: MulticastMessage = {
    tokens,
    notification: {
      title: 'New Instagram message',
      body: preview,
    },
    data: {
      threadId,
      userId: message.userId ?? '',
      itemId: message.itemId ?? '',
    },
    android: { priority: 'high' },
  };

  try {
    const resp = await messaging.sendEachForMulticast(payload, DRY_RUN);
    infoLog(
      `[push] sent to ${resp.successCount}/${tokens.length} device(s)` +
        `${DRY_RUN ? ' [DRY RUN]' : ''}, ${resp.failureCount} failed`,
    );
    resp.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error?.code ?? '';
      const tok = tokens[i];
      if (
        tok &&
        (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument')
      ) {
        deviceTokens.delete(tok);
        infoLog(`[push] pruned invalid token (${code})`);
      }
    });
  } catch (err) {
    infoLog(`[push] send failed: ${err instanceof Error ? err.message : err}`);
  }
}
