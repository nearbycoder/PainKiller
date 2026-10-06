/** Rebindable keyboard and mouse controls. Escape always pauses and is never bindable. */
export const ACTIONS = [
  ["forward", "Move forward"],
  ["back", "Move back"],
  ["left", "Strafe left"],
  ["right", "Strafe right"],
  ["jump", "Jump"],
  ["sprint", "Sprint"],
  ["primary", "Primary fire"],
  ["alternate", "Alternate fire"],
  ["next", "Next weapon"],
  ["previous", "Previous weapon"],
  ["weapon1", "Thresher"],
  ["weapon2", "Shotgun / Freezer"],
  ["weapon3", "Stakes / Grenades"],
  ["weapon4", "Rockets / Chaingun"],
  ["weapon5", "Tempest"],
  ["use", "Use gate"],
  ["tarot", "Tarot card"],
  ["inspect", "Inspect weapon"],
  ["pause", "Pause (Esc always works)"],
  ["lookLeft", "Turn left"],
  ["lookRight", "Turn right"],
  ["lookUp", "Look up"],
  ["lookDown", "Look down"],
] as const;
export type Action = (typeof ACTIONS)[number][0];
export type Bindings = Record<Action, string[]>;
/** Slots per action. */
export const SLOTS = 2;

export const DEFAULT_BINDINGS: Readonly<Bindings> = {
  forward: ["KeyW"],
  back: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
  jump: ["Space"],
  sprint: ["ShiftLeft"],
  primary: ["Mouse0", "KeyZ"],
  alternate: ["Mouse2", "KeyX"],
  next: ["KeyR"],
  previous: ["KeyV"],
  weapon1: ["Digit1"],
  weapon2: ["Digit2"],
  weapon3: ["Digit3"],
  weapon4: ["Digit4"],
  weapon5: ["Digit5"],
  use: ["KeyE"],
  tarot: ["KeyQ"],
  inspect: ["KeyF"],
  pause: ["KeyP"],
  lookLeft: ["ArrowLeft"],
  lookRight: ["ArrowRight"],
  lookUp: ["ArrowUp"],
  lookDown: ["ArrowDown"],
};

/** Codes a binding may use: ordinary keys and the five mouse buttons. */
export function bindable(code: string) {
  return (
    code !== "Escape" &&
    /^(Key[A-Z]|Digit\d|Numpad\w+|F([1-9]|1[0-2])|Arrow(Up|Down|Left|Right)|Mouse[0-4]|Space|Tab|Enter|Backquote|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash|CapsLock|Insert|Delete|Home|End|PageUp|PageDown|(Shift|Control|Alt)(Left|Right))$/.test(
      code,
    )
  );
}

export function cloneBindings(b: Readonly<Bindings>): Bindings {
  return Object.fromEntries(ACTIONS.map(([a]) => [a, [...b[a]]])) as Bindings;
}

/** Validate saved bindings. Unknown actions and codes are dropped; a code is kept only once. */
export function parseBindings(raw: unknown): Bindings {
  const result = cloneBindings(DEFAULT_BINDINGS);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  const saved = raw as Record<string, unknown>;
  const used = new Set<string>();
  // Saved actions win over defaults; codes they claim are removed from the defaults.
  for (const [action] of ACTIONS) {
    const value = saved[action];
    if (!Array.isArray(value)) continue;
    result[action] = value
      .filter((c): c is string => typeof c === "string" && bindable(c))
      .filter((c) => !used.has(c) && (used.add(c), true))
      .slice(0, SLOTS);
  }
  for (const [action] of ACTIONS)
    if (!Array.isArray(saved[action]))
      result[action] = result[action].filter(
        (c) => !used.has(c) && (used.add(c), true),
      );
  return result;
}

/**
 * Put `code` in an action's slot. Any other action using the code loses it; that action
 * is returned so the menu can say where the key came from.
 */
export function bind(
  b: Bindings,
  action: Action,
  slot: number,
  code: string,
): Action | null {
  if (!bindable(code)) return null;
  let moved: Action | null = null;
  for (const [other] of ACTIONS) {
    const i = b[other].indexOf(code);
    if (i < 0 || (other === action && i === slot)) continue;
    b[other].splice(i, 1);
    if (other !== action) moved = other;
  }
  const slots = b[action];
  if (slot < slots.length) slots[slot] = code;
  else slots.push(code);
  b[action] = slots.slice(0, SLOTS);
  return moved;
}

export function unbind(b: Bindings, action: Action, slot: number) {
  b[action].splice(slot, 1);
}

/** Every action a code triggers. */
export function actionsByCode(b: Readonly<Bindings>) {
  const map = new Map<string, Action[]>();
  for (const [action] of ACTIONS)
    for (const code of b[action])
      map.set(code, [...(map.get(code) || []), action]);
  return map;
}

const NAMED: Record<string, string> = {
  Mouse0: "LMB",
  Mouse1: "MMB",
  Mouse2: "RMB",
  Mouse3: "MOUSE 4",
  Mouse4: "MOUSE 5",
  Space: "SPACE",
  ShiftLeft: "SHIFT",
  ShiftRight: "R SHIFT",
  ControlLeft: "CTRL",
  ControlRight: "R CTRL",
  AltLeft: "ALT",
  AltRight: "R ALT",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  CapsLock: "CAPS",
  PageUp: "PG UP",
  PageDown: "PG DN",
};
export function keyLabel(code: string) {
  return (
    NAMED[code] ??
    code
      .replace(/^Key|^Digit/, "")
      .replace(/^Numpad/, "NUM ")
      .toUpperCase()
  );
}
/** Label for an action's bindings, e.g. "LMB / Z"; "—" when unbound. */
export function actionLabel(
  b: Readonly<Bindings>,
  action: Action,
  first = false,
) {
  const codes = first ? b[action].slice(0, 1) : b[action];
  return codes.length ? codes.map(keyLabel).join(" / ") : "—";
}
/** "WASD" when movement uses those keys, otherwise the four movement keys. */
export function moveLabel(b: Readonly<Bindings>) {
  const keys = (["forward", "left", "back", "right"] as const).map((a) =>
    actionLabel(b, a, true),
  );
  return keys.join("") === "WASD" ? "WASD" : keys.join(" ");
}
