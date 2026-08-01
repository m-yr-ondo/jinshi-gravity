import Phaser from "phaser";
import type { GravityRoomController } from "../net.js";

/**
 * Lightweight HUD strip drawn on top of the GameScene. Reads room state each
 * frame to render phase / countdown text, progress and the latest toast.
 *  - phase / countdown text
 *  - local player's progress and survival
 *  - the latest elimination / finish toast
 *  - the connected / disconnected pill
 */
export class HudScene extends Phaser.Scene {
  private room!: GravityRoomController;
  private localPlayerId = "";
  private phaseText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private toastTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super({ key: "HudScene", active: false });
  }

  init(data: { room: GravityRoomController; localPlayerId: string }): void {
    this.room = data.room;
    this.localPlayerId = data.localPlayerId;
  }

  create(): void {
    const w = this.scale.width;

    this.phaseText = this.add
      .text(20, 16, "LOBBY", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(10);

    this.progressText = this.add
      .text(w - 20, 16, "0 / 0", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#a8e8ff",
        stroke: "#000000",
        strokeThickness: 3,
        align: "right",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(10);

    this.toast = this.add
      .text(w / 2, 60, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#ffcc00",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(11)
      .setVisible(false);

    // GameScene emits hud:notice toasts.
    const gameScene = this.scene.get("GameScene");
    gameScene.events.on("hud:notice", (message: string) => this.showToast(message));

    this.scale.on(Phaser.Scale.Events.RESIZE, (size: { width: number; height: number }) => {
      this.progressText.setPosition(size.width - 20, 16);
      this.toast.setPosition(size.width / 2, 60);
    });
  }

  update(): void {
    if (!this.room) return;
    const state = this.room.state;
    const phase = state.phase;
    let label: string = phase;
    if (phase === "COUNTDOWN") {
      const remaining = Math.max(0, state.countdownEndsAt - Date.now());
      label = `Start in ${Math.ceil(remaining / 1000)}s`;
    } else if (phase === "RUNNING") {
      label = "Running";
    } else if (phase === "FINISHED") {
      label = "Finished";
    }
    this.phaseText.setText(label);

    const p = state.players.get(this.localPlayerId);
    if (p) {
      const map = this.room.map;
      const totalX = map ? map.finishX : 1;
      const pct = Math.min(100, Math.max(0, Math.round((p.progress / totalX) * 100)));
      this.progressText.setText(`${pct}% · ${p.alive ? "alive" : p.spectator ? "spectating" : "down"}`);
    } else {
      this.progressText.setText("--");
    }
  }

  private showToast(message: string): void {
    this.toast.setText(message).setVisible(true);
    if (this.toastTimer) this.toastTimer.remove();
    this.toastTimer = this.time.delayedCall(1800, () => this.toast.setVisible(false));
  }
}