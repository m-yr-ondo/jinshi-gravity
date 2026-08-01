type Status = "connected" | "reconnecting" | "disconnected";

const LABELS: Record<Status, string> = {
  connected: "Connected",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected",
};

export class NetworkIndicator {
  private readonly indicator: HTMLElement | null;
  private readonly label: HTMLElement | null;
  private readonly dot: HTMLElement | null;

  constructor(root: HTMLElement) {
    this.indicator = root.querySelector<HTMLElement>("#network-indicator");
    this.label = root.querySelector<HTMLElement>(".net-label");
    this.dot = root.querySelector<HTMLElement>(".net-dot");
  }

  setStatus(status: Status): void {
    if (!this.indicator) return;
    this.indicator.classList.remove("connected", "reconnecting", "disconnected");
    this.indicator.classList.add(status);
    if (this.label && LABELS[status]) this.label.textContent = LABELS[status];
  }
}