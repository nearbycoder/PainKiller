import { Game } from "./game";
import { LEVELS, CHAPTERS, WEAPONS, CARDS } from "./data";
import { formatTime, freshSave } from "./core";
import { AMMUNITION } from "./ammunition";
import { defaults, type Settings } from "./settings";
import {
  ACTIONS,
  bind,
  bindable,
  cloneBindings,
  DEFAULT_BINDINGS,
  keyLabel,
  SLOTS,
  unbind,
  bindPad,
  clonePadBindings,
  DEFAULT_PAD_BINDINGS,
  PAD_ACTIONS,
  PAD_START,
  padBindable,
  padLabel,
  type Action,
  type PadAction,
} from "./bindings";
declare const __APP_VERSION__: string;
const seal = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 2 44 13v22L24 46 4 35V13Z" fill="none" stroke="currentColor"/><path d="M21 9h6v11h10v5H27v15h-6V25H11v-5h10z" fill="currentColor"/><path d="M24 2v7M24 40v6M4 13l9 5m22 12 9 5M4 35l9-5m22-12 9-5" stroke="currentColor"/></svg>`;
const roman = ["I", "II", "III", "IV", "V"];
const icon = (id: number) =>
  [
    '<path d="M12 35h43l16-8 10 8-10 8-16-8M65 35l8-22m-8 22 19-10m-19 10 13 19m-13-19L52 17"/>',
    '<path d="M8 40h28l7-8h47M42 36h48M37 37l-9 16H15l9-16M47 30v10m7-10v10m7-10v10"/>',
    '<path d="M10 38h26l8-11h40l10 8-10 5H42M39 33h52M17 38l-6 15h15l8-15M47 42h29"/>',
    '<path d="M7 29h19v17H7zm19-3h53v15H26zm53-3h12v21H79M33 41l-8 13h16l7-13M50 45h38m-38 5h38"/>',
    '<path d="M8 37h27l11-10h27l14-10m-14 24 14 10M45 26v18m7-18v18m7-18v18m7-18v18M33 37l-9 17H12l9-17M76 33h17"/>',
  ][id];
const gunIcon = (id: number) =>
  `<svg viewBox="0 0 100 65" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true">${icon(id)}</svg>`;
export class UI {
  root: HTMLElement;
  page = "home";
  chapter = 1;
  selectedLevel = 0;
  armory = 1;
  settingsTab = "video";
  dialog = "";
  lastMode = "";
  lastHover = 0;
  /** The binding slot waiting for a key or mouse button, if any. */
  rebinding: { action: Action; slot: number } | null = null;
  rebindNote = "";
  /** The controller action waiting for a button, if any. */
  padRebinding: PadAction | null = null;
  padNote = "";
  private swallowClick = false;
  constructor(public game: Game) {
    this.root = document.getElementById("app")!;
    // While a binding slot is listening, the next mouse button is the binding.
    window.addEventListener(
      "mousedown",
      (e) => {
        if (!this.rebinding) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.swallowClick = true;
        this.capture("Mouse" + e.button);
      },
      true,
    );
    for (const type of ["click", "auxclick", "contextmenu", "mouseup"])
      window.addEventListener(
        type,
        (e) => {
          if (!this.swallowClick) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          if (type === "click" || type === "auxclick")
            this.swallowClick = false;
        },
        true,
      );
    game.onChange = () => this.render();
    game.onHUD = () => this.hud();
    this.root.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-action]",
      );
      if (target && !target.hasAttribute("disabled")) {
        game.sound.menu(true);
        this.action(target.dataset.action!, target.dataset.value);
      }
    });
    this.root.addEventListener("focusin", (e) => {
      this.root
        .querySelectorAll(".nav-current")
        .forEach((x) => x.classList.remove("nav-current"));
      (e.target as HTMLElement)
        .closest(".menu-command")
        ?.classList.add("nav-current");
    });
    this.root.addEventListener("pointerover", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (
        b &&
        !b.disabled &&
        game.mode !== "playing" &&
        performance.now() - this.lastHover > 100
      ) {
        b.focus({ preventScroll: true });
        this.lastHover = performance.now();
        if (game.sound.ctx) game.sound.menu();
      }
    });
    this.root.addEventListener("input", (e) => this.change(e));
    window.addEventListener("keydown", (e) => this.key(e), true);
    this.render();
  }
  key(e: KeyboardEvent) {
    if (this.game.mode === "playing") return;
    if (this.padRebinding) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === "Escape") this.capturePad("cancel");
      else if (e.code === "Backspace" || e.code === "Delete")
        this.capturePad("clear");
      return;
    }
    if (this.rebinding) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) this.capture(e.code);
      return;
    }
    if (e.code === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.back();
      return;
    }
    if (e.code === "Tab" && this.dialog) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const items = Array.from(
        this.root.querySelectorAll<HTMLElement>(".confirm-dialog button"),
      );
      const index = items.indexOf(document.activeElement as HTMLElement);
      items[
        (index + (e.shiftKey ? -1 : 1) + items.length) % items.length
      ]?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.code)) return;
    if (
      (e.target as HTMLElement)?.matches("input[type=range]") &&
      ["Home", "End"].includes(e.code)
    )
      return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const scope = this.root.querySelector(".confirm-dialog") || this.root;
    const items = Array.from(
      scope.querySelectorAll<HTMLElement>("button:not(:disabled),input"),
    ).filter((x) => x.getClientRects().length > 0);
    let index = items.indexOf(document.activeElement as HTMLElement);
    index =
      e.code === "Home"
        ? 0
        : e.code === "End"
          ? items.length - 1
          : (index + (e.code === "ArrowDown" ? 1 : -1) + items.length) %
            items.length;
    items[index]?.focus();
    items[index]?.scrollIntoView({ block: "nearest" });
    if (this.game.sound.ctx) this.game.sound.menu();
  }
  back() {
    if (this.dialog) {
      this.dialog = "";
      this.render();
      return;
    }
    if (this.page !== "home") {
      this.page = "home";
      this.render();
      return;
    }
    if (this.game.mode === "paused") this.action("resume");
  }
  /** Finish a pending rebind: Escape cancels, Backspace or Delete clears the slot. */
  capture(code: string) {
    const target = this.rebinding;
    if (!target) return;
    this.rebinding = null;
    const name = (a: Action) => ACTIONS.find(([x]) => x === a)![1];
    const s = this.game.settings();
    if (code === "Escape") this.rebindNote = "Unchanged.";
    else if (code === "Backspace" || code === "Delete") {
      unbind(s.bindings, target.action, target.slot);
      this.rebindNote = `${name(target.action)}: slot cleared.`;
    } else if (!bindable(code)) {
      this.rebindNote = `${code} cannot be bound.`;
    } else {
      const moved = bind(s.bindings, target.action, target.slot, code);
      this.rebindNote = moved
        ? `${keyLabel(code)} moved from ${name(moved)} to ${name(target.action)}.`
        : `${name(target.action)}: ${keyLabel(code)}.`;
    }
    this.game.applySettings(s);
    this.game.saveOptions();
    this.render();
    this.root
      .querySelector<HTMLElement>(
        `[data-action="rebind"][data-value="${target.action}:${target.slot}"]`,
      )
      ?.focus();
  }
  /** Listen for a controller button for `action`, or stop listening. */
  listenPad(action: PadAction | null) {
    this.padRebinding = action;
    this.game.controls.capture = action ? (b) => this.capturePad(b) : null;
  }
  /** Finish a pending controller rebind: Start or Esc cancels, Backspace clears. */
  capturePad(button: number | "cancel" | "clear") {
    const action = this.padRebinding;
    if (!action) return;
    this.listenPad(null);
    const name = (a: PadAction) => PAD_ACTIONS.find(([x]) => x === a)![1];
    const s = this.game.settings();
    if (button === "cancel" || button === PAD_START)
      this.padNote = "Unchanged.";
    else if (button === "clear") {
      s.padBindings[action] = null;
      this.padNote = `${name(action)}: button cleared.`;
    } else if (!padBindable(button))
      this.padNote = `${padLabel(button)} cannot be bound.`;
    else {
      const moved = bindPad(s.padBindings, action, button);
      this.padNote = moved
        ? `${padLabel(button)} moved from ${name(moved)} to ${name(action)}.`
        : `${name(action)}: ${padLabel(button)}.`;
    }
    this.game.applySettings(s);
    this.game.saveOptions();
    this.render();
    this.root
      .querySelector<HTMLElement>(
        `[data-action="pad-rebind"][data-value="${action}"]`,
      )
      ?.focus();
  }
  padRows() {
    const b = this.game.padBindings;
    return `<div class="rebind-list pad-list" aria-label="Controller bindings"><p class="rebind-note" role="status">${this.padNote || "Controller: select an action, then press a button. Start or Esc cancels; Backspace clears. Start always pauses, the sticks move and look, and menus keep the D-pad, A and B."}</p>${PAD_ACTIONS.map(
      ([action, label]) => {
        const listening = this.padRebinding === action;
        const button = b[action];
        const shown = listening
          ? "PRESS A BUTTON…"
          : button === null
            ? "—"
            : padLabel(button);
        return `<div class="rebind-row pad-row"><span>${label}</span><button class="rebind-slot${listening ? " listening" : ""}${button === null ? " empty" : ""}" data-action="pad-rebind" data-value="${action}" aria-label="${label}, controller: ${listening ? "press a button" : button === null ? "unbound" : padLabel(button)}">${shown}</button></div>`;
      },
    ).join(
      "",
    )}<button class="rebind-reset" data-action="reset-pad-bindings">Reset controller buttons</button></div>`;
  }
  /** What killed the player and what hurt them this attempt. */
  deathRecap() {
    const r = this.game.lastDeath;
    if (!r) return "";
    return `<section class="death-recap" aria-label="Death recap"><p class="killed-by">${r.killedBy}</p>${r.sources.length ? `<ul>${r.sources.map((x) => `<li><span>${x.name}</span><b>${x.damage}</b></li>`).join("")}</ul><small>Damage taken this attempt, armor included</small>` : ""}${r.tip ? `<p class="death-tip">${r.tip}</p>` : ""}</section>`;
  }
  /** A level's best clear for the level select. */
  recordLine(level: number) {
    const r = this.game.save.records?.[level];
    return `<p class="record-line">${
      r
        ? `BEST ${formatTime(r.time)} · ${r.kills} SLAIN · ${r.secrets ? "RELIC FOUND" : "RELIC MISSED"}${r.deathless ? " · DEATHLESS" : ""}`
        : this.game.save.best[level]
          ? "CLEARED · NO RECORDED TIME"
          : "NOT YET CLEARED"
    }</p>`;
  }
  bindingRows() {
    const b = this.game.bindings;
    return `<div class="rebind-list" aria-label="Keyboard and mouse bindings"><p class="rebind-note" role="status">${this.rebindNote || "Select a slot, then press a key or mouse button. Backspace clears it; Esc cancels. Esc always pauses."}</p>${ACTIONS.map(
      ([action, label]) =>
        `<div class="rebind-row"><span>${label}</span>${Array.from(
          { length: SLOTS },
          (_, slot) => {
            const listening =
              this.rebinding?.action === action && this.rebinding.slot === slot;
            const code = b[action][slot];
            const shown = listening
              ? "PRESS A KEY…"
              : code
                ? keyLabel(code)
                : "—";
            return `<button class="rebind-slot${listening ? " listening" : ""}${code ? "" : " empty"}" data-action="rebind" data-value="${action}:${slot}" aria-label="${label}, slot ${slot + 1}: ${listening ? "press a key" : code ? keyLabel(code) : "unbound"}">${shown}</button>`;
          },
        ).join("")}</div>`,
    ).join(
      "",
    )}<button class="rebind-reset" data-action="reset-bindings">Reset key bindings</button></div>`;
  }
  action(action: string, value?: string) {
    const g = this.game;
    if (action === "pad-rebind") {
      this.rebinding = null;
      this.listenPad(value as PadAction);
      this.padNote = "";
      this.render();
      this.root
        .querySelector<HTMLElement>(
          `[data-action="pad-rebind"][data-value="${value}"]`,
        )
        ?.focus();
      return;
    }
    if (action === "reset-pad-bindings") {
      const s = g.settings();
      s.padBindings = clonePadBindings(DEFAULT_PAD_BINDINGS);
      g.applySettings(s);
      g.saveOptions();
      this.padNote = "Controller buttons reset.";
      this.render();
      return;
    }
    if (action === "rebind") {
      this.listenPad(null);
      const [name, slot] = value!.split(":");
      this.rebinding = { action: name as Action, slot: Number(slot) };
      this.rebindNote = "";
      this.render();
      this.root.querySelector<HTMLElement>(`[data-value="${value}"]`)?.focus();
      return;
    }
    if (action === "reset-bindings") {
      const s = g.settings();
      s.bindings = cloneBindings(DEFAULT_BINDINGS);
      g.applySettings(s);
      g.saveOptions();
      this.rebindNote = "Key bindings reset.";
      this.render();
      return;
    }
    if (action === "cycle-weapon") {
      g.cycleWeapon(Number(value));
      return;
    }
    if (action === "equip-weapon") {
      if (g.mode === "playing") g.equip(Number(value));
      return;
    }
    if (action === "back") {
      this.back();
      return;
    }
    if (action === "cancel") {
      this.dialog = "";
      this.render();
      return;
    }
    if (action === "confirm") {
      const target = this.dialog;
      this.dialog = "";
      if (target === "new") {
        g.save = freshSave();
        g.persist();
        this.page = "home";
        g.start(0, 0);
      }
      if (target === "retry") {
        this.page = "home";
        g.retry();
      }
      if (target === "menu") {
        this.page = "home";
        g.level = g.save.level;
        g.room = 0;
        g.loadArena();
        g.setMode("menu");
      }
      if (target === "quit") void window.desktop?.quit();
      return;
    }
    if (["new", "retry", "menu", "quit"].includes(action)) {
      this.dialog = action;
      this.render();
      return;
    }
    if (action === "page") {
      this.page = value!;
      if (value === "campaign") {
        this.selectedLevel = g.save.level;
        this.chapter = LEVELS[g.save.level].chapter;
      }
      this.render();
    }
    if (action === "start") {
      this.page = "home";
      g.continueGame();
    }
    if (action === "level") {
      this.page = "home";
      g.start(Number(value), 0);
    }
    if (action === "retry-loading") g.start(g.loading.level, g.loading.room);
    if (action === "abandon-loading") {
      this.page = "home";
      g.setMode("menu");
    }
    if (action === "select-level") {
      this.selectedLevel = Number(value);
      this.render();
    }
    if (action === "chapter") {
      this.chapter = Number(value);
      this.selectedLevel = LEVELS.findIndex((l) => l.chapter === this.chapter);
      this.render();
    }
    if (action === "weapon") {
      this.armory = Number(value);
      this.render();
    }
    if (action === "card") {
      g.save.selectedCard = Number(value);
      g.persist();
      this.render();
    }
    if (action === "resume") {
      this.page = "home";
      g.resume();
    }
    if (action === "next") {
      this.page = "home";
      g.start(g.save.level, 0);
    }
    if (action === "settings-tab") {
      this.settingsTab = value!;
      this.render();
    }
    if (action === "option") {
      const [key, raw] = value!.split(":");
      const s = g.settings();
      if (key in s) {
        (s as unknown as Record<string, number | boolean>)[key] =
          raw === "true" ? true : raw === "false" ? false : Number(raw);
        g.applySettings(s);
        g.saveOptions();
        this.render();
      }
    }
    if (action === "defaults") {
      g.applySettings({ ...defaults });
      g.saveOptions();
      this.render();
    }
    if (action === "fullscreen") {
      if (window.desktop) void window.desktop.fullscreen();
      else if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen().catch(() => {});
    }
  }
  change(e: Event) {
    const t = e.target as HTMLInputElement,
      key = t.dataset.setting as keyof Settings;
    if (!key) return;
    const s = this.game.settings();
    (s as unknown as Record<string, number>)[key] =
      Number(t.value) / Number(t.dataset.divisor || 1);
    this.game.applySettings(s);
    this.game.saveOptions();
    const output = t.closest(".option-row")?.querySelector("output");
    if (output) output.textContent = t.value + (t.dataset.unit || "");
    t.style.setProperty(
      "--fill",
      `${((Number(t.value) - Number(t.min)) / (Number(t.max) - Number(t.min))) * 100}%`,
    );
  }
  button(label: string, action: string, value?: string, extra = "") {
    return `<button class="menu-command" data-action="${action}" ${value === undefined ? "" : `data-value="${value}"`} ${extra}><span class="command-mark" aria-hidden="true">◆</span>${label}<span class="command-tail" aria-hidden="true">◆</span></button>`;
  }
  footer() {
    return `<div class="menu-hints"><span><kbd>↑</kbd><kbd>↓</kbd> Select <kbd>Enter</kbd> Confirm <kbd>Esc</kbd> Back</span><span>PURGATORY <i>·</i> ${__APP_VERSION__}</span></div>`;
  }
  render() {
    const g = this.game;
    if (
      this.padRebinding &&
      (g.mode === "playing" ||
        this.page !== "settings" ||
        this.settingsTab !== "controls")
    )
      this.listenPad(null);
    if (g.mode !== this.lastMode) {
      this.page = "home";
      this.dialog = "";
    }
    this.lastMode = g.mode;
    document.body.dataset.mode = g.mode;
    document.body.dataset.menu = this.page;
    if (g.mode === "playing") {
      this.renderHUD();
      return;
    }
    const active = document.activeElement as HTMLElement;
    const restore = active?.dataset.action
      ? `[data-action="${active.dataset.action}"]${active.dataset.value !== undefined ? `[data-value="${active.dataset.value}"]` : ""}`
      : active?.id
        ? `#${active.id}`
        : "";
    const paused = g.mode === "paused";
    let content = "";
    if (g.mode === "loading")
      content = `<main class="end-screen"><p class="menu-kicker">OPENING THE GATE</p><h1>${LEVELS[g.loading.level].name}</h1><p>${g.loading.error ? "The level could not be loaded. Check your connection and try again." : "Loading this environment…"}</p>${g.loading.error ? `<nav>${this.button("Try again", "retry-loading", undefined, "data-default")}${this.button("Main menu", "abandon-loading")}</nav>` : ""}</main>`;
    else if (g.mode === "dead")
      content = `<main class="end-screen"><p class="menu-kicker">PURGATORY CLAIMS ANOTHER</p><h1 class="blood-title">You died</h1>${this.deathRecap()}<p>${g.levelKills} ${g.levelKills === 1 ? "enemy" : "enemies"} slain. Your work is not finished.</p><nav>${this.button("Rise again", "retry", undefined, "data-default")}${this.button("Main menu", "menu")}</nav></main>`;
    else if (g.mode === "result" || g.mode === "ending")
      content = `<main class="end-screen"><div class="end-seal">${seal}</div><p class="menu-kicker">${g.mode === "ending" ? "THE LAST SEAL IS BROKEN" : "LEVEL COMPLETE"}</p><h1>${g.mode === "ending" ? "Absolution" : LEVELS[g.level].name}</h1><p>${g.mode === "ending" ? "The gates open. For the first time, nothing follows you." : "The road goes deeper."}</p><div class="result-stats">${[
        [g.levelKills, "ENEMIES SLAIN"],
        [g.levelSouls, "SOULS TAKEN"],
        [g.secrets, "RELICS FOUND"],
        [formatTime(g.elapsed), "TIME"],
      ]
        .map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`)
        .join(
          "",
        )}</div>${g.lastClear ? `<p class="record-line">${g.lastClear.fastest ? "<b>NEW BEST TIME</b>" : `BEST ${formatTime(g.lastClear.best)}`}${g.lastClear.deathless ? " · <b>DEATHLESS</b>" : ""}</p>` : ""}<nav>${this.button(g.mode === "ending" ? "Main menu" : "Continue", "" + (g.mode === "ending" ? "menu" : "next"), undefined, "data-default")}${g.mode === "ending" ? "" : this.button("Main menu", "menu")}</nav></main>`;
    else if (this.page === "home")
      content = paused ? this.pause() : this.home();
    else
      content = `<main class="game-panel ${this.page}-panel"><div class="screen-heading"><button class="back-command" data-action="back" aria-label="Back">‹</button><div><p class="menu-kicker">${paused ? "PAUSED" : "PURGATORY"}</p><h1>${({ campaign: "Select level", settings: "Options", arsenal: "The arsenal", tarot: "Grave tarot" } as Record<string, string>)[this.page] || "Purgatory"}</h1></div><span class="heading-ornament" aria-hidden="true">◆</span></div>${this.panel()}</main>`;
    this.root.innerHTML = `<div class="game-menu ${paused ? "is-paused" : ""} ${g.mode === "dead" ? "is-dead" : ""}"><div class="menu-vignette"></div><div class="menu-grain"></div><div class="frame-corner tl"></div><div class="frame-corner tr"></div><div class="frame-corner bl"></div><div class="frame-corner br"></div>${content}${this.footer()}${this.dialog ? this.confirmation() : ""}</div>`;
    const scope = this.root.querySelector(".confirm-dialog") || this.root;
    const focus =
      (!this.dialog && restore
        ? scope.querySelector<HTMLElement>(restore)
        : null) ||
      scope.querySelector<HTMLElement>("[data-default]") ||
      scope.querySelector<HTMLElement>("button:not(:disabled)");
    focus?.focus({ preventScroll: true });
    if (focus?.classList.contains("menu-command"))
      focus.classList.add("nav-current");
  }
  home() {
    const g = this.game,
      saved = g.save.kills > 0 || g.save.unlocked > 0 || g.save.room > 0;
    return `<main class="title-screen"><div class="title-crest" aria-hidden="true">${seal}</div><div class="logo"><h1>PURGATORY</h1><div class="logo-rule"><i></i><span>A REQUIEM IN STEEL</span><i></i></div></div><nav class="title-commands" aria-label="Main menu">${this.button(saved ? "Continue" : "Enter Purgatory", "start", undefined, "data-default")}${this.button("New game", "new")}${this.button("Select level", "page", "campaign")}${this.button("Options", "page", "settings")}${this.button("The arsenal", "page", "arsenal")}${this.button("Grave tarot", "page", "tarot")}${window.desktop ? this.button("Quit game", "quit") : ""}</nav><p class="checkpoint-caption">${saved ? `CONTINUE · ${LEVELS[g.save.level].name} · SECTOR ${g.save.room + 1}${g.save.resume ? ` · WAVE ${g.save.resume.wave}` : ""}` : "A SOUL BETWEEN HEAVEN AND HELL"}</p></main>`;
  }
  pause() {
    const g = this.game;
    return `<main class="pause-screen"><p class="menu-kicker">${LEVELS[g.level].name} · SECTOR ${g.room + 1}</p><h1>Paused</h1><div class="small-ornament">— ◆ —</div><nav aria-label="Pause menu">${this.button("Resume game", "resume", undefined, "data-default")}${this.button("Options", "page", "settings")}${this.button("Restart sector", "retry")}${this.button("Main menu", "menu")}${window.desktop ? this.button("Quit game", "quit") : ""}</nav><p class="checkpoint-caption">${g.save.resume?.level === g.level && g.save.resume.room === g.room ? `Progress saved at the start of wave ${g.save.resume.wave}` : "Progress saved at the start of this sector"}</p></main>`;
  }
  confirmation() {
    const copy: Record<string, [string, string, string]> = {
      new: [
        "Begin a new game?",
        "Your checkpoint, completed-level records and tarot cards will be reset.",
        "Begin pilgrimage",
      ],
      retry: [
        "Restart this sector?",
        "The sector restarts from its first wave with replenished supplies.",
        "Restart",
      ],
      menu: [
        "Leave the fight?",
        "You will return to the beginning of this sector when you continue.",
        "Main menu",
      ],
      quit: [
        "Quit Purgatory?",
        "Your campaign is saved at the start of the current sector.",
        "Quit game",
      ],
    };
    const [title, detail, confirm] = copy[this.dialog];
    return `<div class="dialog-shade"><section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><p class="menu-kicker">◆</p><h2 id="dialog-title">${title}</h2><p>${detail}</p>${this.button(confirm, "confirm")}${this.button("Cancel", "cancel", undefined, "data-default")}</section></div>`;
  }
  panel() {
    const g = this.game;
    if (this.page === "settings") return this.settings();
    if (this.page === "campaign") {
      const l = LEVELS[this.selectedLevel];
      return `<div class="chapter-select" aria-label="Chapters">${CHAPTERS.map((c, i) => `<button class="${this.chapter === i + 1 ? "selected" : ""}" data-action="chapter" data-value="${i + 1}" aria-pressed="${this.chapter === i + 1}"><b>${roman[i]}</b><span>${c}</span></button>`).join("")}</div><div class="campaign-layout"><nav class="level-list" aria-label="Levels">${LEVELS.map((level, i) => (level.chapter === this.chapter ? `<button class="${this.selectedLevel === i ? "selected" : ""}" data-action="select-level" data-value="${i}" aria-pressed="${this.selectedLevel === i}"><small>${String(i + 1).padStart(2, "0")}</small><span>${level.name}</span><i>${g.save.best[i] ? "✓" : level.boss ? "†" : "◆"}</i></button>` : "")).join("")}</nav><section class="level-preview"><img src="${import.meta.env.BASE_URL}assets/previews/level-${this.selectedLevel}.jpg" alt="${l.name} environment"><div class="preview-caption"><p class="menu-kicker">CHAPTER ${roman[l.chapter - 1]} · ${l.rooms} SECTORS ${l.boss ? "· BOSS ENCOUNTER" : ""}</p><h2>${l.name}</h2><p>${l.subtitle}</p>${this.recordLine(this.selectedLevel)}${this.button("Enter level", "level", String(this.selectedLevel))}</div></section></div><p class="screen-note">All 24 levels are available. Selecting a level changes your checkpoint and keeps your earned cards and scores.</p>`;
    }
    if (this.page === "arsenal") {
      const w = WEAPONS[this.armory];
      return `<div class="arsenal-layout"><nav class="level-list" aria-label="Weapons">${WEAPONS.map((x, i) => `<button data-action="weapon" data-value="${i}" class="${this.armory === i ? "selected" : ""}"><small>0${i + 1}</small><span>${x.short}</span></button>`).join("")}</nav><section class="weapon-inscription"><div class="weapon-etching">${gunIcon(this.armory)}</div><p class="menu-kicker">WEAPON 0${this.armory + 1}</p><h2>${w.name}</h2><p>${w.hint}</p><div class="fire-modes"><p><kbd>LMB</kbd><span>PRIMARY<b>${w.primary}</b></span></p><p><kbd>RMB</kbd><span>SECONDARY<b>${w.secondary}</b></span></p></div></section></div><p class="screen-note">No reloading. Select with 1–5, R / V, or the mouse wheel. Inspect with F.</p>`;
    }
    return `<p class="screen-note">Find a relic or collect 25 souls, then finish the level to earn a card.</p><div class="tarot-grid">${CARDS.map((c, i) => `<button class="tarot-card ${g.save.selectedCard === i ? "selected" : ""} ${g.save.cards.includes(i) ? "" : "locked"}" data-action="card" data-value="${i}" ${g.save.cards.includes(i) ? "" : "disabled"}><span class="menu-kicker">${roman[i]}</span><div class="tarot-symbol">${["⚔", "☄", "♜"][i]}</div><h2>${c.name}</h2><p>${c.detail}</p><span class="card-state">${g.save.cards.includes(i) ? (g.save.selectedCard === i ? "EQUIPPED" : "EQUIP CARD") : "SEALED"}</span></button>`).join("")}</div><p class="screen-note">Press ${g.keyFor("tarot")} in combat. One activation per sector. Collect 66 souls to become the Wraith.</p>`;
  }
  range(
    key: keyof Settings,
    label: string,
    description: string,
    min: number,
    max: number,
    divisor = 1,
    unit = "",
  ) {
    const value = Math.round(Number(this.game.settings()[key]) * divisor);
    return `<label class="option-row"><span><b>${label}</b><small>${description}</small></span><span class="range-control"><input id="${key}" data-setting="${key}" data-divisor="${divisor}" data-unit="${unit}" type="range" min="${min}" max="${max}" value="${value}" style="--fill:${((value - min) / (max - min)) * 100}%"><output>${value}${unit}</output></span></label>`;
  }
  choice(
    key: keyof Settings,
    label: string,
    description: string,
    options: [string, number | boolean][],
  ) {
    const value = this.game.settings()[key];
    return `<div class="option-row"><span><b>${label}</b><small>${description}</small></span><div class="option-choices" role="group" aria-label="${label}">${options.map(([name, v]) => `<button class="${v === value ? "selected" : ""}" aria-pressed="${v === value}" data-action="option" data-value="${key}:${v}">${name}</button>`).join("")}</div></div>`;
  }
  settings() {
    const tabs = [
      ["video", "Video"],
      ["audio", "Audio"],
      ["controls", "Controls"],
      ["gameplay", "Gameplay"],
    ];
    let content = "";
    if (this.settingsTab === "video")
      content =
        this.choice(
          "quality",
          "Graphics quality",
          "Low: no shadows · Medium: shadows · High: shadows + ambient occlusion",
          [
            ["Low", 0],
            ["Medium", 1],
            ["High", 2],
          ],
        ) +
        this.range(
          "renderScale",
          "Resolution scale",
          "Lower the internal resolution to improve performance.",
          50,
          100,
          100,
          "%",
        ) +
        this.choice(
          "adaptiveResolution",
          "Adaptive resolution",
          "Reduce render resolution during heavy combat to keep controls responsive.",
          [
            ["Off", false],
            ["On", true],
          ],
        ) +
        this.range(
          "brightness",
          "Brightness",
          "Adjust the scene exposure.",
          65,
          150,
          100,
          "%",
        ) +
        this.range(
          "fov",
          "Field of view",
          "Horizontal awareness and perspective.",
          65,
          110,
          1,
          "°",
        ) +
        `<div class="option-row"><span><b>Display mode</b><small>Switch between windowed and fullscreen play.</small></span><button class="option-button" data-action="fullscreen">Toggle fullscreen <kbd>F11</kbd></button></div>`;
    if (this.settingsTab === "audio")
      content =
        this.range(
          "volume",
          "Master volume",
          "Overall output level.",
          0,
          100,
          100,
          "%",
        ) +
        this.range(
          "effectsVolume",
          "Sound effects",
          "Weapons, impacts, pickups and menu sounds.",
          0,
          100,
          100,
          "%",
        ) +
        this.range(
          "musicVolume",
          "Music volume",
          "Combat soundtrack level.",
          0,
          100,
          100,
          "%",
        ) +
        this.choice("music", "Combat music", "Enable the combat soundtrack.", [
          ["Off", false],
          ["On", true],
        ]);
    if (this.settingsTab === "controls")
      content =
        this.range(
          "sensitivity",
          "Look sensitivity",
          "Adjust mouse and touch look speed.",
          5,
          60,
          10000,
        ) +
        this.range(
          "stickSpeed",
          "Stick look speed",
          "Controller right-stick turning speed, separate from the mouse.",
          25,
          300,
          100,
          "%",
        ) +
        this.choice(
          "vibration",
          "Controller vibration",
          "Rumble when you are hit, near explosions and when the Wraith wakes.",
          [
            ["Off", false],
            ["On", true],
          ],
        ) +
        this.choice(
          "invertY",
          "Invert vertical look",
          "Reverse vertical aiming on all inputs.",
          [
            ["Off", false],
            ["On", true],
          ],
        ) +
        this.bindingRows() +
        `<div class="binding-list">${[
          ["MOUSE · WHEEL", "Look · next / previous weapon"],
          ["LEFT / RIGHT STICK", "Controller move / look"],
          ["START", "Controller pause"],
        ]
          .map(
            ([key, label]) =>
              `<div><span>${label}</span><kbd>${key}</kbd></div>`,
          )
          .join("")}</div>` +
        this.padRows();
    if (this.settingsTab === "gameplay")
      content =
        this.choice(
          "difficulty",
          "Difficulty",
          "Changes enemy health and incoming damage.",
          [
            ["Reverie", 0],
            ["Purgatory", 1],
            ["Torment", 2],
          ],
        ) +
        `<p class="difficulty-note">${["Forgiving combat. Enemies have less health and deal less damage.", "The standard combat balance. Keep moving and use both fire modes.", "Relentless combat. Tougher enemies and heavier incoming damage."][this.game.difficulty]} Enemy health changes apply to newly spawned enemies.</p>` +
        this.choice(
          "headBob",
          "Camera movement",
          "Enable camera bob while moving.",
          [
            ["Reduced", false],
            ["Full", true],
          ],
        ) +
        this.choice(
          "crosshair",
          "Crosshair",
          "Show the central aiming reticle.",
          [
            ["Off", false],
            ["On", true],
          ],
        ) +
        this.choice(
          "hints",
          "Combat hints",
          "Explain combos and souls once, the first time they come up.",
          [
            ["Off", false],
            ["On", true],
          ],
        );
    return `<div class="settings-layout"><nav class="settings-categories" aria-label="Settings categories">${tabs.map(([id, label]) => `<button class="${id === this.settingsTab ? "selected" : ""}" data-action="settings-tab" data-value="${id}" aria-pressed="${id === this.settingsTab}"><span>◆</span>${label}</button>`).join("")}</nav><section class="settings-options" aria-label="${this.settingsTab} settings"><h2>${tabs.find((t) => t[0] === this.settingsTab)![1]}</h2>${content}<div class="settings-bottom"><span>Changes are saved automatically.</span><button data-action="defaults">Restore all defaults</button></div></section></div>`;
  }
  renderHUD() {
    this.root.innerHTML = `<div id="damage-overlay"></div><div id="demon-overlay"></div><div class="hud-top"><div><p class="eyebrow" id="hud-chapter"></p><h2 id="hud-level"></h2></div><div class="objective"><p id="hud-gate"></p><span id="hud-objective"></span></div><div class="combat-stats"><p><b id="hud-enemies">0</b> REMAINING</p><span><b id="hud-kills">0</b> SLAIN</span><button class="hud-pause" data-action="pause" aria-label="Pause game">Ⅱ</button></div></div><div id="boss-hud"><span id="boss-name"></span><div><i id="boss-fill"></i></div></div><div id="crosshair"><i></i><i></i><i></i><i></i><b></b></div><div id="hitmarker">×</div><div id="threat-ring" aria-hidden="true"></div><div id="toast" role="status"></div><div id="hint" role="status"></div><div id="gate-prompt"></div><div class="hud-bottom"><div class="vitals"><div class="health"><span class="vital-icon">✚</span><b id="hud-health">100</b><span>HEALTH</span></div><div class="armor"><span class="vital-icon">◇</span><b id="hud-armor">50</b><span>ARMOR</span></div><div class="soul-bar"><i id="soul-fill"></i></div><small id="hud-souls">0 / 66 SOULS</small></div><div class="weapon-hud"><div class="weapon-slots">${WEAPONS.map((_, i) => `<button id="slot-${i}" data-action="equip-weapon" data-value="${i}" aria-label="Equip ${WEAPONS[i].short}"><small>${i + 1}</small>${gunIcon(i)}</button>`).join("")}</div><div class="weapon-cycle"><button data-action="cycle-weapon" data-value="-1" aria-label="Previous weapon">◀ <span id="hud-prev-key"></span></button><p id="hud-weapon"></p><button data-action="cycle-weapon" data-value="1" aria-label="Next weapon"><span id="hud-next-key"></span> ▶</button></div><span id="hud-card"></span></div><div class="ammo"><span id="hud-primary-label"></span><div><b id="hud-ammo">65</b><span id="hud-alt">24</span></div><small id="hud-secondary-label"></small></div></div><div id="hud-help">WASD MOVE <i>·</i> SPACE JUMP <i>·</i> LMB / RMB FIRE <i>·</i> R / V SWITCH <i>·</i> F INSPECT <i>·</i> ESC PAUSE</div>`;
    this.root
      .querySelector('[data-action="pause"]')
      ?.addEventListener("click", () => this.game.setMode("paused"));
    this.hud();
  }
  /** Hit-direction arcs, off-screen incoming fire and last-enemy chevrons. */
  threats() {
    const ring = document.getElementById("threat-ring");
    if (!ring) return;
    const marks = this.game.threatIndicators().slice(0, 12);
    while (ring.children.length < marks.length)
      ring.appendChild(document.createElement("i"));
    Array.from(ring.children).forEach((el, i) => {
      const mark = marks[i],
        style = (el as HTMLElement).style;
      if (!mark) {
        style.display = "none";
        return;
      }
      el.className = mark.kind;
      style.display = "block";
      style.setProperty("--angle", mark.angle + "rad");
      style.opacity = String(Math.min(1, 0.25 + mark.strength));
    });
  }
  hud() {
    const g = this.game;
    if (g.mode !== "playing") return;
    const set = (id: string, text: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    const level = LEVELS[g.level];
    const crosshair = document.getElementById("crosshair");
    if (crosshair)
      crosshair.style.visibility = g.crosshair ? "visible" : "hidden";
    set(
      "hud-chapter",
      "CHAPTER " +
        roman[level.chapter - 1] +
        " / SECTOR " +
        (g.room + 1) +
        " OF " +
        level.rooms,
    );
    set("hud-level", level.name);
    set("hud-gate", g.arenaCleared ? "GATE OPEN" : "GATES SEALED");
    set(
      "hud-objective",
      g.arenaCleared
        ? "Follow the green gate"
        : "WAVE " + Math.max(1, g.wave) + " / 3",
    );
    set("hud-enemies", String(g.remaining + g.enemies.length));
    set("hud-kills", String(g.levelKills));
    set("hud-health", String(Math.ceil(g.health)));
    set("hud-armor", String(Math.ceil(g.armor)));
    set(
      "hud-souls",
      g.demon > 0
        ? "WRAITH FORM " + Math.ceil(g.demon) + "s"
        : g.souls + " / 66 SOULS",
    );
    set("hud-weapon", WEAPONS[g.weapon].name.toUpperCase());
    set(
      "hud-ammo",
      g.ammo[g.weapon] === Infinity
        ? "∞"
        : String(Math.floor(g.ammo[g.weapon])),
    );
    set(
      "hud-alt",
      g.altAmmo[g.weapon] === Infinity
        ? "∞"
        : String(Math.floor(g.altAmmo[g.weapon])),
    );
    set("hud-primary-label", AMMUNITION[g.weapon].primary);
    set("hud-secondary-label", "ALT / " + AMMUNITION[g.weapon].secondary);
    set("toast", g.toastTimer > 0 ? g.toast : "");
    set(
      "hud-card",
      g.cardTime > 0
        ? CARDS[g.save.selectedCard].name.toUpperCase() +
            " · " +
            Math.ceil(g.cardTime) +
            "s"
        : g.save.cards.length
          ? (g.controls.connected ? g.padFor("tarot") : g.keyFor("tarot")) +
            " · " +
            (g.cardUsed
              ? "TAROT SPENT"
              : CARDS[g.save.selectedCard].name.toUpperCase())
          : "COLLECT SOULS TO BECOME THE WRAITH",
    );
    set(
      "gate-prompt",
      g.arenaCleared && Math.hypot(g.position.x, g.position.z + 28) < 5
        ? `[ ${g.controls.connected ? g.padFor("use") : g.keyFor("use")} ]  ` +
            (g.room === level.rooms - 1 ? "FINISH LEVEL" : "NEXT SECTOR")
        : "",
    );
    document.getElementById("damage-overlay")!.style.opacity = String(
      g.damageFlash * 1.4,
    );
    document.getElementById("demon-overlay")!.style.opacity =
      g.demon > 0 ? ".6" : "0";
    document.getElementById("hitmarker")!.style.opacity =
      g.hitFlash > 0 ? "1" : "0";
    this.threats();
    const hint = document.getElementById("hint");
    if (hint) {
      const text = g.hintText();
      if (text && hint.textContent !== text) hint.textContent = text;
      hint.style.opacity = String(g.hints.opacity);
    }
    document.getElementById("soul-fill")!.style.width =
      (g.souls / 66) * 100 + "%";
    document.getElementById("hud-help")!.textContent = g.controls.connected
      ? `LEFT STICK MOVE · RIGHT STICK LOOK · ${g.padFor("primary")} / ${g.padFor("alternate")} FIRE · ${g.padFor("previous")} / ${g.padFor("next")} WEAPONS · ${g.padFor("jump")} JUMP · ${g.padFor("use")} USE · START PAUSE`
      : `${g.moveKeys()} MOVE · ${g.keyFor("jump")} JUMP · ${g.keyFor("primary")} / ${g.keyFor("alternate")} FIRE · ${g.keyFor("next")} / ${g.keyFor("previous")} SWITCH · ${g.keyFor("inspect")} INSPECT · ESC PAUSE`;
    set(
      "hud-prev-key",
      g.controls.connected ? g.padFor("previous") : g.keyFor("previous"),
    );
    set(
      "hud-next-key",
      g.controls.connected ? g.padFor("next") : g.keyFor("next"),
    );
    document.getElementById("hud-help")!.style.opacity =
      g.elapsed < 20 ? "1" : "0";
    for (let i = 0; i < 5; i++)
      document
        .getElementById("slot-" + i)!
        .classList.toggle("active", g.weapon === i);
    const boss = g.enemies.find((e) => e.type === "boss");
    document.getElementById("boss-hud")!.style.display = boss
      ? "block"
      : "none";
    if (boss) {
      set("boss-name", level.boss || "GENERAL");
      document.getElementById("boss-fill")!.style.width =
        (boss.hp / boss.maxHp) * 100 + "%";
    }
  }
}
