# Development notes

Long-form notes that do not fit the storefront README: how saves work, the test harnesses, measured performance, and the history of the internal builds that preceded the first public release (v0.1.0).

## Saves

Desktop campaign progress is atomically written to Electron's per-user data directory, normally `~/.config/Purgatory/campaign.json`. Settings are stored in the desktop application's local storage. Saves record the **start of the current sector**, unlocked levels, completed-level scores, tarot cards, and completion status; they do not resume a fight at the exact frame where you quit. Death restarts the sector with replenished supplies. Replaying a level selects it as your current checkpoint. **New game** explicitly resets campaign progress.

The development preview uses browser local storage, separate from the desktop save. Desktop smoke tests use an isolated profile under `artifacts/`.

## Inspection API and browser checks

`window.__PURGATORY__.state()` exposes read-only state and rendering counters in production. Development builds additionally expose deterministic setup and stepping controls. `tests/browser-checks.js` is a repeatable script for the collaborative preview's JavaScript evaluator: it exercises controls, all firing modes, freeze/shatter, death/retry, pickups, tarot, gates, level unlocks, every environment, each boss, the ending, and console-error checks. `tests/polish-checks.js` additionally checks melee wind-up/dodging, indoor entry/exit routes, and inspection input. Both preserve the campaign save they find. `tests/menu-checks.js` exercises keyboard navigation, rendering options, independent audio channels, confirmations, level selection, and pause/options/resume without resetting the fight. It restores the previous options and campaign save. Development setup and stepping controls are stripped from production builds.

The scripts in `tests/*-checks.js` can be pasted into, or evaluated by, a browser console attached to `npm run dev`. `npm run test:browser` runs them all headlessly: `tools/browser-checks.cjs` starts a Vite dev server on a free port, evaluates each script in an offscreen Electron window, and exits non-zero on any failed check or renderer console error. Pass `-- --checks menu,improvement` for a subset, `-- --url <dev server>` to reuse a running server, and `-- --out <file.json>` to keep the raw results. `tests/improvement-checks.js` covers the October 2026 improvement round described in [IMPROVEMENTS.md](IMPROVEMENTS.md). `tools/media/` drives the same development API for deterministic captures (see `tools/make_trailer.py`).

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
