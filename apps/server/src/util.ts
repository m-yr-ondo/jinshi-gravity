import { randomInt } from "node:crypto";

/** Distinct neon player colors (0xRRGGBB) shared by both client and server. */
export const PLAYER_COLOR_POOL: readonly number[] = [
  0x00ffcc, 0xff3366, 0xffcc00, 0x66ccff, 0xcc66ff, 0x66ff66, 0xff9933, 0xff66cc,
];

/** Pick the first unused color from the pool, falling back to a random one. */
export function pickColor(used: ReadonlySet<number>): number {
  for (const c of PLAYER_COLOR_POOL) {
    if (!used.has(c)) return c;
  }
  return PLAYER_COLOR_POOL[randomInt(0, PLAYER_COLOR_POOL.length)!]!;
}

/**
 * Generate a short, human-friendly room code: 4 uppercase chars from a
 * collision-light alphabet (no ambiguous I/O/0/1 chars).
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateRoomCode(length = 4): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return out;
}

/** Generate a stable local playerId for new clients (UUIDv4-ish). */
export function generatePlayerId(): string {
  // crypto.randomUUID is available on Node 20+.
  return randomUUIDLike();
}

function randomUUIDLike(): string {
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = randomInt(0, 256);
  // Mark as v4 variant.
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return (
    h(b[0]!) + h(b[1]!) + h(b[2]!) + h(b[3]!) + "-" +
    h(b[4]!) + h(b[5]!) + "-" +
    h(b[6]!) + h(b[7]!) + "-" +
    h(b[8]!) + h(b[9]!) + "-" +
    h(b[10]!) + h(b[11]!) + h(b[12]!) + h(b[13]!) + h(b[14]!) + h(b[15]!)
  );
}