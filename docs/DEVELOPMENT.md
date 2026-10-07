# Development notes

Long-form notes that do not fit the storefront README: how saves work, the test harnesses, measured performance, and the history of the internal builds that preceded the first public release (v0.1.0).

## Saves

Desktop campaign progress is atomically written to Electron's per-user data directory, normally `~/.config/Purgatory/campaign.json`. Settings are stored in the desktop application's local storage. Saves record the current sector, unlocked levels, completed-level scores, tarot cards and completion status. As each wave begins, `Game.snapshot()` also stores a `resume` record: the wave number, health, armor, ammunition, weapon, souls, whether the tarot was used, which fixed sector supplies were taken, and the level's running stats. **Continue** (`Game.continueGame()`) restores it and starts that wave after two seconds; earlier waves stay cleared. `parseSave` drops a malformed snapshot, or one for a different sector, without touching the rest of the save. It does not resume a fight at the exact frame where you quit. Death deletes the snapshot and restarts the sector with replenished supplies, as do _Restart sector_, level select and finishing a level. Replaying a level selects it as your current checkpoint. **New game** explicitly resets campaign progress.

The development preview uses browser local storage, separate from the desktop save. Desktop smoke tests use an isolated profile under `artifacts/`.

## Web build

`npm run package:web` builds and writes `release/purgatory-<version>-web.zip` with `tools/package-web.cjs` (Node's zlib only; no `zip` binary needed). A Vite build plugin keeps the source texture folders that `tools/fetch-art.py` downloads into `public/assets/textures/` out of `dist/`, because the GLBs embed their textures and the runtime only requests `moonrise.hdr`. That took a local `dist/` from 150 MB to 86 MB; the zip is about 42 MB.

Production builds load the actors, weapons, supplies, the cemetery (title backdrop) and the HDR sky before the menu: 50 MB instead of 86 MB. `prefetchArt()` then fetches the cathedral, crypt and factory scenes one at a time. `Game.start()` waits on a loading screen if the chosen level's scene is still downloading, and offers _Try again_ if the download fails. Development builds load everything up front so scripted checks and trailer capture never wait. `state().environmentsPending` lists scenes not yet loaded.

**Start-up progress and retry (round 5).** The start-up screen counts bytes across every start-up file, the sky included: `virtual:asset-sizes` (a plugin in `vite.config.ts`) lists each model's and the sky's size at build time, so the bar is right before any response headers arrive, behind a compressing server that sends no length, and on `file://` in the desktop build. A failed download does not stop the others; the screen then says _The download stopped_ and offers _Try again_, which fetches only what is still missing, without reloading the page. Errors after the downloads (WebGL, physics) still show the fatal screen. `tools/serve-slow.cjs` serves a build at a set rate per file and without lengths, or answers 503 for a named file until a page script unblocks it; `tools/media/round5/web-start.js` uses it (`npm run test:browser -- --url http://localhost:5190/ --no-boot --checks tools/media/round5/web-start.js`). Verified on 2026-10-06 against `dist/`: at 3 MB/s per file the bar rose in 15 steps from 0 to 13.5 of 49.9 MB within 4 s, while only the cemetery and the revenant had been requested, and never went backwards; with `supplies.glb` blocked the retry screen appeared after the other files finished, and _Try again_ reached the menu in the same page, downloading only `supplies.glb` again. Both checks also pass in Firefox 157 (`node tools/firefox-checks.mjs --url http://localhost:5190/#retry --no-boot --checks tools/media/round5/web-start.js`; the stage comes from the URL there).

Verified on 2026-10-06 by serving the extracted zip with `python3 -m http.server`: in an offscreen Electron (Chromium) window driven through the real menus, jumping straight to Soul Foundry with its download delayed showed the loading screen and then the authored foundry, a blocked crypt download showed the retry screen and recovered, and the background-prefetched cathedral started without waiting; in Playwright's cached `chrome-headless-shell` 151 (SwiftShader WebGL 2) it reached the menu and Hallowed Ground with no console errors. Firefox was first tried in round 4 (below); Safari has not been tested.

## Controls, records and checks added in round 2

Key bindings live in `src/bindings.ts` and are saved inside the options (`purgatory.options` › `bindings`). Each action has up to two codes: `KeyboardEvent.code` values or `Mouse0`–`Mouse4`. `parseBindings` drops unknown actions, unbindable codes and duplicates, and Escape is never bindable. `Game.held()`, `Game.press()` and `Game.firing()` route all keyboard and mouse input through the bindings; controller and touch input are unchanged. `Game.mouse` is still honoured as a fire input for scripted checks.

Per-level records are kept in `save.records` (`mergeRecord` in `src/core.ts`): the fastest clear, most kills, most relics in one clear, and whether the level was ever cleared without dying. Deaths are counted per level and carried through _Rise again_ and the wave snapshot.

Controller buttons are saved alongside (`purgatory.options` › `padBindings`): one standard-mapping button index per action, or `null`. `parsePadBindings` drops Start (9), Home (16) and anything outside 0–15, and keeps a button for one action only. `Controls.poll()` routes held actions (fire, jump, sprint) and one-shot actions (`Game.press()`) through them; Start always pauses, and menu navigation (D-pad, A, B) is fixed. While the Controls page waits for a button, `Controls.capture` receives every newly pressed button instead of the menus.

`tests/round2-checks.js` covers rebinding (through the real Options page), wave resume, records and the generals. `tests/arena-checks.js` guards arena layouts against `tests/fixtures/arena-colliders.json`. `tools/browser-checks.cjs` now runs in an in-memory browser session, so saves and options left by other runs cannot leak in.

## Death recap (round 3)

`Game.hurt(damage, from, cause, source)` adds each hit to `Game.damageLog`, keyed by cause plus, for hellfire, the caster (`hellfire:witch`, `hellfire:boss`). Each hit is capped at the health and armor the player had, so a killing blow's overkill is not counted. `loadArena()` clears the log, so it covers one sector attempt: _Rise again_, a new sector and _Continue_ all start fresh. On death `deathRecap()` in `src/recap.ts` turns it into the killing blow, the top three sources and a tip for the killing source. The tips describe existing mechanics only; no numbers changed.

## Gate guide (round 3)

`Game.gateGuide()` returns the open gate's bearing and distance once the sector is cleared, unless the gate is within 85% of the horizontal half field of view or the player is within 5 m of it. `threatIndicators()` adds it first as a `gate` marker, so the 12-marker cap never drops it. It is direction-only: a gate in the view cone but hidden behind cover gets no marker, since its 4 m ring usually shows above the cover.

`tests/round3-checks.js` covers controller rebinding, stick speed, rumble, the death recap and the gate guide. `tools/media/round3/*.js` set up the round's captures for `npm run test:browser -- --checks <script> --capture <file.jpg>`.

## Reproducible randomness (round 5)

Gameplay and combat effects draw from `random()` in `src/random.ts` (mulberry32), not from `Math.random`. At start-up it is seeded from `Math.random`, so ordinary play is as random as before; `seedRandom(n)` (the development API's `seed(n)`) makes what follows repeatable. Two things used to move the sequence from outside the game's logic:

- **Sound.** `Sound.noise()` filled each buffer from `Math.random`, hundreds to thousands of numbers per sound, and how many sounds play depends on the audio clock (the music beat) and on `performance.now()` (the enemy-cue budget). Sound now has its own generator (`generator()`), so it can never move the game's sequence.
- **Three.js.** `generateUUID` draws four `Math.random` numbers for every object, material and geometry, so building a model for the first time, or not, shifted every later draw. Three.js keeps `Math.random`; the game no longer shares it.

The simulation also had timing that followed displayed frames: the storm orb's damage ticks (`frame % 8`), rocket trails and the Wraith's sparks counted `Game.frame`, which the render loop advances, inside the fixed-step `update()`. On a 120 or 144 Hz display updates run on only some frames, so the orb hit 3.5 to 11.5 times a second depending on phase instead of 7.5. They now count `Game.tick`, the simulation steps since the arena loaded. At 60 Hz nothing changes.

`tests/round5-checks.js` checks that a seeded fight in The Barrow repeats exactly with sound playing, real time passing between batches of frames, and other sectors and freshly built models in between (and fails if sound draws from the game's sequence again); that a different seed gives a different fight; that the storm orb hits 7–7.5 times a second at 30, 60, 120 and 144 Hz from two frame phases; and that the shader warm-up leaves the sequence where it was. `tests/random.test.ts` covers the generator.

## Shader warm-up (round 4)

Three.js compiles a shader the first time a material is drawn under a given lighting and render target, and the game never did that ahead of time, so a fresh session froze for 100–2,500 ms the first time each breed appeared or a weapon fired. Now, after each arena loads, `Game.compileWarmUp()` builds one of everything a fight can draw (every breed, the five generals, projectiles, pickups, effect sprites and the weapons) and hands it to `renderer.compileAsync`, which lets the driver compile in parallel (`KHR_parallel_shader_compile`). It does this for both lighting setups the campaign uses (authored scenes have six lamps, procedural arenas four), and for the composer's offscreen target, because programs drawn into a render target differ from ones drawn to the screen. When that finishes, `Game.warmUp()` draws the set once, unseen, before the real frame, which catches what `compileAsync` cannot: the ambient-occlusion normal pass and the shadow pass. The shadow pass shares one depth material and picks its shader from the caster's side, texture and skinning in draw order, so every variant is compiled explicitly (fog-free, as the shadow pass draws). The set is built in isolation from the game's random sequence (`isolated()` in `src/random.ts`), so seeded runs are unchanged.

`tests/round4-checks.js` fights in a procedural and an authored arena on Low, Medium and High and fails if any shader program is compiled during the fight; with the warm-up disabled it fails. `tools/stutter.js` measures frame times in a fresh session (`npm run test:browser -- --checks tools/stutter.js --out artifacts/stutter.json`). On 2026-10-06, at a load average of 18–23 on this shared machine, `main` showed a 1.0 s freeze at the first level start, 183–2,450 ms on first spawns and 83–317 ms on first shots. This branch showed no fight frame over 33 ms and about 0.5 s at level start, at the cost of one 450 ms frame on the title screen after boot, when both lighting setups are compiled.

## Firefox (round 4)

`npm run test:firefox` (`tools/firefox-checks.mjs`) runs the same `tests/*-checks.js` scenarios in the system Firefox. It starts Firefox headless with `--remote-debugging-port` and drives it over WebDriver BiDi, which Firefox has built in, so nothing is installed. It uses a fresh profile under `artifacts/`, deletes it afterwards, and mutes audio through a profile preference. It takes the same `--checks`, `--url`, `--capture` and `--out` options as `npm run test:browser`, and `--serve <folder>` serves a production build instead of starting a dev server. Firefox's headless window is 1366 × 768 rather than 1280 × 800, since setting the viewport over BiDi needs system access.

Verified on 2026-10-06 with Firefox 157 on this machine (WebGL 2 on the Radeon iGPU, which Firefox reports as "Radeon R9 200 Series, or similar"). Every scenario suite passed: arena 1/1, browser 22/22, improvement 12/12, input-physics 11/11, menu 8/8, performance, polish 5/5, refinement 7/7, round2 12/12, round3 14/14 and round4 9/9, with no page errors. Nothing Firefox-specific needed fixing. The packaged `purgatory-0.1.0-web.zip`, extracted and served, was played with `tools/media/round4/web-play.js` (real menus, then walking, turning and firing with synthetic keyboard and mouse events, using only the read-only production API). It reached Hallowed Ground's first wave at 60 fps with no errors. Pointer lock is not exercised headless, and a person has not played it in Firefox.

## Interface scale (round 4)

`hudScale` (0.75–1.5, Options › Video) sets the `--hud-scale` CSS variable. Each HUD panel scales from the corner or edge it is anchored to (the level title from the top left, the ammunition from the bottom right, the weapon bar from the bottom centre), and the key line and hint move up with the weapon bar. Toasts and the gate prompt scale their font instead, so a long line cannot run off the screen. Menus and the touch layout are unchanged. `tests/round4-checks.js` checks that every panel stays on screen and that neighbouring panels do not overlap at 75%, 100% and 150%; `tools/browser-checks.cjs --size 1920x1080` runs it at another window size.

## The empty-weapon click, measured (round 5)

Nobody has listened to the dry click added in round 4, so `tools/media/round5/dry-click.js` renders it offline with the game's own synthesizer (`src/audio.ts`, default volumes: master 45%, effects 100%, music 65%) next to the sounds it plays among, and writes a listening clip (`npm run test:browser -- --checks tools/media/round5/dry-click.js --out artifacts/r5/dry-click.json`; the JSON holds the clip as base64 WAV). Levels in dBFS, for each sound on its own; "loudest 50 ms" is the RMS of the loudest 50 ms window:

| Sound                                   | Peak  | Loudest 50 ms |
| --------------------------------------- | ----- | ------------- |
| Dry click                               | −31.4 | −46.4         |
| Dry click and weapon draw (auto-switch) | −29.6 | −43.5         |
| Footstep, stone                         | −31.0 | −43.3         |
| Footstep, grass                         | −31.4 | −43.0         |
| Weapon draw                             | −33.6 | −46.1         |
| Menu tick                               | −36.5 | −48.6         |
| Hit marker                              | −29.3 | −42.4         |
| Kill confirm                            | −33.2 | −43.4         |
| Pickup                                  | −24.8 | −32.3         |
| Shotgun blast                           | −11.2 | −21.7         |
| Rocket                                  | −12.7 | −22.5         |
| Tempest star                            | −20.8 | −32.7         |
| Combat music, one bar                   | −25.3 | −35.5         |

The click peaks exactly as high as a footstep and its loudest 50 ms is 3 dB under one, so it sits with the other small handling sounds; it is not lost by design, and its level was left alone. Two things only a listener can judge: it is about 11 dB under the music bar's loudest 50 ms, and it is a short burst of filtered noise (5.2 kHz) like the music's off-beat hat (6.5 kHz), so over the music it may read as part of the rhythm. With _Switch weapon when empty_ on, the weapon-draw sound follows it at once. The 12-second clip `docs/media/improvements/round5/r5-3-dry-click.mp3` has walking to the music, three rockets, the rockets running dry (click and switch to the shotgun), two shotgun blasts, six clicks over the music with the option off, and three clicks alone.

## Combat music (round 6)

Until round 6 every sector of the campaign played the same bar: eight bass notes, a kick and a hat, 1.5 s long, started by `Sound.update()` on the first frame after each step was due. So the tempo followed the frame rate (0.2 s a step at 60 Hz instead of the intended 0.185 s, 0.1875 s at 144 Hz), and a late frame delayed the note.

`src/music.ts` now holds one theme per chapter: a key and mode, a tempo, a bass timbre, a four-bar phrase of eight steps, and a kick and hat pattern. Chapter I keeps the old bar as its first bar. `layerFor()` picks a layer from the fight: _calm_ (a drone an octave above the bar's root and the bass on two steps of eight, no drums) while the next wave gathers, _fight_ while enemies are alive or still to spawn, _general_ while a general lives (a quiet octave on the off-beats, softer kicks between the theme's own, and a two-tom fill at the end of the phrase), and silence once the sector is clear, as before. `Sequencer` places each step at an exact multiple of the step length from where the music started, 0.15 s ahead on the audio clock, whenever it is polled; steps a stall or a pause missed by more than 30 ms are skipped, so the music stays on its beat. Sound still draws from its own generator, so seeded runs are unchanged.

`tests/music.test.ts` covers the themes, layers and scheduler. `tests/round6-checks.js` polls the music in the running game at ragged intervals with a 100 ms hitch every 40 frames, and checks that kicks stay on the beat (worst error under 1 µs), that the calm, fight, general and cleared states play the right layers, that each chapter's bass stays in its theme, and that nothing plays with music off. Measured on 2026-10-07 at load 30 (`artifacts/`-only probe, kick spacing over 6 s): in the live 60 Hz frame loop `main` spaced kicks 0.78–1.02 s apart (mean 0.83, standard deviation 81 ms) and this branch exactly 0.74 s; with ragged polling, 0.78–0.98 s (51 ms) and exactly 0.74 s.

`tools/media/round6/music.js` renders the music offline with the game's synthesizer at the default volumes (`npm run test:browser -- --checks tools/media/round6/music.js --out artifacts/r6/music.json`), one full phrase of each. Levels in dBFS; "loudest 50 ms" is the RMS of the loudest 50 ms window, "overall" the RMS over the phrase:

| Music                           | Peak  | Loudest 50 ms | Overall |
| ------------------------------- | ----- | ------------- | ------- |
| Before round 6: the one loop    | −25.3 | −35.5         | −46.3   |
| I. Ashes of the Faithful, calm  | −40.5 | −44.5         | −51.7   |
| I, fight                        | −25.3 | −34.4         | −44.9   |
| I, general                      | −25.3 | −34.4         | −44.0   |
| II. The Hollow City, calm       | −36.3 | −44.5         | −51.3   |
| II, fight                       | −23.1 | −33.9         | −44.4   |
| II, general                     | −23.1 | −33.6         | −43.4   |
| III. Engines of Damnation, calm | −40.3 | −44.6         | −51.8   |
| III, fight                      | −27.0 | −36.0         | −44.3   |
| III, general                    | −27.0 | −36.0         | −43.9   |
| IV. Kingdom of Dust, calm       | −41.2 | −44.5         | −51.5   |
| IV, fight                       | −24.8 | −34.6         | −43.9   |
| IV, general                     | −24.4 | −34.4         | −43.2   |
| V. The Last Descent, calm       | −40.1 | −44.6         | −51.6   |
| V, fight                        | −25.3 | −34.6         | −43.8   |
| V, general                      | −25.3 | −34.6         | −43.2   |

Combat stays within about 2 dB of the old loop at its peaks; the phrases are denser, so the overall level is 1.4–3.1 dB higher. A first draft of the general layer peaked 5 dB higher, which could have covered the generals' roar and shockwave cues, so its extra drums were turned down until it matched the fight. The calm layer is 9–15 dB quieter. The 72-second clip `docs/media/improvements/round6/r6-1-music.mp3` plays the old loop (0:00), then each chapter waiting for a wave and fighting it: I at 0:07 (and a general at 0:16), II at 0:24, III at 0:35, IV at 0:45, V at 0:56 (and a general at 1:05). **Nobody has listened to it**; whether the themes suit the chapters is for a person to judge.

## Difficulty when a campaign begins (round 6)

_Enter Purgatory_ on a save with no progress (no kills, no unlocked level, first sector) and _New game_ after its confirmation open a page with the three difficulties and the same descriptions as Options › Gameplay, the current setting focused. Choosing one saves it as the option and starts Hallowed Ground; for _New game_ the save is reset only then, so backing out keeps the campaign. _Continue_, level select and Options are unchanged, and no difficulty value changed. `tests/round6-checks.js` covers the page, keyboard selection, Back, _Continue_ and _New game_; the desktop smoke test and `tools/media/round4/web-play.js` take the offered difficulty, as a player pressing Enter would.

## Inspection API and browser checks

`window.__PURGATORY__.state()` exposes read-only state and rendering counters in production. Development builds additionally expose deterministic setup and stepping controls. `tests/browser-checks.js` is a repeatable script for the collaborative preview's JavaScript evaluator: it exercises controls, all firing modes, freeze/shatter, death/retry, pickups, tarot, gates, level unlocks, every environment, each boss, the ending, and console-error checks. `tests/polish-checks.js` additionally checks melee wind-up/dodging, indoor entry/exit routes, and inspection input. Both preserve the campaign save they find. `tests/menu-checks.js` exercises keyboard navigation, rendering options, independent audio channels, confirmations, level selection, and pause/options/resume without resetting the fight. It restores the previous options and campaign save. Development setup and stepping controls are stripped from production builds.

The scripts in `tests/*-checks.js` can be pasted into, or evaluated by, a browser console attached to `npm run dev`. `npm run test:browser` runs them all headlessly: `tools/browser-checks.cjs` starts a Vite dev server on a free port, evaluates each script in an offscreen Electron window, and exits non-zero on any failed check or renderer console error. Pass `-- --checks menu,improvement` for a subset, `-- --url <dev server>` to reuse a running server, and `-- --out <file.json>` to keep the raw results. `tests/improvement-checks.js` covers the October 2026 improvement round described in [IMPROVEMENTS.md](IMPROVEMENTS.md). `tools/media/` drives the same development API for deterministic captures (see `tools/make_trailer.py`).

## Balance autopilot

`tests/balance-autopilot.js` is a repeatable yardstick, not a playtest. A scripted player aims perfectly at the nearest visible enemy, chooses the shotgun under 6 m, rockets under 18 m and stakes beyond, backs off when closer than 7 m, strafes, hops, and jumps a general's shockwave when it is about to arrive. It does not path-find or route to pickups. Each run seeds the game's random sequence, so a build gives the same results in every session and in any order (since round 5; see below):

```bash
npm run test:browser -- --checks tests/balance-autopilot.js --out artifacts/balance.json
```

The default set covers six ordinary sectors (Hallowed Ground 1 and 4, Penitent Cells 1, Soul Foundry 3, Spire of Tongues 5, Sealed Abbey 5) and four general sectors (The Barrow, The Drowned Fen, Seraph's Ascent, The Abyss) on all three difficulties with two seeds each: 60 runs, roughly 10–20 minutes on a busy machine. Damage includes armor.

Results on 2026-10-06, before (v0.1.0, `4672978`) and after the October improvement round:

| Sectors            | Difficulty | Cleared / died / timed out, before | Cleared / died / timed out, after | Median damage, before → after | Median clear time, before → after |
| ------------------ | ---------- | ---------------------------------- | --------------------------------- | ----------------------------- | --------------------------------- |
| Ordinary (12 runs) | Reverie    | 11 / 0 / 1                         | 12 / 0 / 0                        | 0 → 2                         | 76 s → 79 s                       |
| Ordinary (12 runs) | Purgatory  | 12 / 0 / 0                         | 12 / 0 / 0                        | 15 → 15                       | 79 s → 89 s                       |
| Ordinary (12 runs) | Torment    | 11 / 0 / 1                         | 10 / 2 / 0                        | 11 → 30                       | 91 s → 88 s                       |
| General (8 runs)   | Reverie    | 8 / 0 / 0                          | 8 / 0 / 0                         | 60 → 42                       | 83 s → 79 s                       |
| General (8 runs)   | Purgatory  | 2 / 6 / 0                          | 4 / 4 / 0                         | 168 → 162                     | 82 s → 90 s                       |
| General (8 runs)   | Torment    | 2 / 6 / 0                          | 4 / 4 / 0                         | 158 → 149                     | 84 s → 84 s                       |

Round 4 found that the autopilot was not reproducible run to run (two back-to-back runs of identical code matched in 0 of 60 runs). Round 5 found and removed the causes; two full runs in separate sessions now match in 60 of 60 runs. Results recorded before round 5 compare only as several complete runs, not run by run.

The round changed no balance values on purpose; how hard ordinary sectors should be is the owner's decision. Apart from the timeouts, the before/after differences are run-to-run variance: the code changes shift the seeded random sequence. In this sample that variance is about ±2 deaths per cell, so do not read the changed death counts as an effect.

The one real change is the **timeouts**. Both baseline timeouts (Hallowed Ground sector 4) ended with enemies wedged in the concave corner between a headstone and a grave slab at (-7.4, -10.2). When the player stands diagonally beyond that corner, the straight-line chase and wall slide oscillate in place forever, so the gate never opens. The stuck-enemy rescue moves such an enemy after 20 s. `tests/improvement-checks.js` reproduces that exact corner. The improved build had no timeouts.

What the bot's damage says (after; by share of all damage taken):

- Ordinary sectors: hellfire 48%, the bot's own rocket splash 43%, melee 9%. Melee almost never lands, because the player outruns every breed.
- General sectors: shockwaves 46%, hellfire 29%, own splash 16%, contact with the general 7%. 6 of the 8 deaths in general sectors came from The Barrow and The Abyss, the two sampled generals that cast shockwaves, and the shockwave was the largest damage source in all 6.
- Ordinary sectors stay easy for this bot even on Torment, while generals are where it dies. That matches the phase-1 finding. Whether that curve is intended is an open question for the owner.

## Reproducible baseline and campaign sweep (round 5)

With the randomness fixed (above), one run of the default set is a baseline that any later build can be compared with run by run. On 2026-10-06/07, on this branch after R5-2 (identical in two sessions for R5-1's code; R5-2 changed 3 of the 60 runs, all with the same outcome):

| Sectors            | Difficulty | Cleared / died / timed out | Stuck-enemy rescues | Median damage | Median clear time |
| ------------------ | ---------- | -------------------------- | ------------------- | ------------- | ----------------- |
| Ordinary (12 runs) | Reverie    | 12 / 0 / 0                 | 2                   | 6             | 80 s              |
| Ordinary (12 runs) | Purgatory  | 12 / 0 / 0                 | 2                   | 18            | 84 s              |
| Ordinary (12 runs) | Torment    | 11 / 1 / 0                 | 0                   | 18            | 82 s              |
| General (8 runs)   | Reverie    | 7 / 1 / 0                  | 0                   | 74            | 86 s              |
| General (8 runs)   | Purgatory  | 6 / 2 / 0                  | 0                   | 89            | 87 s              |
| General (8 runs)   | Torment    | 1 / 7 / 0                  | 1                   | 172           | 80 s              |

The shape is the one every earlier round found: ordinary sectors are easy for the bot on every difficulty, and the generals kill it, most often with shockwaves and hellfire. Only the variation between runs is gone; the earlier differences between rounds were noise.

**Every sector.** `window.__AUTOPILOT__ = { sectors: "all", difficulties: [1], seeds: 1 }` plays all 104 sectors on Purgatory (about 15 minutes of machine time, 146 minutes of game time). The autopilot now also reports each stuck-enemy rescue with the spot where the enemy was stuck, and anything that leaves the arena. The first sweep (after R5-1) cleared 99, died in 2 general sectors (Dune Sepulchre's and The Abyss's) and **timed out in three of Last Platform's four sectors**, each time with one enemy left and no rescue. Last Platform's arena has six 6 × 13 m train cars at x = ±15 with 4 m gaps. An enemy behind a car chases the player in a straight line, slides 2–5 m back and forth along the car as the player moves, and never finds a gap; because the sliding moves it more than 1.5 m, the round 1 rescue never counted it as stuck. Enemies are now also timed from the moment a wall blocks them out of the player's sight until they next see the player, and after 20 s they are moved to open ground in view, like walled-in enemies (`Enemy.walled` in `Game.updateEnemies`). `tests/round5-checks.js` reproduces it with a shambler and a witch behind a car while the player stands still, and a monk while the player paces a circle, and checks that an enemy in the open is never moved; all three fail on the old code.

The second sweep had **no timeouts**: 102 cleared and the same 2 deaths. 96 sectors played identically; the 8 that changed all cleared sooner: Last Platform 1–4 (the three timeouts, and 175 → 136 s), Penitent Cells 1–3 (86 → 81, 124 → 84 and 112 → 90 s, enemies stuck at the cell-block corner near (−19, −26)) and Ward of Whispers 3 (109 → 90 s). No enemy or player left an arena in either sweep. The bot does not path-find, so a person would usually walk round to such an enemy (the last-enemy locator points to it); the rescue is the safety net for a player who waits. No collider, spawn point, health, speed, damage or wave value changed, so `tests/fixtures/arena-colliders.json` is unchanged.

Median damage per sector (generals included) on Purgatory in the second sweep, by chapter: 0, 15, 37, 45 and 50. Damage rises through the campaign for the bot, though no ordinary sector killed it.

## Procedural arena dressing (round 2)

`src/grounds.ts` draws one 4 × 4 m canvas texture per ground kind (flagstone, tile, marble, planks, parquet, snow, sand, mud, cobble, basalt with an emissive crack map, concrete, dirt). The textures are shared for the session. `dressTheme()` and `plinth()` in `src/world.ts` add per-theme dressing. All of it is non-solid and draws from its own seeded generator, so the arena's `random()` sequence, and with it every collider and spawn point, is unchanged. `tests/arena-checks.js` compares all 104 sectors against `tests/fixtures/arena-colliders.json`, which was recorded before the dressing. Flat dressing (floors, pools, carpets, painted lines) does not cast shadows.

Render cost on High at the sector-1 start view, measured on 2026-10-06 (Radeon 8060S, 1280×800; draw calls include the shadow pass):

| Theme     | Draw calls              | Triangles                         |
| --------- | ----------------------- | --------------------------------- |
| ruins     | 74 → 80                 | 77,257 → 81,097                   |
| prison    | 70 → 76                 | 62,601 → 63,713                   |
| opera     | 80 → 86                 | 84,577 → 87,321                   |
| asylum    | 72 → 80                 | 63,273 → 64,537                   |
| snow      | 74 → 82                 | 84,777 → 91,113                   |
| town      | 76 → 86                 | 78,625 → 78,865                   |
| swamp     | 78 → 86                 | 83,217 → 84,849                   |
| station   | 78 → 84                 | 79,025 → 79,873                   |
| military  | 74 → 82                 | 72,113 → 91,729                   |
| castle    | 76 → 82                 | 81,361 → 81,601                   |
| palace    | 78 → 84                 | 85,273 → 89,369                   |
| babel     | 76 → 82                 | 82,153 → 85,993                   |
| forest    | 76 → 86                 | 92,849 → 97,041                   |
| tower     | 76 → 78                 | 88,577 → 90,913                   |
| water     | 78 → 84                 | 79,321 → 79,705                   |
| docks     | 80 → 88                 | 71,713 → 77,313                   |
| monastery | 78 → 84                 | 101,793 → 114,753                 |
| hell      | 96 → 102                | 79,061 → 82,757                   |
| **Total** | **1390 → 1512 (+8.8%)** | **1,447,566 → 1,522,542 (+5.2%)** |

The median render time per theme was about 1 ms both before and after; on this shared machine, single-frame timings vary more than that.

## Measured performance (internal build 0.7)

Visual inspection used the collaborative Chromium preview at 1280×800. The controlled 24 skeleton/revenant render workload from 0.6 measured 1.5 ms median High, 0.9 ms Medium, and 0.6 ms Low after the changes. A separate 24-enemy mixture of all seven regular archetypes measured 2.2 / 1.4 / 0.8 ms respectively. The mixed scene submitted 2,117,281 / 1,427,358 / 746,220 triangles and 835 / 504 / 334 draw calls. Fixed-step simulation with 24 living actors and eight ragdolls measured 0.7 ms median, 0.8 ms p90 for the mixed scene.

Same test hardware as 0.6: client Apple M4 Max through ANGLE/Metal, DPR 1, eight warm-up renders followed by 30 measured renders with shadow updates forced and `gl.finish()`. These are short resident-asset CPU/driver samples, not GPU timer queries or sustained/mobile FPS. The heavier mixed crowd has additional clothing draw calls; it is not directly comparable to the homogeneous baseline. The FXAA pass retains the major triangle reductions from 0.6. Low has no antialiasing; Medium/High smooth the world and weapon together.

Full campaign length has not been timed end to end. Physical controllers and phones were not available for testing; controller and touch support is verified with synthetic input only.

## Internal build history

Version numbers below are internal milestones; the public release history starts at v0.1.0.

### 0.7 · Animation and weapon feel

Press **R** for the next weapon and **V** for the previous one; **1–5** still selects directly. The desktop HUD includes clickable weapon slots and previous/next buttons. Scroll input is limited to one switch per 240 ms. Mobile arrows and controller shoulder buttons remain available.

Every enemy now has layered idle, locomotion, attack/cast, recovery and hit motion, with alternating attacks, weight shifts, head movement and articulated limb bends. Humanoids share the authored six-clip skeleton/revenant rigs; monks, witches, knights, brutes and bosses gain Blender-authored bone-mounted garments and armor. The knight carries a sword. The hound has a separate articulated head/tail and gait. These are reused rigs with procedural animation layers and costume variants, not bespoke motion capture or unique finished characters for every boss.

Shotgun and launcher recoil is stronger, shotgun pumping follows the shot, and the blade and electrical weapon have distinct handling. Flashes, electrical arcs, rocket exhaust, soft explosion effects and layered firing sounds have been refined. Medium and High now apply FXAA to the composed world and weapon view; Low retains the direct render path. Adaptive resolution no longer falls below 75% of the selected resolution scale. Retiring actors releases their GPU bone textures.

Validation: 56 unit/asset checks and 53 browser checks, including weapon-cycle inputs, wheel bursts, animated costume scale, boss physics and bone-texture retirement.

### 0.6 · Physics, input and performance pass

Enemy locomotion has independent phases, gradual turning, torso/head steering and directional, hit-location-weighted spring reactions. Death transitions preserve the current pose and create articulated Rapier bodies. Stakes carry bodies, attach the projectile to the skeleton, and can pin the struck body part to nearby solid architecture. Grenades use gravity, spin, restitution and continuous collision detection; explosions apply impulses to corpses. Corpses are capped at eight and retire after 12 seconds. Player and living-enemy movement still uses the existing swept arena collision system; this is a hybrid physics implementation, not a complete replication of the original engine.

Projectiles now have distinct stake, grenade, rocket and shuriken models. Ammunition pickups and checkpoints grant whole rounds with weapon-specific capacities. The storm combo atomically spends one shuriken and 16 charge. No magazine reload is required. Transparent smoke/ash are excluded from the opaque ambient-occlusion pass, fixing rectangular particle silhouettes.

Runtime Blender exports reduce the skeleton to 16,000 triangles, the revenant to 14,999, and the cemetery to about 323,000 while retaining the detailed source files. Static batches retain indexed geometry. Medium and Low bypass ambient occlusion/postprocessing; High uses half-resolution AO, shadows update at 30 Hz, and adaptive resolution adjusts during heavy play. New mobile profiles start at Low/80% resolution.

Standard-mapped controllers support both sticks, RT/LT fire, LB/RB weapons, A jump, X use, Y tarot, B inspect, left-stick click sprint, and Start pause. Use D-pad/up-down stick and A/B in menus; D-pad left/right adjusts sliders. Pair the controller with your device and press a button to activate it. Touch controls appear for coarse pointers or widths below 900px: left joystick, right-side drag aiming, and separate action buttons. Pointer cancellation, focus loss, pause and controller disconnect release held actions. Look sensitivity and invert-Y apply across input types. Physical phone/controller hardware still needs hands-on testing; automated checks use synthetic inputs and resized desktop viewports.

### 0.5 · Armory and atmosphere pass

All five weapons now use a unified aged finish: blued steel, oxidized iron, tarnished brass, dark walnut and smoke-dark leather. An editable Blender material library produces baked color, roughness, metalness and normal maps. Cylindrical barrel UVs, refined bevels, proof marks, receiver straps, rivets, glove cuffs and cloth sleeves complete this pass. Press **F** to inspect the finish in game.

First-person framing now exposes more of the receiver and supporting hand. Weapon lighting responds to nearby arena lamps, with a brief muzzle light and distinct flash origins for each firing mode. Combat adds expanding gun smoke, impact dust, fading soot marks and red shotgun hulls with brass caps. These effects have fixed population limits and are cleared on sector changes. Grounded movement has surface-dependent footsteps; firing and switching weapons include mechanical handling sounds. Every environment gains subtle dust, ash or snow; indoor illumination is reduced and procedural ironwork uses the armory's aged materials.

This improves the current game's presentation across the campaign. It does not replace the remaining prototype enemies or author the remaining environment themes.

### 0.4 · Game menus and options

The main menu, pause screen, level selector, arsenal, tarot, death and completion screens now share a gothic game presentation. Use the mouse or arrow keys and Enter; Escape backs out of a submenu and resumes from the pause menu. Starting over, restarting a checkpoint, leaving a fight and quitting have confirmation screens.

**Options** is available from both the title and pause menus. Video includes Low/Medium/High graphics presets (shadows and ambient occlusion), resolution scale, brightness, field of view and fullscreen. Audio has independent master, effects and music levels. Controls include sensitivity and inverted mouse pitch. Gameplay includes difficulty, reduced camera movement and a crosshair toggle. Changes apply immediately and save locally; existing settings migrate automatically. Changing difficulty affects the health of newly spawned enemies and incoming damage. Key bindings remain fixed. Controller and touch support were added in 0.6.

### 0.3 · Combat and level pass

The cemetery, cathedral, catacombs, and factory now use editable Blender scenes. The cemetery is built with fitted arches, grave markers, ironwork, trees, scanned statues and doors, and physically based materials. All five weapons have Blender models, separate rotating assemblies, gloves, and sleeves. The zombie and skeleton use skinned meshes and six animation clips, with locomotion speed adjustment and blended attack, hit, and death states. Melee attacks now wind up before connecting and can be dodged. Weapons have distinct spring recoil, mouse sway, draw/inspect motion, landing movement, shotgun pumping, stake cycling, rotating assemblies, shell ejection, and bullet impact marks. Supplies use modeled medical tins, ammunition boxes, armor, and relics. The renderer adds shadows, ambient occlusion, HDR reflections, and postprocessing. The 0.6 performance pass replaces multisampling with lighter render paths.

**This was an art-development milestone, not AA/AAA quality.** The other enemy archetypes and most environments still use prototype geometry. Their materials are improved, but they have not received the cemetery's modeling pass. There are no claims of full campaign art completion or production performance certification.
