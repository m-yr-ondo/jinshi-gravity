import type { GravitySimulation } from "@jinshi-gravity/shared";
import type { PlayerState } from "./state.js";

/**
 * Push a projection of the simulation per-player state into the Colyseus schema
 * for replication. The simulation remains source-of-truth; schema mirrors it.
 */
export function syncState(
  sim: GravitySimulation,
  schemaPlayers: Map<string, PlayerState>,
): void {
  for (const p of sim.players.values()) {
    const wire = schemaPlayers.get(p.playerId);
    if (!wire) continue;
    wire.x = p.x;
    wire.y = p.y;
    wire.vx = p.vx;
    wire.vy = p.vy;
    wire.progress = p.progress;
    wire.gravityDir = p.gravityDir;
    wire.grounded = p.grounded;
    wire.alive = p.alive;
    wire.finished = p.finished;
    wire.finishTimeMs = p.finishTimeMs;
    wire.survivalMs = p.survivalMs;
    wire.connected = p.connected;
    if (!p.alive && !wire.eliminated) {
      wire.eliminated = true;
    }
    wire.placement = computeLivePlacement(sim, p.playerId);
  }
}

/**
 * Compute placement 1..n for a freshly finished/eliminated player based on
 * simulation state. Order: finishers by finish time asc, then dead by progress
 * desc then survivalMs desc. Done eagerly so spectators see live placements.
 */
function computeLivePlacement(
  sim: GravitySimulation,
  playerId: string,
): number {
  const all = [...sim.players.values()];
  all.sort((a, b) => {
    if (a.finished && b.finished) return a.finishTimeMs - b.finishTimeMs;
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    if (a.alive && !b.alive) return -1;
    if (!a.alive && b.alive) return 1;
    if (a.progress !== b.progress) return b.progress - a.progress;
    return b.survivalMs - a.survivalMs;
  });
  const idx = all.findIndex((p) => p.playerId === playerId);
  return idx >= 0 ? idx + 1 : 0;
}