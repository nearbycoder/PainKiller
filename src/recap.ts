/** What hurt the player during one sector attempt, for the death screen. */
export type DamageLog = Record<string, number>;

/** Log key for a hit: the cause, plus who fired it for hellfire ("hellfire:witch"). */
export const damageKey = (cause: string, source?: string) =>
  source ? `${cause}:${source}` : cause;

const MELEE: Record<string, [string, string]> = {
  shambler: [
    "a shambler",
    "Melee attacks growl as they wind up; step back or strafe out of reach before they land.",
  ],
  skeleton: [
    "a skeleton",
    "Melee attacks growl as they wind up; step back or strafe out of reach before they land.",
  ],
  knight: [
    "a knight",
    "A knight's sword winds up before it swings; step back as you hear it.",
  ],
  hound: [
    "a hound",
    "Hounds bite after a short snarl; keep moving so the bite lands on empty ground.",
  ],
  brute: [
    "a brute",
    "A brute's swing reaches farther and hits hardest; keep more distance, or freeze it and shatter it with the shotgun.",
  ],
};
const CASTERS: Record<string, string> = {
  monk: "a monk",
  witch: "a witch",
};

/** Name the thing behind a log key: "a witch's hellfire", "your own blast". */
export function describeDamage(key: string, name = "the general") {
  const [cause, source] = key.split(":");
  // Mid-sentence: "Slain by the Gravewarden's shockwave".
  const general = name.replace(/^The /, "the ");
  if (MELEE[cause]) return MELEE[cause][0];
  if (cause === "hellfire") {
    const caster =
      source === "boss" ? general : (CASTERS[source] ?? "the damned");
    return `${caster}'s hellfire`;
  }
  if (cause === "shockwave") return `${general}'s shockwave`;
  if (cause === "general contact") return general;
  if (cause === "explosion") return "your own blast";
  return "the damned";
}

/** How the killing source is avoided; mechanics the game already has, nothing new. */
export function deathTip(key: string) {
  const [cause] = key.split(":");
  if (MELEE[cause]) return MELEE[cause][1];
  if (cause === "hellfire")
    return "Hellfire flies straight at where you stand; strafe across it. A dashed arc at the crosshair marks a shot coming from off-screen.";
  if (cause === "shockwave")
    return "Shockwave rings run along the ground; jump as a ring reaches you.";
  if (cause === "general contact")
    return "A general burns whatever it touches; keep your distance and circle it.";
  if (cause === "explosion")
    return "Rockets and grenades hurt you too at close range; switch to the shotgun when the damned are near.";
  return "";
}

/** The first word of a sentence, capitalized ("a witch's…" → "A witch's…"). */
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The death screen's lines: the killing blow, the top sources of damage, and a tip. */
export function deathRecap(
  log: Readonly<DamageLog>,
  killer: string,
  general?: string,
  top = 3,
) {
  const sources = Object.entries(log)
    .filter(([, damage]) => damage >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([key, damage]) => ({
      name: capital(describeDamage(key, general)),
      damage: Math.round(damage),
    }));
  return {
    killedBy: `Slain by ${describeDamage(killer, general)}`,
    sources,
    tip: deathTip(killer),
  };
}
