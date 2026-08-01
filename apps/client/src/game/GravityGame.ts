import Phaser from "phaser";
import type { GameMap } from "@jinshi-gravity/shared";
import type { GravityRoomController } from "../net.js";
import { GameScene } from "./GameScene.js";
import { HudScene } from "./HudScene.js";

export interface StartGameOptions {
  mount: HTMLDivElement;
  room: GravityRoomController;
  map: GameMap;
  localPlayerId: string;
  initialWidth?: number;
  initialHeight?: number;
}

/**
 * Create and start the Phaser.Game instance for the active round. Returns the
 * game object so the caller can destroy it when the player leaves.
 */
export function startGame(opts: StartGameOptions): Phaser.Game {
  const width = opts.initialWidth ?? opts.mount.clientWidth ?? 1280;
  const height = opts.initialHeight ?? opts.mount.clientHeight ?? 720;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: opts.mount,
    backgroundColor: "#0a0a14",
    width,
    height,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    fps: {
      target: 60,
    },
    render: {
      antialias: true,
      powerPreference: "high-performance",
    },
    scene: [GameScene, HudScene],
    input: {
      activePointers: 1,
    },
    callbacks: {
      postBoot(g) {
        const scene = g.scene.getScene("GameScene") as GameScene;
        scene.scene.start("GameScene", {
          room: opts.room,
          map: opts.map,
          localPlayerId: opts.localPlayerId,
        });
        const hud = g.scene.getScene("HudScene") as HudScene;
        hud.scene.start("HudScene", {
          room: opts.room,
          localPlayerId: opts.localPlayerId,
        });
      },
    },
  });

  return game;
}