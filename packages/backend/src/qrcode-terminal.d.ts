// Minimal ambient types for qrcode-terminal (ships no types). We use only
// generate(text, opts?, cb?).
declare module 'qrcode-terminal' {
  export function generate(
    text: string,
    opts?: { small?: boolean },
    cb?: (qr: string) => void,
  ): void;
}
