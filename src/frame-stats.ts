/** Frames per second and the slowest frame, over windows of about a second. */
export class FrameStats {
  /** The last completed window: frames per second and the slowest frame, ms. */
  fps = 0;
  worst = 0;
  private frames = 0;
  private time = 0;
  private slowest = 0;
  /** Count one displayed frame that took `ms`. A gap over a second (a hidden tab) restarts. */
  add(ms: number) {
    if (!(ms > 0) || ms > 1000) {
      this.frames = this.time = this.slowest = 0;
      return;
    }
    this.frames++;
    this.time += ms;
    this.slowest = Math.max(this.slowest, ms);
    if (this.time >= 1000) {
      this.fps = (this.frames * 1000) / this.time;
      this.worst = this.slowest;
      this.frames = this.time = this.slowest = 0;
    }
  }
  /** The readout: "144 FPS · WORST 6.9 MS". */
  label() {
    return this.fps
      ? `${Math.round(this.fps)} FPS · WORST ${this.worst.toFixed(1)} MS`
      : "";
  }
}
