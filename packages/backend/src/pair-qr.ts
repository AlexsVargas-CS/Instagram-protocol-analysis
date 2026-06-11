// Pairing-QR generator. Prints a scannable QR code (and a fallback payload string)
// encoding the daemon's reachable address + a pairing token, so the mobile app can
// be configured by scanning instead of typing a host:port and a 32-byte hex token.
//
// Run on the daemon host (e.g. over SSH on the VM):
//   npm run pair-qr -- 100.116.234.121:8765
// The address is taken from the CLI arg, else IG_DAEMON_ADDR; the token from
// IG_PAIRING_TOKEN (or the first entry of IG_PAIRING_TOKENS). A bare host with no
// port gets the daemon's WS port (IG_DAEMON_PORT / IG_WS_PORT, default 8765)
// appended. The token is rendered into the QR but never logged on its own line.
import 'dotenv/config';
import * as qrcode from 'qrcode-terminal';

// Keep in lockstep with the mobile app's parsePairingPayload (packages/mobile/src/config.ts).
const PAYLOAD_TYPE = 'igdaemon-pair';
const PAYLOAD_VERSION = 1;

const WS_PORT = Number(process.env.IG_DAEMON_PORT ?? process.env.IG_WS_PORT ?? 8765);

function firstToken(): string | null {
  const single = process.env.IG_PAIRING_TOKEN?.trim();
  if (single) return single;
  const list = process.env.IG_PAIRING_TOKENS;
  if (list) {
    for (const t of list.split(',')) {
      const v = t.trim();
      if (v) return v;
    }
  }
  return null;
}

// Normalize the address to host:port. Accepts a bare host (port appended), a
// host:port, or a full ws:// / wss:// URL (passed through untouched).
function normalizeAddress(raw: string): string {
  const addr = raw.trim();
  if (/^[a-z]+:\/\//i.test(addr)) return addr; // already a URL
  if (addr.includes(':')) return addr; // host:port
  return `${addr}:${WS_PORT}`; // bare host
}

function main(): void {
  const argAddr = process.argv[2]?.trim();
  const rawAddr = argAddr || process.env.IG_DAEMON_ADDR?.trim();
  const token = firstToken();

  if (!rawAddr) {
    console.error(
      'Error: no daemon address.\n' +
        '  Pass it as an argument:  npm run pair-qr -- <host:port>\n' +
        '  e.g.                     npm run pair-qr -- 100.116.234.121:8765\n' +
        '  (or set IG_DAEMON_ADDR in the environment)',
    );
    process.exit(1);
  }
  if (!token) {
    console.error(
      'Error: no pairing token configured (set IG_PAIRING_TOKEN or IG_PAIRING_TOKENS).',
    );
    process.exit(1);
  }

  const address = normalizeAddress(rawAddr);
  const payload = JSON.stringify({
    v: PAYLOAD_VERSION,
    t: PAYLOAD_TYPE,
    address,
    token,
  });

  console.log(`\nDaemon pairing QR — scan from the app's "Scan QR code" screen.`);
  console.log(`Address: ${address}\n`);
  qrcode.generate(payload, { small: true }, (qr) => {
    console.log(qr);
    console.log('If scanning fails, paste the address + token into the app manually.\n');
  });
}

main();
