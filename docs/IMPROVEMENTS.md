# Improvement plan (October 2026)

This is a review of Purgatory v0.1.0 as a player would meet it. It is grounded in the code, the automated checks, a headless autopilot, and screenshots of the running game. It ranks what to fix next and proposes the scope for the next round of work.

## Outcome of this round (2026-10-06)

The orchestrator approved items 1, 2, 3, 5 and 6 as planned. Item 4 was narrowed: commit the autopilot and its before/after table, fix only clearly broken encounters, and leave the difficulty direction to the owner. Weapon progression (#14) is out of scope.

| Item | Status | Verified by |
| --- | --- | --- |
| 1. Bug-fix pass | Done | `tests/core.test.ts` (arch rings at 1.7–45 m spans); `tests/improvement-checks.js` (no visible particles at the eye after a hellfire hit, level stats survive a sector retry, singular kill count), each shown failing on the old code first; before/after captures `docs/media/improvements/01-*.jpg` |
| 2. Enemy audio telegraphs | Done | `tests/audio.test.ts` (pan, gain, range, voice budget); browser checks that a left-side wind-up pans left and a right-side cast pans right; offline render levels (cue peaks 10–15 dB under gunfire); a 24 s bot-fight mix, `02-enemy-cues-combat-mix.mp3`. **Not listened to by a person.** |
| 3. Threat direction and last-enemy locator | Done, plus the stuck-enemy rescue | Browser checks for arcs (behind, left, right, following the view, fading), off-screen incoming fire, locator conditions, artificial walls and a real Hallowed Ground corner trap; capture `03-threat-indicators.jpg` |
| 4. Encounter pacing | Narrowed as directed: autopilot committed, table recorded, one broken encounter fixed (enemies wedged in a headstone corner), no balance values changed | `tests/balance-autopilot.js`, 60-run before/after table in [DEVELOPMENT.md](DEVELOPMENT.md#balance-autopilot) |
| 5. Hostable web build | Done; Pages workflow added but not enabled or run | Served zip driven through the menus in Electron (delayed, failed-then-retried and prefetched environments) and in `chrome-headless-shell` 151; boot download 86 MB → 50 MB; `05-web-loading-error-and-play.jpg` |
| 6. First-run combat hints | Done | `tests/hints.test.ts`; browser check (once each, saved, held during a general's introduction, never when disabled); captures `06-*.jpg` including the touch layout |

Still open: everything below rank 6 in the list, the owner decisions at the end, and human checks (a listening pass on the new audio, playtesting the difficulty curve, physical controllers and phones, Firefox and Safari).

## Baseline (2026-10-06, `main` at 4672978)

| Check | Result |
| --- | --- |
| `npm test` | 56 / 56 pass |
| `npm run build` | Passes. One 2.8 MB JS chunk (983 kB gzip) triggers Vite's chunk-size warning |
| `npm run format:check` | Clean |
| `npm run test:desktop` (Electron smoke) | Passes: render, native save, options persistence, start a level; no renderer errors |
| `tests/*-checks.js` against `npm run dev` (run in an offscreen Electron window) | browser 22/22, polish 5/5, menu 8/8, input-physics 11/11, refinement 7/7; 0 console errors |
| `tests/performance-checks.js` (Radeon 8060S iGPU, 1280×800, 24 mixed enemies + 8 ragdolls) | Render median 7.2 / 3.8 / 4.1 ms (High / Medium / Low), p90 10.3 / 6.7 / 6.7 ms. Simulation median 3.3 ms, p90 4.3 ms |

Screenshots were taken of the title, Hallowed Ground, six procedural levels, a boss sector, and the pause and death screens.

**Balance autopilot.** I wrote a throwaway bot that uses the development API. It has perfect aim, picks a weapon by range, backs off at close range and strafes, but does no pathfinding or pickup routing. It ran 30 sector clears: 10 sectors × 3 difficulties.

| Sector type | Typical clear time | Damage taken | Deaths |
| --- | --- | --- | --- |
| Ordinary sectors (L0, L5, L12, L17, L22) | 45–120 s | 0–123, mostly under 45, even on Torment | 0 / 15 |
| Boss sectors (L4, L10, L19, L23) | 40–120 s | 35–237 | 6 / 12, including two deaths on Purgatory (normal) |

One run (L0 sector 4, Reverie) timed out after 6 minutes with one enemy alive. I could not reproduce it in five reruns. It may be the bot's lack of pathfinding rather than a stuck enemy. Treat the table as a lower bound on difficulty for ordinary sectors, since a human aims worse than the bot, and as sample-size-one per cell. It still shows the shape of the curve. At a rough 1–2.5 minutes per sector, the 104 sectors put the campaign at about 2–4.5 hours. That figure is unmeasured with humans.

## What a player meets

- **The first minute is good-looking but unexplained.** You get the full arsenal of five weapons and ten modes at once. The only teaching is a fading key line on the HUD and the static Arsenal page. The game's signature combos (freeze then shatter, a stake into your own grenade, the storm orb, souls into the Wraith) are never taught in play.
- **Enemies are silent.** `src/audio.ts` has player shots, hits, footsteps, pickups, explosions and music. No enemy makes a sound: not on spawn, melee wind-up, hellfire cast, or death, and the bosses are silent too. Nothing is spatialized. Melee wind-ups exist to be dodged (`attackWindup`), but you can only see them, and only when the enemy is on screen.
- **Damage has no direction.** `hurt()` drives one full-screen red flash. Hellfire from a witch behind you looks the same as a knight in front.
- **Bug: hostile hits paint a flat peach polygon over the view.** When hellfire hits the player, `burst(p.mesh.position, 0xffa365, …)` spawns unlit icosahedron particles about 0.3 m from the camera. They render as large flat shapes covering part of the screen (seen in the Spire of Tongues, The Abyss and Frostbound Crossing captures).
- **Bug: wide arches render as a fan of floating planks.** The `arch()` helper in `src/world.ts` sizes voussoirs as 0.78 m tangential × `width·0.16` radial. For the 45 m arches in the `snow` theme (Frostbound Crossing), that makes 7 m-long radial slats with 5 m gaps. The level looks broken: snowless pyramids under a sunburst of planks.
- **Bug: level results and the tarot soul goal reset on death.** `start()` zeroes `levelKills`, `levelSouls`, `secrets` and `elapsed`. A death in sector 4 therefore wipes the whole level's stats and the 25-soul tarot progress for that level. The death screen also reads "1 enemies slain".
- **Ordinary sectors don't threaten.** The player moves at 10–13 m/s, and the fastest enemy (hound) moves at 7. Enemies are mostly melee and spawn one every 0.6 s at random points at least 9 m away. Wave composition is a uniform draw from a pool that reaches all seven breeds by level 10, so chapters III–V add only head count. Every sector is three waves with the same structure.
- **The last enemy can be hard to find.** The arena is 52 × 62 m with cover. The HUD gives a "REMAINING" count but no direction.
- **Procedural themes blur together.** Every procedural arena shares the floor slab, perimeter, the four torch plinths at the spawn and the end, and the limestone material. Snow has no snow, and harbor and station read as the same brown yard.
- **Web reach is limited.** The web build is a manual zip with no packaging script or CI. Boot loads all 13 GLBs (81 MB, about 40 MB if the server compresses it) and the 4.7 MB HDR before the menu appears. If `tools/fetch-art.py` has been run, `npm run build` also copies 64 MB of git-ignored source textures from `public/assets/textures/*/` into `dist/`, and the runtime never requests them.

## Ranked list

Impact is for a real player. Effort: S is under half a day, M is one to two days, L is more. Risk covers regressions and balance uncertainty.

| # | Improvement | Impact | Effort | Risk |
| --- | --- | --- | --- | --- |
| 1 | **Fix the visible bugs**: hostile-hit particles in the camera, wide arches, level stats and tarot souls wiped on death, plural text | High: the first two are visible in normal play | S | Low |
| 2 | **Enemy audio telegraphs**: synthesized, stereo-panned and distance-attenuated cues for spawn, melee wind-up, hellfire cast, death, boss roar/shockwave; a distinct kill confirm | High: fairness and game feel | M | Low; the existing audio is fully synthesized, so this follows the same pattern |
| 3 | **Directional threat feedback**: hit-direction arcs around the crosshair, an edge marker for hellfire about to hit, and a last-enemies locator once at most 3 remain | High | S–M | Low |
| 4 | **Encounter pacing pass**: authored wave mixes per chapter (named squads such as a brute escort, a witch flank, a hound pack), spawns in view or flanking rather than uniform random, a modest ranged share, and boss spikes smoothed. A committed autopilot harness verifies it | High: replayability and the difficulty curve | M | Medium: balance without human playtests |
| 5 | **Hostable web build**: `npm run package:web` (a reproducible zip that excludes unused textures), lazy-loading of the authored environment GLBs not needed for the title, and a GitHub Pages workflow (needs the owner's go-ahead to enable) | High for reach | M | Low–medium |
| 6 | **First-run combat hints**: one-time contextual prompts for shatter, stake-grenade launch, storm orb, Wraith, tarot and gate; an option to disable them | Medium–high for the first five minutes | S | Low |
| 7 | Key rebinding (keyboard and mouse) in Options | Medium (accessibility; README known gap) | M | Medium: touches every input path |
| 8 | Per-theme identity for procedural arenas: floor material/colour, removal of the shared plinths, snow cover, water planes, one signature landmark each | Medium–high | M–L | Low–medium |
| 9 | Meshopt geometry compression in `tools/optimize-glb.py` (three.js has the decoder), roughly halving download size | Medium (web) | M | Medium: re-export through the art pipeline |
| 10 | Per-level records: best time, rank or medal on the result screen and level select | Medium (replay) | S | Low |
| 11 | Mid-sector resume on quit | Low–medium | L | Medium |
| 12 | Windows and macOS packages | Medium (reach) | M | High: cannot be tested on this machine |
| 13 | Distinct general models and attacks | Medium | L | Medium (art) |
| 14 | Weapon progression (unlock weapons across chapter I instead of all at once) | Possibly high for onboarding | M | High: a design change for the owner to decide |

## Proposed scope for this round

Six items, in implementation order. Items 1–4 are the core. Items 5–6 go in if time allows.

### 1. Bug-fix pass

- Hostile impacts on the player spawn no particles within 1.5 m of the camera; the hit is shown by item 3's indicator instead. Particle bursts are clamped so none can be closer than the near-field threshold.
- `arch()` builds continuous arches at any width (segment count and tangential size derived from the arc length). The snow, ruins and any other wide arches render as solid arcs.
- Kills, souls, relics and time for the level persist across a sector retry. Only a fresh level start resets them. The 25-soul tarot goal counts the whole level.
- The death screen pluralizes correctly.

**Verify:** new Vitest cases for arch segment coverage (no gaps for widths 5–45 m), for level stats surviving `retry()`, and for pluralization. A scripted capture of Frostbound Crossing and of a forced hellfire hit, compared before and after. Existing checks stay green.

### 2. Enemy audio telegraphs

- New synthesized cues in `src/audio.ts`: spawn, melee wind-up (distinct per weight class), hellfire cast, enemy death, boss enrage and shockwave, and a kill confirm separate from `hit()`.
- Cues are stereo-panned by bearing relative to the camera and attenuated by distance. Enemy cues use the effects channel and respect the volume settings. A voice cap and a per-frame budget keep crowds from clipping.

**Verify:** a unit test for the pan and gain mapping (left, right, behind, far) and the voice cap. A browser check that a wind-up and a cast emit the cue with the expected pan sign. A listen through the rendered-audio path in `tools/media/audio.js` (event stems) to make sure the mix doesn't swamp gunfire.

### 3. Directional threat feedback and last-enemy locator

- A damage arc around the crosshair points to the source of each hit (melee, hellfire, shockwave) and fades in about 1 s. It respects reduced camera motion and the crosshair toggle where relevant.
- When at most 3 enemies remain in the final count and none has been visible for 4 s, edge-of-screen markers point to them. As a safety net, an enemy that has made no progress for 20 s is moved to a valid spawn point in view.

**Verify:** browser checks that hits from behind, left and right produce arcs at the right angle, that locators appear only under the stated conditions, and that a deliberately walled-in enemy is rescued. Captures of the HUD.

### 4. Encounter pacing pass with a committed autopilot

- Commit the balance bot as `tests/balance-autopilot.js` with an Electron runner script, documented in `docs/DEVELOPMENT.md`.
- Replace the uniform enemy draw with per-chapter wave tables of weighted squads. The third wave of each sector carries a heavier squad, and ranged enemies are guaranteed from chapter II.
- Spawn some of each wave in the player's field of view or flanks at 12–25 m so fights start sooner.
- Smooth the boss sectors: reduce the escort count while a general is alive, give the shockwave an audio and visual wind-up, and tune the hellfire volley spread.

**Acceptance:** the autopilot shows ordinary sectors on Purgatory dealing meaningful damage (median at least 40 HP plus armor by chapter III) without deaths. Boss sectors on Purgatory are clearable by the bot in at least 2 of 3 runs. Reverie stays forgiving. Sector clear times stay within ±25% of baseline. The before and after table goes into `docs/DEVELOPMENT.md`, with the caveat that this is a bot, not a human playtest.

### 5. Hostable web build (if time allows)

- `npm run package:web` writes `release/purgatory-<version>-web.zip` from `dist/`, excluding `assets/textures/*/`.
- `src/assets.ts` loads the actor, weapon and supply GLBs, the cemetery (title backdrop) and the HDR at boot. It loads cathedral, crypt and factory on first use, with a loading overlay and an error path.
- A `.github/workflows/pages.yml` is added but not enabled or pushed. Enabling it is the owner's call.

**Verify:** the zip contains no unused textures, and its size is reported. The served zip boots in the cached Chromium headless shell and reaches the menu and a level in each authored theme. The boot download is measured before and after. Desktop smoke and browser checks stay green.

### 6. First-run combat hints (if time allows)

- A one-shot hint queue fed by in-game triggers: the first freeze, first shatter opportunity, first stake fired near your own grenade, Tempest equipped, 50 souls, first tarot card, gate opened. Hints are stored in settings, can be turned off in Options, and are never shown during a boss intro toast.

**Verify:** a unit test for the hint state machine, and a browser check that each hint fires once and never after being disabled.

## Needs a decision from the owner

- **Hosting the web build.** Should a GitHub Pages workflow (or another host) be enabled? Nothing will be deployed or pushed without approval.
- **Weapon progression (#14).** Unlocking weapons across chapter I would likely help onboarding most, but it changes the game's identity. I won't do it without a yes.
- **Balance targets.** Should Purgatory difficulty be noticeably harder in ordinary sectors, as proposed? The current design may intend a power fantasy with spikes at the generals.
