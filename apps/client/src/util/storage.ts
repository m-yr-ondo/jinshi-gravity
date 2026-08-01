const PLAYER_ID_KEY = "jinshi-gravity:player-id";
const PLAYER_NAME_KEY = "jinshi-gravity:display-name";
const MUTED_KEY = "jinshi-gravity:muted";

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
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

/**
 * Stable per-tab player ID. Stored in sessionStorage so each browser tab gets
 * its own identity (independent racers across tabs), while a single tab retains
 * its identity across refreshes. NOT a Discord identity. Display name and mute
 * preference (below) intentionally stay on localStorage because they are not
 * identity and are fine to share across tabs.
 */
export function getLocalPlayerId(): string {
  try {
    const existing = sessionStorage.getItem(PLAYER_ID_KEY);
    if (existing && existing.length > 0) return existing;
  } catch {
    /* storage may be unavailable in some embedding contexts */
  }
  const id = uuid();
  try {
    sessionStorage.setItem(PLAYER_ID_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

export function getDisplayName(fallback: string): string {
  try {
    const v = localStorage.getItem(PLAYER_NAME_KEY);
    if (v && v.length > 0) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function setDisplayName(value: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_KEY, value);
  } catch {
    /* ignore */
  }
}

export function getMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setMuted(value: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, String(value));
  } catch {
    /* ignore */
  }
}