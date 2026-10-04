# Purgatory art pipeline

This is a reviewable Blender art milestone. It establishes an asset pipeline and upgrades four environment themes and weapon handling; it does not meet an AA/AAA release standard or complete the campaign art.

The repository ships the exported runtime meshes in `public/assets/models/`. The editable `.blend` masters are **generated** by the Python build scripts in `tools/` and are not committed: they are 15–120 MB each because textures are packed. To recreate them:

```bash
python3 tools/fetch-art.py   # download the CC0 sources listed in ASSET_MANIFEST.json (~220 MB)
npm run art:build            # Blender 4.5 LTS: rebuild every .blend master and re-export the GLBs
```

## Editable masters

The build writes these files to `art/source/`. Materials are packed. Scene dimensions are meters; Blender +Y becomes game -Z.

| Source | Contents | In-game coverage |
| --- | --- | --- |
| `source/cemetery.blend` | Church facade, fitted arches, rose tracery, headstones, grave slabs, lanterns, iron boundary, statues, doors, oak branches, ground and debris | Hallowed Ground |
| `source/cathedral.blend` | Arcades, clustered piers, stained glass, pews, altar and ribbed canopy | Hall of Vigils and Cathedral of Ash |
| `source/crypt.blend` | Barrel vaults, burial niches, sarcophagi and iron gate | The Ossuary |
| `source/factory.blend` | Riveted structure, generators, flywheels, pipes and loading door | Soul Foundry |
| `source/weapon-0.blend` through `weapon-4.blend` | Five weapons, grips, barrels, screws, trigger guards, gloves, sleeves; rotor pivots retained | All five weapons |
| `source/revenant.blend` | CC0 zombie mesh with corrected materials and baked, retargeted animation | Shambler |
| `source/skeleton.blend` | Authored skull with cut sockets, mandible/teeth, rib cage, pelvis, paired limb bones, skinned to the retargeted rig | Skeleton |
| `source/supplies.blend` | Medical tin, ammunition box, breastplate, cross reliquary | Health, ammo, armor, secret pickups |

`tools/render-weapons.py` and `tools/render-revenant.py` write Blender review renders to `renders/` (not committed). Runtime meshes are in `../public/assets/models/`. All four environment scenes include collision and lamp markers exported as glTF extras.

The weapon source retains bevel modifiers and editable profiles. Environmental type and curves remain editable in the .blend master; the exported mesh is evaluated. The zombie and skeleton each contain walk, run, idle, attack, hit, and death NLA tracks. The downloaded animation skeleton has a different bind pose, so the pipeline copies evaluated bone transforms and bakes them to the target rig; renaming bones alone produces incorrect poses.

## Armory material library

`source/armory-materials.blend` retains the original procedural blued steel, iron and brass shaders, plus graded CC0 wood and leather source materials. `tools/refine-weapons.py` bakes their color, roughness, metalness and tangent-space normal maps to `../public/assets/textures/armory/`, then applies them to all five editable weapon masters. `-- --reuse-textures` skips baking when reviewing model details. The runtime GLBs embed optimized maps; no external material service is required.

This pass also adds armory stamps, receiver bands, peened rivets, glove cuffs and stitching, changes sleeves to charcoal cloth, and unwraps barrel sidewalls cylindrically. Receiver/pump/bolt and rotor names remain stable for the runtime mechanics. The exposed freezer hose is darkened to match the mechanical housing.

## Rebuild

Run `python3 tools/fetch-art.py`, then `npm run art:build` with Blender 4.5 LTS on your `PATH`. The fetch script downloads every CC0 source (Poly Haven models, materials and the HDR sky; the OpenGameArt zombie archive, checked against a pinned SHA-256) into `source/` and `../public/assets/textures/`, both git-ignored. `ASSET_MANIFEST.json` records licenses and artists.

The build creates scene/weapon masters, bakes the armory library and refines all weapons, refines the cemetery's trees, retargets the zombie, builds the skeleton, supplies, cathedral, crypt and factory, then produces GLB files. Full-resolution source textures stay packed in Blender. Runtime images are resized to at most 1024 pixels and compressed; alpha masks are retained. The texture optimization command should run once after exporting, to avoid repeatedly recompressing JPEG images.

The evaluated high-density tree scan was not shipped as geometry. The cemetery uses authored tapered oak meshes; its bark comes from the credited tree material. Source scans are retained for reference.

## Quality work still required

- Produce bespoke anatomy and individual boss identities. The humanoids now reuse the authored skeleton/revenant rigs with Blender clothing and armor; the hound still uses procedural articulated geometry. These need artist review and further modeling rather than additional costume variants alone.
- Replace the remaining 18 level themes with authored modular architecture, terrain, props, lighting and distinct layouts. The authored environments repeat their main layouts between sectors, with alternate cover placement.
- Refine weapon ergonomics and hand fit; replace procedural spring motion and moving assemblies with fully authored hand/weapon animation where needed. The new shell ejection, impact marks and layered synthesized shots remain a first effects pass.
- Add deliberate environmental storytelling, damaged material variants, decals, debris placement and less repetitive grave dressing. Current grave text and facade construction still look too uniform.
- Artist review of anatomy, skin, skeleton proportions, animation contacts, foliage silhouette, surface scale, and readability in motion.
- Profile full waves on declared target hardware. Establish frame-time and memory budgets, spatial batching/instancing and distance LODs before expanding the art set. Current counters are inspection aids, not benchmark evidence.
- Full campaign playtesting, pacing and timing. Total campaign length has not been measured.

For the next art milestone, finish one cemetery sector to the intended quality with a complete enemy encounter, then extend that approved standard across the campaign. Do not classify this build as AA/AAA based on model count or polygon count.

## Runtime mesh budgets (0.6)

`tools/build-actor-lods.py` exports weighted 16k/15k skeleton/revenant meshes with all six animation clips. `tools/build-environment-lods.py` reduces scanned grass, rock, trunk and statue geometry while retaining UVs and textures. Both read the full-detail packed Blender masters without overwriting them. Run through `tools/build-assets.sh` so texture compression happens once after fresh exports. The cemetery runtime is about 323k triangles including repeated meshes; architectural silhouettes and collision markers are retained.

## Enemy rig and wardrobe pass (0.7)

`art/source/enemy-wardrobe.blend` and `tools/build-enemy-wardrobe.py` contain bone-mounted cowls, folded habits, plate armor, greaves, a sword and crown. `enemy-wardrobe.glb` is shared by all variants and reuses the credited leather/metal texture sources. Runtime attachment batches group geometry by bone/material, convert metre-based costume coordinates to the imported animation rig units, and follow that rig through animation and ragdoll transitions. `src/enemy-motion.ts` layers variant attacks, casting, breathing, turning and weight transfer over the existing clips; no new motion-capture clips are claimed.
