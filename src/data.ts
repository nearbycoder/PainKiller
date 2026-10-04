export type Theme =
  | "cemetery"
  | "cathedral"
  | "crypt"
  | "prison"
  | "opera"
  | "asylum"
  | "snow"
  | "town"
  | "swamp"
  | "station"
  | "factory"
  | "military"
  | "ruins"
  | "castle"
  | "palace"
  | "babel"
  | "forest"
  | "tower"
  | "water"
  | "docks"
  | "monastery"
  | "hell";
export interface Level {
  name: string;
  chapter: number;
  theme: Theme;
  subtitle: string;
  rooms: number;
  boss?: string;
  seed: number;
}
const raw: [string, number, Theme, string, number, string?][] = [
  ["Hallowed Ground", 1, "cemetery", "The dead have forgotten how to rest.", 4],
  ["Hall of Vigils", 1, "cathedral", "An empty heaven, built from stone.", 4],
  ["The Ossuary", 1, "crypt", "Follow the voices beneath the earth.", 5],
  [
    "Cathedral of Ash",
    1,
    "cathedral",
    "There is no salvation at this altar.",
    5,
  ],
  ["The Barrow", 1, "ruins", "The grave has a guardian.", 3, "The Gravewarden"],
  ["Penitent Cells", 2, "prison", "Every cell holds a broken promise.", 4],
  ["The Silent Stage", 2, "opera", "One last performance for the damned.", 5],
  ["Ward of Whispers", 2, "asylum", "Some nightmares never wake.", 4],
  ["Frostbound Crossing", 2, "snow", "A frozen road to nowhere.", 4],
  ["Lantern Parish", 2, "town", "They still remember your name.", 5],
  [
    "The Drowned Fen",
    2,
    "swamp",
    "Something ancient stirs below.",
    3,
    "The Mire King",
  ],
  ["Last Platform", 3, "station", "The final train is always late.", 4],
  ["Soul Foundry", 3, "factory", "The machines run on borrowed souls.", 5],
  ["Dead Garrison", 3, "military", "A war without the living.", 5],
  [
    "Dune Sepulchre",
    3,
    "ruins",
    "An empire beneath the sand.",
    3,
    "The Sand Colossus",
  ],
  ["Bastion of Thorns", 4, "castle", "Storm the walls of the afterlife.", 5],
  ["Gilded Court", 4, "palace", "Even kings must answer.", 5],
  [
    "Spire of Tongues",
    4,
    "babel",
    "Their prayers built a tower of silence.",
    5,
  ],
  ["Weeping Wood", 4, "forest", "The trees grow toward the screams.", 4],
  [
    "Seraph's Ascent",
    4,
    "tower",
    "The last general waits above.",
    3,
    "The Iron Seraph",
  ],
  ["Sunken Canals", 5, "water", "A drowned world, still breathing.", 5],
  ["Black Harbor", 5, "docks", "No ship leaves this harbor.", 5],
  ["Sealed Abbey", 5, "monastery", "Break the final seal.", 5],
  [
    "The Abyss",
    5,
    "hell",
    "Make the darkness remember you.",
    4,
    "The First Fallen",
  ],
];
export const LEVELS: Level[] = raw.map(
  ([name, chapter, theme, subtitle, rooms, boss], i) => ({
    name,
    chapter,
    theme,
    subtitle,
    rooms,
    boss,
    seed: 173 + i * 7919,
  }),
);
export const CHAPTERS = [
  "Ashes of the Faithful",
  "The Hollow City",
  "Engines of Damnation",
  "Kingdom of Dust",
  "The Last Descent",
];
export const WEAPONS = [
  {
    name: "Thresher",
    short: "BLADE",
    primary: "Rotating blades",
    secondary: "Returning blade",
    hint: "An inexhaustible engine of steel. Close the distance, or launch its spinning head.",
    color: 0xc6d5c5,
    ammo: Infinity,
    alt: Infinity,
  },
  {
    name: "Shotgun / Freezer",
    short: "SHOTGUN",
    primary: "Scattershot",
    secondary: "Freezing bolt",
    hint: "Freeze a target, then shatter it with a point-blank blast.",
    color: 0xffc16f,
    ammo: 65,
    alt: 24,
  },
  {
    name: "Stake Launcher / Grenade",
    short: "STAKES",
    primary: "Wooden stake",
    secondary: "Bouncing grenade",
    hint: "Impale enemies. Stakes ignite in flight; shoot a grenade to propel it.",
    color: 0xe2a05e,
    ammo: 45,
    alt: 24,
  },
  {
    name: "Rocket / Chaingun",
    short: "ROCKET",
    primary: "Rocket launcher",
    secondary: "Rotary chaingun",
    hint: "Explosive crowd control, backed by a torrent of lead. Keep your distance.",
    color: 0xff6c39,
    ammo: 24,
    alt: 220,
  },
  {
    name: "Tempest",
    short: "TEMPEST",
    primary: "Shuriken launcher",
    secondary: "Chain lightning",
    hint: "Throw razor stars or arc lightning between targets. Both buttons launch a storm orb.",
    color: 0x6bdfec,
    ammo: 100,
    alt: 160,
  },
];
export const CARDS = [
  { name: "Wrath", detail: "Double weapon damage for 30 seconds." },
  { name: "Quickening", detail: "Faster movement and firing for 30 seconds." },
  { name: "Bulwark", detail: "Ignore incoming damage for 30 seconds." },
];
export const ENEMY_TYPES = [
  "shambler",
  "skeleton",
  "monk",
  "hound",
  "knight",
  "witch",
  "brute",
] as const;
export type EnemyType = (typeof ENEMY_TYPES)[number] | "boss";
export function waveCount(level: number, room: number, wave: number) {
  return 8 + Math.floor(level * 0.65) + room * 2 + wave * 3;
}
export function chapterStart(chapter: number) {
  return LEVELS.findIndex((l) => l.chapter === chapter);
}
