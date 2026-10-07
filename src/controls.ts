import type { Game } from "./game";
import { clamp } from "./core";
import { PAD_ACTIONS, PAD_START, type PadAction } from "./bindings";

/** Controller actions that fire once when their button goes down. */
const PAD_PRESSES = PAD_ACTIONS.map(([a]) => a).filter(
  (a) => !["primary", "alternate", "jump", "sprint"].includes(a),
);

/**
 * A stick axis after the dead zone, rescaled so full tilt is still 1. `exponent` shapes
 * the response: 1 is linear, 2 ("precise") turns slower near the centre.
 */
export function stickAxis(value: number, deadzone = 0.18, exponent = 1) {
  if (Math.abs(value) <= deadzone) return 0;
  const t = Math.min(1, (Math.abs(value) - deadzone) / (1 - deadzone));
  return Math.sign(value) * t ** exponent;
}
/**
 * Sprint in toggle mode, once per simulation step: a fresh press of sprint starts or
 * stops running, and running ends when the player stops moving.
 */
export function toggleSprint(
  running: boolean,
  pressed: boolean,
  moving: boolean,
) {
  if (pressed) running = !running;
  return running && moving;
}
/** The look exponent for each _Look response_ choice. */
export const LOOK_CURVES = [1, 2];
export type RumbleKind = "hurt" | "shockwave" | "explosion" | "wraith";
/**
 * Controller rumble for an event: strong (low-frequency) and weak (high-frequency) motor
 * magnitudes, 0–1, and a duration in ms. `amount` is 0–1: damage taken / 40 for hits,
 * closeness for explosions.
 */
export function rumbleFor(kind: RumbleKind, amount = 1) {
  const a = clamp(amount, 0, 1);
  if (kind === "shockwave") return { strong: 1, weak: 0.7, duration: 380 };
  if (kind === "wraith") return { strong: 0.45, weak: 1, duration: 600 };
  if (kind === "explosion")
    return { strong: 0.7 * a, weak: 0.3 * a, duration: 160 + 120 * a };
  return {
    strong: 0.25 + 0.6 * a,
    weak: 0.35 + 0.5 * a,
    duration: 90 + 160 * a,
  };
}
/** Touch and standard-mapped controllers share the same gameplay actions. */
export class Controls {
  moveX = 0;
  moveY = 0;
  primary = false;
  secondary = false;
  jump = false;
  sprint = false;
  connected = false;
  mobile = false;
  private touchX = 0;
  private touchY = 0;
  private held = new Set<string>();
  private previous: boolean[] = [];
  private wasConnected = false;
  private repeat = 0;
  private element: HTMLElement;
  private cancelGestures: (() => void)[] = [];
  /**
   * While the Controls page listens for a controller button, every newly pressed button
   * goes here instead of to the menus (Start included, so the page can cancel).
   */
  capture: ((button: number) => void) | null = null;
  private pad: Gamepad | null = null;
  constructor(private game: Game) {
    this.element = document.createElement("div");
    this.element.id = "touch-controls";
    this.element.innerHTML = `<div id="touch-move" role="group" aria-label="Movement joystick"><i></i><span>MOVE</span></div><div id="touch-look" aria-label="Drag to look"></div><div class="touch-actions"><button data-touch="secondary" aria-label="Alternate fire">ALT</button><button data-touch="primary" class="touch-fire" aria-label="Fire">FIRE</button><button data-touch="jump" aria-label="Jump">JUMP</button><button data-touch="sprint" aria-label="Sprint">RUN</button></div><div class="touch-tools"><button data-touch="previous" aria-label="Previous weapon">◀</button><button data-touch="next" aria-label="Next weapon">▶</button><button data-touch="use" aria-label="Use gate">USE</button><button data-touch="tarot" aria-label="Activate tarot">TAROT</button><button data-touch="inspect" aria-label="Inspect weapon">INSPECT</button><button data-touch="pause" aria-label="Pause">Ⅱ</button></div><span id="touch-rotate">Landscape gives you a wider view</span>`;
    document.body.append(this.element);
    // The touch layout follows the input, not the window's width: a mouse in a narrow
    // window still aims with the mouse. A touch on a touchscreen laptop switches to it,
    // and the mouse moving or clicking switches back.
    const coarse = matchMedia("(pointer: coarse)");
    const layout = (touch: boolean) => {
      this.mobile = touch;
      document.body.classList.toggle("touch-layout", touch);
    };
    layout(coarse.matches);
    coarse.addEventListener?.("change", () => layout(coarse.matches));
    window.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "touch") layout(true);
        else if (e.pointerType === "mouse") layout(false);
      },
      true,
    );
    window.addEventListener("pointermove", (e) => {
      if (
        this.mobile &&
        e.pointerType === "mouse" &&
        (e.movementX || e.movementY)
      )
        layout(false);
    });
    const move = this.element.querySelector<HTMLElement>("#touch-move")!;
    let moving: number | undefined,
      startX = 0,
      startY = 0;
    move.addEventListener("pointerdown", (e) => {
      if (this.game.mode !== "playing" || moving !== undefined) return;
      e.preventDefault();
      moving = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      move.setPointerCapture(e.pointerId);
    });
    move.addEventListener("pointermove", (e) => {
      if (e.pointerId !== moving) return;
      const dx = e.clientX - startX,
        dy = e.clientY - startY,
        len = Math.max(48, Math.hypot(dx, dy));
      this.touchX = dx / len;
      this.touchY = dy / len;
      move.style.setProperty("--jx", `${this.touchX * 34}px`);
      move.style.setProperty("--jy", `${this.touchY * 34}px`);
    });
    const endMove = (e: PointerEvent) => {
      if (e.pointerId !== moving) return;
      moving = undefined;
      this.touchX = this.touchY = 0;
      move.style.setProperty("--jx", "0px");
      move.style.setProperty("--jy", "0px");
    };
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      move.addEventListener(event, endMove as EventListener);
    const look = this.element.querySelector<HTMLElement>("#touch-look")!;
    let looking: number | undefined,
      lx = 0,
      ly = 0;
    look.addEventListener("pointerdown", (e) => {
      if (this.game.mode !== "playing" || looking !== undefined) return;
      e.preventDefault();
      looking = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      look.setPointerCapture(e.pointerId);
    });
    look.addEventListener("pointermove", (e) => {
      if (e.pointerId !== looking || this.game.mode !== "playing") return;
      this.look(
        (e.clientX - lx) * this.game.sensitivity * 1.25,
        (e.clientY - ly) * this.game.sensitivity * 1.25,
      );
      lx = e.clientX;
      ly = e.clientY;
    });
    this.cancelGestures.push(() => {
      const id = moving;
      moving = undefined;
      if (id !== undefined && move.hasPointerCapture(id))
        move.releasePointerCapture(id);
    });
    this.cancelGestures.push(() => {
      const id = looking;
      looking = undefined;
      if (id !== undefined && look.hasPointerCapture(id))
        look.releasePointerCapture(id);
    });
    const endLook = (e: PointerEvent) => {
      if (e.pointerId === looking) looking = undefined;
    };
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      look.addEventListener(event, endLook as EventListener);
    for (const button of Array.from(
      this.element.querySelectorAll<HTMLButtonElement>("button"),
    )) {
      const pointers = new Set<number>();
      const action = button.dataset.touch!;
      button.addEventListener("pointerdown", (e) => {
        if (this.game.mode !== "playing") return;
        e.preventDefault();
        pointers.add(e.pointerId);
        button.setPointerCapture(e.pointerId);
        this.held.add(action);
        button.classList.add("held");
        this.action(action);
        this.game.sound.start();
      });
      this.cancelGestures.push(() => {
        for (const id of pointers)
          if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
        pointers.clear();
      });
      const end = (e: PointerEvent) => {
        pointers.delete(e.pointerId);
        if (!pointers.size) {
          this.held.delete(action);
          button.classList.remove("held");
        }
      };
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
        button.addEventListener(event, end as EventListener);
    }
    window.addEventListener("blur", () => this.clear());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.clear();
    });
  }
  private action(action: string) {
    const g = this.game;
    if (action === "previous") g.equip((g.weapon + 4) % 5);
    if (action === "next") g.equip((g.weapon + 1) % 5);
    if (action === "inspect") g.weaponMotion.inspect = 1.7;
    if (action === "use") g.useGate();
    if (action === "tarot") g.activateCard();
    if (action === "pause") g.setMode("paused");
  }
  private look(x: number, y: number) {
    this.game.yaw -= x;
    this.game.pitch = clamp(
      this.game.pitch - y * (this.game.invertY ? -1 : 1),
      -1.45,
      1.45,
    );
    this.game.weaponMotion.look(x * 10, y * 10);
  }
  clear() {
    this.moveX = this.moveY = this.touchX = this.touchY = 0;
    this.primary = this.secondary = this.jump = this.sprint = false;
    this.held.clear();
    this.element
      .querySelectorAll(".held")
      .forEach((b) => b.classList.remove("held"));
    const stick = this.element.querySelector<HTMLElement>("#touch-move")!;
    stick.style.setProperty("--jx", "0px");
    stick.style.setProperty("--jy", "0px");
    this.cancelGestures.forEach((cancel) => cancel());
  }
  poll(dt: number, pads?: readonly (Gamepad | null)[]) {
    let gamepads = pads;
    if (!gamepads)
      try {
        gamepads = navigator.getGamepads?.() || [];
      } catch {
        gamepads = [];
      }
    const pad = Array.from(gamepads).find(
      (p) => p?.connected && p.mapping === "standard",
    );
    this.connected = !!pad;
    this.pad = pad ?? null;
    document.body.classList.toggle("controller-active", this.connected);
    if (this.wasConnected && !pad && this.game.mode === "playing")
      this.game.setMode("paused");
    this.wasConnected = !!pad;
    const down = pad
      ? Array.from(pad.buttons, (b) => b.pressed || b.value > 0.5)
      : [];
    const press = (i: number) => !!down[i] && !this.previous[i];
    if (this.capture && this.game.mode !== "playing") {
      const button = down.findIndex((d, i) => d && !this.previous[i]);
      this.previous = down;
      this.moveX = this.moveY = 0;
      this.primary = this.secondary = this.jump = this.sprint = false;
      if (button >= 0) this.capture(button);
      return;
    }
    if (press(PAD_START)) {
      if (this.game.mode === "playing") this.game.setMode("paused");
      else if (this.game.mode === "paused") this.game.setMode("playing");
    }
    if (this.game.mode === "playing") {
      const bound = this.game.padBindings;
      const padHeld = (a: PadAction) => {
        const button = bound[a];
        return button !== null && !!down[button];
      };
      const zone = this.game.stickDeadzone,
        curve = LOOK_CURVES[this.game.lookCurve] ?? 1,
        // Swapped (left-handed): the right stick moves and the left looks.
        [mx, my, lx, ly] = this.game.swapSticks ? [2, 3, 0, 1] : [0, 1, 2, 3];
      this.moveX = clamp(
        this.touchX + (pad ? stickAxis(pad.axes[mx] || 0, zone) : 0),
        -1,
        1,
      );
      this.moveY = clamp(
        this.touchY + (pad ? stickAxis(pad.axes[my] || 0, zone) : 0),
        -1,
        1,
      );
      this.primary = this.held.has("primary") || padHeld("primary");
      this.secondary = this.held.has("secondary") || padHeld("alternate");
      this.jump = this.held.has("jump") || padHeld("jump");
      this.sprint = this.held.has("sprint") || padHeld("sprint");
      if (pad)
        this.look(
          stickAxis(pad.axes[lx] || 0, zone, curve) *
            dt *
            2.5 *
            this.game.stickSpeed,
          stickAxis(pad.axes[ly] || 0, zone, curve) *
            dt *
            2 *
            this.game.stickSpeed,
        );
      for (const action of PAD_PRESSES) {
        const button = bound[action];
        if (button !== null && press(button) && this.game.mode === "playing")
          this.game.press(action);
      }
    } else {
      this.moveX = this.moveY = 0;
      this.primary = this.secondary = this.jump = this.sprint = false;
      this.repeat -= dt;
      const axis = pad ? stickAxis(pad.axes[1] || 0) : 0;
      const direction =
        down[12] || axis < -0.5
          ? "ArrowUp"
          : down[13] || axis > 0.5
            ? "ArrowDown"
            : null;
      if (direction && this.repeat <= 0) {
        this.key(direction);
        this.repeat = 0.22;
      } else if (!direction) this.repeat = 0;
      if (press(0)) (document.activeElement as HTMLElement)?.click();
      if (press(1)) this.key("Escape");
      // D-pad and horizontal stick also adjust the focused options slider.
      const focused = document.activeElement;
      if (
        focused instanceof HTMLInputElement &&
        focused.type === "range" &&
        (press(14) || press(15))
      ) {
        focused.value = String(
          clamp(
            Number(focused.value) +
              (press(15) ? 1 : -1) * Number(focused.step || 1),
            Number(focused.min),
            Number(focused.max),
          ),
        );
        focused.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    this.previous = down;
  }
  /** Rumble the active controller, if it can and vibration is on. */
  rumble(kind: RumbleKind, amount = 1) {
    const actuator = this.pad?.vibrationActuator as
      | { playEffect?: (type: string, params: object) => Promise<unknown> }
      | null
      | undefined;
    if (!this.game.vibration || !actuator?.playEffect) return false;
    const r = rumbleFor(kind, amount);
    if (r.strong + r.weak < 0.05) return false;
    try {
      void actuator
        .playEffect("dual-rumble", {
          startDelay: 0,
          duration: Math.round(r.duration),
          strongMagnitude: r.strong,
          weakMagnitude: r.weak,
        })
        ?.catch?.(() => {});
    } catch {
      return false;
    }
    return true;
  }
  private key(code: string) {
    (document.activeElement || document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: code, code, bubbles: true }),
    );
  }
}
