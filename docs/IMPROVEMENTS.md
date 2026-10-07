# Improvement plan (October 2026)

This is a review of Purgatory v0.1.0 as a player would meet it. It is grounded in the code, the automated checks, a headless autopilot, and screenshots of the running game. It ranks what to fix next and proposes the scope for the next round of work.

## Round 1 results (2026-10-06)

The orchestrator approved items 1, 2, 3, 5 and 6 as planned. Item 4 was narrowed: commit the autopilot and its before/after table, fix only clearly broken encounters, and leave the difficulty direction to the owner. Weapon progression (#14) is out of scope.

| Item                                       | Status                                                                                                                                                  | Verified by                                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Bug-fix pass                            | Done                                                                                                                                                    | `tests/core.test.ts` (arch rings at 1.7–45 m spans); `tests/improvement-checks.js` (no visible particles at the eye after a hellfire hit, level stats survive a sector retry, singular kill count), each shown failing on the old code first; before/after captures `docs/media/improvements/01-*.jpg` |
| 2. Enemy audio telegraphs                  | Done                                                                                                                                                    | `tests/audio.test.ts` (pan, gain, range, voice budget); browser checks that a left-side wind-up pans left and a right-side cast pans right; offline render levels (cue peaks 10–15 dB under gunfire); a 24 s bot-fight mix, `02-enemy-cues-combat-mix.mp3`. **Not listened to by a person.**           |
| 3. Threat direction and last-enemy locator | Done, plus the stuck-enemy rescue                                                                                                                       | Browser checks for arcs (behind, left, right, following the view, fading), off-screen incoming fire, locator conditions, artificial walls and a real Hallowed Ground corner trap; capture `03-threat-indicators.jpg`                                                                                   |
| 4. Encounter pacing                        | Narrowed as directed: autopilot committed, table recorded, one broken encounter fixed (enemies wedged in a headstone corner), no balance values changed | `tests/balance-autopilot.js`, 60-run before/after table in [DEVELOPMENT.md](DEVELOPMENT.md#balance-autopilot)                                                                                                                                                                                          |
| 5. Hostable web build                      | Done; Pages workflow added but not enabled or run                                                                                                       | Served zip driven through the menus in Electron (delayed, failed-then-retried and prefetched environments) and in `chrome-headless-shell` 151; boot download 86 MB → 50 MB; `05-web-loading-error-and-play.jpg`                                                                                        |
| 6. First-run combat hints                  | Done                                                                                                                                                    | `tests/hints.test.ts`; browser check (once each, saved, held during a general's introduction, never when disabled); captures `06-*.jpg` including the touch layout                                                                                                                                     |

Still open: everything below rank 6 in the list, the owner decisions at the end, and human checks (a listening pass on the new audio, playtesting the difficulty curve, physical controllers and phones, Firefox and Safari).

## Round 2 results (2026-10-06)

| Item                               | Status         | Verified by                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2-1. Key rebinding                | Done           | `tests/bindings.test.ts` (defaults, Escape, conflicts, parsing, persistence, labels, hint wording); `tests/round2-checks.js` rebinds through the real Options page, then moves, jumps, fires, picks a weapon, uses the gate with Mouse 4 and pauses with the new keys while the old ones stop working, and checks that Escape still pauses; capture `round2/r2-1-controls-rebinding.jpg`. Controller buttons are still fixed.                         |
| R2-2. Resume at the current wave   | Done           | `tests/resume.test.ts`; browser checks quit in wave 3 through the pause menu and Continue into wave 3 with the saved health, armor, ammunition, souls and kills, without respawning a taken supply; death, level select and finishing a level do not resume mid-sector; desktop smoke native save round trip; capture `round2/r2-2-wave-resume.jpg`. _Restart checkpoint_ is renamed _Restart sector_.                                                |
| R2-3. Per-theme arena identity     | Done           | Before/after contact sheets `round2/themes-before.jpg` and `round2/themes-after.jpg`; `tests/arena-checks.js` matches all 104 sectors' colliders and spawns against a fixture recorded before the change; draw calls +8.8% and triangles +5.2% across the 18 themes, with no measurable change in render time (table in [DEVELOPMENT.md](DEVELOPMENT.md#procedural-arena-dressing-round-2)). Snow is the one theme above 10% (+10.8%, 74 → 82 calls). |
| R2-4. Per-level records            | Done           | `tests/resume.test.ts` (merging, corrupt records, formatting); browser checks for NEW BEST TIME, a slower deathless clear keeping the best time, the level-select record line, and a death that survives quitting from the death screen; capture `round2/r2-4-records.jpg`.                                                                                                                                                                           |
| R2-5. Generals' identity (stretch) | Done, cosmetic | Browser check: five distinct material sets, unchanged health, speed, hit sphere and scale, and a dressed general still ragdolls; capture `round2/r2-5-generals.jpg`. The silhouettes (crown, antlers, horns, halo, wings) do most of the work; the colour differences are subtle under torchlight.                                                                                                                                                    |

**Found along the way and fixed:**

- After a death, quitting from the death screen and continuing would have restarted the sector with the death forgotten, which would have allowed a false "deathless" record and dropped the level's running stats. Now every sector start, including the one after a death, is saved as a wave-1 snapshot that matches _Rise again_ exactly.
- The level-select previews still showed the pre-round-1 broken arches and the old floors. `tools/make-previews.cjs` now regenerates them from the game.
- Browser checks could inherit options left in the shared Electron profile by other runs (a screenshot run had moved E to Jump). The runner now uses an in-memory session.

**Balance regression run.** The full autopilot (60 runs) on this branch gave cleared/died/timed-out of 12/0/0, 12/0/0 and 11/1/0 for ordinary sectors on Reverie, Purgatory and Torment, and 5/3/0, 4/4/0 and 2/6/0 for general sectors, with no timeouts. The three Reverie general deaths looked new, so I re-ran the two deadliest generals (Seraph's Ascent and The Abyss) on Reverie with four seeds each on `main` and on this branch: `main` died twice and this branch not at all. That is run-to-run variance, as expected, since nothing in round 2 touches combat values or layouts.

**Still open / owner decisions:** controller rebinding; Windows and macOS builds; meshopt compression (needs a new tool install); hosting the web build; difficulty direction, including whether to telegraph the generals' shockwaves (the autopilot's main killer); weapon progression; bespoke general models and authored scenes for the 18 procedural themes.

## Round 3 results (2026-10-06)

| Item                                 | Status           | Verified by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R3-1. Controller rebinding           | Done (`e0a815f`) | `tests/pad-bindings.test.ts` (defaults match the old layout, Start/Home/out-of-range rejected, duplicates, conflicts, persistence, labels, controller hint wording); `tests/round3-checks.js` rebinds through the real Options page with a synthetic gamepad, then jumps with RT, fires with LB, picks a weapon and uses the gate with the D-pad while the old buttons do nothing, checks that Start still pauses, that Start or Esc cancels a capture and Backspace clears it, and that the HUD key line, gate prompt, tarot line and a hint name the new buttons; capture `round3/r3-1-controller-rebinding.jpg`. |
| R3-2. Stick look speed and vibration | Done (`5141177`) | `tests/controller-feel.test.ts` (limits, migration of the old speed from saved mouse sensitivity, rumble magnitudes in 0–1 and growing with damage); browser checks that mouse sensitivity no longer changes stick speed, that stick speed 2 turns twice as far, that the slider saves, that a brute's hit rumbles harder than a hound's, a shockwave hardest, a near explosion rumbles and a far one does not, and that nothing is requested with vibration off or without an actuator. **Not felt on a physical controller.**                                                                                     |
| R3-3. Death recap                    | Done (`912e235`) | `tests/recap.test.ts` (wording for every cause, general names, sorting, rounding, empty logs); browser checks for real deaths by a witch's hellfire projectile, a brute after an earlier self-inflicted blast (both listed), the player's own blast and a shockwave ring in The Barrow ("Slain by the Gravewarden's shockwave"), and that the log starts fresh after _Rise again_, a new sector and _Continue_ after quitting from the death screen; capture `round3/r3-3-death-recap.jpg`.                                                                                                                         |
| R3-4. Gate guide                     | Done (`d431be3`) | Browser check clears a sector the way the game does, then checks no marker before the clear, none with the gate ahead, behind/left/right bearings with opposite signs for left and right, the distance label, the HUD element, none when standing in the gate, and none in the next sector; capture `round3/r3-4-gate-guide.jpg`.                                                                                                                                                                                                                                                                                   |

**Found along the way and fixed:** the tarot line on the HUD always said "Q", even after round 2's rebinding moved the tarot key; it now shows the bound key or controller button.

**Regression.** `npm test` 96/96 (82 before), `npm run test:browser` all green (arena 1/1, browser 22/22, improvement 12/12, input-physics 11/11, menu 8/8, performance, polish 5/5, refinement 7/7, round2 12/12, round3 14/14), `npm run build`, `npm run format:check` and `npm run test:desktop` pass. `~/.config/Purgatory` did not exist before the round and still does not.

**Balance regression run.** The full autopilot (60 runs, about 12 minutes) gave cleared/died/timed-out of 12/0/0, 12/0/0 and 12/0/0 for ordinary sectors on Reverie, Purgatory and Torment, and 8/0/0, 5/3/0 and 2/6/0 for general sectors, with no timeouts; median damage 1, 10 and 21 (ordinary) and 95, 116 and 176 (general). Round 2's run gave 12/0/0, 12/0/0, 11/1/0 and 5/3/0, 4/4/0, 2/6/0. Nothing in round 3 changes combat values, so the differences are run-to-run variance (the recap and rumble code shift no random draws, but the order of model-cache warm-up still does). The deaths again come from the generals: shockwaves, hellfire and contact, as in round 2.

**Still open / owner decisions:** the difficulty direction, including a warning before the generals' shockwaves (the death recap explains a shockwave death afterwards and the existing "SHOCKWAVE / JUMP" toast is unchanged, but no new warning was added); weapon progression; meshopt compression (needs a tool install); hosting the web build; Windows and macOS builds; bespoke general models; licensing and releases. Human checks still needed: a physical controller (rebinding, stick speed and especially how the vibration feels), phones, Firefox and Safari.

## Round 4 results (2026-10-06)

| Item                                   | Status           | Verified by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R4-1. Pre-compile shaders              | Done (`2d547bc`) | `tests/round4-checks.js` fights in a procedural and an authored arena on Low, Medium and High and fails if any shader compiles mid-fight; it passes, and fails with the warm-up disabled. `tools/stutter.js` in a fresh session at load 18–23: `main` froze 183–2,450 ms on first spawns, 83–317 ms on first shots and about 1 s at level start; this branch had no fight frame over 33 ms and about 0.5 s at level start. The cost is one 350–450 ms frame on the title screen after boot.                                                         |
| R4-2. Running dry: switch, click, warn | Done (`941bf80`) | `tests/running-dry.test.ts` (weapon choice per button, skipping empty weapons, Thresher fallback, low threshold, option parsing); browser checks that holding fire with no rockets switches to the Tempest and keeps firing, that the alternate button looks at alternate reserves, that nothing switches with the option off (repeated dry clicks), that the counter turns red and clears with a pickup, and that the option saves from the Gameplay page; capture `round4/r4-2-low-ammo.jpg`. **The click has not been listened to by a person.** |
| R4-3. Firefox                          | Done (`fe201e2`) | `npm run test:firefox` runs every scenario suite in Firefox 157 headless (on the GPU) with no failures and no page errors; the packaged web zip plays through the real menus into Hallowed Ground's first wave at 60 fps; capture `round4/r4-3-firefox-web-build.jpg`. Nothing Firefox-specific needed fixing. Headless only: pointer lock and a person playing are untested, and Safari is still untested.                                                                                                                                         |
| R4-4. Interface scale                  | Done (`5a5db26`) | `tests/hud-scale.test.ts` (default, limits); browser checks that every HUD panel stays on screen and neighbouring panels do not overlap at 75%, 100% and 150%, at 1280×800 and 1920×1080, that the weapon bar grows by exactly 1.5×, and that the slider saves; captures `round4/r4-4-hud-75.jpg` and `r4-4-hud-150.jpg`.                                                                                                                                                                                                                           |

**Plan changes.** R4-1's "capture showing no visual change" became a check that the warm-up leaves nothing in the scene and restores the weapon models, since the warm-up frame is always drawn over before it reaches the screen. R4-2's unit tests do not cover the storm combo: a storm short of charge is not "empty" and still only shows its own message, which the existing input check covers.

**Found along the way.** The shadow pass shares one depth material and picks its shader variant (front, back or double sided; textured or not; skinned or not) in whatever order casters are drawn, so drawing everything once was not enough; every variant is now compiled explicitly. Shaders drawn into the composer's render target differ from ones drawn to the screen, so the warm-up compiles for the target the game actually uses.

**Regression.** `npm test` 104/104 (96 before), `npm run test:browser` all green (arena 1/1, browser 22/22, improvement 12/12, input-physics 11/11, menu 8/8, performance, polish 5/5, refinement 7/7, round2 12/12, round3 14/14, round4 9/9), round4 also at 1920×1080, the same suites in Firefox, `npm run build`, `npm run package:web`, `npm run format:check` and `npm run test:desktop` pass. `~/.config/Purgatory` did not exist before the round and still does not; the other Electron profile folder on this machine (`~/.config/Painkiller Purgatory`, from October 4) was not modified.

**Balance regression run.** Nothing in round 4 changes combat values. Because _Switch weapon when empty_ changes what a player holds when a weapon runs dry, I ran the full autopilot (60 runs, about 7 minutes each, load 16–28 with one spike to 73) six times: four on this branch with the default settings, one on this branch with the option off, and one on `main` the same day. Cleared/died/timed-out, ordinary sectors then general sectors, Reverie/Purgatory/Torment:

| Build                         | Ordinary               | General             | Median general damage |
| ----------------------------- | ---------------------- | ------------------- | --------------------- |
| `main`                        | 12/0/0, 12/0/0, 12/0/0 | 6/2/0, 5/3/0, 2/6/0 | 30, 135, 179          |
| Branch, run 1                 | 12/0/0, 11/1/0, 12/0/0 | 7/1/0, 7/1/0, 3/5/0 | 35, 33, 157           |
| Branch, run 2                 | 12/0/0, 11/1/0, 12/0/0 | 8/0/0, 5/3/0, 2/6/0 | 47, 147, 173          |
| Branch, run 3                 | 12/0/0, 12/0/0, 12/0/0 | 8/0/0, 3/5/0, 3/5/0 | 30, 164, 161          |
| Branch, run 4                 | 12/0/0, 12/0/0, 12/0/0 | 8/0/0, 3/5/0, 2/6/0 | 58, 160, 165          |
| Branch, switch when empty off | 12/0/0, 12/0/0, 12/0/0 | 7/1/0, 5/3/0, 4/4/0 | 85, 96, 156           |

No run timed out. Run 1 looked much easier on the generals, but the next three runs of the same code did not repeat it: runs 3 and 4 were back to back and matched in 0 of 60 individual runs. So the autopilot is not reproducible run to run, even though it seeds `Math.random` and steps synchronously, and a difference of two or three deaths in a cell, or a median that moves by 100, is noise. I did not find the source. The bot already skips weapons with no primary ammunition, so the switch rarely comes into play for it. Across all six runs the picture is the same as in rounds 2 and 3: ordinary sectors are easy on every difficulty, and the generals kill the bot in 1 to 5 of 8 runs on Purgatory and 4 to 6 of 8 on Torment.

**Still open / owner decisions:** whether _Switch weapon when empty_ should be on by default (it is, as in most arena shooters; it changes no numbers, but it does keep a player firing who would otherwise stall); the difficulty direction, including a warning before the generals' shockwaves; weapon progression; meshopt compression (needs a tool install); hosting the web build; Windows and macOS builds; bespoke general models; licensing and releases. Human checks still needed: a physical controller, phones, a person playing in Firefox, Safari, and a listen to the new dry click.

## Round 5 results (2026-10-07)

| Item                                   | Status                                        | Verified by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R5-1. Reproducible gameplay randomness | Done (`7015f91`), plus a frame-rate bug fixed | `tests/random.test.ts`; `tests/round5-checks.js`: a seeded fight in The Barrow repeats exactly with sound playing, real time passing and other sectors and new models in between (and fails when sound is wired back to the game's sequence), a different seed differs, the warm-up leaves the sequence alone, and the storm orb hits 7–7.5 times a second at 30, 60, 120 and 144 Hz from two frame phases (3.5–11.5 on the old code). Two full default autopilot runs in separate sessions matched in **60 of 60** runs; The Barrow run alone matched its runs inside the full set. |
| R5-2. Every-sector sweep               | Done (`79ede38`): one broken encounter fixed  | All 104 sectors on Purgatory: 99 cleared, 2 died (generals), 3 timeouts, all in Last Platform, where an enemy behind a train car slid along it forever without counting as stuck. After the fix: 102 cleared, the same 2 deaths, no timeouts; 96 sectors identical and 8 cleared sooner. `tests/round5-checks.js` reproduces it (fails on the old code); the default 60 runs: 57 identical, 3 same outcome. Arena collider fixture unchanged. Details in [DEVELOPMENT.md](DEVELOPMENT.md#reproducible-baseline-and-campaign-sweep-round-5).                                          |
| R5-3. The dry click, by measurement    | Measured (`c407b7a`); level unchanged         | Offline render with the game's synthesizer: the click peaks at −31.4 dBFS, level with a stone footstep (−31.0), loudest 50 ms 3 dB under it, so it was left alone. Listening clip `round5/r5-3-dry-click.mp3`. **Still not heard by a person.**                                                                                                                                                                                                                                                                                                                                      |
| R5-4. Web start-up progress and retry  | Done (`d709bd1`)                              | A production build behind `tools/serve-slow.cjs` at 3 MB/s per file: the bar rose in 15 steps to 13.5 of 49.9 MB within 4 s while only the first two files had been requested (the old bar stayed at 0 until a file finished), and never moved backwards. With `supplies.glb` blocked, _The download stopped / Try again_ appeared, and _Try again_ reached the menu in the same page, downloading only that file again. The same two checks pass in Firefox 157. Desktop smoke (`file://`) passes. Captures `round5/r5-4-start-up-progress.jpg` and `r5-4-start-up-retry.jpg`.      |

**Found along the way and fixed.** The storm orb's damage ticks, rocket trails and the Wraith's sparks were timed by displayed frames inside the fixed-step simulation, so on a 120 or 144 Hz display the orb hit 3.5 to 11.5 times a second depending on phase, instead of 7.5. They now count simulation steps (`Game.tick`); nothing changes at 60 Hz. This was also a third source of the autopilot's drift.

**Plan changes.** R5-2's first fix only counted time pressed against a wall and reset it after a second of free walking; the sweep showed the enemy slides freely for part of each of the player's laps, so the count now runs from the first blocked step until the enemy sees the player. That broader rule also rescues enemies stuck at Penitent Cells' cell-block corner, which made 2 of the default 60 autopilot runs (and 3 sectors of the sweep) clear sooner with the same outcome.

**Regression.** `npm test` 108/108 (104 before), `npm run test:browser` all green at load 13 (arena 1/1, browser 22/22, improvement 12/12, input-physics 11/11, menu 8/8, performance, polish 5/5, refinement 7/7, round2 12/12, round3 14/14, round4 9/9, round5 6/6), the same suites in Firefox 157, the start-up checks in Firefox as well as Electron, `npm run build`, `npm run package:web` (42.0 MB zip), `npm run format:check` and `npm run test:desktop` pass. `~/.config/Purgatory` did not exist before the round and still does not; `~/.config/Painkiller Purgatory` (October 4) was not modified.

**Balance.** No health, speed, damage, ammunition or wave value changed. Because runs are now reproducible, the default 60-run table in [DEVELOPMENT.md](DEVELOPMENT.md#reproducible-baseline-and-campaign-sweep-round-5) is a baseline later builds can be compared with run by run: ordinary sectors 12/0/0, 12/0/0 and 11/1/0 on Reverie, Purgatory and Torment, generals 7/1/0, 6/2/0 and 1/7/0. Same picture as rounds 2–4.

**Still open / owner decisions:** the difficulty direction, including a warning before the generals' shockwaves (still the bot's main killer); weapon progression; whether the dry click should be louder or more distinct from the music's hat once someone has listened; meshopt compression (needs a tool install); hosting the web build; Windows and macOS builds; bespoke general models; licensing and releases. Human checks still needed: a physical controller, phones, a person playing in Firefox, Safari, a 120/144 Hz display (the storm orb fix is verified with synthetic frame timing only), and a listen to the dry click.

## Round 5 scope (2026-10-06)

Round 4 left one measurement problem open: the balance autopilot gave different results run to run on the same code, so balance numbers could not be compared. A first look this round found both causes:

- **Sound draws from the game's random sequence.** `Sound.noise()` fills each noise buffer with `Math.random()` (hundreds to thousands of draws per sound), and the music beat and the enemy-cue budget run on the audio clock and `performance.now()`. How many numbers sound takes therefore depends on wall-clock time, and every draw after that shifts enemy spawns and attacks. Two sessions of three sectors with the same seeds (load 3–5) gave three different results, one a death instead of a clear. With sound on its own generator, two sessions matched exactly.
- **Three.js draws four `Math.random()` numbers for every object, material and geometry it creates** (`generateUUID`). Models and materials built for the first time (caches, pools) therefore shift the sequence, so a sector's result depends on which sectors ran before it: The Barrow on its own and after Hallowed Ground 4 gave a clear and a death.

The fix is the same for both: gameplay draws from its own seeded generator, which nothing else touches. That also makes a full sweep of the campaign reproducible, so a broken encounter found by the bot can be replayed exactly. Out of scope as before: difficulty and balance values (including a shockwave warning), weapon progression, meshopt, hosting, licensing, releases.

### R5-1. Reproducible gameplay randomness

A `src/random.ts` generator (seeded from `Math.random()` at start-up, so play stays as random as before) replaces `Math.random()` in gameplay and combat effects. Sound gets its own generator. The shader warm-up builds its models without touching the gameplay sequence. The development API gets `seed(n)`, and the autopilot uses it instead of replacing `Math.random`. No balance values change.

**Accept / verify:** unit tests for the generator (same seed, same sequence; reseeding; range). A browser check that a scripted fight gives the same result twice with the same seed even with sound playing, real time passing between frames, and other sectors and fresh models in between, and that the warm-up leaves the sequence untouched. Two complete default autopilot runs in separate sessions match in 60 of 60 runs, and a sector run on its own matches the same sector inside the full set.

### R5-2. Every-sector sweep for broken encounters

Run the autopilot once through all 104 sectors on Purgatory and look at every timeout, every enemy or player outside the arena, and every sector whose gate does not open. Replay each one with its seed, and fix what is clearly broken in the level or the spawning (as round 1 did for the headstone corner). Report what is only the bot's lack of pathfinding. No difficulty values change.

**Accept / verify:** the sweep's results in DEVELOPMENT.md; each fix has a check that reproduces the broken case and fails on the old code; a second sweep with no new timeouts caused by the fixes; the arena collider fixture either unchanged or updated with the reason stated.

### R5-3. Listen to the dry click (by measurement)

Nobody has heard the empty-weapon click from round 4. Render it offline, with the footsteps, weapon switch, menu tick and gunfire it plays among, and compare peak and loudness. If it is clearly too quiet to notice over footsteps and music, raise it; otherwise leave it. Either way, commit a short listening clip for the owner.

**Accept / verify:** a table of levels in DEVELOPMENT.md and `docs/media/improvements/round5/r5-3-dry-click.mp3`. It is still **not heard by a person**, and will be reported as such.

### R5-4. Web start-up progress and retry

The web build downloads 50 MB before the menu, and the progress bar only moves when a whole file finishes: the 21 MB cemetery is first, so a player on a slow connection sees 0% for most of the wait, and the 4.9 MB sky is not counted at all. If any boot download fails, the page says "Restart the game to retry". Count progress in bytes across every boot file including the sky, and on a failed download offer _Try again_, which retries only what failed.

**Accept / verify:** a served production build with a deliberately slow server shows the bar moving steadily during the cemetery download; a blocked file shows the retry screen and recovers when unblocked, without reloading the page; the desktop smoke test and the existing loading checks stay green; a capture.

### Regression

`npm test`, `npm run test:browser`, `npm run test:firefox`, `npm run test:desktop`, `npm run build`, `npm run package:web`, `npm run format:check`, the arena collider fixture, and the autopilot runs above. `~/.config/Purgatory` is checked before and after (it did not exist at the start of the round).

## Round 4 scope (2026-10-06)

The ranked list is done apart from owner decisions (meshopt, weapon progression, difficulty, hosting) and work that cannot be tested here (Windows and macOS) or needs new art (bespoke generals). So this round's items come from a fresh look at the running game. Two things turned up:

- **First-use stutter.** In a fresh session (offscreen Electron, load average 8), the first frame of the first level took 883 ms, the first skeleton and revenant spawns froze the game for 117 and 183 ms, and the first rocket for 67 ms. Running the same script a second time, no frame went over 17 ms except the level start (133 ms) and one 67 ms frame. The game never pre-compiles its shaders, so each new material compiles the first time it is drawn, in the middle of a fight.
- **Firefox is installed here.** Headless Firefox 157 can be driven over WebDriver BiDi, which is built in, with a throwaway profile and nothing to install. The README says Firefox has never been tried.

Out of scope as before: difficulty and balance values (including a shockwave warning), weapon progression, meshopt, hosting, licensing, releases.

### R4-1. Pre-compile shaders (no first-use stutter)

Compile the materials the game will need before they are first drawn: enemies, generals' wardrobe, weapons, projectiles, effects, pickups and the Wraith tint while the title is up, and each arena's materials as it loads. Nothing should look different.

**Accept / verify:** the stutter script, run in a fresh session, shows no frame over 50 ms on the first spawn of each breed or the first use of each fire mode, and a shorter freeze at level start. Measured before and after with the load noted, and committed as a repeatable check. Existing checks stay green, and a capture shows no visual change.

### R4-2. Running dry: switch weapons, click, warn

Today, firing an empty mode only shows "OUT OF AMMO / SWITCH WEAPON" and you have to switch by hand in the middle of a fight. Instead, firing an empty mode plays a dry click and, if the new _Switch weapon when empty_ option is on (the default), switches to the highest slot with ammunition for the button you pressed. The Thresher's blades never run out, so there is always something to switch to. The ammunition counter turns red when the mode in hand is low. No ammunition amounts change.

**Accept / verify:** unit tests for the weapon choice (the button pressed, skipping empty weapons, never the current weapon, falling back to the Thresher). Browser checks that holding fire with empty rockets switches to the next weapon with ammunition and keeps firing, that the alternate button looks at alternate ammunition, that nothing switches with the option off, that the dry click plays, and that the low-ammunition state appears and clears with a pickup. A capture.

### R4-3. Firefox

A `tools/firefox-checks.mjs` runner drives the system Firefox headless (profile in `artifacts/`, deleted afterwards) through WebDriver BiDi. It runs the same `tests/*-checks.js` scenarios as `npm run test:browser` against a dev server, and plays the packaged web build through the real menus. Fix what fails in Firefox only.

**Accept / verify:** the scenario suites pass in Firefox, or every failure is fixed or explained. The packaged build reaches the menu and plays a level with no console errors. A capture from Firefox. Safari is still untested (WebKit cannot be driven here without installing Playwright).

### R4-4. HUD scale (if time allows)

An _Interface scale_ option (75–150%) for the in-game HUD: health, armor, ammunition, weapon bar, key line, hints, toasts and the boss bar. Menus and the touch layout stay as they are.

**Accept / verify:** a browser check that every HUD element stays inside the viewport and that the main panels don't overlap, at 75%, 100% and 150% on 1280×800 and 1920×1080, and that the option saves. Captures at 75% and 150%.

### Regression

`npm test`, `npm run test:browser`, `npm run test:desktop`, `npm run build`, `npm run format:check`, and one full balance autopilot run (no combat values change, but R4-2 changes what the bot holds when it runs dry, so compare with round 3). `~/.config/Purgatory` is checked before and after.

## Round 3 scope (2026-10-06)

Picked from what is still open after round 2, for a player and without touching difficulty. Out of scope as owner decisions: difficulty retuning, a warning before generals' shockwaves, weapon progression, meshopt compression (needs a tool install), hosting, licensing, releases. Windows and macOS builds and bespoke general models stay deferred: the first cannot be tested here and the second needs new art.

### R3-1. Controller rebinding (rest of ranked #7)

Every gameplay action that the controller can trigger (fire, alternate fire, jump, sprint, next and previous weapon, use, tarot, inspect) gets a standard-mapping button, editable in Options › Controls by selecting a slot and pressing a controller button. A button another action uses moves and the page says so. Start always pauses and cannot be bound, the sticks stay move and look, and menu navigation (D-pad, A, B) is unchanged, so a player cannot lock themselves out. Bindings save with the options and reset with their own button and with "Restore all defaults". The HUD key line, gate prompt, weapon-slot keys and combat hints show the bound buttons instead of fixed names.

**Accept / verify:** unit tests for defaults, parsing (unknown actions, Start, out-of-range buttons, duplicates), conflicts and labels; a browser check that rebinds through the real Options page with a synthetic gamepad, then jumps, fires and uses the gate with the new buttons while the old ones do nothing, that Start still pauses, and that the HUD and a hint name the new button; the existing input checks stay green; a capture of the Controls page.

### R3-2. Controller feel: stick look speed and vibration

Look speed on the right stick is today the mouse sensitivity scaled, so a player who tunes the mouse also changes the stick. Add a separate _Stick look speed_ option (default equal to today's speed at the default mouse sensitivity) and an optional _Controller vibration_ (default on) for taking damage, nearby explosions, the generals' shockwave hitting you and becoming the Wraith, through the Gamepad `vibrationActuator` where the browser offers it. Nothing changes for players without a controller.

**Accept / verify:** unit tests for the option limits and the rumble strength mapping; browser checks with a synthetic gamepad that stick look speed is independent of mouse sensitivity, that hits request a rumble whose strength grows with damage, and that none is requested when vibration is off or the pad has no actuator. A physical controller is not available, so how it feels is **not verified** and will be reported as such.

### R3-3. Death recap

The death screen says what killed you and what hurt you during that attempt: the killing blow ("Struck down by a general's shockwave"), the damage taken from the top three sources, and one line on how that source is avoided (strafe across hellfire, keep distance from a brute's swing, your own rockets hurt up close, jump a shockwave ring). It describes mechanics that already exist; it does not warn before an attack and changes no numbers.

**Accept / verify:** unit tests for the recap (sorting, merging, wording, plural forms, unknown causes); browser checks that deaths by hellfire, melee, own explosion and shockwave each name the right cause, that the breakdown resets on _Rise again_ and with a new sector, and that a resumed save does not show a stale recap; a capture of the death screen.

### R3-4. Gate guide

Once a sector is cleared, the gate is a 4 m ring at one end of a 52 × 62 m arena with cover, and the HUD only says "Follow the green gate". When the open gate is out of view, show a gate marker at the screen edge pointing to it (distinct from the red enemy chevrons), with the distance in metres while it is off-screen.

**Accept / verify:** browser checks that the marker appears only after the sector is cleared, points left, right and behind correctly, hides when the gate is in view, and is gone in the next sector; a capture.

### Regression

`npm test`, `npm run test:browser`, `npm run test:desktop`, `npm run build`, `npm run format:check`, the arena collider fixture, and one full balance autopilot run (no combat values change, so it should match round 2 within run-to-run variance). Options are checked to never touch `~/.config/Purgatory` (the desktop smoke run uses its isolated profile).

## Round 2 scope (2026-10-06)

Picked from the ranked list below, plus what round 1 showed. A contact sheet of all 18 procedural themes (`docs/media/improvements/round2/themes-before.jpg`) shows them sharing one brown flagstone floor and the same four torch plinths. Prison and asylum are indistinguishable, snow has no snow, and town, castle, Babel and the canals read as the same yard. Out of scope as owner decisions: difficulty retuning (including a shockwave wind-up, which would make the deadliest general attack easier), weapon progression, hosting, licensing and releases. Meshopt compression (#9) needs a new tool install, so it waits.

### R2-1. Key rebinding (ranked #7)

Keyboard and mouse bindings for every action (move, jump, sprint, fire, alternate fire, next/previous weapon, weapons 1–5, use, tarot, inspect, pause, keyboard look), two slots each, editable in Options › Controls. Capturing a key that another action uses moves it and says so. Escape always pauses and cancels a capture, so a player cannot lock themselves out. Bindings persist with the other options and reset with "Restore all defaults". The HUD key line, gate prompt, notifications and keyboard hints show the bound keys.

**Accept / verify:** unit tests for parsing, validation, conflicts and labels; browser checks that a rebound key moves, fires, jumps and uses the gate while the old key no longer does, that a mouse side button can be bound, that bindings survive a reload of settings, and that Escape still pauses; a capture of the Controls page. The existing input checks stay green.

### R2-2. Resume at the current wave (ranked #11, reduced)

Today, quitting mid-sector restores the sector's start. Instead the save records a snapshot at the start of each wave: wave number, health, armor, ammunition, souls, the tarot's use, the sector's supplies already taken, and the level's running stats. _Continue_ resumes there. Death still restarts the sector with fresh supplies, as now. This is not an exact-frame save, but it caps the loss from quitting at one wave.

**Accept / verify:** unit tests that `parseSave` accepts a valid snapshot and rejects malformed ones; browser checks that quitting in wave 3 and continuing resumes wave 3 with the snapshot's health and ammo and without respawning taken supplies, that death clears the snapshot back to the sector start, and that the title and pause captions say which wave is saved; a desktop smoke run to make sure the native save still round-trips.

### R2-3. Per-theme arena identity (ranked #8)

Give each of the 18 procedural themes its own ground and dressing without moving any collider, so encounter balance is unchanged: snow cover and frozen pools, standing water in the swamp, canals and harbor, sand and cracked tile, plank decks, prison flagstones against asylum tiles, and a signature landmark where two themes now look alike. The shared torch plinths vary by theme.

**Accept / verify:** a before/after contact sheet of all 18 themes; a test that each theme's collider list is identical before and after (layout and difficulty untouched); `tests/performance-checks.js` draw calls and triangles within 10% of baseline on High; existing browser checks green.

### R2-4. Per-level records (ranked #10)

The result screen marks a new best time, and level select shows each level's best time, relics found and whether it was cleared without dying. Records come from the existing level stats (round 1 made them survive a sector retry) plus a death count.

**Accept / verify:** unit tests for record merging and save parsing; a browser check that finishing a level stores and shows the record, and that a slower clear keeps the old best; captures of the result screen and level select.

### R2-5. Generals' identity (stretch; cosmetic)

The five generals share one rig. Give each a distinct silhouette and palette (scale, colour, emissive markings, wardrobe pieces from the existing `enemy-wardrobe.glb`) without changing health, speed, attacks or hitboxes.

**Accept / verify:** a capture of all five; a check that general health, speed and radius are unchanged. Dropped and reported if it needs new art.

## Baseline (2026-10-06, `main` at 4672978)

| Check                                                                                      | Result                                                                                                                |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                                                 | 56 / 56 pass                                                                                                          |
| `npm run build`                                                                            | Passes. One 2.8 MB JS chunk (983 kB gzip) triggers Vite's chunk-size warning                                          |
| `npm run format:check`                                                                     | Clean                                                                                                                 |
| `npm run test:desktop` (Electron smoke)                                                    | Passes: render, native save, options persistence, start a level; no renderer errors                                   |
| `tests/*-checks.js` against `npm run dev` (run in an offscreen Electron window)            | browser 22/22, polish 5/5, menu 8/8, input-physics 11/11, refinement 7/7; 0 console errors                            |
| `tests/performance-checks.js` (Radeon 8060S iGPU, 1280×800, 24 mixed enemies + 8 ragdolls) | Render median 7.2 / 3.8 / 4.1 ms (High / Medium / Low), p90 10.3 / 6.7 / 6.7 ms. Simulation median 3.3 ms, p90 4.3 ms |

Screenshots were taken of the title, Hallowed Ground, six procedural levels, a boss sector, and the pause and death screens.

**Balance autopilot.** I wrote a throwaway bot that uses the development API. It has perfect aim, picks a weapon by range, backs off at close range and strafes, but does no pathfinding or pickup routing. It ran 30 sector clears: 10 sectors × 3 difficulties.

| Sector type                              | Typical clear time | Damage taken                            | Deaths                                             |
| ---------------------------------------- | ------------------ | --------------------------------------- | -------------------------------------------------- |
| Ordinary sectors (L0, L5, L12, L17, L22) | 45–120 s           | 0–123, mostly under 45, even on Torment | 0 / 15                                             |
| Boss sectors (L4, L10, L19, L23)         | 40–120 s           | 35–237                                  | 6 / 12, including two deaths on Purgatory (normal) |

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

| #   | Improvement                                                                                                                                                                                                                                                                      | Impact                                         | Effort | Risk                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| 1   | **Fix the visible bugs**: hostile-hit particles in the camera, wide arches, level stats and tarot souls wiped on death, plural text                                                                                                                                              | High: the first two are visible in normal play | S      | Low                                                                            |
| 2   | **Enemy audio telegraphs**: synthesized, stereo-panned and distance-attenuated cues for spawn, melee wind-up, hellfire cast, death, boss roar/shockwave; a distinct kill confirm                                                                                                 | High: fairness and game feel                   | M      | Low; the existing audio is fully synthesized, so this follows the same pattern |
| 3   | **Directional threat feedback**: hit-direction arcs around the crosshair, an edge marker for hellfire about to hit, and a last-enemies locator once at most 3 remain                                                                                                             | High                                           | S–M    | Low                                                                            |
| 4   | **Encounter pacing pass**: authored wave mixes per chapter (named squads such as a brute escort, a witch flank, a hound pack), spawns in view or flanking rather than uniform random, a modest ranged share, and boss spikes smoothed. A committed autopilot harness verifies it | High: replayability and the difficulty curve   | M      | Medium: balance without human playtests                                        |
| 5   | **Hostable web build**: `npm run package:web` (a reproducible zip that excludes unused textures), lazy-loading of the authored environment GLBs not needed for the title, and a GitHub Pages workflow (needs the owner's go-ahead to enable)                                     | High for reach                                 | M      | Low–medium                                                                     |
| 6   | **First-run combat hints**: one-time contextual prompts for shatter, stake-grenade launch, storm orb, Wraith, tarot and gate; an option to disable them                                                                                                                          | Medium–high for the first five minutes         | S      | Low                                                                            |
| 7   | Key rebinding (keyboard and mouse) in Options                                                                                                                                                                                                                                    | Medium (accessibility; README known gap)       | M      | Medium: touches every input path                                               |
| 8   | Per-theme identity for procedural arenas: floor material/colour, removal of the shared plinths, snow cover, water planes, one signature landmark each                                                                                                                            | Medium–high                                    | M–L    | Low–medium                                                                     |
| 9   | Meshopt geometry compression in `tools/optimize-glb.py` (three.js has the decoder), roughly halving download size                                                                                                                                                                | Medium (web)                                   | M      | Medium: re-export through the art pipeline                                     |
| 10  | Per-level records: best time, rank or medal on the result screen and level select                                                                                                                                                                                                | Medium (replay)                                | S      | Low                                                                            |
| 11  | Mid-sector resume on quit                                                                                                                                                                                                                                                        | Low–medium                                     | L      | Medium                                                                         |
| 12  | Windows and macOS packages                                                                                                                                                                                                                                                       | Medium (reach)                                 | M      | High: cannot be tested on this machine                                         |
| 13  | Distinct general models and attacks                                                                                                                                                                                                                                              | Medium                                         | L      | Medium (art)                                                                   |
| 14  | Weapon progression (unlock weapons across chapter I instead of all at once)                                                                                                                                                                                                      | Possibly high for onboarding                   | M      | High: a design change for the owner to decide                                  |

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
