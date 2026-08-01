import Phaser from "phaser";
import { SIM_CONFIG, type GameMap } from "@jinshi-gravity/shared";
import type { GravityRoomController, GravityRoomStateShape, PlayerStateShape } from "../net.js";
import { audio } from "../util/audio.js";

const BG_COLOR = 0x0a0a14;
const FLOOR_COLOR = 0x2a2a4e;
const HAZARD_COLOR = 0xff3366;
const CEILING_COLOR = 0x224c66;
const FINISH_COLOR = 0x00ffcc;

interface PlayerRig {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle;
  eye: Phaser.GameObjects.Arc;
  arrow: Phaser.GameObjects.Triangle;
  label: Phaser.GameObjects.Text;
  displayX: number;
  displayY: number;
  lastServerX: number;
  lastServerY: number;
  lastUpdateMs: number;
  alive: boolean;
}

/**
 * Phaser scene that renders the authoritative race. Server state is the
 * source-of-truth for every visible value. We:
 *  - draw the loaded map (shared between server and client) using Phaser primitives
 *  - replicate per-player state into display objects once per frame
 *  - apply horizontal interpolation/extrapolation between 20 Hz server updates
 *  - drive the camera from the local player's predicted position
 *  - forward keyboard / mouse switch input to the server immediately, with the
 *    local player mirroring the response so the controls feel instantaneous.
 */
export class GameScene extends Phaser.Scene {
  private room!: GravityRoomController;
  private map!: GameMap;
  private rigs = new Map<string, PlayerRig>();
  private localPlayerId = "";
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private lastServerStateMs = 0;
  private spectatorsVisible = false;
  private finishLine!: Phaser.GameObjects.Rectangle;
  private resizeListener?: () => void;

  constructor() {
    super({ key: "GameScene", active: false });
  }

  init(data: { room: GravityRoomController; map: GameMap; localPlayerId: string }): void {
    this.room = data.room;
    this.map = data.map;
    this.localPlayerId = data.localPlayerId;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BG_COLOR);
    this.cameras.main.setRoundPixels(true);

    // World bounds follow the map.
    this.physics.world.setBounds(0, 0, this.map.width, this.map.height);
    this.cameras.main.setBounds(0, 0, this.map.width, this.map.height);

    this.drawMap();

    // Finish line.
    this.finishLine = this.add
      .rectangle(this.map.finishX, 0, 8, this.map.height, FINISH_COLOR, 0.35)
      .setOrigin(0, 0)
      .setDepth(3);

    // Keyboard + mouse input.
    if (this.input.keyboard) {
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.input.keyboard.on("keydown-SPACE", this.onSwitchInput, this);
      this.input.keyboard.on("keydown-UP", this.onSwitchInput, this);
    }
    this.input.on("pointerdown", this.onSwitchInput, this);

    // Hook onStateChange so the HUD / spec can react. We re-render each frame
    // independently of when state arrives (interpolating).
    this.room.sdk.onStateChange(() => {
      this.lastServerStateMs = this.time.now;
      this.syncPlayersFromState();
    });
    this.room.sdk.onMessage("eliminated", (msg: { playerId: string; cause: string }) => {
      if (msg.playerId === this.localPlayerId) audio.playDeath();
      this.events.emit("hud:notice", `eliminated: ${this.shortName(msg.playerId)}`);
    });
    this.room.sdk.onMessage("finished", (msg: { playerId: string; placement: number }) => {
      if (msg.playerId === this.localPlayerId) audio.playFinish();
      this.events.emit("hud:notice", `#${msg.placement}: ${this.shortName(msg.playerId)}`);
    });

    // Browser resize handling (logical resample handled by Phaser internals).
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutCamera, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerdown", this.onSwitchInput, this);
      if (this.input.keyboard) {
        this.input.keyboard.off("keydown-SPACE", this.onSwitchInput, this);
        this.input.keyboard.off("keydown-UP", this.onSwitchInput, this);
      }
    });
  }

  update(_time: number, deltaMs: number): void {
    const state = this.room.state;
    const phase = state.phase;
    const rig = this.rigs.get(this.localPlayerId);
    const leaderRig = rig ?? this.findLeaderRig();

    // Predict forward movement for the local player using its authoritative vx.
    // Other players: simple lerp toward server position.
    for (const [pid, r] of this.rigs) {
      const p = state.players.get(pid);
      if (!p) continue;
      const dt = (this.time.now - r.lastUpdateMs) / 1000;
      if (pid === this.localPlayerId && (phase === "RUNNING" || phase === "COUNTDOWN")) {
        // Extrapolate from last server sample using vx.
        const predictedX = r.lastServerX + p.vx * Math.max(0, dt);
        // Vertical: simple linear ease toward server value (cheap).
        r.displayX += (predictedX - r.displayX) * 0.6;
        r.displayY += (p.y - r.displayY) * 0.4;
      } else {
        r.displayX += (p.x - r.displayX) * 0.3;
        r.displayY += (p.y - r.displayY) * 0.3;
      }
      r.container.setPosition(r.displayX, r.displayY);
      r.container.setVisible(p.spectator === false || this.spectatorsVisible === true ? true : !p.spectator);
      r.container.setAlpha(p.spectator ? 0.45 : 1);
      r.body.setFillStyle(p.color, p.alive ? 1 : 0.4);
      r.alive = p.alive;
      // Arrow rotation indicates gravity dir.
      const flip = p.gravityDir < 0;
      r.arrow.setRotation(flip ? Math.PI : 0);
      r.label.setText(`${p.displayName}${p.isHost ? " ★" : ""}`);
    }

    // Camera follow the local rig (or the leader if local is dead / spectator).
    const target = leaderRig?.container ?? this.findLeaderRig()?.container;
    if (target) {
      const cam = this.cameras.main;
      const focusX = target.x;
      const desiredScrollX = Phaser.Math.Clamp(
        focusX - cam.width / 2,
        0,
        Math.max(0, this.map.width - cam.width),
      );
      cam.scrollX += (desiredScrollX - cam.scrollX) * 0.12;
      cam.scrollY = 0;
      cam.setZoom(1);
    }

    // Eliminate far-behind players visually by hiding once they exit camera view.
    if (this.finishLine) this.finishLine.setVisible(true);

    // Suppress "unused" hint.
    void deltaMs;
  }

  // ---------- Map / players rendering ----------

  private drawMap(): void {
    // Decorative grid background.
    const grid = this.add.graphics();
    grid.fillStyle(0x11112a, 1);
    grid.fillRect(0, 0, this.map.width, this.map.height);
    grid.lineStyle(1, 0x1a1a36, 0.6);
    for (let x = 0; x < this.map.width; x += 80) {
      grid.lineBetween(x, 0, x, this.map.height);
    }
    for (let y = 0; y < this.map.height; y += 80) {
      grid.lineBetween(0, y, this.map.width, y);
    }
    grid.setDepth(0).setScrollFactor(1).setBlendMode(Phaser.BlendModes.ADD);

    // Solids (floors + ceilings).
    for (const s of this.map.solids) {
      this.add.rectangle(s.x, s.y, s.w, s.h, FLOOR_COLOR, 0.92).setOrigin(0, 0).setDepth(1);
      this.add.rectangle(s.x, s.y, s.w, 4, 0x00ffcc, 0.4).setOrigin(0, 0).setDepth(2);
    }

    // Hazards: triangles with subtle animation via gradient.
    for (const h of this.map.hazards) {
      const shape = this.add.graphics();
      shape.fillStyle(HAZARD_COLOR, 0.85);
      shape.beginPath();
      const segs = Math.max(2, Math.floor(h.w / 24));
      const step = h.w / segs;
      for (let i = 0; i < segs; i++) {
        const x0 = h.x + i * step;
        shape.moveTo(x0, h.y + h.h);
        shape.lineTo(x0 + step / 2, h.y);
        shape.lineTo(x0 + step, h.y + h.h);
        shape.closePath();
      }
      shape.fillPath();
      shape.setDepth(2);
      // Strobe pulse.
      this.tweens.add({
        targets: shape,
        alpha: 0.5,
        duration: 320,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Decorations (stars / arrows).
    if (this.map.decorations) {
      for (const d of this.map.decorations) {
        if (d.type === "star") {
          this.add
            .star(d.x, d.y, 5, 4, 9, d.color ?? 0xffffff, 0.6)
            .setDepth(0);
        } else if (d.type === "arrow") {
          this.add
            .triangle(d.x, d.y, -16, -16, 16, 0, -16, 16, d.color ?? 0xffffff, 0.7)
            .setDepth(0);
        }
      }
    }
  }

  private syncPlayersFromState(): void {
    const state = this.room.state;
    if (!state) return;
    for (const [pid, p] of state.players.entries()) {
      let r = this.rigs.get(pid);
      if (!r) r = this.createRig(p);
      r.lastServerX = p.x;
      r.lastServerY = p.y;
      r.lastUpdateMs = this.time.now;
    }
    // Drop rigs whose seat was permanently removed.
    for (const [pid] of this.rigs) {
      if (!state.players.has(pid)) {
        const r = this.rigs.get(pid);
        if (r) {
          r.container.destroy();
          this.rigs.delete(pid);
        }
      }
    }
  }

  private createRig(p: PlayerStateShape): PlayerRig {
    const container = this.add.container(p.x, p.y).setDepth(4);
    const w = SIM_CONFIG.playerWidth;
    const h = SIM_CONFIG.playerHeight;
    const body = this.add.rectangle(0, 0, w, h, p.color, 1).setOrigin(0.5, 0.5);
    const eye = this.add.circle(w / 4, -h / 6, 3, 0xffffff, 0.95);
    const arrow = this.add.triangle(0, h / 2 + 6, -6, 6, 6, 6, 0, -6, p.color, 1);
    const label = this.add
      .text(0, -h, p.displayName, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "12px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setScale(0.8);
    container.add([body, eye, arrow, label]);
    return {
      container,
      body,
      eye,
      arrow,
      label,
      displayX: p.x,
      displayY: p.y,
      lastServerX: p.x,
      lastServerY: p.y,
      lastUpdateMs: this.time.now,
      alive: p.alive,
    };
  }

  private findLeaderRig(): PlayerRig | undefined {
    const state = this.room.state;
    let leadX = Number.NEGATIVE_INFINITY;
    let leadId: string | undefined;
    for (const [pid, p] of state.players.entries()) {
      if (!p.spectator && p.alive && !p.finished && p.x > leadX) {
        leadX = p.x;
        leadId = pid;
      }
    }
    return leadId ? this.rigs.get(leadId) : undefined;
  }

  private onSwitchInput(): void {
    audio.resume();
    audio.playSwitch();
    // Send the switch intent - server remains authoritative.
    this.room.sendGravitySwitch(Date.now());
    // Local prediction: instantly flip the gravity arrow + apply a vy bump for
    // immediate visual responsiveness. The server guarantees determinism.
    const state = this.room.state;
    const p = state.players.get(this.localPlayerId);
    if (!p) return;
    if (!p.alive || p.finished || p.spectator) return;
    if (state.phase !== "RUNNING") return;
    const r = this.rigs.get(this.localPlayerId);
    if (!r) return;
    // Display the new gravity direction immediately while we wait for confirmation.
    const flip = p.gravityDir < 0;
    r.arrow.setRotation(flip ? 0 : Math.PI);
  }

  private shortName(pid: string): string {
    const state = this.room.state;
    const p = state.players.get(pid);
    return p ? p.displayName : pid.slice(0, 8);
  }

  private layoutCamera(): void {
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    cam.setBounds(0, 0, this.map.width, this.map.height);
  }

  // Allow outside code to make spectator-flag toggles (e.g. show dead players).
  setSpectatorsVisible(v: boolean): void {
    this.spectatorsVisible = v;
  }
}