import Phaser from "phaser";
import {
  ALL_MAPS,
  type GameMap,
} from "@jinshi-gravity/shared";
import {
  createRoom,
  joinRoom,
  type GravityRoomController,
  type GravityRoomStateShape,
  type PlayerStateShape,
} from "./net.js";
import {
  getDisplayName,
  getLocalPlayerId,
  getMuted,
  setDisplayName as persistName,
  setMuted as persistMuted,
} from "./util/storage.js";
import { audio } from "./util/audio.js";
import { NetworkIndicator } from "./game/network-indicator.js";
import { startGame } from "./game/GravityGame.js";

const PLAYER_ID = getLocalPlayerId();
const INITIAL_NAME = getDisplayName("Player");

let currentRoom: GravityRoomController | null = null;
let phaserGame: Phaser.Game | null = null;
let currentMap: GameMap | null = null;
let cleanupFns: Array<() => void> = [];
let wantsRematch = false;

const root = document.body;
const $ = <T extends Element = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as unknown as T;
};

const network = new NetworkIndicator(root);

audio.setMuted(getMuted());

// Bootstrap DOM.
(() => {
  $<HTMLInputElement>("display-name").value = INITIAL_NAME;
  $("player-id-display").textContent = PLAYER_ID.slice(0, 8) + "…" + PLAYER_ID.slice(-4);
  populateMapSelect($<HTMLSelectElement>("create-map"));
  network.setStatus("disconnected");
  setMuteIcon(getMuted());
  showSection("lobby");
})();

function populateMapSelect(select: HTMLSelectElement, lockedTo?: string): void {
  select.innerHTML = "";
  for (const m of ALL_MAPS) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    if (lockedTo && m.id === lockedTo) opt.selected = true;
    select.appendChild(opt);
  }
}

function setMuteIcon(muted: boolean): void {
  $<HTMLButtonElement>("mute-toggle").ariaPressed = String(muted);
  $("mute-icon").textContent = muted ? "🔇" : "🔊";
}

// ---------- Lobby controls ----------
$<HTMLButtonElement>("mute-toggle").addEventListener("click", () => {
  audio.resume();
  const muted = audio.toggleMuted();
  persistMuted(muted);
  setMuteIcon(muted);
});

$<HTMLInputElement>("display-name").addEventListener("change", (event) => {
  const value = (event.target as HTMLInputElement).value.trim();
  if (value.length === 0) return;
  persistName(value);
  if (currentRoom) currentRoom.sendSetName(value);
});

$<HTMLButtonElement>("create-button").addEventListener("click", async () => {
  audio.resume();
  $<HTMLParagraphElement>("create-error").hidden = true;
  const name = readName();
  if (!name) {
    showInlineError("create-error", "Enter a display name");
    return;
  }
  const mode = $<HTMLSelectElement>("create-mode").value as "multiplayer" | "practice";
  const mapId = $<HTMLSelectElement>("create-map").value;
  try {
    const room = await createRoom({ playerId: PLAYER_ID, displayName: name, mode, mapId });
    attachToRoom(room);
  } catch (err) {
    showInlineError("create-error", `Failed to create room: ${String(err)}`);
  }
});

$<HTMLButtonElement>("join-button").addEventListener("click", async () => {
  audio.resume();
  $<HTMLParagraphElement>("join-error").hidden = true;
  const name = readName();
  const code = $<HTMLInputElement>("room-code").value.trim().toUpperCase();
  if (!name) {
    showInlineError("join-error", "Enter a display name");
    return;
  }
  if (code.length < 4) {
    showInlineError("join-error", "Room codes are 4 characters");
    return;
  }
  try {
    const room = await joinRoom({ playerId: PLAYER_ID, displayName: name, mode: "multiplayer", code });
    attachToRoom(room);
  } catch (err) {
    showInlineError("join-error", `Could not join room: ${String(err)}`);
  }
});

$<HTMLButtonElement>("copy-code").addEventListener("click", () => {
  const code = $("room-code-display").textContent ?? "";
  void navigator.clipboard?.writeText(code);
});

$<HTMLButtonElement>("ready-button").addEventListener("click", () => {
  if (!currentRoom) return;
  const seat = currentRoom.state.players.get(PLAYER_ID);
  if (!seat) return;
  currentRoom.sendSetReady(!seat.ready);
});

$<HTMLButtonElement>("start-button").addEventListener("click", () => {
  if (!currentRoom) return;
  if (currentRoom.state.mode === "practice") {
    currentRoom.sendStartPractice();
  } else {
    currentRoom.sendStartRound();
  }
});

$<HTMLButtonElement>("map-select").addEventListener("change", (event) => {
  if (!currentRoom) return;
  const seat = currentRoom.state.players.get(PLAYER_ID);
  if (!seat?.isHost) return;
  const mapId = (event.target as HTMLSelectElement).value;
  currentRoom.sendSelectMap(mapId);
});

$<HTMLButtonElement>("leave-button").addEventListener("click", async () => {
  await leaveRoom();
});

$<HTMLButtonElement>("rematch-button").addEventListener("click", () => {
  if (!currentRoom) return;
  wantsRematch = !wantsRematch;
  currentRoom.sendVoteRematch(wantsRematch);
});

$<HTMLButtonElement>("results-leave").addEventListener("click", async () => {
  await leaveRoom();
});

// ---------- Wire a connected room ----------
function attachToRoom(room: GravityRoomController): void {
  if (currentRoom) {
    void currentRoom.leave();
  }
  currentRoom = room;
  wantsRematch = false;
  cleanupFns.push(room.onStateChange(refreshRoomUI));
  cleanupFns.push(room.onLeave(() => onRoomLeft()));
  cleanupFns.push(
    room.onError((code, message) => {
      console.warn("[jinshi-gravity] room error", code, message);
      showInlineError("room-error", message ?? `Error ${code}`);
      network.setStatus("reconnecting");
    }),
  );
  cleanupFns.push(
    room.onMessage("info", (m: { message?: string }) => {
      console.info("[jinshi-gravity] room info", m);
    }),
  );
  cleanupFns.push(
    room.onMessage("error", (m: { code: string; message: string }) => {
      showInlineError("room-error", m.message);
    }),
  );
  cleanupFns.push(
    room.onMessage("countdown", (m: { remainingMs: number }) => showCountdown(m.remainingMs)),
  );
  cleanupFns.push(
    room.onMessage("round-started", (m: { mapId: string }) => onRoundStarted(m.mapId)),
  );
  cleanupFns.push(
    room.onMessage("eliminated", (m: { playerId: string; cause: string }) => {
      if (m.playerId === PLAYER_ID) {
        showDeathOverlay(true);
        showSpectatorBanner(false);
      }
    }),
  );
  cleanupFns.push(
    room.onMessage("round-ended", (m: { result: any }) => onRoundEnded(m.result)),
  );
  network.setStatus("connected");
  $("room-card").hidden = false;
  populateMapSelect($<HTMLSelectElement>("map-select"));
  refreshRoomUI();
}

function refreshRoomUI(): void {
  if (!currentRoom) return;
  const state = currentRoom.state;
  if (!state.players) return;
  $("room-code-display").textContent = state.code ?? "----";
  $<HTMLSpanElement>("room-mode-badge").textContent = state.mode;
  const mySeat = state.players.get(PLAYER_ID);
  if (mySeat) {
    const isHost = !!mySeat.isHost;
    $<HTMLSpanElement>("room-host-badge").textContent = isHost ? "host" : "seated";
    $<HTMLSelectElement>("map-select").disabled = !isHost;
    $<HTMLButtonElement>("start-button").disabled = !isHost || state.phase !== "LOBBY";
    $<HTMLButtonElement>("ready-button").disabled = state.phase !== "LOBBY" || mySeat.spectator;
    $<HTMLButtonElement>("ready-button").textContent = mySeat.ready ? "Unready" : "Mark ready";
    if (isHost) syncMapSelect(state.mapId);
    $("start-button").textContent = state.mode === "practice" ? "Start practice" : "Start round";
  } else {
    $<HTMLButtonElement>("ready-button").disabled = true;
    $<HTMLButtonElement>("start-button").disabled = true;
  }

  renderPlayerList(state);

  // Phase transitions UI.
  if (state.phase === "RUNNING") {
    if (!phaserGame) onRoundStarted(state.mapId);
  } else if (state.phase === "LOBBY") {
    hideCountdown();
    hideResults();
    hideGame();
    showDeathOverlay(false);
    showSpectatorBanner(false);
  } else if (state.phase === "FINISHED") {
    hideCountdown();
    // Results overlay reveal is triggered by the round-ended message.
  }
}

function renderPlayerList(state: GravityRoomStateShape): void {
  const list = $<HTMLUListElement>("player-list");
  if (!state.players) return;
  // Build/refresh the displayed list.
  const seen = new Set<string>();
  for (const seat of state.players.values()) {
    seen.add(seat.playerId);
    let li = list.querySelector<HTMLLIElement>(`[data-pid="${seat.playerId}"]`);
    if (!li) {
      li = document.createElement("li");
      li.dataset.pid = seat.playerId;
      li.innerHTML =
        `<span class="swatch"></span>` +
        `<span class="player-name"></span>` +
        `<span class="player-tag"></span>` +
        `<span class="player-ready"></span>`;
      list.appendChild(li);
    }
    const swatch = li.querySelector<HTMLSpanElement>(".swatch");
    if (swatch) swatch.style.background = `#${(seat.color & 0xffffff).toString(16).padStart(6, "0")}`;
    const nameEl = li.querySelector<HTMLSpanElement>(".player-name");
    if (nameEl) nameEl.textContent = seat.displayName;
    const tagEl = li.querySelector<HTMLSpanElement>(".player-tag");
    if (tagEl) {
      const tags: string[] = [];
      if (seat.isHost) tags.push("host");
      if (!seat.connected) tags.push("dc");
      if (seat.spectator) tags.push("spectator");
      if (seat.finished) tags.push(`#${seat.placement}`);
      if (!seat.alive && !seat.spectator && !seat.finished) tags.push("down");
      tagEl.textContent = tags.join(" · ");
    }
    const readyEl = li.querySelector<HTMLSpanElement>(".player-ready");
    if (readyEl) readyEl.textContent = seat.spectator ? "" : seat.ready ? "✔ ready" : "";
  }
  // Remove stale list entries.
  for (const existing of [...list.querySelectorAll<HTMLLIElement>("li")]) {
    if (!seen.has(existing.dataset.pid ?? "")) existing.remove();
  }
}

function syncMapSelect(mapId: string): void {
  const select = $<HTMLSelectElement>("map-select");
  if (select.value !== mapId) select.value = mapId;
}

// ---------- Round transitions ----------
function showCountdown(remainingMs: number): void {
  const overlay = $("countdown-overlay");
  overlay.hidden = false;
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
  $("countdown-text").textContent = remaining > 0 ? String(remaining) : "Go!";
  if (remaining > 0) audio.playCountdown();
  else audio.playFinish();
}

function hideCountdown(): void {
  $<HTMLDivElement>("countdown-overlay").hidden = true;
}

function onRoundStarted(mapId: string): void {
  hideCountdown();
  showDeathOverlay(false);
  const map = ALL_MAPS.find((m) => m.id === mapId) ?? ALL_MAPS[0];
  if (!map) return;
  currentMap = map;
  audio.playFinish();
  showSection("game");
  mountGame(map);
  const mySeat = currentRoom?.state.players.get(PLAYER_ID);
  if (mySeat && mySeat.spectator) showSpectatorBanner(true);
}

function onRoundEnded(_result: unknown): void {
  hideCountdown();
  showDeathOverlay(false);
  // Reveal results overlay.
  showResults();
}

function showResults(): void {
  if (!currentRoom) return;
  const state = currentRoom.state;
  $("results").hidden = false;
  $("result-reason").textContent = prettyReason(state.resultReason);
  const list = $<HTMLOListElement>("results-list");
  list.innerHTML = "";
  const ordered = [...state.leaderboard].sort((a, b) => a.placement - b.placement);
  for (const entry of ordered) {
    const li = document.createElement("li");
    li.classList.add(`placement-${entry.placement}`);
    li.innerHTML =
      `<span class="placement">#${entry.placement}</span>` +
      `<span class="swatch" style="background:${seatColor(entry.playerId)}"></span>` +
      `<span class="player-name">${escapeHtml(entry.displayName)}</span>` +
      `<span class="player-tag">${describeProgress(entry)}</span>`;
    list.appendChild(li);
  }
  $<HTMLSpanElement>("rematch-votes").textContent = String(state.rematchVoters.length);
  $<HTMLSpanElement>("rematch-required").textContent = String(state.rematchRequired);
  if (state.winnerId === PLAYER_ID) audio.playVictory();
  if (state.phase !== "FINISHED") {
    // Race ended locally (e.g. host) - keep the overlay hidden by closing it later when phase flips.
  }
}

function describeProgress(entry: {
  finished: boolean;
  eliminated: boolean;
  progress: number;
  survivalMs: number;
}): string {
  const secs = (entry.survivalMs / 1000).toFixed(1);
  return entry.finished
    ? `${secs}s finished`
    : entry.eliminated
      ? `${secs}s · ${Math.round(entry.progress)}u`
      : `${secs}s · ${Math.round(entry.progress)}u`;
}

function prettyReason(reason: string): string {
  switch (reason) {
    case "finish":
      return "first to finish";
    case "last-survivor":
      return "last survivor";
    case "all-eliminated":
      return "all eliminated";
    case "draw":
      return "draw";
    default:
      return reason;
  }
}

function seatColor(playerId: string): string {
  const seat = currentRoom?.state.players.get(playerId);
  if (!seat) return "#888";
  return `#${(seat.color & 0xffffff).toString(16).padStart(6, "0")}`;
}

function hideResults(): void {
  $("results").hidden = true;
  wantsRematch = false;
}

function showSpectatorBanner(show: boolean): void {
  $<HTMLDivElement>("spectator-banner").hidden = !show;
}

function showDeathOverlay(show: boolean): void {
  $<HTMLDivElement>("death-overlay").hidden = !show;
}

// ---------- Game mount ----------
function mountGame(map: GameMap): void {
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
  }
  if (!currentRoom) return;
  const mount = $<HTMLDivElement>("game-mount");
  mount.hidden = false;
  phaserGame = startGame({
    mount,
    map,
    room: currentRoom,
    localPlayerId: PLAYER_ID,
  });
}

function hideGame(): void {
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
  }
  $<HTMLDivElement>("game-mount").hidden = true;
}

// ---------- Section visibility ----------
function showSection(section: "lobby" | "game"): void {
  const showLobby = section === "lobby";
  $<HTMLDivElement>("lobby").hidden = !showLobby;
  $<HTMLDivElement>("game-mount").hidden = showLobby;
  if (showLobby) hideGame();
  if (!showLobby) hideResults();
}

// ---------- Leave / cleanup ----------
async function leaveRoom(): Promise<void> {
  for (const fn of cleanupFns) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
  cleanupFns = [];
  if (currentRoom) {
    await currentRoom.leave();
    currentRoom = null;
  }
  hideGame();
  hideResults();
  hideCountdown();
  showDeathOverlay(false);
  showSpectatorBanner(false);
  $("room-card").hidden = true;
  network.setStatus("disconnected");
}

function onRoomLeft(): void {
  void leaveRoom();
}

// ---------- Helpers ----------
function readName(): string {
  const value = $<HTMLInputElement>("display-name").value.trim();
  return value;
}

function showInlineError(id: string, message: string): void {
  const el = $<HTMLParagraphElement>(id);
  el.textContent = message;
  el.hidden = false;
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}

// Trigger a render once we are sure the DOM is interactive.
document.addEventListener("DOMContentLoaded", () => {
  if (currentRoom) refreshRoomUI();
});

// Avoid unused symbol warnings for re-exported types.
export type { GravityRoomStateShape, PlayerStateShape };
