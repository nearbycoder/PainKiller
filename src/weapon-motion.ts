/** Deterministic viewmodel motion, independent of render frame rate. */
export class Spring {
  value = 0;
  velocity = 0;
  constructor(
    public stiffness = 180,
    public damping = 22,
  ) {}
  kick(impulse: number) {
    this.velocity += impulse;
  }
  step(dt: number, target = 0) {
    let left = Math.min(dt, 0.1);
    while (left > 0) {
      const h = Math.min(left, 1 / 120);
      this.velocity +=
        ((target - this.value) * this.stiffness -
          this.velocity * this.damping) *
        h;
      this.value += this.velocity * h;
      left -= h;
    }
    return this.value;
  }
}
export class WeaponMotion {
  kick = new Spring(230, 24);
  roll = new Spring(130, 18);
  swayX = new Spring(100, 20);
  swayY = new Spring(100, 20);
  landing = new Spring(160, 20);
  draw = 0;
  inspect = 0;
  flash = 0;
  cycle = 0;
  cycleDuration = 0.7;
  phase = 0;
  spin = 0;
  alt = false;
  id = 1;
  reset() {
    for (const s of [
      this.kick,
      this.roll,
      this.swayX,
      this.swayY,
      this.landing,
    ]) {
      s.value = s.velocity = 0;
    }
    this.flash = this.inspect = this.phase = this.spin = 0;
    this.cycle = this.cycleDuration;
    this.draw = 0.34;
  }
  equip(id: number) {
    this.id = id;
    this.reset();
  }
  look(x: number, y: number) {
    this.swayX.kick(Math.max(-1, Math.min(1, x)) * 0.3);
    this.swayY.kick(Math.max(-1, Math.min(1, y)) * 0.25);
  }
  fire(alt: boolean) {
    this.inspect = 0;
    this.draw = 0;
    this.alt = alt;
    this.kick.kick(
      (alt ? [0.9, 1.5, 2.2, 0.8, 0.65] : [0.85, 4.8, 2.0, 5.2, 1.2])[this.id],
    );
    this.roll.kick((this.id % 2 ? 1 : -1) * (alt ? 0.15 : 0.36));
    this.flash =
      this.id === 0
        ? 0
        : this.id === 4 || (alt && this.id === 1)
          ? 0.085
          : this.id === 3 && !alt
            ? 0.09
            : 0.055;
    this.cycle = 0;
    this.cycleDuration = alt ? 0.3 : [0.14, 0.7, 0.85, 0.72, 0.16][this.id];
  }
  land(speed: number) {
    this.landing.kick(Math.min(12, Math.abs(speed)) * 0.06);
  }
  step(
    dt: number,
    speed: number,
    strafe: number,
    grounded: boolean,
    sprinting: boolean,
  ) {
    this.draw = Math.max(0, this.draw - dt);
    this.inspect = Math.max(0, this.inspect - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.cycle = Math.min(this.cycleDuration, this.cycle + dt);
    this.phase += dt * (2 + speed * 1.1);
    this.spin +=
      ((this.flash > 0 ? 42 : 0) - this.spin) * (1 - Math.exp(-dt * 5));
    const kick = this.kick.step(dt),
      roll = this.roll.step(dt),
      sx = this.swayX.step(dt),
      sy = this.swayY.step(dt),
      landing = this.landing.step(dt);
    const moving = Math.min(speed / 9, 1) * (grounded ? 1 : 0.15),
      draw = this.draw / 0.34;
    const inspect =
      this.inspect > 0 ? Math.sin(Math.PI * (1 - this.inspect / 1.7)) : 0;
    const sprint = sprinting && speed > 8 ? 1 : 0;
    const cycle = this.cycle / this.cycleDuration;
    const pump =
      this.id === 1 && !this.alt
        ? Math.sin(Math.PI * Math.max(0, Math.min(1, (cycle - 0.24) / 0.65)))
        : Math.sin(Math.PI * cycle);
    const sweep =
      this.id === 0
        ? Math.sin(Math.PI * cycle) * (this.alt ? -0.12 : 0.035)
        : 0;
    return {
      x:
        0.28 +
        Math.sin(this.phase) * 0.012 * moving +
        sx -
        inspect * 0.1 +
        sweep,
      y:
        -0.38 -
        Math.abs(Math.cos(this.phase)) * 0.016 * moving -
        landing -
        draw * 0.42 -
        sprint * 0.045 -
        inspect * 0.045,
      z:
        -0.74 +
        kick +
        draw * 0.18 -
        (this.id === 0 ? Math.sin(Math.PI * cycle) * 0.08 : 0),
      rx:
        kick * (this.id === 1 || this.id === 3 ? 1.7 : 0.9) +
        sy +
        draw * 0.5 +
        inspect * 0.24,
      ry: inspect * -0.65 + sx * 2 + sweep,
      rz: roll - strafe * 0.006 + inspect * 0.65 + sprint * 0.08 + sweep * 2,
      mechanical: pump,
    };
  }
}
