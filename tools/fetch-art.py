"""Download the CC0 source assets used by tools/build-assets.sh.

Everything lands in art/source/ and public/assets/textures/ (both git-ignored).
Licenses and artists are recorded in art/ASSET_MANIFEST.json. Re-running is safe;
existing files are skipped.
"""
import concurrent.futures, hashlib, json, pathlib, shutil, subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1];SOURCE=ROOT/'art/source';TEXTURES=ROOT/'public/assets/textures'
MODELS=['large_castle_door','dead_tree_trunk_02','rock_moss_set_01','gothic_statue','tree_small_02','grass_medium_01']
MATERIALS=['medieval_blocks_03','mossy_cobblestone','rocky_terrain_02','rusty_metal','dark_wood','brown_leather']
HDRI='qwantani_moonrise_puresky'
ZOMBIE=('https://opengameart.org/sites/default/files/Male%20City%20Zombie.7z','2858c0c4968740b372108afc64ba009ef4d0e0425edbb5dc3dc50d46f4d0a661')
def fetch(url,path):
 path.parent.mkdir(parents=True,exist_ok=True)
 if not path.exists():subprocess.run(['curl','-fLsS','--retry','3','-o',str(path),url],check=True)
 return path
def files(asset):return json.loads(fetch('https://api.polyhaven.com/files/'+asset,SOURCE/(asset+'.json')).read_text())
jobs=[]
for name in MODELS:
 entry=files(name)['gltf']['2k']['gltf'];jobs.append((entry['url'],SOURCE/name/(name+'.gltf')))
 for filename,item in entry.get('include',{}).items():jobs.append((item['url'],SOURCE/name/filename))
for name in MATERIALS:
 data=files(name)
 for key,short in [('Diffuse','color'),('nor_gl','normal'),('Rough','roughness')]:jobs.append((data[key]['2k']['jpg']['url'],TEXTURES/name/(short+'.jpg')))
jobs.append((files(HDRI)['hdri']['2k']['hdr']['url'],TEXTURES/'moonrise.hdr'))
jobs.append((ZOMBIE[0],SOURCE/'zombie.7z'))
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
 for p in pool.map(lambda job:fetch(*job),jobs):print(p.relative_to(ROOT),flush=True)
archive=SOURCE/'zombie.7z'
if hashlib.sha256(archive.read_bytes()).hexdigest()!=ZOMBIE[1]:raise SystemExit('zombie.7z checksum mismatch; inspect the download before using it')
if not (SOURCE/'zombie/InfectedCityMan.fbx').exists():
 if not shutil.which('7z'):raise SystemExit('Install 7-Zip (7z) to extract art/source/zombie.7z')
 subprocess.run(['7z','x','-y','-o'+str(SOURCE/'zombie'),str(archive)],check=True,stdout=subprocess.DEVNULL)
print('CC0 sources ready. Next: npm run art:build (requires Blender 4.5 LTS).')
