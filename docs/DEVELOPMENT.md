# Development notes

Long-form notes that do not fit the storefront README: how saves work, the test harnesses, measured performance, and the history of the internal builds that preceded the first public release (v0.1.0).

## Saves

Desktop campaign progress is atomically written to Electron's per-user data directory, normally `~/.config/Purgatory/campaign.json`. Settings are stored in the desktop application's local storage. Saves record the current sector, unlocked levels, completed-level scores, tarot cards and completion status. As each wave begins, `Game.snapshot()` also stores a `resume` record: the wave number, health, armor, ammunition, weapon, souls, whether the tarot was used, which fixed sector supplies were taken, and the level's running stats. **Continue** (`Game.continueGame()`) restores it and starts that wave after two seconds; earlier waves stay cleared. `parseSave` drops a malformed snapshot, or one for a different sector, without touching the rest of the save. It does not resume a fight at the exact frame where you quit. Death deletes the snapshot and restarts the sector with replenished supplies, as do _Restart sector_, level select and finishing a level. Replaying a level selects it as your current checkpoint. **New game** explicitly resets campaign progress.

The development preview uses browser local storage, separate from the desktop save. Desktop smoke tests use an isolated profile under `artifacts/`.

## Web build

`npm run package:web` builds and writes `release/purgatory-<version>-web.zip` with `tools/package-web.cjs` (Node's zlib only; no `zip` binary needed). A Vite build plugin keeps the source texture folders that `tools/fetch-art.py` downloads into `public/assets/textures/` out of `dist/`, because the GLBs embed their textures and the runtime only requests `moonrise.hdr`. That took a local `dist/` from 150 MB to 86 MB; the zip is about 42 MB.

Production builds load the actors, weapons, supplies, the cemetery (title backdrop) and the HDR sky before the menu: 50 MB instead of 86 MB. `prefetchArt()` then fetches the cathedral, crypt and factory scenes one at a time. `Game.start()` waits on a loading screen if the chosen level's scene is still downloading, and offers _Try again_ if the download fails. Development builds load everything up front so scripted checks and trailer capture never wait. `state().environmentsPending` lists scenes not yet loaded.

Verified on 2026-10-06 by serving the extracted zip with `python3 -m http.server`: in an offscreen Electron (Chromium) window driven through the real menus, jumping straight to Soul Foundry with its download delayed showed the loading screen and then the authored foundry, a blocked crypt download showed the retry screen and recovered, and the background-prefetched cathedral started without waiting; in Playwright's cached `chrome-headless-shell` 151 (SwiftShader WebGL 2) it reached the menu and Hallowed Ground with no console errors. Firefox and Safari were not tested.

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

## Shader warm-up (round 4)

Three.js compiles a shader the first time a material is drawn under a given lighting and render target, and the game never did that ahead of time, so a fresh session froze for 100–2,500 ms the first time each breed appeared or a weapon fired. Now, after each arena loads, `Game.compileWarmUp()` builds one of everything a fight can draw (every breed, the five generals, projectiles, pickups, effect sprites and the weapons) and hands it to `renderer.compileAsync`, which lets the driver compile in parallel (`KHR_parallel_shader_compile`). It does this for both lighting setups the campaign uses (authored scenes have six lamps, procedural arenas four), and for the composer's offscreen target, because programs drawn into a render target differ from ones drawn to the screen. When that finishes, `Game.warmUp()` draws the set once, unseen, before the real frame, which catches what `compileAsync` cannot: the ambient-occlusion normal pass and the shadow pass. The shadow pass shares one depth material and picks its shader from the caster's side, texture and skinning in draw order, so every variant is compiled explicitly (fog-free, as the shadow pass draws). Building the set draws no numbers from `Math.random`, so seeded runs are unchanged.

`tests/round4-checks.js` fights in a procedural and an authored arena on Low, Medium and High and fails if any shader program is compiled during the fight; with the warm-up disabled it fails. `tools/stutter.js` measures frame times in a fresh session (`npm run test:browser -- --checks tools/stutter.js --out artifacts/stutter.json`). On 2026-10-06, at a load average of 18–23 on this shared machine, `main` showed a 1.0 s freeze at the first level start, 183–2,450 ms on first spawns and 83–317 ms on first shots. This branch showed no fight frame over 33 ms and about 0.5 s at level start, at the cost of one 450 ms frame on the title screen after boot, when both lighting setups are compiled.

## Inspection API and browser checks

`window.__PURGATORY__.state()` exposes read-only state and rendering counters in production. Development builds additionally expose deterministic setup and stepping controls. `tests/browser-checks.js` is a repeatable script for the collaborative preview's JavaScript evaluator: it exercises controls, all firing modes, freeze/shatter, death/retry, pickups, tarot, gates, level unlocks, every environment, each boss, the ending, and console-error checks. `tests/polish-checks.js` additionally checks melee wind-up/dodging, indoor entry/exit routes, and inspection input. Both preserve the campaign save they find. `tests/menu-checks.js` exercises keyboard navigation, rendering options, independent audio channels, confirmations, level selection, and pause/options/resume without resetting the fight. It restores the previous options and campaign save. Development setup and stepping controls are stripped from production builds.

The scripts in `tests/*-checks.js` can be pasted into, or evaluated by, a browser console attached to `npm run dev`. `npm run test:browser` runs them all headlessly: `tools/browser-checks.cjs` starts a Vite dev server on a free port, evaluates each script in an offscreen Electron window, and exits non-zero on any failed check or renderer console error. Pass `-- --checks menu,improvement` for a subset, `-- --url <dev server>` to reuse a running server, and `-- --out <file.json>` to keep the raw results. `tests/improvement-checks.js` covers the October 2026 improvement round described in [IMPROVEMENTS.md](IMPROVEMENTS.md). `tools/media/` drives the same development API for deterministic captures (see `tools/make_trailer.py`).

## Balance autopilot

`tests/balance-autopilot.js` is a repeatable yardstick, not a playtest. A scripted player aims perfectly at the nearest visible enemy, chooses the shotgun under 6 m, rockets under 18 m and stakes beyond, backs off when closer than 7 m, strafes, hops, and jumps a general's shockwave when it is about to arrive. It does not path-find or route to pickups. Each run seeds `Math.random`, but results also depend on run order (model caches consume randomness on first use), so compare complete default runs only:

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

The round changed no balance values on purpose; how hard ordinary sectors should be is the owner's decision. Apart from the timeouts, the before/after differences are run-to-run variance: the code changes shift the seeded random sequence. In this sample that variance is about ±2 deaths per cell, so do not read the changed death counts as an effect.

The one real change is the **timeouts**. Both baseline timeouts (Hallowed Ground sector 4) ended with enemies wedged in the concave corner between a headstone and a grave slab at (-7.4, -10.2). When the player stands diagonally beyond that corner, the straight-line chase and wall slide oscillate in place forever, so the gate never opens. The stuck-enemy rescue moves such an enemy after 20 s. `tests/improvement-checks.js` reproduces that exact corner. The improved build had no timeouts.

What the bot's damage says (after; by share of all damage taken):

- Ordinary sectors: hellfire 48%, the bot's own rocket splash 43%, melee 9%. Melee almost never lands, because the player outruns every breed.
- General sectors: shockwaves 46%, hellfire 29%, own splash 16%, contact with the general 7%. 6 of the 8 deaths in general sectors came from The Barrow and The Abyss, the two sampled generals that cast shockwaves, and the shockwave was the largest damage source in all 6.
- Ordinary sectors stay easy for this bot even on Torment, while generals are where it dies. That matches the phase-1 finding. Whether that curve is intended is an open question for the owner.

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
