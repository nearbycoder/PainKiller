import { WeaponMotion } from "./weapon-motion";
import { CombatEffects } from "./combat-effects";
import { Atmosphere } from "./surface-effects";
import { Physics, type Ragdoll } from "./physics";
import type { RigidBody } from "@dimforge/rapier3d-compat";
import { projectileModel } from "./projectile-models";
import { Controls } from "./controls";
import { AMMUNITION, fallbackWeapon, refillAmmo } from "./ammunition";
import { authoredPickup } from "./authored-models";
import { art, DEFERRED_ART, ensureArt, hasArt } from "./assets";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import * as T from "three";
import { buildArena, type Arena } from "./world";
import {
  enemyModel,
  weaponModel,
  type EnemyModel,
  type WeaponModel,
} from "./models";
import {
  LEVELS,
  WEAPONS,
  ENEMY_TYPES,
  waveCount,
  type EnemyType,
} from "./data";
import {
  clamp,
  slide,
  blocked,
  parseSave,
  freshSave,
  damageAfterArmor,
  segmentSphere,
  mergeRecord,
  spatialCue,
  bearing,
  type Resume,
  type Save,
} from "./core";
import { Sound, type EnemyCue } from "./audio";
import { layerFor } from "./music";
import { isolated, random } from "./random";
import { CROSSHAIR_COLORS, parseSettings, type Settings } from "./settings";
import { HintQueue, hintText, type HintId } from "./hints";
import { damageKey, deathRecap, type DamageLog } from "./recap";
import {
  actionLabel,
  actionsByCode,
  cloneBindings,
  DEFAULT_BINDINGS,
  moveLabel,
  clonePadBindings,
  DEFAULT_PAD_BINDINGS,
  PAD_ACTIONS,
  padActionLabel,
  type Action,
  type PadAction,
} from "./bindings";
declare global {
  interface Window {
    desktop?: {
      readSave: () => Promise<string | null>;
      writeSave: (data: string) => Promise<boolean>;
      fullscreen: () => Promise<boolean>;
      quit: () => Promise<void>;
    };
    __PURGATORY__?: unknown;
  }
}
function readSeenHints(): string[] {
  try {
    const seen = JSON.parse(localStorage.getItem("purgatory.hints") || "[]");
    return Array.isArray(seen) ? seen.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeSeenHints(seen: Iterable<string>) {
  try {
    localStorage.setItem("purgatory.hints", JSON.stringify([...seen]));
  } catch {}
}
/** Particle bursts closer than this to the eye are skipped (metres). */
const NEAR_PARTICLE_DISTANCE = 1.5;
type Mode =
  "menu" | "loading" | "playing" | "paused" | "dead" | "result" | "ending";
interface Enemy {
  model: EnemyModel;
  type: EnemyType;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  cooldown: number;
  frozen: number;
  age: number;
  phase: number;
  attackWindup: number;
  knockback: T.Vector3;
  stagger: number;
  animationTime: number;
  /** Seconds spent trying to walk without leaving `anchor`. */
  stuck: number;
  /** Seconds out of the player's sight since a wall last blocked the enemy. */
  walled: number;
  anchor: T.Vector3;
}
export interface ThreatIndicator {
  kind: "damage" | "incoming" | "locator" | "gate";
  /** Bearing from the view direction, radians, positive to the right. */
  angle: number;
  strength: number;
  /** Text shown with the marker (the gate's distance). */
  label?: string;
}
interface Projectile {
  mesh: T.Object3D;
  velocity: T.Vector3;
  kind: string;
  damage: number;
  life: number;
  age: number;
  hostile: boolean;
  /** Who fired a hostile projectile (enemy type, or "boss"), for the death recap. */
  source?: string;
  radius: number;
  hits: Set<Enemy>;
  body?: RigidBody;
  distance: number;
}
interface Pickup {
  mesh: T.Object3D;
  kind: "soul" | "health" | "armor" | "ammo" | "secret";
  age: number;
  /** Index of a fixed sector supply, so a resumed wave does not hand it out twice. */
  slot?: number;
}
interface Particle {
  mesh: T.Mesh;
  velocity: T.Vector3;
  life: number;
  max: number;
}
interface Ring {
  mesh: T.Mesh;
  radius: number;
  hit: boolean;
}
export class Game {
  canvas: HTMLCanvasElement;
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(80, 1, 0.08, 220);
  weaponScene = new T.Scene();
  weaponCamera = new T.PerspectiveCamera(65, 1, 0.01, 10);
  private weaponFlashLight = new T.PointLight(0xffc178, 0, 3, 2);
  private weaponLamp = new T.PointLight(0xffbb77, 0, 5, 2);
  private worldSun = new T.DirectionalLight(0xbecddb, 1);
  private worldFill = new T.HemisphereLight(0xa4b5c5, 0x302a23, 0.5);
  private atmosphere = new Atmosphere(this.scene);
  private stepDistance = 0;
  private actionSoundTime = 0;
  private actionSoundWeapon = 1;
  private lastLampPosition = new T.Vector3();
  arena!: Arena;
  weaponModels: WeaponModel[] = [];
  sound = new Sound();
  mode: Mode = "menu";
  save: Save = freshSave();
  level = 0;
  room = 0;
  wave = 0;
  kills = 0;
  levelKills = 0;
  levelSouls = 0;
  secrets = 0;
  elapsed = 0;
  /** Deaths in the current level; a clear with none is deathless. */
  levelDeaths = 0;
  /** Damage taken this sector attempt by source; the death screen's recap. */
  damageLog: DamageLog = {};
  lastDeath: ReturnType<typeof deathRecap> | null = null;
  /** What the last completed level achieved, for the result screen. */
  lastClear: { fastest: boolean; deathless: boolean; best: number } | null =
    null;
  /** Fixed sector supplies collected in this sector (see Resume.taken). */
  taken = new Set<number>();
  /** The level waiting on a deferred environment download, while mode is "loading". */
  loading = { level: 0, room: 0, error: "" };
  /** One-time combat hints; which ones were shown is kept in local storage. */
  hints = new HintQueue(readSeenHints());
  /** World positions that recently hurt the player, for the HUD's hit-direction arcs. */
  damageMarks: { x: number; z: number; life: number }[] = [];
  /** Seconds since any living enemy was in view; drives the last-enemies locator. */
  unseenTime = 0;
  sectorStart = { level: -1, kills: 0, souls: 0, secrets: 0 };
  totalTime = 0;
  health = 100;
  armor = 50;
  souls = 0;
  demon = 0;
  cardTime = 0;
  cardUsed = false;
  weapon = 1;
  ammo = WEAPONS.map((w) => w.ammo);
  altAmmo = WEAPONS.map((w) => w.alt);
  difficulty = 1;
  position = new T.Vector3(0, 1.75, 23);
  velocity = new T.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = true;
  keys = new Set<string>();
  mouse = [false, false];
  cooldown = 0;
  recoil = 0;
  weaponMotion = new WeaponMotion();
  effects = new CombatEffects(this.scene);
  physics = new Physics();
  embeddedStakes: { mesh: T.Object3D; life: number }[] = [];
  damageFlash = 0;
  /** One of everything a fight can draw, rendered once per arena so shaders compile up front. */
  private warmSet?: T.Group;
  /** Shadow depth variants, compiled the way the shadow pass draws them. */
  private depthSet = new T.Group();
  private arenaId = 0;
  private warmedLights = new Set<string>();
  warmPending = false;
  warmReady = false;
  hitFlash = 0;
  invulnerable = 0;
  sensitivity = 0.002;
  fov = 80;
  quality = 1;
  adaptiveResolution = true;
  private adaptiveScale = 1;
  private frameAverage = 16.7;
  private resolutionTimer = 0;
  private shadowTimer = 0;
  renderScale = 1;
  brightness = 1;
  invertY = false;
  headBob = true;
  bindings = cloneBindings(DEFAULT_BINDINGS);
  padBindings = clonePadBindings(DEFAULT_PAD_BINDINGS);
  stickSpeed = 1;
  vibration = true;
  autoSwitch = true;
  hudScale = 1;
  private codeActions = actionsByCode(this.bindings);
  crosshair = true;
  crosshairStyle = 0;
  crosshairColor = 0;
  crosshairSize = 1;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  particles: Particle[] = [];
  rings: Ring[] = [];
  corpses: { model: EnemyModel; life: number; ragdoll: Ragdoll }[] = [];
  remaining = 0;
  spawnTimer = 0;
  waveDelay = 2;
  arenaCleared = false;
  bossSpawned = false;
  toast = "";
  toastTimer = 0;
  /** Displayed frames; for rendering only. */
  frame = 0;
  /** Simulation steps since the arena loaded; timing inside update() uses this, not `frame`. */
  tick = 0;
  fps = 60;
  lastTime = 0;
  accumulator = 0;
  onChange: () => void = () => {};
  onHUD: () => void = () => {};
  hudTimer = 0;
  inputEnabled = true;
  controls: Controls;
  private ray = new T.Ray();
  private box3 = new T.Box3();
  private geometry = new T.IcosahedronGeometry(1, 0);
  private projectileMats = new Map<number, T.MeshBasicMaterial>();
  composer: EffectComposer;
  ao: SSAOPass;
  aa = new ShaderPass(FXAAShader);
  weaponPass = new RenderPass(this.weaponScene, this.weaponCamera);
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    if (art.sky) {
      const pmrem = new T.PMREMGenerator(this.renderer);
      const env = pmrem.fromEquirectangular(art.sky);
      this.scene.environment = env.texture;
      this.weaponScene.environment = env.texture;
      this.scene.environmentIntensity = 0.35;
      this.weaponScene.environmentIntensity = 0.65;
      pmrem.dispose();
    }
    this.composer = new EffectComposer(this.renderer);
    this.composer.renderTarget1.samples = 0;
    this.composer.renderTarget2.samples = 0;
    this.camera.layers.enable(1);
    const ao = (this.ao = new SSAOPass(
      this.scene,
      this.camera,
      innerWidth,
      innerHeight,
      16,
    ));
    ao.kernelRadius = 0.7;
    ao.minDistance = 0.002;
    ao.maxDistance = 0.13;
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(ao);
    // Keep transparent particles out of the opaque AO depth/normal pass.
    const renderAO = ao.render.bind(ao);
    ao.render = (...args: Parameters<typeof ao.render>) => {
      this.camera.layers.disable(1);
      try {
        renderAO(...args);
      } finally {
        this.camera.layers.enable(1);
      }
    };
    this.weaponPass.clear = false;
    this.weaponPass.clearDepth = true;
    this.composer.addPass(this.weaponPass);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.aa);
    this.scene.add(this.worldFill);
    const sun = this.worldSun;
    sun.position.set(-20, 35, -10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -40,
      right: 40,
      top: 45,
      bottom: -40,
      near: 0.5,
      far: 110,
    });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.weaponScene.add(new T.HemisphereLight(0xc5c5b9, 0x302a23, 0.7));
    const key = new T.DirectionalLight(0xf4e8d6, 2.7);
    key.position.set(-2, 4, 1);
    this.weaponScene.add(key);
    this.weaponScene.add(this.weaponFlashLight, this.weaponLamp);
    this.weaponModels = WEAPONS.map((_, i) => weaponModel(i));
    this.weaponModels.forEach((w) => {
      this.weaponScene.add(w.root);
      w.root.scale.setScalar(0.72);
      w.root.visible = false;
    });
    this.weaponModels[this.weapon].root.visible = true;
    this.loadArena();
    this.controls = new Controls(this);
    this.bindInput();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    requestAnimationFrame(this.loop);
  }
  async init() {
    let raw: string | null = null;
    try {
      raw = window.desktop
        ? await window.desktop.readSave()
        : localStorage.getItem("purgatory.save");
    } catch {}
    this.save = parseSave(raw);
    let options: string | null = null;
    try {
      options = localStorage.getItem("purgatory.options");
    } catch {}
    const settings = parseSettings(options);
    if (!options && this.controls.mobile) {
      settings.quality = 0;
      settings.renderScale = 0.8;
    }
    this.applySettings(settings);
    this.level = this.save.level;
    this.room = 0;
    // The saved level is the title backdrop; wait for its scene if it is still loading.
    await ensureArt(LEVELS[this.level].theme).catch(() => (this.level = 0));
    this.loadArena();
    this.onChange();
  }
  persist() {
    const value = JSON.stringify(this.save);
    try {
      localStorage.setItem("purgatory.save", value);
    } catch {}
    if (window.desktop)
      void window.desktop
        .writeSave(value)
        .catch(() =>
          this.notify("Save could not be written. Check disk permissions."),
        );
  }
  settings(): Settings {
    return {
      sensitivity: this.sensitivity,
      fov: this.fov,
      volume: this.sound.volume,
      music: this.sound.music,
      musicVolume: this.sound.musicVolume,
      effectsVolume: this.sound.effectsVolume,
      difficulty: this.difficulty,
      quality: this.quality,
      renderScale: this.renderScale,
      adaptiveResolution: this.adaptiveResolution,
      brightness: this.brightness,
      invertY: this.invertY,
      headBob: this.headBob,
      crosshair: this.crosshair,
      crosshairStyle: this.crosshairStyle,
      crosshairColor: this.crosshairColor,
      crosshairSize: this.crosshairSize,
      hints: this.hints.enabled,
      bindings: cloneBindings(this.bindings),
      padBindings: clonePadBindings(this.padBindings),
      stickSpeed: this.stickSpeed,
      vibration: this.vibration,
      autoSwitch: this.autoSwitch,
      hudScale: this.hudScale,
    };
  }
  applySettings(s: Settings) {
    const resize =
      this.quality !== s.quality || this.renderScale !== s.renderScale;
    Object.assign(this, {
      sensitivity: s.sensitivity,
      fov: s.fov,
      difficulty: s.difficulty,
      quality: s.quality,
      renderScale: s.renderScale,
      adaptiveResolution: s.adaptiveResolution,
      brightness: s.brightness,
      invertY: s.invertY,
      headBob: s.headBob,
      crosshair: s.crosshair,
      crosshairStyle: s.crosshairStyle,
      crosshairColor: s.crosshairColor,
      crosshairSize: s.crosshairSize,
      stickSpeed: s.stickSpeed,
      vibration: s.vibration,
      autoSwitch: s.autoSwitch,
      hudScale: s.hudScale,
    });
    const root = document.documentElement;
    root.style.setProperty("--hud-scale", String(s.hudScale));
    root.style.setProperty("--crosshair-size", String(s.crosshairSize));
    root.style.setProperty(
      "--crosshair-color",
      CROSSHAIR_COLORS[s.crosshairColor][1],
    );
    root.dataset.crosshair = String(s.crosshairStyle);
    this.hints.setEnabled(s.hints);
    this.bindings = cloneBindings(s.bindings);
    this.codeActions = actionsByCode(this.bindings);
    this.padBindings = clonePadBindings(s.padBindings);
    this.sound.music = s.music;
    this.sound.setVolume(s.volume);
    this.sound.setChannels(s.effectsVolume, s.musicVolume);
    this.renderer.toneMappingExposure = s.brightness;
    this.renderer.shadowMap.enabled = s.quality > 0;
    this.renderer.shadowMap.needsUpdate = true;
    this.ao.enabled = s.quality === 2;
    if (resize || !s.adaptiveResolution) {
      this.adaptiveScale = 1;
      this.renderer.setPixelRatio(
        Math.min(devicePixelRatio, 1.5) * s.renderScale,
      );
      this.resize();
    }
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
  }
  saveOptions() {
    try {
      localStorage.setItem(
        "purgatory.options",
        JSON.stringify(this.settings()),
      );
    } catch {}
  }
  resize() {
    const w = innerWidth,
      h = innerHeight;
    this.renderer.setSize(w, h);

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weaponCamera.aspect = w / h;
    this.weaponCamera.fov = T.MathUtils.radToDeg(
      2 *
        Math.atan(Math.tan(T.MathUtils.degToRad(65 / 2)) / Math.min(1, w / h)),
    );
    this.weaponCamera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    const ratio = this.renderer.getPixelRatio();
    this.aa.uniforms.resolution.value.set(1 / (w * ratio), 1 / (h * ratio));
    this.ao.setSize(
      Math.max(1, Math.floor(w * ratio * 0.5)),
      Math.max(1, Math.floor(h * ratio * 0.5)),
    );
  }
  setMode(mode: Mode) {
    this.mode = mode;
    this.mouse = [false, false];
    this.keys.clear();
    if (mode !== "playing") this.controls?.clear();
    if (mode !== "playing" && document.pointerLockElement)
      document.exitPointerLock();
    this.onChange();
  }
  start(
    level = this.save.level,
    room = level === this.save.level ? this.save.room : 0,
    lock = true,
    resume = false,
  ) {
    const theme = LEVELS[clamp(level, 0, 23)].theme;
    if (!hasArt(theme)) {
      // Web builds fetch some environments after the menu appears; wait for this one.
      this.loading = { level: clamp(level, 0, 23), room, error: "" };
      this.setMode("loading");
      ensureArt(theme).then(
        () => {
          if (this.mode === "loading") this.start(level, room, lock, resume);
        },
        (error) => {
          this.loading.error = String(error);
          this.onChange();
        },
      );
      return;
    }
    const snapshot =
      resume &&
      this.save.resume?.level === clamp(level, 0, 23) &&
      this.save.resume.room === room
        ? this.save.resume
        : undefined;
    this.level = clamp(level, 0, 23);
    this.room = clamp(room, 0, LEVELS[this.level].rooms - 1);
    this.health = 100;
    this.armor = 50;
    this.souls = 0;
    this.demon = 0;
    this.cardTime = 0;
    this.cardUsed = false;
    this.levelKills = 0;
    this.levelSouls = 0;
    this.secrets = 0;
    this.elapsed = 0;
    this.levelDeaths = 0;
    this.ammo = WEAPONS.map((w) => w.ammo);
    this.altAmmo = WEAPONS.map((w) => w.alt);
    this.loadArena();
    this.setMode("playing");
    this.sound.start();
    this.checkpoint();
    this.notify(
      LEVELS[this.level].name.toUpperCase() +
        "  /  " +
        LEVELS[this.level].subtitle,
      5,
    );
    if (snapshot) this.restore(snapshot);
    if (lock) this.lock();
  }
  /** Continue from the saved checkpoint, resuming the saved wave if there is one. */
  continueGame() {
    this.start(this.save.level, this.save.room, true, true);
  }
  /** Record the player's state as the next wave begins, so quitting loses at most one wave. */
  snapshot(wave = this.wave + 1): Resume {
    const finite = (v: number) => (Number.isFinite(v) ? Math.floor(v) : -1);
    return {
      level: this.level,
      room: this.room,
      wave,
      health: Math.max(1, Math.ceil(this.health)),
      armor: Math.max(0, Math.round(this.armor)),
      ammo: this.ammo.map(finite),
      altAmmo: this.altAmmo.map(finite),
      weapon: this.weapon,
      souls: this.souls,
      cardUsed: this.cardUsed,
      taken: [...this.taken],
      kills: this.levelKills,
      levelSouls: this.levelSouls,
      secrets: this.secrets,
      elapsed: Math.round(this.elapsed),
      deaths: this.levelDeaths,
      sector: {
        kills: this.sectorStart.kills,
        souls: this.sectorStart.souls,
        secrets: this.sectorStart.secrets,
      },
    };
  }
  private restore(r: Resume) {
    const amount = (v: number) => (v < 0 ? Infinity : v);
    this.health = r.health;
    this.armor = r.armor;
    this.ammo = r.ammo.map(amount);
    this.altAmmo = r.altAmmo.map(amount);
    this.souls = r.souls;
    this.cardUsed = r.cardUsed;
    this.levelKills = r.kills;
    this.levelSouls = r.levelSouls;
    this.secrets = r.secrets;
    this.elapsed = r.elapsed;
    this.levelDeaths = r.deaths;
    this.sectorStart = { level: this.level, ...r.sector };
    for (const slot of r.taken) {
      this.taken.add(slot);
      const p = this.pickups.find((x) => x.slot === slot);
      if (p) {
        p.mesh.removeFromParent();
        this.pickups.splice(this.pickups.indexOf(p), 1);
      }
    }
    this.equip(r.weapon);
    // The saved wave begins shortly; earlier waves of this sector stay cleared.
    this.wave = r.wave - 1;
    this.waveDelay = 2;
    this.save.resume = r;
    this.persist();
    this.notify(`RESUMED  /  WAVE ${r.wave} OF 3`, 3);
  }
  lock() {
    if (this.controls.mobile || this.controls.connected) return;
    try {
      const result = this.canvas.requestPointerLock();
      if (result && typeof result.catch === "function")
        void result.catch(() =>
          this.notify(
            "Click the world to capture the mouse. Arrow keys also turn.",
          ),
        );
    } catch {
      this.notify("Mouse capture unavailable. Use arrow keys to turn.");
    }
  }
  resume() {
    this.setMode("playing");
    this.sound.start();
    this.lock();
  }
  checkpoint() {
    this.sectorStart = {
      level: this.level,
      kills: this.levelKills,
      souls: this.levelSouls,
      secrets: this.secrets,
    };
    this.save.level = this.level;
    this.save.room = this.room;
    this.save.unlocked = Math.max(this.save.unlocked, this.level);
    // The sector start is itself a snapshot, so quitting before wave 1 keeps level stats.
    this.save.resume = this.snapshot(1);
    this.persist();
  }
  retry() {
    // Restarting a sector keeps what the earlier sectors of this level earned.
    const kept =
        this.sectorStart.level === this.level ? this.sectorStart : null,
      elapsed = this.elapsed,
      deaths = this.levelDeaths;
    this.start(this.level, this.room);
    if (kept) {
      this.levelKills = kept.kills;
      this.levelSouls = kept.souls;
      this.secrets = kept.secrets;
      this.elapsed = elapsed;
      this.levelDeaths = deaths;
      this.sectorStart = { ...kept };
    }
    this.save.resume = this.snapshot(1);
    this.persist();
  }
  /** Queue a one-time hint; it appears in its own HUD line when nothing blocks it. */
  hint(id: HintId) {
    this.hints.trigger(id);
  }
  /** The visible hint worded for the current input device. */
  hintText() {
    const id = this.hints.visible;
    if (!id) return "";
    return hintText(
      id,
      this.controls.connected
        ? "controller"
        : this.controls.mobile
          ? "touch"
          : "keyboard",
      (a) => (this.controls.connected ? this.padFor(a) : this.keyFor(a)),
    );
  }
  notify(text: string, time = 3) {
    this.toast = text;
    this.toastTimer = time;
  }
  /** Play an enemy cue panned and attenuated from the player's point of view. */
  enemyCue(name: EnemyCue, at: T.Vector3) {
    const s = spatialCue(
      this.position.x,
      this.position.z,
      this.yaw,
      at.x,
      at.z,
    );
    if (s.gain > 0) this.sound.cue(name, s.pan, s.gain);
  }
  cycleWeapon(direction: number) {
    if (this.mode === "playing") this.equip((this.weapon + direction + 5) % 5);
  }
  equip(id: number) {
    this.weapon = clamp(id, 0, 4);
    if (this.weapon === 4 && this.mode === "playing") this.hint("storm");
    this.weaponMotion.equip(this.weapon);
    this.weaponModels.forEach((w, i) => (w.root.visible = i === this.weapon));
    this.recoil = 0.14;
    this.sound.mechanism(this.weapon, true);
    this.onHUD();
  }
  clearDynamic() {
    this.effects.clear();
    this.enemies.forEach((e) => e.model.dispose());
    this.corpses.forEach((c) => {
      this.physics.removeRagdoll(c.ragdoll);
      c.model.dispose();
    });
    for (const p of this.projectiles)
      if (p.body) this.physics.removeBody(p.body);
    for (const s of this.embeddedStakes) s.mesh.removeFromParent();
    this.embeddedStakes = [];
    [
      ...this.projectiles,
      ...this.pickups,
      ...this.particles,
      ...this.rings,
    ].forEach((p) => {
      p.mesh.removeFromParent();
      if (p.mesh instanceof T.Mesh && p.mesh.geometry !== this.geometry)
        p.mesh.geometry.dispose();
    });
    this.enemies = [];
    this.corpses = [];
    this.projectiles = [];
    this.pickups = [];
    this.particles = [];
    this.rings = [];
  }
  loadArena() {
    this.clearDynamic();
    this.hints.clear();
    this.damageLog = {};
    this.arena?.dispose();
    this.arena = buildArena(this.scene, LEVELS[this.level], this.room);
    this.physics.reset(this.arena.colliders);
    this.renderer.shadowMap.needsUpdate = true;
    // Each arena's lights change the shader variants; compile them before the fight.
    this.arenaId++;
    this.warmPending = true;
    this.warmReady = false;
    const theme = LEVELS[this.level].theme;
    const indoor = [
      "cathedral",
      "crypt",
      "prison",
      "opera",
      "asylum",
      "station",
      "factory",
      "castle",
      "palace",
      "monastery",
    ].includes(theme);
    this.worldSun.intensity = indoor ? 0.55 : 1.05;
    this.worldFill.intensity = indoor ? 0.42 : 0.55;
    this.scene.environmentIntensity = indoor ? 0.28 : 0.38;
    this.weaponScene.environmentIntensity = indoor ? 0.48 : 0.65;
    this.atmosphere.setTheme(theme);
    this.stepDistance = 0;
    this.actionSoundTime = 0;
    this.position.set(0, 1.75, 24);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.yaw = 0;
    this.pitch = 0;
    this.wave = 0;
    this.remaining = 0;
    this.waveDelay = 3;
    this.spawnTimer = 0;
    this.arenaCleared = false;
    this.bossSpawned = false;
    this.cardUsed = false;
    this.cardTime = 0;
    this.cooldown = 0;
    this.damageFlash = this.hitFlash = this.recoil = 0;
    this.tick = 0;
    this.damageMarks = [];
    this.unseenTime = 0;
    this.accumulator = 0;
    this.weaponMotion.equip(this.weapon);
    this.invulnerable = 1;
    this.taken = new Set();
    this.addPickup("health", new T.Vector3(-5, 0.65, 8), 0);
    this.addPickup("armor", new T.Vector3(5, 0.65, 8), 1);
    this.addPickup("ammo", new T.Vector3(-5, 0.65, -15), 2);
    this.addPickup("ammo", new T.Vector3(5, 0.65, -15), 3);
    this.addPickup("secret", this.arena.secret, 4);
  }
  nextArena() {
    if (!this.arenaCleared) return;
    if (this.room + 1 < LEVELS[this.level].rooms) {
      this.room++;
      this.health = Math.max(this.health, 75);
      this.armor = Math.max(this.armor, 30);
      this.ammo = this.ammo.map((v, i) =>
        i === 0 ? Infinity : Math.max(v, Math.floor(WEAPONS[i].ammo * 0.5)),
      );
      this.altAmmo = this.altAmmo.map((v, i) =>
        i === 0 ? Infinity : Math.max(v, Math.floor(WEAPONS[i].alt * 0.5)),
      );
      this.loadArena();
      this.checkpoint();
      this.notify("CHECKPOINT  /  SECTOR " + (this.room + 1));
    } else this.completeLevel();
  }
  completeLevel() {
    delete this.save.resume;
    const { record, fastest } = mergeRecord(this.save.records?.[this.level], {
      time: Math.max(1, Math.round(this.elapsed)),
      kills: this.levelKills,
      secrets: this.secrets,
      deathless: this.levelDeaths === 0,
    });
    this.save.records = { ...this.save.records, [this.level]: record };
    this.lastClear = {
      fastest,
      deathless: this.levelDeaths === 0,
      best: record.time,
    };
    this.save.best[this.level] = Math.max(
      this.save.best[this.level] || 0,
      this.levelKills,
    );
    if (this.secrets > 0 || this.levelSouls >= 25) {
      const card = (LEVELS[this.level].chapter - 1) % 3;
      if (!this.save.cards.includes(card)) this.save.cards.push(card);
    }
    if (this.level === 23) {
      this.save.completed = true;
      this.save.room = 0;
      this.setMode("ending");
    } else {
      this.save.unlocked = Math.max(this.save.unlocked, this.level + 1);
      this.save.level = this.level + 1;
      this.save.room = 0;
      this.setMode("result");
    }
    this.persist();
  }
  activateCard() {
    if (this.mode !== "playing") return;
    if (!this.save.cards.includes(this.save.selectedCard)) {
      this.notify(
        "Earn a tarot card by finding a relic or collecting 25 souls in a level.",
      );
      return;
    }
    if (this.cardUsed) {
      this.notify("Tarot recharges at the next checkpoint.");
      return;
    }
    this.cardUsed = true;
    this.cardTime = 30;
    this.sound.pickup();
    this.notify("TAROT AWAKENED", 3);
  }
  bindInput() {
    window.addEventListener("keydown", (e) => {
      if (this.mode !== "playing") return;
      if (
        e.target instanceof Element &&
        e.target.matches("input,select,button")
      )
        return;
      const bound = this.codeActions.get(e.code);
      if (bound || ["Space", "Tab"].includes(e.code)) e.preventDefault();
      if (e.repeat) {
        this.keys.add(e.code);
        return;
      }
      // Escape always pauses, whatever else is bound.
      if (e.code === "Escape") this.setMode("paused");
      else for (const action of bound || []) this.press(action);
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      if (this.mode === "playing") this.setMode("paused");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.mode === "playing") this.setMode("paused");
    });
    document.addEventListener("pointerlockchange", () => {
      if (!document.pointerLockElement && this.mode === "playing")
        this.setMode("paused");
    });
    document.addEventListener("mousemove", (e) => {
      if (
        this.mode === "playing" &&
        document.pointerLockElement === this.canvas
      ) {
        this.weaponMotion.look(e.movementX / 30, e.movementY / 30);
        this.yaw -= e.movementX * this.sensitivity;
        this.pitch = clamp(
          this.pitch - e.movementY * this.sensitivity * (this.invertY ? -1 : 1),
          -1.45,
          1.45,
        );
      }
    });
    this.canvas.addEventListener("mousedown", (e) => {
      if (this.mode !== "playing") return;
      if (!document.pointerLockElement) this.lock();
      const code = "Mouse" + e.button;
      if (this.codeActions.has(code)) e.preventDefault();
      for (const action of this.codeActions.get(code) || []) this.press(action);
      this.keys.add(code);
    });
    window.addEventListener("mouseup", (e) => {
      this.keys.delete("Mouse" + e.button);
      // Side buttons otherwise navigate the browser back or forward.
      if (this.mode === "playing" && e.button > 2) e.preventDefault();
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    let lastWheel = -Infinity;
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        if (this.mode === "playing") {
          e.preventDefault();
          const now = performance.now();
          if (Math.abs(e.deltaY) >= 2 && now - lastWheel >= 240) {
            this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
            lastWheel = now;
          }
        }
      },
      { passive: false },
    );
  }
  /** Whether any key or mouse button bound to `action` is held. */
  held(action: Action) {
    return this.bindings[action].some((code) => this.keys.has(code));
  }
  /** Primary or alternate fire from any device; `mouse` is also set by scripted tests. */
  firing(alt: boolean) {
    return (
      this.mouse[alt ? 1 : 0] ||
      this.held(alt ? "alternate" : "primary") ||
      (alt ? this.controls.secondary : this.controls.primary)
    );
  }
  /** One-shot actions when their key or button goes down. */
  press(action: Action) {
    if (this.mode !== "playing") return;
    if (action === "pause") this.setMode("paused");
    else if (action === "next") this.cycleWeapon(1);
    else if (action === "previous") this.cycleWeapon(-1);
    else if (action === "inspect") this.weaponMotion.inspect = 1.7;
    else if (action === "tarot") this.activateCard();
    else if (action === "use") this.useGate();
    else if (action.startsWith("weapon"))
      this.equip(Number(action.slice(-1)) - 1);
  }
  /** Walk through the open gate when standing at it. */
  useGate() {
    if (
      this.mode === "playing" &&
      this.arenaCleared &&
      Math.hypot(this.position.x, this.position.z + 28) < 5
    )
      this.nextArena();
  }
  /** Label of the keys bound to an action, for prompts. */
  keyFor(action: Action) {
    return actionLabel(this.bindings, action);
  }
  /** Label of the controller button bound to an action, for prompts. */
  padFor(action: Action) {
    return PAD_ACTIONS.some(([a]) => a === action)
      ? padActionLabel(this.padBindings, action as PadAction)
      : "—";
  }
  moveKeys() {
    return moveLabel(this.bindings);
  }
  private mat(color: number) {
    if (!this.projectileMats.has(color))
      this.projectileMats.set(color, new T.MeshBasicMaterial({ color }));
    return this.projectileMats.get(color)!;
  }
  addPickup(kind: Pickup["kind"], pos: T.Vector3, slot?: number) {
    if (this.pickups.length > 160) {
      const old = this.pickups.shift();
      old?.mesh.removeFromParent();
    }
    const color = {
      soul: 0x86efb1,
      health: 0xdf4d37,
      armor: 0x7398ee,
      ammo: 0xe9b770,
      secret: 0xffd892,
    }[kind];
    const modeled = art.ready ? authoredPickup(kind) : undefined;
    const m = modeled || new T.Mesh(this.geometry, this.mat(color));
    m.position.copy(pos);
    if (!modeled)
      m.scale.setScalar(
        kind === "secret" ? 0.32 : kind === "soul" ? 0.17 : 0.3,
      );
    this.scene.add(m);
    this.pickups.push({ mesh: m, kind, age: 0, slot });
  }
  burst(pos: T.Vector3, color: number, count = 10, speed = 6) {
    // Particles are flat unlit solids; one spawned beside the camera covers the view.
    if (pos.distanceTo(this.position) < NEAR_PARTICLE_DISTANCE) return;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 200) break;
      const m = new T.Mesh(this.geometry, this.mat(color));
      m.position.copy(pos);
      m.scale.setScalar(0.06 + random() * 0.12);
      this.scene.add(m);
      const life = 0.3 + random() * 0.6;
      this.particles.push({
        mesh: m,
        velocity: new T.Vector3(
          (random() - 0.5) * speed,
          random() * speed,
          (random() - 0.5) * speed,
        ),
        life,
        max: life,
      });
    }
  }
  spawnEnemy(type: EnemyType, pos?: T.Vector3) {
    const model = enemyModel(type, LEVELS[this.level].chapter);
    let p =
      pos?.clone() ||
      this.arena.spawn[Math.floor(random() * this.arena.spawn.length)].clone();
    if (!pos) {
      let valid = false;
      for (let i = 0; i < 100; i++) {
        const q =
          i < 30
            ? p
                .clone()
                .add(
                  new T.Vector3((random() - 0.5) * 8, 0, (random() - 0.5) * 7),
                )
            : new T.Vector3((random() - 0.5) * 47, 0, (random() - 0.5) * 54);
        if (
          !blocked(q.x, q.z, type === "boss" ? 2 : 0.6, this.arena.colliders) &&
          q.distanceTo(this.position) > 9
        ) {
          p = q;
          valid = true;
          break;
        }
      }
      if (!valid) p.set(0, 0, -20);
    }
    model.root.position.copy(p);
    this.scene.add(model.root);
    const hp =
      {
        shambler: 75,
        skeleton: 50,
        monk: 90,
        hound: 45,
        knight: 180,
        witch: 100,
        brute: 280,
        boss: 1800 + this.level * 110,
      }[type] *
      (this.difficulty === 0 ? 0.75 : this.difficulty === 2 ? 1.3 : 1);
    const speed = {
      shambler: 2.9,
      skeleton: 4.3,
      monk: 2.6,
      hound: 7,
      knight: 3.4,
      witch: 3.2,
      brute: 2.4,
      boss: 2,
    }[type];
    const e: Enemy = {
      model,
      type,
      hp,
      maxHp: hp,
      speed,
      radius: type === "boss" ? 2 : type === "brute" ? 1 : 0.6,
      cooldown: 1 + random(),
      frozen: 0,
      age: 0,
      phase: 0,
      attackWindup: 0,
      knockback: new T.Vector3(),
      stagger: 0,
      animationTime: 0,
      stuck: 0,
      walled: 0,
      anchor: p.clone(),
    };
    this.enemies.push(e);
    this.burst(p.clone().add(new T.Vector3(0, 1, 0)), 0xb8d98a, 5, 3);
    this.enemyCue(type === "boss" ? "roar" : "spawn", p);
    return e;
  }
  beginWave() {
    this.save.resume = this.snapshot();
    this.persist();
    this.wave++;
    if (this.wave === 1) this.hint("arsenal");
    if (
      this.wave === 1 &&
      !this.cardUsed &&
      this.save.cards.includes(this.save.selectedCard)
    )
      this.hint("tarot");
    if (
      LEVELS[this.level].boss &&
      this.room === LEVELS[this.level].rooms - 1 &&
      this.wave === 3
    ) {
      this.bossSpawned = true;
      this.spawnEnemy("boss", new T.Vector3(0, 0, -20));
      this.remaining = (waveCount(this.level, this.room, 0) / 2) | 0;
      this.notify(LEVELS[this.level].boss!.toUpperCase(), 5);
    } else {
      this.remaining = waveCount(this.level, this.room, this.wave - 1);
      this.notify("WAVE " + this.wave + "  /  THE GATES ARE SEALED", 2);
    }
    this.spawnTimer = 0;
  }
  hurt(damage: number, from?: T.Vector3, cause = "unknown", source?: string) {
    if (
      this.invulnerable > 0 ||
      this.demon > 0 ||
      (this.cardTime > 0 && this.save.selectedCard === 2) ||
      this.mode !== "playing"
    )
      return;
    const dealt =
      damage * (this.difficulty === 0 ? 0.6 : this.difficulty === 2 ? 1.4 : 1);
    const key = damageKey(cause, source);
    // Log what the hit actually took, not the overkill of a killing blow.
    this.damageLog[key] =
      (this.damageLog[key] || 0) +
      Math.min(dealt, Math.max(0, this.health) + this.armor);
    const result = damageAfterArmor(dealt, this.armor);
    this.armor = result.armor;
    this.health -= result.health;
    this.damageFlash = 0.5;
    this.invulnerable = 0.3;
    if (cause === "shockwave") this.controls.rumble("shockwave");
    else this.controls.rumble("hurt", dealt / 40);
    if (from) {
      this.damageMarks.push({ x: from.x, z: from.z, life: 1 });
      if (this.damageMarks.length > 4) this.damageMarks.shift();
    }
    this.sound.tone(65, 0.2, "sawtooth", 0.17, 25);
    if (this.health <= 0) {
      this.health = 0;
      this.levelDeaths++;
      this.lastDeath = deathRecap(this.damageLog, key, LEVELS[this.level].boss);
      // Death restarts the sector with fresh supplies; record exactly that, so quitting
      // from the death screen and continuing matches Rise again (deaths included).
      this.save.resume = {
        ...this.snapshot(1),
        health: 100,
        armor: 50,
        ammo: WEAPONS.map((w) => (Number.isFinite(w.ammo) ? w.ammo : -1)),
        altAmmo: WEAPONS.map((w) => (Number.isFinite(w.alt) ? w.alt : -1)),
        souls: 0,
        cardUsed: false,
        taken: [],
        kills: this.sectorStart.kills,
        levelSouls: this.sectorStart.souls,
        secrets: this.sectorStart.secrets,
      };
      this.persist();
      this.setMode("dead");
    }
  }
  hitEnemy(
    e: Enemy,
    damage: number,
    kind = "bullet",
    direction = this.direction(),
    point = e.model.root.position.clone().add(new T.Vector3(0, 1, 0)),
  ) {
    if (e.hp <= 0) return;
    const multiplier =
      this.demon > 0
        ? 4
        : this.cardTime > 0 && this.save.selectedCard === 0
          ? 2
          : 1;
    e.hp -= damage * multiplier;
    if (kind === "ice") {
      if (e.type !== "boss") this.hint("freeze");
      e.frozen = e.type === "boss" ? 1 : 4;
      this.burst(
        e.model.root.position.clone().add(new T.Vector3(0, 1, 0)),
        0x8fddff,
        5,
        3,
      );
    } else if (e.frozen > 0 && kind === "shotgun") {
      e.hp -= e.type === "boss" ? 150 : 1000;
      this.enemyCue("shatter", e.model.root.position);
      this.burst(
        e.model.root.position.clone().add(new T.Vector3(0, 1, 0)),
        0x91d8ff,
        12,
        8,
      );
    }
    const strength =
      kind === "stake"
        ? 20
        : kind === "explosion"
          ? 10
          : kind === "shotgun"
            ? 4
            : 1.8;
    e.knockback.addScaledVector(direction, Math.min(5, strength * 0.3));
    e.stagger = Math.max(e.stagger, kind === "explosion" ? 0.35 : 0.12);
    if (e.model.react) e.model.react(direction, point, Math.min(3, strength));
    else e.model.action?.("hit");
    this.hitFlash = 0.12;
    this.sound.hit();
    if (e.hp <= 0) {
      this.kill(
        e,
        kind,
        direction
          .clone()
          .multiplyScalar(strength)
          .add(
            new T.Vector3(
              0,
              kind === "explosion" ? 4 : kind === "stake" ? 1.5 : 0.5,
              0,
            ),
          ),
        point,
      );
    }
  }
  kill(
    e: Enemy,
    kind: string,
    impulse = this.direction().multiplyScalar(3),
    hit = e.model.root.position.clone().add(new T.Vector3(0, 1, 0)),
  ) {
    const pos = e.model.root.position.clone();
    this.enemies = this.enemies.filter((x) => x !== e);
    this.enemyCue("death", pos);
    this.sound.cue("kill");
    this.kills++;
    this.levelKills++;
    this.save.kills++;
    this.addPickup("soul", pos.clone().add(new T.Vector3(0, 0.8, 0)));
    if (random() < 0.26)
      this.addPickup("ammo", pos.clone().add(new T.Vector3(0.5, 0.6, 0)));
    if (random() < 0.14)
      this.addPickup("health", pos.clone().add(new T.Vector3(-0.5, 0.6, 0)));
    this.burst(
      pos.clone().add(new T.Vector3(0, 1, 0)),
      kind === "ice" ? 0x99e9ff : 0x863e2b,
      8,
      5,
    );
    const ragdoll = this.physics.ragdoll(
      e.model,
      impulse,
      hit,
      kind === "stake",
    );
    this.corpses.push({ model: e.model, life: 12, ragdoll });
    if (kind === "stake") {
      const mesh = projectileModel("stake");
      mesh.position.copy(hit);
      mesh.quaternion.setFromUnitVectors(
        new T.Vector3(0, 0, 1),
        impulse.clone().normalize(),
      );
      const bone = ragdoll.bindings.reduce((a, b) =>
        a.object.getWorldPosition(new T.Vector3()).distanceToSquared(hit) <
        b.object.getWorldPosition(new T.Vector3()).distanceToSquared(hit)
          ? a
          : b,
      ).object;
      this.scene.add(mesh);
      bone.attach(mesh);
      this.embeddedStakes.push({ mesh, life: 12 });
    }
    if (this.corpses.length > 8) {
      const c = this.corpses.shift()!;
      this.physics.removeRagdoll(c.ragdoll);
      c.model.dispose();
    }
    if (e.type === "boss") {
      this.remaining = 0;
      this.notify("THE GENERAL HAS FALLEN", 4);
      this.burst(pos.clone().add(new T.Vector3(0, 3, 0)), 0xffcc77, 40, 16);
    }
  }
  direction() {
    return new T.Vector3(0, 0, -1).applyEuler(
      new T.Euler(this.pitch, this.yaw, 0, "YXZ"),
    );
  }
  wallDistance(origin: T.Vector3, dir: T.Vector3, max: number) {
    this.ray.set(origin, dir);
    let distance = max;
    const point = new T.Vector3();
    for (const c of this.arena.colliders) {
      this.box3.min.set(c.x - c.w / 2, 0, c.z - c.d / 2);
      this.box3.max.set(c.x + c.w / 2, c.h, c.z + c.d / 2);
      if (this.ray.intersectBox(this.box3, point))
        distance = Math.min(distance, point.distanceTo(origin));
    }
    if (dir.y < 0) distance = Math.min(distance, -origin.y / dir.y);
    return distance;
  }
  rayTarget(origin: T.Vector3, dir: T.Vector3, range = 100) {
    let target: Enemy | undefined,
      dist = this.wallDistance(origin, dir, range);
    this.ray.set(origin, dir);
    for (const e of this.enemies) {
      const center = e.model.root.position
        .clone()
        .add(
          new T.Vector3(
            0,
            e.type === "boss" ? 3.3 : e.type === "hound" ? 0.6 : 1.1,
            0,
          ),
        );
      const point = this.ray.intersectSphere(
        new T.Sphere(
          center,
          e.type === "boss" ? 2.6 : e.type === "brute" ? 1.1 : 0.75,
        ),
        new T.Vector3(),
      );
      if (point) {
        const d = point.distanceTo(origin);
        if (d < dist) {
          target = e;
          dist = d;
        }
      }
    }
    return {
      target,
      point: origin.clone().addScaledVector(dir, dist),
      distance: dist,
    };
  }
  trace(a: T.Vector3, b: T.Vector3, color = 0xffce8b, width = 0.018) {
    const delta = b.clone().sub(a);
    const geo = new T.CylinderGeometry(width, width, delta.length(), 5);
    const m = new T.Mesh(geo, this.mat(color));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
    this.scene.add(m);
    this.particles.push({
      mesh: m,
      velocity: new T.Vector3(),
      life: 0.07,
      max: 0.07,
    });
  }
  lightning(a: T.Vector3, b: T.Vector3) {
    let previous = a.clone();
    for (let i = 1; i <= 6; i++) {
      const point = a.clone().lerp(b, i / 6);
      if (i < 6)
        point.add(
          new T.Vector3(
            (random() - 0.5) * 0.3,
            (random() - 0.5) * 0.3,
            (random() - 0.5) * 0.3,
          ),
        );
      this.trace(previous, point, 0x87dfff, 0.022);
      previous = point;
    }
  }
  impactMark(point: T.Vector3, direction: T.Vector3) {
    const normal = new T.Vector3(0, 1, 0);
    if (point.y > 0.05) {
      let found = false;
      for (const c of this.arena.colliders) {
        if (
          Math.abs(point.x - c.x) > c.w / 2 + 0.04 ||
          Math.abs(point.z - c.z) > c.d / 2 + 0.04
        )
          continue;
        const dx = Math.abs(Math.abs(point.x - c.x) - c.w / 2),
          dz = Math.abs(Math.abs(point.z - c.z) - c.d / 2);
        if (Math.min(dx, dz) < 0.04) {
          normal.set(
            dx < dz ? Math.sign(point.x - c.x) : 0,
            0,
            dz <= dx ? Math.sign(point.z - c.z) : 0,
          );
          found = true;
          break;
        }
      }
      if (!found) normal.copy(direction).negate();
    }
    this.effects.impact(point, normal);
  }
  shoot(alt = false) {
    if (this.cooldown > 0 || this.mode !== "playing") return;
    const id = this.weapon,
      ammo = alt ? this.altAmmo : this.ammo;
    if (ammo[id] <= 0) {
      this.cooldown = 0.2;
      this.sound.dry();
      const label = alt ? AMMUNITION[id].secondary : AMMUNITION[id].primary;
      if (this.autoSwitch) {
        // Keep the fight going with the best weapon that can fire from this button.
        this.equip(fallbackWeapon(id, this.ammo, this.altAmmo, alt));
        this.cooldown = 0.25;
        this.notify(`OUT OF ${label}`, 1);
      } else this.notify(`OUT OF ${label}  /  SWITCH WEAPON`, 1);
      return;
    }
    const storm = id === 4 && alt && this.firing(false);
    if (storm && (this.ammo[4] < 1 || this.altAmmo[4] < 16)) {
      this.cooldown = 0.2;
      this.notify("STORM REQUIRES 1 SHURIKEN + 16 CHARGE", 1);
      return;
    }
    if (id !== 0) ammo[id] = Math.max(0, Math.floor(ammo[id]) - 1);
    const origin = this.position.clone(),
      dir = this.direction();
    const haste = this.cardTime > 0 && this.save.selectedCard === 1 ? 0.65 : 1;
    this.cooldown =
      [
        alt ? 0.65 : 0.14,
        alt ? 0.65 : 0.7,
        alt ? 0.75 : 0.85,
        alt ? 0.075 : 0.72,
        alt ? 0.12 : 0.16,
      ][id] * haste;
    this.recoil = alt && id === 3 ? 0.035 : 0.13;
    this.weaponMotion.fire(alt);
    this.actionSoundTime = !alt && [1, 2, 3].includes(id) ? 0.24 : 0;
    this.actionSoundWeapon = id;
    const visualMuzzle = origin
      .clone()
      .add(
        new T.Vector3(0.21, -0.21, -1.15).applyEuler(
          new T.Euler(this.pitch, this.yaw, 0, "YXZ"),
        ),
      );
    if ((id === 1 && !alt) || id === 2 || id === 3)
      this.effects.muzzle(visualMuzzle, dir, id === 1 || (id === 3 && !alt));
    if ((id === 1 && !alt) || (id === 3 && alt))
      this.effects.eject(
        this.position
          .clone()
          .add(
            new T.Vector3(0.28, -0.24, -0.6).applyEuler(
              new T.Euler(this.pitch, this.yaw, 0, "YXZ"),
            ),
          ),
        new T.Quaternion().setFromEuler(
          new T.Euler(this.pitch, this.yaw, 0, "YXZ"),
        ),
        id === 1,
      );
    this.sound.shot(id, alt);
    if (id === 0) {
      if (alt) this.projectile("blade", origin, dir, 27, 85, 2.1);
      else {
        const result = this.rayTarget(origin, dir, 3.5);
        if (result.target) this.hitEnemy(result.target, 38, "blade");
        this.burst(origin.clone().addScaledVector(dir, 1.8), 0xbcd3bf, 3, 2);
      }
    }
    if (id === 1) {
      if (alt) this.projectile("ice", origin, dir, 34, 14, 2.5);
      else
        for (let i = 0; i < 10; i++) {
          const d = dir
            .clone()
            .add(
              new T.Vector3(
                (random() - 0.5) * 0.13,
                (random() - 0.5) * 0.13,
                (random() - 0.5) * 0.13,
              ),
            )
            .normalize();
          const hit = this.rayTarget(origin, d, 65);
          if (hit.target)
            this.hitEnemy(
              hit.target,
              17 * Math.max(0.2, 1 - hit.distance / 75),
              "shotgun",
              d,
              hit.point,
            );
          else if (hit.distance < 64) this.impactMark(hit.point, d);
          if (i < 3) this.trace(visualMuzzle, hit.point, 0xffdca0);
        }
    }
    if (id === 2 && alt) this.hint("grenade");
    if (id === 2)
      this.projectile(
        alt ? "grenade" : "stake",
        origin,
        dir,
        alt ? 19 : 48,
        alt ? 150 : 135,
        alt ? 2.2 : 3,
      );
    if (id === 3) {
      if (!alt) this.projectile("rocket", origin, dir, 32, 180, 3);
      else {
        const d = dir
          .clone()
          .add(
            new T.Vector3(
              (random() - 0.5) * 0.027,
              (random() - 0.5) * 0.027,
              0,
            ),
          )
          .normalize();
        const hit = this.rayTarget(origin, d);
        if (hit.target) this.hitEnemy(hit.target, 22, "bullet", d, hit.point);
        else if (hit.distance < 99) this.impactMark(hit.point, d);
        this.trace(visualMuzzle, hit.point);
      }
    }
    if (id === 4) {
      if (storm) {
        this.ammo[4]--;
        this.altAmmo[4] -= 15;
        this.projectile("storm", origin, dir, 16, 140, 3);
        this.cooldown = 0.8;
      } else if (!alt) this.projectile("star", origin, dir, 46, 45, 2.5);
      else {
        const hit = this.rayTarget(origin, dir, 24);
        this.lightning(visualMuzzle, hit.point);
        if (hit.target) {
          this.hitEnemy(hit.target, 28, "electric");
          const near = this.enemies
            .filter(
              (e) =>
                e !== hit.target &&
                e.model.root.position.distanceTo(
                  hit.target!.model.root.position,
                ) < 7,
            )
            .slice(0, 3);
          near.forEach((e) => {
            const a = hit
                .target!.model.root.position.clone()
                .add(new T.Vector3(0, 1, 0)),
              b = e.model.root.position.clone().add(new T.Vector3(0, 1, 0));
            const delta = b.clone().sub(a);
            if (
              this.wallDistance(a, delta.clone().normalize(), delta.length()) >=
              delta.length() - 0.1
            ) {
              this.lightning(a, b);
              this.hitEnemy(e, 16, "electric");
            }
          });
        }
      }
    }
  }
  projectile(
    kind: string,
    origin: T.Vector3,
    dir: T.Vector3,
    speed: number,
    damage: number,
    life: number,
    hostile = false,
    source?: string,
  ) {
    const m = projectileModel(hostile ? "hellfire" : kind);
    const muzzleOffset = Math.min(
      0.65,
      Math.max(0, this.wallDistance(origin, dir, 0.8) - 0.16),
    );
    m.position.copy(origin).addScaledVector(dir, muzzleOffset);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), dir);
    this.scene.add(m);
    this.projectiles.push({
      mesh: m,
      velocity: dir
        .clone()
        .multiplyScalar(speed)
        .add(new T.Vector3(0, kind === "grenade" ? 5 : 0, 0)),
      kind,
      damage,
      life,
      age: 0,
      hostile,
      source,
      radius: kind === "storm" ? 0.7 : 0.2,
      hits: new Set(),
      distance: 0,
      body:
        kind === "grenade"
          ? this.physics.grenade(
              m.position,
              dir
                .clone()
                .multiplyScalar(speed)
                .add(new T.Vector3(0, 5, 0)),
            )
          : undefined,
    });
  }
  explode(pos: T.Vector3, damage: number, radius = 6, hostile = false) {
    this.effects.explosion(pos, radius);
    this.burst(pos, 0xffa453, 6, 12);
    this.physics.impulse(pos, radius, 10);
    this.sound.noise(0.4, 0.35);
    if (!hostile)
      for (const e of [...this.enemies]) {
        const center = e.model.root.position
          .clone()
          .add(new T.Vector3(0, 1, 0));
        const distance = center.distanceTo(pos);
        const delta = center.clone().sub(pos);
        if (
          distance < radius &&
          this.wallDistance(pos, delta.normalize(), distance) >= distance - 0.2
        )
          this.hitEnemy(
            e,
            damage * (1 - (distance / radius) * 0.7),
            "explosion",
            delta,
            center,
          );
      }
    const distance = this.position.distanceTo(pos);
    if (distance < radius * 2)
      this.controls.rumble("explosion", 1 - distance / (radius * 2));
    if (distance < radius)
      this.hurt(
        damage * (hostile ? 0.25 : 0.35) * (1 - distance / radius),
        pos,
        "explosion",
      );
    this.recoil = 0.18;
  }
  update(dt: number) {
    this.tick++;
    this.elapsed += dt;
    this.totalTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.actionSoundTime > 0) {
      this.actionSoundTime -= dt;
      if (this.actionSoundTime <= 0)
        this.sound.mechanism(this.actionSoundWeapon);
    }
    this.invulnerable -= dt;
    this.demon = Math.max(0, this.demon - dt);
    this.cardTime = Math.max(0, this.cardTime - dt);
    this.toastTimer -= dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    const haste = this.cardTime > 0 && this.save.selectedCard === 1;
    const speed =
      (this.held("sprint") || this.controls.sprint ? 13 : 10) *
      (haste ? 1.4 : 1);
    let x =
        Number(this.held("right")) -
        Number(this.held("left")) +
        this.controls.moveX,
      z =
        Number(this.held("back")) -
        Number(this.held("forward")) +
        this.controls.moveY;
    const len = Math.max(1, Math.hypot(x, z));
    x /= len;
    z /= len;
    const desiredX = (x * Math.cos(this.yaw) + z * Math.sin(this.yaw)) * speed,
      desiredZ = (-x * Math.sin(this.yaw) + z * Math.cos(this.yaw)) * speed;
    const smoothing = 1 - Math.exp(-dt * (this.grounded ? 16 : 5));
    this.velocity.x = T.MathUtils.lerp(this.velocity.x, desiredX, smoothing);
    this.velocity.z = T.MathUtils.lerp(this.velocity.z, desiredZ, smoothing);
    if (this.held("lookLeft")) this.yaw += dt * 1.8;
    if (this.held("lookRight")) this.yaw -= dt * 1.8;
    if (this.held("lookUp")) this.pitch = clamp(this.pitch + dt, -1.45, 1.45);
    if (this.held("lookDown")) this.pitch = clamp(this.pitch - dt, -1.45, 1.45);
    if ((this.held("jump") || this.controls.jump) && this.grounded) {
      this.velocity.y = 8;
      this.grounded = false;
    }
    this.velocity.y -= dt * 22;
    const previousFeet = this.position.y - 1.75;
    this.position.y += this.velocity.y * dt;
    const move = slide(
      this.position.x,
      this.position.z,
      this.velocity.x * dt,
      this.velocity.z * dt,
      0.38,
      this.arena.colliders,
      Math.max(0, this.position.y - 1.75),
    );
    const footstepTravel = Math.hypot(
      clamp(move.x, -26, 26) - this.position.x,
      clamp(move.z, -30.8, 30.8) - this.position.z,
    );
    this.position.x = clamp(move.x, -26, 26);
    this.position.z = clamp(move.z, -30.8, 30.8);
    let floor = 0;
    for (const c of this.arena.colliders)
      if (
        c.h <= 3 &&
        previousFeet >= c.h - 0.02 &&
        this.position.y - 1.75 < c.h &&
        Math.abs(this.position.x - c.x) < c.w / 2 + 0.3 &&
        Math.abs(this.position.z - c.z) < c.d / 2 + 0.3
      )
        floor = Math.max(floor, c.h);
    if (this.position.y <= 1.75 + floor) {
      this.position.y = 1.75 + floor;
      if (!this.grounded) this.weaponMotion.land(this.velocity.y);
      this.velocity.y = 0;
      this.grounded = true;
    }
    if (this.firing(true)) this.shoot(true);
    else if (this.firing(false)) this.shoot(false);
    if (!this.arenaCleared) {
      if (this.remaining > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.enemies.length < 32) {
          const poolSize = Math.min(
            7,
            2 + Math.floor(this.level / 2) + Math.floor(this.room / 2),
          );
          let type = ENEMY_TYPES[Math.floor(random() * poolSize)];
          if (this.level === 0 && this.wave === 1 && this.room === 0)
            type = "shambler";
          this.spawnEnemy(type);
          this.remaining--;
          this.spawnTimer = 0.6;
        }
      } else if (this.enemies.length === 0) {
        this.waveDelay -= dt;
        if (this.waveDelay <= 0) {
          if (this.wave >= 3) {
            this.arenaCleared = true;
            this.arena.portal.visible = true;
            this.notify("SECTOR CLEANSED  /  ENTER THE GREEN GATE", 5);
            this.sound.pickup();
          } else {
            this.beginWave();
            this.waveDelay = 2;
          }
        }
      }
    }
    this.updateEnemies(dt);
    if (this.mode !== "playing") return;
    // Hints wait while a general is being introduced.
    const boss = LEVELS[this.level].boss;
    const shown = this.hints.update(
      dt,
      !!boss && this.toastTimer > 0 && this.toast === boss.toUpperCase(),
    );
    if (shown) writeSeenHints(this.hints.seen);
    for (const m of this.damageMarks) m.life -= dt;
    this.damageMarks = this.damageMarks.filter((m) => m.life > 0);
    // Line-of-sight tests only matter once the locator could appear.
    if (
      this.remaining === 0 &&
      this.enemies.length > 0 &&
      this.enemies.length <= 3
    )
      this.unseenTime = this.enemies.some((e) =>
        this.inView(e.model.root.position.clone().setY(1.2)),
      )
        ? 0
        : this.unseenTime + dt;
    else this.unseenTime = 0;
    this.physics.step(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    for (const ring of [...this.rings]) {
      ring.radius += dt * 11;
      ring.mesh.scale.setScalar(ring.radius);
      const d = Math.hypot(
        this.position.x - ring.mesh.position.x,
        this.position.z - ring.mesh.position.z,
      );
      if (
        !ring.hit &&
        Math.abs(d - ring.radius) < 1.2 &&
        this.position.y < 2.4
      ) {
        this.hurt(24, ring.mesh.position, "shockwave");
        ring.hit = true;
      }
      if (ring.radius > 48) {
        ring.mesh.removeFromParent();
        ring.mesh.geometry.dispose();
        this.rings.splice(this.rings.indexOf(ring), 1);
      }
    }
    this.updateEffects(dt);
    this.effects.update(dt);
    this.atmosphere.update(dt, this.position);
    if (this.grounded) {
      this.stepDistance += footstepTravel;
      if (this.stepDistance > 2.2) {
        this.stepDistance = 0;
        this.sound.footstep(
          ["cemetery", "swamp", "forest", "snow"].includes(
            LEVELS[this.level].theme,
          ),
        );
      }
    }
    this.arena.portal.rotation.z += dt * 0.17;
    this.sound.update(
      layerFor({
        cleared: this.arenaCleared,
        general: this.enemies.some((e) => e.type === "boss"),
        enemies: this.enemies.length,
        remaining: this.remaining,
      }),
      LEVELS[this.level].chapter,
    );
    if (this.demon > 0 && this.tick % 12 === 0)
      this.burst(
        this.position.clone().add(new T.Vector3(0, -1.65, 0)),
        0x9ae9cc,
        1,
        2,
      );
  }
  /** Move a stuck enemy to open ground 12–25 m away, in view when possible. */
  relocate(e: Enemy) {
    const pos = e.model.root.position;
    let fallback: T.Vector3 | null = null;
    for (let i = 0; i < 300; i++) {
      const q = new T.Vector3((random() - 0.5) * 46, 0, (random() - 0.5) * 54);
      const d = Math.hypot(q.x - this.position.x, q.z - this.position.z);
      if (d < 12 || d > 25 || blocked(q.x, q.z, e.radius, this.arena.colliders))
        continue;
      fallback ??= q;
      if (this.inView(q.clone().setY(1))) {
        fallback = q;
        break;
      }
    }
    pos.copy(fallback ?? new T.Vector3(0, 0, -20));
    e.anchor.copy(pos);
    e.stuck = e.walled = 0;
    e.knockback.set(0, 0, 0);
    this.burst(pos.clone().add(new T.Vector3(0, 1, 0)), 0xb8d98a, 5, 3);
  }
  /** Horizontal half field of view, radians. */
  halfFov() {
    return Math.atan(
      Math.tan(T.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect,
    );
  }
  /** Whether a point is inside the view cone with a clear line of sight. */
  inView(point: T.Vector3) {
    const angle = bearing(
      this.position.x,
      this.position.z,
      this.yaw,
      point.x,
      point.z,
    );
    if (Math.abs(angle) > this.halfFov()) return false;
    const delta = point.clone().sub(this.position),
      distance = delta.length();
    return (
      this.wallDistance(this.position, delta.normalize(), distance) >=
      distance - 0.3
    );
  }
  /** Hit-direction arcs, off-screen incoming fire and the last-enemies locator. */
  threatIndicators(): ThreatIndicator[] {
    const out: ThreatIndicator[] = [];
    const at = (x: number, z: number) =>
      bearing(this.position.x, this.position.z, this.yaw, x, z);
    const gate = this.gateGuide();
    if (gate) out.push({ kind: "gate", strength: 1, ...gate });
    for (const m of this.damageMarks)
      out.push({ kind: "damage", angle: at(m.x, m.z), strength: m.life });
    const edge = this.halfFov() * 0.8;
    for (const p of this.projectiles) {
      if (!p.hostile) continue;
      const rel = p.mesh.position.clone().sub(this.position),
        speed2 = p.velocity.lengthSq();
      const t = speed2 > 0 ? -rel.dot(p.velocity) / speed2 : -1;
      if (t <= 0 || t > 0.9) continue;
      const miss = rel.addScaledVector(p.velocity, t).length();
      const angle = at(p.mesh.position.x, p.mesh.position.z);
      if (miss < 1.6 && Math.abs(angle) > edge)
        out.push({ kind: "incoming", angle, strength: 1 - t / 0.9 });
    }
    if (this.locatorActive())
      for (const e of this.enemies)
        out.push({
          kind: "locator",
          angle: at(e.model.root.position.x, e.model.root.position.z),
          strength: 1,
        });
    return out;
  }
  /**
   * Once the sector is cleared, where the open gate is while it is off-screen: its
   * bearing and distance. Null when the gate is shut, in view, or you stand in it.
   */
  gateGuide() {
    if (!this.arenaCleared || !this.arena?.portal.visible) return null;
    const gate = this.arena.portal.getWorldPosition(new T.Vector3());
    const distance = Math.hypot(
      gate.x - this.position.x,
      gate.z - this.position.z,
    );
    const angle = bearing(
      this.position.x,
      this.position.z,
      this.yaw,
      gate.x,
      gate.z,
    );
    if (distance < 5 || Math.abs(angle) < this.halfFov() * 0.85) return null;
    return { angle, label: `GATE ${Math.round(distance)} M` };
  }
  /** The final few enemies of a wave have stayed out of sight for 4 s. */
  locatorActive() {
    return (
      !this.arenaCleared &&
      this.remaining === 0 &&
      this.enemies.length > 0 &&
      this.enemies.length <= 3 &&
      this.unseenTime > 4
    );
  }
  updateEnemies(dt: number) {
    for (const e of [...this.enemies]) {
      e.age += dt;
      e.cooldown -= dt;
      e.frozen = Math.max(0, e.frozen - dt);
      e.model.ice.visible = e.frozen > 0;
      const root = e.model.root;
      const pos = root.position;
      const offset = this.position.clone().sub(pos);
      offset.y = 0;
      const distance = offset.length();
      const direction = offset.normalize();
      const desiredYaw = Math.atan2(direction.x, direction.z);
      const turn = Math.atan2(
        Math.sin(desiredYaw - root.rotation.y),
        Math.cos(desiredYaw - root.rotation.y),
      );
      root.rotation.y += turn * (1 - Math.exp(-dt * 7));
      e.model.steer?.(turn);
      e.stagger = Math.max(0, e.stagger - dt);
      e.knockback.multiplyScalar(Math.exp(-dt * 7));
      const slow = e.frozen > 0 ? 0.03 : 1;
      const ranged = e.type === "monk" || e.type === "witch";
      let moveSpeed =
        e.speed * (distance < 1.5 ? 0 : 1) * slow * (e.stagger > 0 ? 0.2 : 1);
      if (e.attackWindup > 0) {
        if (e.frozen <= 0) {
          e.attackWindup -= dt;
          if (
            e.attackWindup <= 0 &&
            distance < (e.type === "brute" ? 2.8 : 2.05) &&
            Math.abs(this.position.y - 1.75 - pos.y) < 1.5 &&
            this.wallDistance(
              pos.clone().add(new T.Vector3(0, 1, 0)),
              direction,
              distance,
            ) >=
              distance - 0.15
          )
            this.hurt(
              e.type === "brute" ? 25 : e.type === "hound" ? 9 : 13,
              pos,
              e.type,
            );
        }
        moveSpeed = 0;
      }
      if (ranged && distance < 13) moveSpeed *= distance < 8 ? -0.6 : 0.05;
      if (e.type === "boss") {
        const phase = e.hp / e.maxHp < 0.35 ? 2 : e.hp / e.maxHp < 0.7 ? 1 : 0;
        if (phase > e.phase) {
          e.phase = phase;
          this.notify("THE GENERAL ENRAGES", 2);
          this.enemyCue("roar", pos);
          for (let i = 0; i < 3; i++) this.spawnEnemy("skeleton");
        }
        moveSpeed *= 1 + e.phase * 0.35;
        if (e.cooldown <= 0) {
          e.cooldown = 3.5 - e.phase * 0.6;
          e.model.action?.("cast");
          this.enemyCue("cast", pos);
          const chapter = LEVELS[this.level].chapter;
          if (chapter === 1 || chapter === 3 || chapter === 5) {
            const m = new T.Mesh(
              new T.TorusGeometry(1, 0.06, 6, 64),
              this.mat(0xff703f),
            );
            m.rotation.x = Math.PI / 2;
            m.position.set(pos.x, 0.12, pos.z);
            this.scene.add(m);
            this.rings.push({ mesh: m, radius: 0.5, hit: false });
            this.enemyCue("shockwave", pos);
            this.notify("SHOCKWAVE  /  JUMP", 1.2);
          }
          const count = chapter === 2 ? 5 : chapter === 4 ? 9 : 3;
          const origin = pos.clone().add(new T.Vector3(0, 3, 0));
          const target = this.position.clone().sub(origin).normalize();
          for (let i = 0; i < count; i++) {
            const d = target
              .clone()
              .applyAxisAngle(
                new T.Vector3(0, 1, 0),
                (i - (count - 1) / 2) * 0.14,
              );
            this.projectile(
              "hellfire",
              origin,
              d,
              chapter === 4 ? 16 : 11,
              22,
              6,
              true,
              "boss",
            );
          }
        }
      }
      if (
        e.frozen <= 0 &&
        e.type !== "boss" &&
        e.cooldown <= 0 &&
        e.attackWindup <= 0
      ) {
        if (ranged && distance < 28) {
          const origin = pos.clone().add(new T.Vector3(0, 1.7, 0));
          const dir = this.position.clone().sub(origin).normalize();
          if (this.wallDistance(origin, dir, distance) >= distance - 0.5) {
            e.model.action?.("cast");
            this.enemyCue("cast", pos);
            this.projectile(
              "hellfire",
              origin,
              dir,
              e.type === "witch" ? 14 : 11,
              15,
              5,
              true,
              e.type,
            );
            e.cooldown = 1.8 + random();
          }
        } else if (distance < (e.type === "brute" ? 2.6 : 1.8)) {
          e.attackWindup = e.type === "hound" ? 0.2 : 0.36;
          this.enemyCue(
            e.type === "hound"
              ? "windup-hound"
              : e.type === "brute" || e.type === "knight"
                ? "windup-heavy"
                : "windup",
            pos,
          );
          moveSpeed = 0;
          e.cooldown = 1.15;
          e.model.action?.("attack");
        }
      }
      if (e.type === "boss" && distance < 3.6 && e.frozen <= 0)
        this.hurt(22, pos, "general contact");
      const separation = new T.Vector3();
      for (const other of this.enemies) {
        if (other === e) continue;
        const dx = pos.x - other.model.root.position.x,
          dz = pos.z - other.model.root.position.z;
        const n = Math.hypot(dx, dz);
        if (n > 0 && n < e.radius + other.radius + 0.2) {
          separation.x += (dx / n) * 0.75;
          separation.z += (dz / n) * 0.75;
        }
      }
      const dx = (direction.x * moveSpeed + separation.x + e.knockback.x) * dt,
        dz = (direction.z * moveSpeed + separation.z + e.knockback.z) * dt;
      let move = slide(
        pos.x,
        pos.z,
        dx,
        dz,
        e.radius * 0.65,
        this.arena.colliders,
      );
      const blocked =
        Math.hypot(move.x - pos.x, move.z - pos.z) < Math.hypot(dx, dz) * 0.3 &&
        Math.abs(moveSpeed) > 0.1;
      if (blocked) {
        const sign = Math.sin(e.age * 0.2 + pos.z) > 0.0 ? 1 : -1;
        move = slide(
          pos.x,
          pos.z,
          -direction.z * moveSpeed * dt * sign,
          direction.x * moveSpeed * dt * sign,
          e.radius * 0.65,
          this.arena.colliders,
        );
      }
      const nextX = clamp(move.x, -25.8, 25.8),
        nextZ = clamp(move.z, -30.5, 30.5),
        actualSpeed =
          Math.hypot(nextX - pos.x, nextZ - pos.z) / Math.max(dt, 0.001);
      pos.x = nextX;
      pos.z = nextZ;
      pos.y = e.type === "witch" ? 0.45 + Math.sin(e.age * 2) * 0.2 : 0;
      // An enemy that makes no headway for 20 s (walled in or wedged in scenery)
      // is moved to open ground so the gate can still open. Net displacement is
      // used because wall sliding jitters in place.
      if (pos.distanceTo(e.anchor) > 1.5) {
        e.anchor.copy(pos);
        e.stuck = 0;
      } else if (Math.abs(moveSpeed) > 0.5 && distance > 3) e.stuck += dt;
      // Sliding along a long wall after the player (a train car, say) moves far enough to
      // count as headway, so also time an enemy from when a wall blocks it out of the
      // player's sight until it next sees the player.
      if (blocked || e.walled > 0) {
        const eye = pos.clone().setY(1.2),
          toPlayer = this.position.clone().sub(eye),
          range = toPlayer.length();
        if (this.wallDistance(eye, toPlayer.normalize(), range) < range - 0.5)
          e.walled += dt;
        else e.walled = 0;
      }
      if (e.stuck > 20 || e.walled > 20) this.relocate(e);
      e.animationTime += dt;
      if (distance < 20 || e.animationTime >= 1 / 30) {
        e.model.animate?.(e.animationTime, actualSpeed, e.frozen > 0);
        e.animationTime = 0;
      }

      root.rotation.z =
        e.frozen > 0
          ? 0.025 * Math.sin(e.age * 40)
          : T.MathUtils.clamp(-turn * 0.08, -0.1, 0.1);
      if (!e.model.react)
        root.rotation.x = T.MathUtils.clamp(e.knockback.z * 0.08, -0.2, 0.2);
    }
  }
  updateProjectiles(dt: number) {
    for (const p of [...this.projectiles]) {
      p.life -= dt;
      p.age += dt;
      const before = p.mesh.position.clone();
      if (p.body) {
        const velocity = p.body.linvel();
        p.velocity.set(velocity.x, velocity.y, velocity.z);
      }
      if (p.kind === "stake") p.velocity.y -= dt * 4;
      if (p.kind === "blade" && p.age > 0.65)
        p.velocity.lerp(
          this.position
            .clone()
            .sub(p.mesh.position)
            .normalize()
            .multiplyScalar(36),
          dt * 7,
        );
      const displacement = p.body
          ? new T.Vector3(
              p.body.translation().x,
              p.body.translation().y,
              p.body.translation().z,
            ).sub(before)
          : p.velocity.clone().multiplyScalar(dt),
        length = displacement.length();
      const dir = displacement.clone().normalize();
      const wall = this.wallDistance(before, dir, length);
      p.mesh.position.add(displacement);
      p.distance += length;
      if (p.body) {
        const r = p.body.rotation();
        p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      } else if (p.kind === "stake" || p.kind === "rocket")
        p.mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), dir);
      if (p.kind === "star" || p.kind === "blade") p.mesh.rotation.z += dt * 25;
      let remove = false,
        impact = false;
      if (!p.body && wall < length - 0.001) {
        p.mesh.position
          .copy(before)
          .addScaledVector(dir, Math.max(0, wall - 0.04));
        if (p.kind === "blade") {
          p.age = 0.7;
        } else {
          impact = true;
          remove = true;
        }
      }
      if (p.hostile) {
        if (
          segmentSphere(
            before.x,
            before.y,
            before.z,
            p.mesh.position.x,
            p.mesh.position.y,
            p.mesh.position.z,
            this.position.x,
            this.position.y - 0.4,
            this.position.z,
            0.65,
          )
        ) {
          this.hurt(
            p.damage,
            this.position
              .clone()
              .addScaledVector(p.velocity.clone().normalize(), -10),
            "hellfire",
            p.source,
          );
          remove = true;
          this.burst(p.mesh.position, 0xffa365, 4, 3);
        }
      } else {
        if (p.kind === "stake") {
          const grenade = this.projectiles.find(
            (g) =>
              g !== p &&
              g.kind === "grenade" &&
              g.mesh.position.distanceTo(p.mesh.position) < 0.9,
          );
          if (grenade) {
            grenade.velocity.copy(p.velocity).multiplyScalar(1.3);
            grenade.body?.setLinvel(grenade.velocity, true);
            grenade.damage = 300;
            grenade.life = 2.5;
            remove = true;
            this.notify("STAKE-PROPELLED GRENADE", 1);
          }
        }
        for (const e of [...this.enemies]) {
          if (p.hits.has(e)) continue;
          const center = e.model.root.position
            .clone()
            .add(
              new T.Vector3(
                0,
                e.type === "boss" ? 3.3 : e.type === "hound" ? 0.6 : 1.1,
                0,
              ),
            );
          if (
            segmentSphere(
              before.x,
              before.y,
              before.z,
              p.mesh.position.x,
              p.mesh.position.y,
              p.mesh.position.z,
              center.x,
              center.y,
              center.z,
              (e.type === "boss" ? 2.6 : e.type === "brute" ? 1.1 : 0.7) +
                p.radius,
            )
          ) {
            p.hits.add(e);
            if (["rocket", "grenade", "storm"].includes(p.kind)) {
              impact = true;
              remove = true;
            } else {
              this.hitEnemy(
                e,
                p.damage * (p.kind === "stake" && p.distance > 18 ? 1.25 : 1),
                p.kind,
                dir,
                new T.Ray(before, dir).intersectSphere(
                  new T.Sphere(
                    center,
                    e.type === "boss" ? 2.6 : e.type === "brute" ? 1.1 : 0.7,
                  ),
                  new T.Vector3(),
                ) || center,
              );
              if (p.kind !== "blade" && p.kind !== "stake") remove = true;
            }
            if (p.kind !== "stake" && p.kind !== "blade") break;
          }
        }
        if (p.kind === "storm" && this.tick % 8 === 0) {
          for (const e of [...this.enemies])
            if (e.model.root.position.distanceTo(p.mesh.position) < 7) {
              const target = e.model.root.position
                .clone()
                .add(new T.Vector3(0, 1, 0));
              const d = target.clone().sub(p.mesh.position);
              if (
                this.wallDistance(
                  p.mesh.position,
                  d.clone().normalize(),
                  d.length(),
                ) >=
                d.length() - 0.1
              ) {
                this.trace(p.mesh.position, target, 0x83e9ff, 0.025);
                this.hitEnemy(e, 12, "electric");
              }
            }
        }
        if (
          p.kind === "blade" &&
          p.age > 0.8 &&
          p.mesh.position.distanceTo(this.position) < 1
        )
          remove = true;
      }
      if (p.life <= 0) {
        remove = true;
        impact = true;
      }
      if (remove) {
        if (p.body) this.physics.removeBody(p.body);
        if (impact && p.kind === "stake" && p.life > 0) {
          const embedded = projectileModel("stake");
          embedded.position.copy(p.mesh.position);
          embedded.quaternion.copy(p.mesh.quaternion);
          this.scene.add(embedded);
          this.embeddedStakes.push({ mesh: embedded, life: 12 });
          if (this.embeddedStakes.length > 32)
            this.embeddedStakes.shift()!.mesh.removeFromParent();
        }
        if (impact && ["rocket", "grenade", "storm"].includes(p.kind))
          this.explode(
            p.mesh.position,
            p.damage,
            p.kind === "storm" ? 8 : 6,
            p.hostile,
          );
        else this.burst(p.mesh.position, p.hostile ? 0xff9933 : 0xd4c3a0, 2, 2);
        p.mesh.removeFromParent();
        this.projectiles.splice(this.projectiles.indexOf(p), 1);
      } else if (
        (p.kind === "rocket" || (p.kind === "stake" && p.distance > 18)) &&
        this.tick % 3 === 0
      )
        if (p.kind === "rocket") this.effects.trail(p.mesh.position);
        else this.burst(p.mesh.position, 0xe99440, 1, 1);
    }
  }
  updatePickups(dt: number) {
    for (const p of [...this.pickups]) {
      p.age += dt;
      p.mesh.rotation.y += dt * 1.4;
      p.mesh.position.y = 0.7 + Math.sin(p.age * 3) * 0.12;
      const d = p.mesh.position.distanceTo(this.position);
      if (p.kind === "soul" && d < 6)
        p.mesh.position.lerp(this.position, dt * 6);
      const distance = p.mesh.position.distanceTo(this.position);
      if (distance < 1.5) {
        if (
          (p.kind === "health" && this.health >= 100) ||
          (p.kind === "armor" && this.armor >= 100)
        )
          continue;
        if (p.kind === "soul") {
          this.hint("souls");
          this.souls++;
          this.save.souls++;
          this.levelSouls++;
          this.health = Math.min(100, this.health + 1);
          if (this.souls >= 66) {
            this.souls = 0;
            this.demon = 15;
            this.controls.rumble("wraith");
            this.notify("WRAITH FORM  /  UNCHAINED FOR 15 SECONDS", 4);
            this.sound.tone(55, 1, "sawtooth", 0.25, 330);
          }
        } else if (p.kind === "health")
          this.health = Math.min(100, this.health + 25);
        else if (p.kind === "armor")
          this.armor = Math.min(100, this.armor + 30);
        else if (p.kind === "ammo") {
          this.ammo = this.ammo.map((v, i) => refillAmmo(v, i));
          this.altAmmo = this.altAmmo.map((v, i) => refillAmmo(v, i, true));
          this.notify("AMMUNITION REPLENISHED", 1);
        } else {
          this.secrets++;
          this.armor = Math.min(100, this.armor + 40);
          this.notify("SECRET RELIC FOUND  /  TAROT CONDITION MET", 4);
        }
        this.sound.pickup();
        if (p.slot !== undefined) this.taken.add(p.slot);
        p.mesh.removeFromParent();
        this.pickups.splice(this.pickups.indexOf(p), 1);
      } else if (p.age > 120 && p.kind !== "secret") {
        p.mesh.removeFromParent();
        this.pickups.splice(this.pickups.indexOf(p), 1);
      }
    }
  }
  updateEffects(dt: number) {
    for (const s of this.embeddedStakes) {
      s.life -= dt;
      if (s.life <= 0) s.mesh.removeFromParent();
    }
    this.embeddedStakes = this.embeddedStakes.filter((s) => s.life > 0);
    for (const p of [...this.particles]) {
      p.life -= dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= dt * 8;
      p.mesh.scale.multiplyScalar(Math.exp(-dt * 2));
      p.mesh.visible = p.mesh.position.distanceToSquared(this.position) > 0.64;
      if (p.life <= 0) {
        p.mesh.removeFromParent();
        if (p.mesh.geometry !== this.geometry) p.mesh.geometry.dispose();
        this.particles.splice(this.particles.indexOf(p), 1);
      }
    }
    for (const c of [...this.corpses]) {
      c.life -= dt;

      if (c.life <= 0) {
        this.physics.removeRagdoll(c.ragdoll);
        c.model.dispose();
        this.corpses.splice(this.corpses.indexOf(c), 1);
      }
    }
  }
  loop = (time: number) => {
    requestAnimationFrame(this.loop);
    const delta = Math.min((time - this.lastTime) / 1000 || 0, 0.1);
    this.lastTime = time;
    this.controls.poll(delta);
    this.fps = T.MathUtils.lerp(this.fps, 1 / Math.max(0.001, delta), 0.04);
    this.frame++;
    if (this.mode === "playing") {
      this.accumulator += delta;
      let steps = 0;
      while (
        this.accumulator >= 1 / 60 &&
        steps < 6 &&
        this.mode === "playing"
      ) {
        this.update(1 / 60);
        this.accumulator -= 1 / 60;
        steps++;
      }
      this.camera.position.copy(this.position);
      const motion = Math.hypot(this.velocity.x, this.velocity.z);
      this.camera.position.y +=
        Math.sin(this.elapsed * motion * 1.4) *
        Math.min(0.035, motion * 0.003) *
        (this.grounded && this.headBob ? 1 : 0);
      this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
      this.camera.fov = T.MathUtils.lerp(
        this.camera.fov,
        this.fov + (this.demon > 0 ? 7 : 0),
        0.08,
      );
      this.camera.updateProjectionMatrix();
    } else if (this.mode === "menu") {
      this.totalTime += delta;
      this.camera.position.set(Math.sin(this.totalTime * 0.045) * 3 + 4, 3, 23);
      this.camera.lookAt(-2, 5, -28);
    } else this.accumulator = 0;
    if (
      this.mode === "playing" &&
      !document.hidden &&
      this.adaptiveResolution
    ) {
      this.frameAverage += (delta * 1000 - this.frameAverage) * 0.025;
      this.resolutionTimer += delta;
      if (this.resolutionTimer > 2) {
        this.resolutionTimer = 0;
        const next = T.MathUtils.clamp(
          this.adaptiveScale +
            (this.frameAverage > 23
              ? -0.08
              : this.frameAverage < 17
                ? 0.04
                : 0),
          0.75,
          1,
        );
        if (Math.abs(next - this.adaptiveScale) > 0.01) {
          this.adaptiveScale = next;
          this.renderer.setPixelRatio(
            Math.min(devicePixelRatio, 1.5) * this.renderScale * next,
          );
          this.resize();
        }
      }
    }
    this.recoil = Math.max(0, this.recoil - delta * 0.65);
    const w = this.weaponModels[this.weapon];
    const animDt = this.mode === "playing" ? delta : 0;
    const pose = this.weaponMotion.step(
      animDt,
      Math.hypot(this.velocity.x, this.velocity.z),
      this.velocity.x * Math.cos(this.yaw) -
        this.velocity.z * Math.sin(this.yaw),
      this.grounded,
      this.held("sprint"),
    );
    w.root.position.set(pose.x, pose.y, pose.z);
    w.root.rotation.set(pose.rx, pose.ry, pose.rz);
    w.mechanics?.(
      pose.mechanical,
      this.weaponMotion.alt,
      animDt,
      this.firing(false) || this.firing(true) || this.cooldown > 0,
    );
    w.flash.visible = this.weaponMotion.flash > 0 && this.mode === "playing";
    w.flash.rotation.z = this.elapsed * 37;
    w.root.updateMatrixWorld(true);
    this.weaponFlashLight.position.copy(
      w.flash.getWorldPosition(this.lastLampPosition),
    );
    this.weaponFlashLight.intensity = w.flash.visible
      ? this.weapon === 3
        ? 3
        : 1.6
      : 0;
    this.weaponFlashLight.color.set(
      (this.weapon === 1 && this.weaponMotion.alt) || this.weapon === 4
        ? 0x83bdcd
        : 0xffc178,
    );
    // Carry the nearest world lamp into viewmodel space; keep its falloff stable.
    let nearest: T.PointLight | undefined,
      distance = Infinity;
    for (const lamp of this.arena.lights) {
      const d = lamp.position.distanceToSquared(this.position);
      if (d < distance) {
        distance = d;
        nearest = lamp;
      }
    }
    if (nearest) {
      this.camera.updateMatrixWorld(true);
      this.weaponLamp.position
        .copy(nearest.position)
        .applyMatrix4(this.camera.matrixWorldInverse)
        .normalize()
        .multiplyScalar(2);
      this.weaponLamp.color.copy(nearest.color);
      this.weaponLamp.intensity = 6 / (1 + distance * 0.16);
    }
    this.arena.lights.forEach(
      (l, i) =>
        (l.intensity =
          25 +
          Math.sin(this.elapsed * 8 + i * 2) * 2 +
          Math.sin(this.elapsed * 13 + i) * 0.7),
    );
    this.renderer.info.autoReset = false;
    if (this.warmPending) this.compileWarmUp();
    else if (this.warmReady) this.warmUp();
    this.shadowTimer += animDt;
    if (this.shadowTimer >= 1 / 30) {
      this.shadowTimer = 0;
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.renderer.info.reset();
    this.renderer.autoClear = true;
    this.ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(
      this.camera.projectionMatrix,
    );
    this.ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(
      this.camera.projectionMatrixInverse,
    );
    this.renderWorld(delta);
    if (
      this.quality === 0 &&
      ["playing", "paused", "dead"].includes(this.mode)
    ) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.weaponScene, this.weaponCamera);
    }
    this.hudTimer += delta;
    if (this.hudTimer > 0.07) {
      this.hudTimer = 0;
      this.onHUD();
    }
  };
  /** One of everything a fight can draw: every breed, general, projectile, pickup and effect. */
  private warmUpSet() {
    if (!this.warmSet) {
      // Building models draws random numbers; keep the game's sequence untouched.
      isolated(() => {
        const set = (this.warmSet = new T.Group());
        for (const type of ENEMY_TYPES) set.add(enemyModel(type).root);
        for (let chapter = 1; chapter <= 5; chapter++)
          set.add(enemyModel("boss", chapter).root);
        for (const kind of [
          "stake",
          "grenade",
          "rocket",
          "star",
          "blade",
          "hellfire",
          "ice",
          "storm",
        ])
          set.add(projectileModel(kind).clone());
        for (const kind of ["soul", "health", "armor", "ammo", "secret"])
          set.add(
            (art.ready && authoredPickup(kind)) ||
              new T.Mesh(this.geometry, this.mat(0xffffff)),
          );
        set.add(...this.effects.samples());
        // The shadow pass shares one depth material and picks its shader from the
        // caster's side, texture and skinning in draw order, so compile every variant.
        const pixel = new T.DataTexture(
          new Uint8Array([255, 255, 255, 255]),
          1,
          1,
        );
        pixel.needsUpdate = true;
        let skinned: T.SkinnedMesh | undefined;
        set.traverse((o) => {
          if (!skinned && o instanceof T.SkinnedMesh) skinned = o;
        });
        for (const side of [T.FrontSide, T.BackSide, T.DoubleSide])
          for (const map of [null, pixel]) {
            const depth = new T.MeshDepthMaterial({
              depthPacking: T.RGBADepthPacking,
              side,
              map,
            });
            this.depthSet.add(new T.Mesh(this.geometry, depth));
            if (skinned) {
              const mesh = new T.SkinnedMesh(skinned.geometry, depth);
              mesh.bind(skinned.skeleton, skinned.bindMatrix);
              this.depthSet.add(mesh);
            }
          }
        set.traverse((o) => {
          o.frustumCulled = false;
          if (o instanceof T.Mesh) o.visible = true;
        });
      });
    }
    return this.warmSet!;
  }
  /**
   * Starts compiling the warm-up set's shaders in the background (the driver compiles
   * in parallel where it can), for both lighting setups the campaign uses: authored
   * scenes have six lamps and procedural arenas four. Then {@link warmUp} draws it.
   */
  compileWarmUp() {
    this.warmPending = false;
    const id = this.arenaId,
      set = this.warmUpSet(),
      lamps = this.arena.lights,
      jobs: Promise<unknown>[] = [];
    // Programs differ between the screen and an offscreen target (tone mapping happens
    // in the output pass), so compile for the target the composer draws into.
    const target = this.quality > 0 ? this.composer.readBuffer : null;
    if (!this.warmedLights.size)
      jobs.push(
        this.renderer.compileAsync(this.weaponScene, this.weaponCamera),
      );
    for (const count of [lamps.length, 6, 4]) {
      const key = `${count}:${!!target}`;
      if (this.warmedLights.has(key)) continue;
      this.warmedLights.add(key);
      // Shader variants depend on the number of visible lights, not where they are.
      const extra = Array.from(
        { length: Math.max(0, count - lamps.length) },
        () => new T.PointLight(0, 0),
      );
      if (extra.length) this.scene.add(...extra);
      lamps.forEach((l, i) => (l.visible = i < count));
      this.renderer.setRenderTarget(target);
      jobs.push(this.renderer.compileAsync(set, this.camera, this.scene));
      // The shadow pass draws into its own target, without fog.
      const fog = this.scene.fog;
      this.scene.fog = null;
      this.renderer.setRenderTarget(this.composer.readBuffer);
      jobs.push(
        this.renderer.compileAsync(this.depthSet, this.camera, this.scene),
      );
      this.scene.fog = fog;
      lamps.forEach((l) => (l.visible = true));
      for (const l of extra) l.removeFromParent();
    }
    this.renderer.setRenderTarget(null);
    Promise.all(jobs)
      .catch(() => {})
      .then(() => (this.warmReady = id === this.arenaId));
  }
  /**
   * Draws the warm-up set once, unseen, so the variants compileAsync cannot reach
   * (shadow depth, ambient occlusion normals) compile now instead of mid-fight. The
   * real frame is rendered over it before anything reaches the screen.
   */
  warmUp() {
    this.warmReady = false;
    const set = this.warmUpSet();
    this.camera.updateMatrixWorld(true);
    set.position
      .copy(this.camera.position)
      .addScaledVector(this.camera.getWorldDirection(new T.Vector3()), 4);
    this.scene.add(set);
    const shown = this.weaponModels.map((w) => [
      w.root.visible,
      w.flash.visible,
    ]);
    for (const w of this.weaponModels) w.root.visible = w.flash.visible = true;
    const pass = this.weaponPass.enabled;
    this.weaponPass.enabled = true;
    this.renderer.shadowMap.needsUpdate = true;
    if (this.quality > 0) this.composer.render(1 / 60);
    else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      this.renderer.render(this.weaponScene, this.weaponCamera);
    }
    this.weaponPass.enabled = pass;
    this.weaponModels.forEach((w, i) => {
      w.root.visible = shown[i][0];
      w.flash.visible = shown[i][1];
    });
    set.removeFromParent();
    // The real frame redraws the shadows without the warm-up set in them.
    this.renderer.shadowMap.needsUpdate = true;
  }
  renderWorld(delta = 1 / 60) {
    this.weaponPass.enabled = ["playing", "paused", "dead"].includes(this.mode);
    if (this.quality > 0) this.composer.render(delta);
    else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
  }
  state() {
    return {
      mode: this.mode,
      environmentsPending: DEFERRED_ART.filter((t) => !hasArt(t)),
      level: this.level,
      room: this.room,
      wave: this.wave,
      remaining: this.remaining,
      enemies: this.enemies.map((e) => ({
        type: e.type,
        hp: e.hp,
        position: e.model.root.position.toArray(),
        frozen: e.frozen,
      })),
      health: this.health,
      armor: this.armor,
      weapon: this.weapon,
      ammo: this.ammo.map((n) =>
        Number.isFinite(n) ? Math.floor(n) : "infinite",
      ),
      altAmmo: this.altAmmo.map((n) =>
        Number.isFinite(n) ? Math.floor(n) : "infinite",
      ),
      position: this.position.toArray(),
      kills: this.kills,
      souls: this.souls,
      demon: this.demon,
      arenaCleared: this.arenaCleared,
      projectiles: this.projectiles.length,
      unlocked: this.save.unlocked,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      fps: Math.round(this.fps),
    };
  }
}
