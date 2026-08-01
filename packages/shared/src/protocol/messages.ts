/**
 * Client -> server message envelopes.
 * Only intentions cross the wire. The server is authoritative for all
 * positions, velocities, results and scores.
 */
export type ClientMessage =
  | { type: "set-name"; name: string }
  | { type: "set-ready"; ready: boolean }
  | { type: "select-map"; mapId: string }
  | { type: "start-round" }
  | { type: "request-practice" }
  | { type: "gravity-switch"; sequence: number; clientTime: number }
  | { type: "vote-rematch"; rematch: boolean };

/**
 * Server -> client message envelopes (room.broadcast or client.send).
 * State is also pushed via Colyseus schema at the configured broadcast rate.
 */
export type ServerMessage =
  | { type: "info"; message: string }
  | { type: "error"; code: string; message: string }
  | { type: "countdown"; remainingMs: number }
  | { type: "round-started"; mapId: string; startedAt: string }
  | { type: "eliminated"; playerId: string; cause: string }
  | { type: "finished"; playerId: string; placement: number }
  | { type: "round-ended"; result: unknown }
  | { type: "rematch-update"; voters: number; required: number; deadlineMs: number };

export const CLIENT_MESSAGE_TYPES = [
  "set-name",
  "set-ready",
  "select-map",
  "start-round",
  "request-practice",
  "gravity-switch",
  "vote-rematch",
] as const;

export const SERVER_MESSAGE_TYPES = [
  "info",
  "error",
  "countdown",
  "round-started",
  "eliminated",
  "finished",
  "round-ended",
  "rematch-update",
] as const;

/** Type guard the server uses to validate incoming client messages. */
export function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.type !== "string") return false;
  switch (v.type) {
    case "set-name":
      return typeof v.name === "string";
    case "set-ready":
      return typeof v.ready === "boolean";
    case "select-map":
      return typeof v.mapId === "string";
    case "start-round":
    case "request-practice":
      return true;
    case "gravity-switch":
      return (
        typeof v.sequence === "number" &&
        Number.isFinite(v.sequence) &&
        typeof v.clientTime === "number" &&
        Number.isFinite(v.clientTime)
      );
    case "vote-rematch":
      return typeof v.rematch === "boolean";
    default:
      return false;
  }
}