import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDisplayName,
  getLocalPlayerId,
  getMuted,
  setMuted as persistMuted,
} from "../src/util/storage";

interface StorageCalls {
  getItem: number;
  setItem: number;
  removeItem: number;
  clear: number;
}

type CallCountedStorage = Storage & { calls: StorageCalls };

function makeMockStorage(): CallCountedStorage {
  const store = new Map<string, string>();
  const calls: StorageCalls = { getItem: 0, setItem: 0, removeItem: 0, clear: 0 };
  return {
    get length() {
      return store.size;
    },
    clear() {
      calls.clear++;
      store.clear();
    },
    getItem(key) {
      calls.getItem++;
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key) {
      calls.removeItem++;
      store.delete(key);
    },
    setItem(key, value) {
      calls.setItem++;
      store.set(key, String(value));
    },
    calls,
  } as CallCountedStorage;
}

const PLAYER_ID_KEY = "jinshi-gravity:player-id";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getLocalPlayerId", () => {
  it("reads and writes sessionStorage, never localStorage", () => {
    const session = makeMockStorage();
    const local = makeMockStorage();
    vi.stubGlobal("sessionStorage", session);
    vi.stubGlobal("localStorage", local);

    const id = getLocalPlayerId();

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(session.calls.getItem).toBe(1);
    expect(session.calls.setItem).toBe(1);
    expect(session.getItem(PLAYER_ID_KEY)).toBe(id);
    expect(local.calls.getItem).toBe(0);
    expect(local.calls.setItem).toBe(0);
  });

  it("returns the existing ID on the second call (persists within a tab)", () => {
    const session = makeMockStorage();
    vi.stubGlobal("sessionStorage", session);
    vi.stubGlobal("localStorage", makeMockStorage());

    const first = getLocalPlayerId();
    const second = getLocalPlayerId();

    expect(second).toBe(first);
    expect(session.calls.setItem).toBe(1);
    expect(session.calls.getItem).toBe(2);
  });

  it("produces two different IDs for two independent sessionStorages (two tabs)", () => {
    const tabA = makeMockStorage();
    vi.stubGlobal("sessionStorage", tabA);
    vi.stubGlobal("localStorage", makeMockStorage());
    const idA = getLocalPlayerId();

    const tabB = makeMockStorage();
    vi.stubGlobal("sessionStorage", tabB);
    const idB = getLocalPlayerId();

    expect(idA).not.toBe(idB);
    expect(tabA.getItem(PLAYER_ID_KEY)).toBe(idA);
    expect(tabB.getItem(PLAYER_ID_KEY)).toBe(idB);
  });

  it("falls back to a generated UUID when sessionStorage throws on read", () => {
    const failingStorage = {
      get length(): number {
        throw new Error("denied");
      },
      clear() {
        throw new Error("denied");
      },
      getItem() {
        throw new Error("denied");
      },
      key() {
        throw new Error("denied");
      },
      removeItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
    } as unknown as Storage;
    vi.stubGlobal("sessionStorage", failingStorage);
    vi.stubGlobal("localStorage", failingStorage);

    const id = getLocalPlayerId();

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

describe("non-identity storage stays on localStorage", () => {
  it("reads display name from localStorage", () => {
    const local = makeMockStorage();
    local.setItem("jinshi-gravity:display-name", "Alice");
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", makeMockStorage());

    expect(getDisplayName("Fallback")).toBe("Alice");
    expect(local.calls.getItem).toBeGreaterThanOrEqual(1);
  });

  it("persists mute preference to localStorage", () => {
    const local = makeMockStorage();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", makeMockStorage());

    persistMuted(true);
    expect(getMuted()).toBe(true);
    expect(local.getItem("jinshi-gravity:muted")).toBe("true");
  });
});