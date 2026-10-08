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

## Crosshair (round 6)

The crosshair was four 1-pixel bone-white ticks and a dot with a 1-pixel drop shadow, and over pale ground (snow, sand, marble, sky) it thinned out. Every mark now has a 1-pixel dark outline as well, and Options › Gameplay adds _Crosshair style_ (cross and dot as before, cross, dot, circle), _Crosshair colour_ (bone as before, green, yellow, cyan, magenta) and _Crosshair size_ (75–200%). `crosshairStyle`, `crosshairColor` and `crosshairSize` are saved with the options (`parseSettings` clamps and rounds them); `Game.applySettings` sets the `--crosshair-color` and `--crosshair-size` CSS variables and `data-crosshair` on the root element.

Measured on 1280 × 800 PNG captures (`tools/media/round6/crosshair-scenes.js`, `crosshair-contrast.py`), as WCAG contrast ratios of the default crosshair's ticks against the pixels touching them:

| Background                    | Before | After  |
| ----------------------------- | ------ | ------ |
| Frostbound Crossing, snow     | 3.4:1  | 13.8:1 |
| The Ossuary, dark crypt floor | 12.1:1 | 17.4:1 |

Against the background 4 px away nothing changes (2.3:1 → 2.5:1 on snow): the outline is what separates the mark from pale ground. `tests/crosshair.test.ts` covers parsing; `tests/round6-checks.js` sets each style, a colour and a size through the real Options page and checks the marks drawn, the outline, the colour, the size (1.5× wide and still centred), that each saves, and that _Crosshair off_ still hides it. Comparison: `docs/media/improvements/round6/r6-3-crosshair.jpg`.

## Stick dead zone and look response (round 6)

`stickAxis(value, deadzone, exponent)` in `src/controls.ts` ignores each axis inside the dead zone and rescales the rest so full tilt is still 1; the exponent shapes the response. _Stick dead zone_ (Options › Controls, 5–30%, default 18% as before) applies to both sticks; _Look response_ (linear as before, or precise: exponent 2, so half way between the dead zone and full tilt turns at a quarter of full speed instead of half) applies to the right stick only. Menu navigation keeps its fixed 18%. `tests/stick.test.ts` checks that the defaults reproduce the old mapping exactly, the limits, full tilt and monotonicity; `tests/round6-checks.js` drives a synthetic controller to check that a 0.25 deflection moves nothing at 30% and does at 5%, that precise turns at half the linear rate at half tilt and the same at full tilt, that the left stick is not curved, and that both options save from the Controls page. **Not tried on a physical controller.**

## Smooth motion between simulation steps (round 7)

The simulation advances in fixed 1/60 s steps, and until round 7 every frame drew the camera, enemies, projectiles and pickups exactly where the last step left them. On a display that is not exactly 60 Hz that judders: a frame that falls between two steps shows nothing moving. Walking straight ahead through the real frame loop, the camera stood still on 50% of frames at 120 Hz, 58% at 144 Hz (unevenly: 0, 1, 0, 1, 0, 0, 1 …), one frame in five at 75 Hz, and 5 of 30 frames at 60 Hz with ±3 ms of frame-time jitter. Every enemy did the same. Mouse and stick look were already applied every frame.

`Interpolator` in `src/interpolate.ts` records where each enemy root, projectile and pickup is as each step begins (`Game.update()` calls it, so steps driven by the development API count too), and `Game.loop()` draws them, and the camera, `accumulator × 60` of the way from there to where the step left them. Enemies also turn part of the way. Straight after drawing, the simulated positions are put back and their world matrices refreshed, so nothing the game decides ever sees a drawn position. Anything that moved more than 4 m in one step (a new sector, a rescued enemy) is drawn where it landed. Ragdolls, particles and skeletal animation still change at the step rate. Moving things are drawn up to one step (17 ms) behind the simulation; turning is not delayed. `Game.interpolate = false` turns it off, for comparisons.

`tests/round7-checks.js` drives the real frame loop with synthetic display timestamps. Per-frame camera speed while walking, before → after:

| Display         | Frozen frames, before | Variation (CV), before | Frozen frames, after | Variation (CV), after |
| --------------- | --------------------- | ---------------------- | -------------------- | --------------------- |
| 60 Hz           | 0 / 30                | 0                      | 0 / 30               | 0                     |
| 60 Hz, ±3 ms    | 5 / 30                | 0.56                   | 0 / 30               | 0                     |
| 75 Hz           | 8 / 38                | 0.52                   | 0 / 38               | 0                     |
| 120 Hz          | 30 / 60               | 1.00                   | 0 / 60               | 0                     |
| 144 Hz          | 42 / 72               | 1.18                   | 0 / 72               | 0                     |
| 144 Hz, ±1.5 ms | 42 / 72               | 1.20                   | 0 / 72               | 0                     |
| Enemy, 144 Hz   | 84 / 143              | 1.19                   | 0 / 143              | 0                     |

The same file checks that a 14-second seeded rocket fight driven through the frame loop at 144 Hz with uneven frames ends in exactly the same state with interpolation on and off (positions, health, kills, the random sequence and every ragdoll body), that frames without a step leave every simulated position untouched, and that a new sector is drawn at its start rather than slid to it. `tests/interpolate.test.ts` covers the interpolator. Chart: `docs/media/improvements/round7/r7-1-motion.jpg` (per-frame data from `tools/media/round7/motion-data.js`, drawn by `motion-chart.py`). Synthetic timing only: **no 120 or 144 Hz display has been looked at.**

## Low-health warning (round 7)

At 25 health or less (`LOW_HEALTH` in `src/vitals.ts`) the health readout turns red and pulses (steady under _prefers-reduced-motion_), a red vignette deepens toward the screen edges, and `Sound.heartbeat()` plays a lub-dub on the effects channel: about 67 beats a minute at 25 health, quickening to about 109 close to none. Strength runs from 0.4 at 25 health to 1 near 0 (`lowHealth()`). It is off in Wraith form (you cannot be hurt), while paused and on the death screen, and with _Low-health warning_ (Options › Gameplay, on by default) turned off. The heartbeat is timed inside the simulation step but draws no random numbers, so seeded runs are unchanged. It describes the player's own state and warns of no attack; no health, damage or timing value changed.

`tools/media/round7/heartbeat.js` renders it offline with the game's synthesizer at the default volumes (`npm run test:browser -- --checks tools/media/round7/heartbeat.js --out artifacts/r7/heartbeat.json`). Levels in dBFS; "loudest 50 ms" is the RMS of the loudest 50 ms window:

| Sound                      | Peak  | Loudest 50 ms |
| -------------------------- | ----- | ------------- |
| Heartbeat, 25 health       | −26.9 | −36.6         |
| Heartbeat, near death      | −24.6 | −34.5         |
| Footstep, stone            | −31.0 | −43.3         |
| Hit marker                 | −29.3 | −42.4         |
| Taking a hit               | −23.3 | −32.5         |
| Melee wind-up (brute), 6 m | −24.3 | −32.3         |
| Shotgun blast              | −11.2 | −21.7         |
| Rocket                     | −12.7 | −22.5         |
| Combat music, one bar      | −25.3 | −35.4         |

A first draft was 4 dB louder, level with a brute's melee wind-up, and since it repeats every 0.6–0.9 s it could have covered the wind-up cues, so it was turned down to sit with the music, 2–4 dB under a wind-up. It is a low triangle thump (78 → 42 Hz) with a little filtered noise so it carries on small speakers. The 14-second clip `docs/media/improvements/round7/r7-2-heartbeat.mp3` has walking to the music, a hit down to 22 health with the heartbeat and two shotgun blasts, a hit down to 6 with the faster heartbeat, a health pickup ending it, and four beats with no music. **Nobody has listened to it.**

`tests/round7-checks.js` checks that nothing shows at 100 or 26 health, the warning at 25 and 20 and stronger at 5, none in Wraith form, that a health pickup clears it, that heartbeats come only while low and playing (4–5 in 4 s at 22 health, more at 3, none at full health, in Wraith form, with the option off, paused or dead), that a seeded fight is identical with the heartbeat on and off, and that the option saves from the Gameplay page. `tests/vitals.test.ts` covers the threshold, strength, interval and option parsing.

## Toggle sprint and swapped sticks (round 7)

_Sprint_ (Options › Controls: Hold as before, or Toggle) and _Stick layout_ (Standard as before, or Swapped) are saved as `toggleSprint` and `swapSticks`. In toggle mode `Game.update()` passes each step's fresh press of sprint (keyboard, controller or the touch RUN button) to `toggleSprint()` in `src/controls.ts`: a press starts or stops running, and running ends as soon as there is no movement input, so it never starts again by itself. Hold mode computes exactly what it did before, so seeded runs are unchanged. `Game.sprinting` now also drives the weapon's sprint pose, which before followed only the keyboard. Swapped sticks exchange axes 0–1 and 2–3 in `Controls.poll()`; the dead zone applies to both and the look response to whichever stick looks. Menu navigation keeps the left stick and D-pad. The HUD key line and the Controls page name the sticks in the chosen layout.

`tests/round7-checks.js` checks that hold sprint still runs at 13 m/s only while held; that a tap in toggle mode keeps running at 13 m/s after release, a second tap walks at 10, and stopping ends it without restarting; the same with a synthetic controller's stick click; that swapped sticks move with the right stick (unchanged 0.5 at 59% tilt) and look with the left exactly as the right did, with the precise curve on the left only; and that both options save from the Controls page and the key line reads "RIGHT STICK MOVE · LEFT STICK LOOK". `tests/controller-comfort.test.ts` covers the toggle and option parsing. **Not tried on a physical controller.**

## Frame-rate readout (round 7)

_Frame rate_ (Options › Video, hidden by default; `showFps`) shows "144 FPS · WORST 6.9 MS" above the level title: displayed frames per second and the slowest frame, over windows of about a second (`FrameStats` in `src/frame-stats.ts`, fed every frame by `Game.loop()`). A gap of over a second, such as a hidden tab, starts a new window. It is fixed in size and sits in the HUD's top margin, so it does not move with the interface scale. `tests/round7-checks.js` checks that it is hidden by default, reads exactly "144 FPS · WORST 6.9 MS" for synthetic 144 Hz frames and catches a single 50 ms frame, stays on screen and clear of the title, objective and counters at 75%, 100% and 150%, and saves from the Video page; `tests/frame-stats.test.ts` covers the windows. Capture: `docs/media/improvements/round7/r7-4-frame-rate.jpg` (60 fps, worst 16.8 ms in the offscreen window at load 28).

## Getting the mouse back after a pause (round 8)

Pausing releases the mouse, and _Resume game_, _Restart sector_ and starting a level ask for it again with `requestPointerLock`. Chromium refuses that request for about a second after Esc released the mouse, so pressing Esc and then Enter used to resume a fight with the mouse free: the view could not be turned while enemies attacked, and the click that captured the mouse also fired. Now, once this session has had the mouse captured (`Game.hadMouse`), a refused request sets `Game.awaitingMouse`: `Game.loop()` runs no simulation steps, the HUD shows _Click to return to the fight_, keys other than Esc do nothing, and a click on the world asks for the mouse again without firing. When the mouse is captured the fight continues; Esc pauses. A connected controller or the touch layout clears the hold at once, and a session that never had the mouse (a browser that does not grant it, where the arrow keys turn) plays on as before. Seeded runs are unchanged: the hold only stops the frame loop from stepping.

The game's Esc handler also stops the key event once it has paused. Real key presses reach the menus' handler first, while the game is still playing, so this only matters for an Esc dispatched at the window, as scripts do; the menus used to read that one as "back" and resume at once.

`tests/round8-checks.js` simulates pointer lock (granted, refused, released by Esc), since these test windows are offscreen and the shared desktop's mouse must not be grabbed. It checks that a session that never had the mouse plays on; that a granted resume shows nothing; that a refused resume holds the fight (simulation steps, health, armor, position, enemy positions and the random sequence unchanged over 120 frames, and weapon keys ignored) with the prompt shown; that a refused click keeps holding and asks again, and a granted one resumes without holding fire or spending ammunition; that Esc pauses while held and from a fight without the mouse; and that a controller clears the hold and is never asked for the mouse. **The real Chromium refusal has not been reproduced here.** Capture: `docs/media/improvements/round8/r8-1-mouse-prompt.jpg`.

## Grave tarot progress (round 8)

`src/tarot.ts` holds the rules: a level awards its chapter's card (`levelCard`: Wrath, Quickening, Bulwark, then Wrath and Quickening again), won when the level ends with its relic found or 25 of its souls taken (`cardConditionMet`). `earnCard` adds the card and equips it when the equipped card is not owned; a choice among owned cards is kept. A fresh save has Wrath selected and owns nothing, so before round 8 a player who started in chapter II earned Quickening while the HUD offered "Q · WRATH" and Q answered "Earn a tarot card…". The HUD now offers the key only for an owned, equipped card, and `parseSave` equips an owned card when a saved selection is not owned. The result screen names a card the clear won for the first time (`Game.lastClear.card`), with its effect and the key, or that it can be equipped under Grave tarot; the pause screen shows the level's card and souls toward it, or that it is already owned; and the 25th soul of a level shows "25 SOULS / TAROT CONDITION MET" as a relic already did. No card's effect, the soul count or the relic changed. `tests/tarot.test.ts` covers the rules and the save; `tests/round8-checks.js` plays them through the real result, pause and HUD. Capture: `docs/media/improvements/round8/r8-2-tarot.jpg`.

## Desktop window state (round 8)

`desktop/window-state.cjs` saves the window's restored bounds (`getNormalBounds`) and whether it was maximized or fullscreen to `window.json` in the user data folder when the window closes, and the next launch opens that way. A saved window whose centre is on no connected display (a monitor unplugged) opens at the default 1440 × 900, centred; otherwise it is kept on its display and within the 960 × 600 minimum and the display's size. Malformed files are ignored. On a Wayland desktop the compositor places windows and reports no position, so only the size and display mode carry over there. The smoke test and the window check never restore maximized or fullscreen, so test windows cannot cover the desktop. `tests/window-state.test.ts` covers parsing and placement; `npm run test:desktop-window` (`tools/desktop-window-check.cjs`) launches the build twice in `artifacts/window-check/`: the first launch resizes to 1104 × 702 and closes, the second must open at that size, and a third with a malformed `window.json` must open at the default. Verified on 2026-10-07 on KDE Plasma (Wayland): size restored, no position reported. **Maximized, fullscreen and position restoring are checked by the unit tests only.**

## Confirmations (round 8)

_Restore all defaults_ (Options) asks first, with Cancel focused, since it resets every option including the difficulty and all key and controller bindings. _Leave the fight?_ (and, on the result screen, _Return to the main menu?_) and _Quit Purgatory?_ say where _Continue_ will pick up, from the save itself: "Continue resumes Hall of Vigils, sector 3, at the start of wave 3." or "Continue starts The Ossuary, sector 1.". They used to say the sector restarts, which has been wrong since round 2. `tests/round8-checks.js` checks that the defaults change nothing on Cancel or Esc and reset on confirming, and the dialogs' wording; `tests/menu-checks.js` and the desktop smoke test confirm the new dialog. Capture: `docs/media/improvements/round8/r8-4-defaults-dialog.jpg`.

## Touch layout and narrow windows (round 9)

Until round 9 the touch layout (on-screen buttons, no weapon bar, touch-worded hints, and no mouse capture) was used on a coarse pointer **or in any window under 900 CSS pixels wide**, so a mouse in a half-screen browser window, or a 1080-pixel window zoomed to 125%, could not turn the view. `Controls` now chooses it from the input: the touch layout is on when the main pointer is coarse (`matchMedia("(pointer: coarse)")`, which also answers a change, such as a tablet's keyboard being detached), a `pointerdown` from a touch switches to it, and a mouse click or a mouse `pointermove` with movement switches back (a pen changes nothing). The first-run Low graphics at 80% resolution follow the same rule, so they now apply to touchscreens only. In a small window the HUD keeps the desktop layout and `Game.fitHud()` caps the interface scale at the window's size (`min(width / 853, height / 420)`; a window 1280 wide and 630 tall holds 150%), without changing the saved option.

`tests/round9-checks.js` asks the runner to resize its window by logging `__RUNNER__ size 860x640` (both runners handle it; Firefox's resizes the viewport over WebDriver BiDi), and to emulate a touchscreen with `__RUNNER__ touch on|off` (Electron only, through the DevTools `Emulation.setTouchEmulationEnabled` command; Firefox's runner answers that it cannot, and that check says so). `npm run test:browser -- --touch` starts the whole page on an emulated touchscreen; `tools/media/round9/touch-start.js` uses it to check the first-run touch layout and graphics default.

## HUD contrast over bright ground (round 9)

The HUD's text is pale on a transparent background, so over Frostbound Crossing's snow its small labels nearly vanished. Two changes: a soft shade along the top and bottom screen edges under the HUD (`#hud-scrim`, a pair of gradients that grow with the interface scale and take no clicks), and a tight dark halo around HUD text and weapon icons (`--hud-halo`, `--hud-icon-halo` in `style.css`) in place of the old drop shadows. The smallest labels (health, armor, ammunition and the key line) are a little lighter.

**Measured, not eyeballed.** `tools/media/round9/hud-contrast.js` starts a level with no enemies yet, freezes the frame loop so the canvas keeps one frame, and has the runner save it twice (`__RUNNER__ capture`): with the HUD, and with only the HUD's text and icons hidden (the edge shade counts as background). `tools/media/round9/hud-contrast.mjs` then takes, for each label, the fifth of the pixels the HUD changed that are nearest the label's colour (the glyphs) and the pixels two pixels out from them, and reports the WCAG contrast between their median luminances, which is what the eye compares. A sweep of all 24 levels' opening views at 1280 × 800 found two arenas where labels fall under 2:1: Frostbound Crossing and Hallowed Ground (the first level). Results, before → after (ranges over the labels in each group):

| Level               | Small labels (health, armor, souls, ammunition, card, key line) | Numbers and weapon name | Weapon slot numbers |
| ------------------- | --------------------------------------------------------------- | ----------------------- | ------------------- |
| Frostbound Crossing | 1.4–1.7 → 2.8–4.1                                               | 2.1–2.6 → 5.7–7.9       | 1.2 → 1.7           |
| Hallowed Ground     | 1.8–2.8 → 3.8–4.9                                               | 3.0–4.1 → 6.6–8.9       | 1.5 → 2.0           |
| Dune Sepulchre      | 3.7–5.3 → 4.6–6.8                                               | 6.1–8.1 → 7.1–10.2      | 2.1 → 2.3           |
| Hall of Vigils      | 3.0–6.7 → 4.7–7.8                                               | 4.5–10.0 → 7.9–11.8     | 2.4 → 2.3           |

The one label still under 3:1 is Frostbound Crossing's ammunition name above the counter (2.8), which sits highest in the bottom band where the shade is lightest. The weapon slot numbers sat in buttons dimmed as a whole; the weapon bar change below dims only the icon of a weapon not in hand, which took the numbers to 4.2:1 in Frostbound Crossing, 5.4:1 in Hallowed Ground, 8.7:1 in Dune Sepulchre and 9.9:1 in Hall of Vigils. Over a dark hall the shade is barely visible (`docs/media/improvements/round9/r9-2-hud-contrast.jpg` shows the two bright arenas). The view changes as you turn, so these are the opening views only. `tests/round9-checks.js` checks that the shade and halo are in place and that the shade covers no control.

## HUD at every heading (round 10)

Round 9 measured each level's opening view only. `tools/media/round10/hud-headings.js` takes the same frame pairs at eight headings (every 45°, level gaze) for each level given, and `tools/media/round9/hud-contrast.mjs` reads them unchanged (it now takes the file name from the report). In Frostbound Crossing, Hallowed Ground, Dune Sepulchre and Hall of Vigils at 1280 × 800, 5 of 384 small-label readings were under 3:1, all in Frostbound Crossing: the ammunition name at four headings (2.7–2.8:1, facing the far snow) and the gate line at one (3.0). A wider halo changed nothing measurable, because the ring two pixels out is already inside the halo; what washed out was the glyphs themselves, 9–11 pixel strokes thinner than a pixel and blended with the snow behind. The small labels (health, armor, souls, gate line, kill counts, ammunition names, card and key line) now use the semi-bold cut of the HUD font (`style.css`, beside `--hud-halo`). No colour, size, shade or position changed.

Worst and best reading over the eight headings, before → after:

| Level               | Small labels | Numbers and weapon name | Weapon slot numbers |
| ------------------- | ------------ | ----------------------- | ------------------- |
| Frostbound Crossing | 2.7 → 3.9    | 5.2 (unchanged)         | 4.2 (unchanged)     |
| Hallowed Ground     | 3.9 → 5.3    | 6.4 (unchanged)         | 5.5 (unchanged)     |
| Dune Sepulchre      | 3.6 → 4.5    | 6.7 (unchanged)         | 8.7 (unchanged)     |
| Hall of Vigils      | 4.6 → 6.2    | 5.1 (unchanged)         | 8.8 (unchanged)     |

After: 0 of 384 small-label readings under 3:1 (the lowest is Frostbound Crossing's gate line at 3.9), and no number under 4.5:1 at any heading. The ammunition name in Frostbound Crossing reads 6.4:1 at its worst heading (2.7 before). Repeat runs of the same frames move single readings by up to about 0.3 (falling snow). This is still a level gaze from the sector's start with no fight on screen; muzzle flashes, explosions and looking down at the ground are not measured. Capture: `docs/media/improvements/round10/r10-1-hud-headings.jpg`.

## Result and ending screens (round 10)

The level-complete and ending screens show the arena you cleared, sharp and undimmed (pause and death blur and darken it). Their text sat on it with no backing, so over Frostbound Crossing's snow the four stat labels measured 1.0:1, invisible, and the numbers and record line 1.4:1. They now have a soft dark backing (`.result-screen::before`, a radial gradient behind the text that fades out before the screen's edges and takes no clicks), a dark halo on their text, and the kicker and stat labels in a lighter, semi-bold gold. In windows under 700 pixels tall the seal, title and stats are smaller: at the desktop window's minimum, 960 × 600, a clear that earned a card used to push _Main menu_ off the bottom of the window and _Continue_ onto the key line, with the seal cut off at the top.

Measured with `tools/media/round10/result-contrast.js` (frame pairs of the screen with and without its text, read by `tools/media/round9/hud-contrast.mjs`), at 1280 × 800, two headings per arena, for a deathless record clear with a relic and a new card. Before → after, worst and best reading:

| Screen                          | Kicker, subtitle, stat labels, card line | Title, stat numbers, record line | Commands  |
| ------------------------------- | ---------------------------------------- | -------------------------------- | --------- |
| Hallowed Ground                 | 1.7–5.5 → 6.6–9.4                        | 2.2–6.6 → 6.6–10.4               | 6.3 → 7.1 |
| Frostbound Crossing             | 1.0–7.0 → 5.7–8.9                        | 1.4–9.3 → 5.8–9.9                | 4.3 → 6.2 |
| Dune Sepulchre                  | 1.8–6.8 → 7.1–9.2                        | 4.0–9.5 → 5.7–11.0               | 6.9 → 6.8 |
| The ending (The Abyss; no card) | 3.1–6.8 → 7.4–9.7                        | 4.3–9.6 → 5.8–11.1               | 4.1 → 4.0 |

The ending's one command, _Main menu_, stays at 4.0:1: it is focused, and the menus' focus style puts an orange glow around the text, which this method counts against it. `tests/round10-checks.js` checks the backing, halo and label colours at 960 × 600, 1280 × 800 and 1920 × 1080, that every part of the screen is inside the window and the commands clear of the key line, that _Continue_ still takes a click and starts the next level, and that the ending has the backing while the death and pause screens do not; all three checks fail on the old code. Capture: `docs/media/improvements/round10/r10-2-result-screen.jpg`.

## Arsenal page in short windows (round 10)

Round 9 checked that no weapon's arsenal page scrolls at 1280 × 800. In shorter windows they did: at 960 × 600, the desktop window's minimum, the Blade's page needed 402 pixels in a 324-pixel panel and the _Trick_ line was out of sight; 1280 × 720 and 1366 × 657 scrolled too. The panel's scrollbar was also the browser's bright default, the only unstyled one in the menus. In windows up to 760 pixels tall the weapon's etching is smaller (`clamp(56px, 10vh, 120px)` instead of up to 21% of the height) and the page's spacing, title and trick text are a little tighter; the bronze scrollbar colour is now set on `.game-menu` and inherited by every panel, and the tarot cards' bar is thin like the rest. `tests/round10-checks.js` opens all five weapons at 960 × 600, 1366 × 657, 1280 × 720, 1024 × 768, 1280 × 800 and 1920 × 1080 and checks that none scrolls and both fire modes and the trick are in view, and that every panel that can scroll on the Options, level, arsenal and tarot pages has the bronze, thin bar; both fail on the old code. Capture (Tempest at 960 × 600): `docs/media/improvements/round10/r10-3-arsenal-960x600.jpg`.

## Weapon bar reserves (round 9)

Each of the five weapon slots shows two thin bars under its icon: the primary and alternate reserves as a share of their maximum (`slotAmmo` in `src/ammunition.ts`; the chaingun holds 500, the shuriken launcher and its charge 250, everything else 100). A bar turns red when its reserve is low by the same rule as the ammunition counter (a fifth of what a level starts with). When neither mode has a whole round left, the slot is marked dry: its icon fades and its number is struck through in red, and its accessible name says "out of ammunition". The Thresher shows two full bars. A weapon not in hand now dims only its icon (to 45%), not its number and bars. No ammunition value changed. Covered by `tests/weapon-bar.test.ts` and `tests/round9-checks.js` (bars following a shot, every slot following its own reserves, dry after the last stake, refilled by a pickup, the weapon bar clear of the other panels at 75–150%). Capture: `docs/media/improvements/round9/r9-3-weapon-bar.jpg`.

## Arsenal page (round 9)

The arsenal page used to read "LMB", "RMB" and "Select with 1–5, R / V, or the mouse wheel. Inspect with F." whatever the bindings or the device. It now names the controls in use (`UI.control`): the bound keys or mouse buttons, the controller's buttons when one is connected (no mouse wheel then, and a weapon's direct-select button only if one is bound), or FIRE, ALT, ◀ ▶ and INSPECT in the touch layout. Each weapon also has a _Trick_ line (`trick` in `WEAPONS`, with `{primary}` and `{alternate}` filled in from the bindings): the Thresher's endless ammunition and returning blade, shattering a frozen enemy, stakes that ignite and pin and launch your own grenade, rockets that fling bodies and hurt you up close, and the storm orb. `tests/round9-checks.js` checks the default keys, a rebinding (fire on J and a side button, N / B to cycle, G to inspect, no key for the Tempest), a synthetic controller, a touch, every weapon's trick, and that no weapon's page needs scrolling at 1280 × 800. Capture: `docs/media/improvements/round9/r9-4-arsenal.jpg`.

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

On 2026-10-07 the default 60 runs on `main` matched round 5's final run in 60 of 60, and round 6's branch (music, difficulty page, crosshair, stick options) matched `main` in 60 of 60.

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
