/** Integer reserves per firing mode. The melee/returning blade needs no ammo. */
export const AMMUNITION = [
  {
    primary: "STEEL",
    secondary: "STEEL",
    max: Infinity,
    altMax: Infinity,
    pack: 0,
    altPack: 0,
  },
  {
    primary: "SHELLS",
    secondary: "FREEZER CELLS",
    max: 100,
    altMax: 100,
    pack: 12,
    altPack: 6,
  },
  {
    primary: "STAKES",
    secondary: "GRENADES",
    max: 100,
    altMax: 100,
    pack: 10,
    altPack: 5,
  },
  {
    primary: "ROCKETS",
    secondary: "ROUNDS",
    max: 100,
    altMax: 500,
    pack: 5,
    altPack: 60,
  },
  {
    primary: "SHURIKENS",
    secondary: "CHARGE",
    max: 250,
    altMax: 250,
    pack: 25,
    altPack: 35,
  },
] as const;
export function refillAmmo(current: number, weapon: number, alternate = false) {
  if (weapon === 0) return Infinity;
  const a = AMMUNITION[weapon];
  return Math.min(
    alternate ? a.altMax : a.max,
    Math.max(0, Math.floor(current)) + (alternate ? a.altPack : a.pack),
  );
}
