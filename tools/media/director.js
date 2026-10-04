// Page-side shot director for tools/media/capture.cjs. Requires the Vite dev build
// (window.__PURGATORY__.game) and tools/media/preload.cjs (virtual time).
(() => {
  const P = window.__PURGATORY__,
    g = P.game,
    C = window.__capture,
    V3 = g.position.constructor;
  const FPS = 30;

  // --- Audio: record the game's own synthesizer calls against virtual time. ---
  let events = [],
    shotStart = 0;
  const silent = { gain: { value: 0 }, connect() {}, disconnect() {} };
  g.sound.ctx = {
    get currentTime() {
      return C.now / 1000;
    },
    state: "running",
    resume() {},
  };
  g.sound.gain = g.sound.effectsGain = g.sound.musicGain = silent;
  g.sound.tone = (...a) =>
    events.push({ t: (C.now - shotStart) / 1000, m: "tone", a });
  g.sound.noise = (...a) =>
    events.push({ t: (C.now - shotStart) / 1000, m: "noise", a });

  // --- Overlays: captions and title cards in the game's own typefaces. ---
  const style = document.createElement("style");
  style.textContent = `
  #media-layer{position:fixed;inset:0;pointer-events:none;z-index:50;font-family:"Barlow Condensed",sans-serif;color:#ded5be}
  #media-caption{position:absolute;left:104px;top:612px;width:1180px;padding:30px 0 30px 34px;opacity:0}
  #media-caption::before{content:"";position:absolute;inset:-60px -260px -60px -104px;background:radial-gradient(ellipse at 30% 50%,#050505e6 0%,#05050599 42%,transparent 72%);z-index:-1}
  #media-caption .bar{position:absolute;left:0;top:30px;bottom:30px;width:2px;background:linear-gradient(#b33927,#b3392700)}
  #media-caption .kicker{font-size:21px;letter-spacing:.32em;color:#c9533a;font-weight:600;text-transform:uppercase;margin:0 0 10px}
  #media-caption h2{font-family:"Cinzel",serif;font-weight:700;font-size:58px;white-space:nowrap;line-height:1.02;margin:0;color:#efe4c9;letter-spacing:-.01em;text-shadow:0 3px 0 #150b07,0 8px 26px #000}
  #media-caption p{font-size:29px;line-height:1.28;margin:16px 0 0;max-width:860px;color:#d6ccb4;letter-spacing:.02em;text-shadow:0 2px 10px #000}
  #media-caption p b{color:#e7b575;font-weight:600}
  #media-card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0}
  #media-card .shade{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 46%,#0b0b0bb8 0%,#060606ee 70%,#030303 100%)}
  #media-card .crest{position:absolute;width:420px;height:420px;color:#d4ae77;opacity:.13;top:calc(50% - 300px)}
  #media-card .crest svg{width:100%;height:100%}
  #media-card .logo{position:relative;margin:0}
  #media-card .logo h1{font-size:150px}
  #media-card .logo-rule{font-size:25px;margin-top:30px}
  #media-card .tagline{position:relative;margin-top:44px;font-size:30px;letter-spacing:.34em;color:#c6bca5;text-transform:uppercase}
  #media-card .url{position:relative;margin-top:58px;font-size:34px;letter-spacing:.12em;color:#e7b575;font-weight:600}
  #media-card .meta{position:relative;margin-top:16px;font-size:22px;letter-spacing:.3em;color:#8f8878;text-transform:uppercase}
  #media-fade{position:absolute;inset:0;background:#000;opacity:0}
  #media-labels .tag{position:absolute;transform:translate(-50%,-100%);text-align:center;white-space:nowrap;font-size:24px;letter-spacing:.26em;font-weight:600;color:#efe4c9;text-transform:uppercase;text-shadow:0 2px 8px #000,0 0 22px #000}
  #media-labels .tag::after{content:"";display:block;margin:8px auto 0;width:1px;height:26px;background:linear-gradient(#e7b575,#e7b57500)}
  #media-center{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;opacity:0}
  #media-center::before{content:"";position:absolute;left:0;right:0;top:-120px;bottom:-120px;background:radial-gradient(ellipse at 50% 50%,#050505d0 0%,#05050580 40%,transparent 70%);z-index:-1}
  #media-center h2{font-family:"Cinzel",serif;font-weight:700;font-size:104px;margin:0;color:#efe4c9;letter-spacing:-.02em;text-shadow:0 4px 0 #150b07,0 10px 34px #000}
  #media-center p{margin:18px 0 0;font-size:28px;letter-spacing:.42em;color:#c9533a;font-weight:600;text-transform:uppercase}
  #media-flash{position:absolute;inset:0;background:#fff3dc;opacity:0;mix-blend-mode:screen}
  `;
  document.head.append(style);
  const layer = document.createElement("div");
  layer.id = "media-layer";
  layer.innerHTML = `<div id="media-caption"><i class="bar"></i><p class="kicker"></p><h2></h2><p class="body"></p></div><div id="media-labels"></div><div id="media-center"><h2></h2><p></p></div><div id="media-card"></div><div id="media-flash"></div><div id="media-fade"></div>`;
  document.body.append(layer);
  const caption = layer.querySelector("#media-caption"),
    card = layer.querySelector("#media-card"),
    fade = layer.querySelector("#media-fade"),
    flash = layer.querySelector("#media-flash"),
    labels = layer.querySelector("#media-labels"),
    center = layer.querySelector("#media-center");
  const seal = `<svg viewBox="0 0 48 48"><path d="M24 2 44 13v22L24 46 4 35V13Z" fill="none" stroke="currentColor"/><path d="M21 9h6v11h10v5H27v15h-6V25H11v-5h10z" fill="currentColor"/><path d="M24 2v7M24 40v6M4 13l9 5m22 12 9 5M4 35l9-5m22-12 9-5" stroke="currentColor"/></svg>`;

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const smooth = (x) => {
    x = clamp(x);
    return x * x * (3 - 2 * x);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const angleLerp = (a, b, t) =>
    a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

  function hash(text) {
    let h = 2166136261;
    for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  }

  const settings = {
    ...g.settings(),
    quality: 2,
    renderScale: 1,
    adaptiveResolution: false,
    brightness: 1.08,
    fov: 74,
    headBob: true,
    crosshair: true,
    difficulty: 1,
  };

  // --- Shot API ---------------------------------------------------------------
  const api = {
    g,
    V3,
    FPS,
    clamp,
    ease,
    smooth,
    lerp,
    v: (x, y, z) => new V3(x, y, z),
    captionSpec: null,
    cardSpec: null,
    fadeSpec: null,
    /** Load a level/sector with a quiet arena: no automatic waves unless requested. */
    level(level, room = 0, { waves = false, toast = false, weapon = 1 } = {}) {
      g.applySettings(settings);
      P.start(level, room);
      g.invulnerable = 1e9;
      g.elapsed = 30; // hide the first-run controls hint
      if (!toast) g.toastTimer = 0;
      if (!waves) {
        g.wave = 1;
        g.waveDelay = 1e9;
        g.remaining = 0;
      }
      api.arm(weapon);
      g.weaponMotion.inspect = 0;
      return g;
    },
    /** Switch weapons without the draw animation or handling sound. */
    arm(weapon) {
      g.weapon = weapon;
      g.weaponModels.forEach((w, i) => (w.root.visible = i === weapon));
    },
    clearPickups() {
      for (const p of g.pickups) p.mesh.removeFromParent();
      g.pickups = [];
    },
    spawn(type, x, z, { still = false, hp } = {}) {
      const e = g.spawnEnemy(type, new V3(x, 0, z));
      e.baseSpeed = e.speed;
      if (still) {
        e.speed = 0;
        e.cooldown = 1e9;
      }
      if (hp) e.hp = e.maxHp = hp;
      return e;
    },
    release(e, cooldown = 0.6) {
      e.speed = e.baseSpeed;
      e.cooldown = cooldown;
    },
    /** Open a menu page by clicking the real UI. */
    click(action, value) {
      const el = document.querySelector(`[data-action="${action}"]${value === undefined ? "" : `[data-value="${value}"]`}`);
      if (!el) throw new Error(`No UI control ${action}=${value}`);
      el.click();
    },
    menu(level = 0) {
      api.level(level, 0);
      g.setMode("menu");
      api.hud(true);
    },
    captionAt(left, top) {
      caption.style.left = left + "px";
      caption.style.top = top + "px";
    },
    face(e, x, z) {
      e.model.root.rotation.y = Math.atan2(x - e.model.root.position.x, z - e.model.root.position.z);
    },
    at(x, z, y = 1.75) {
      g.position.set(x, y, z);
      g.velocity.set(0, 0, 0);
    },
    look(yaw, pitch = 0) {
      g.yaw = yaw;
      g.pitch = pitch;
    },
    /** Yaw/pitch that point the camera at a world position. */
    aim(target) {
      const dx = target.x - g.position.x,
        dy = target.y - g.position.y,
        dz = target.z - g.position.z;
      return {
        yaw: Math.atan2(-dx, -dz),
        pitch: Math.atan2(dy, Math.hypot(dx, dz)),
      };
    },
    /** Ease the view toward a world point; rate is the fraction per frame. */
    track(target, rate = 0.2) {
      const a = api.aim(target);
      g.yaw = angleLerp(g.yaw, a.yaw, rate);
      g.pitch = lerp(g.pitch, a.pitch, rate);
    },
    enemyPoint(e, height = 1.1) {
      return e.model.root.position
        .clone()
        .add(new V3(0, e.type === "boss" ? 3.3 : e.type === "hound" ? 0.6 : height, 0));
    },
    fire(primary = false, secondary = false) {
      g.mouse[0] = primary;
      g.mouse[1] = secondary;
    },
    keys(...codes) {
      g.keys.clear();
      for (const c of codes) g.keys.add(c);
    },
    /** Angular error between the view and a world point. */
    error(target) {
      const a = api.aim(target);
      return Math.hypot(Math.atan2(Math.sin(a.yaw - g.yaw), Math.cos(a.yaw - g.yaw)), a.pitch - g.pitch);
    },
    /** Pick the enemy that is cheapest to turn toward (angle first, then distance). */
    target(filter = () => true) {
      let best,
        score = Infinity;
      for (const e of g.enemies) {
        if (e.hp <= 0 || !filter(e)) continue;
        const p = api.enemyPoint(e),
          s = api.error(p) * 12 + p.distanceTo(g.position) * 0.08;
        if (s < score) {
          score = s;
          best = e;
        }
      }
      return best;
    },
    /** Scripted combat: track a target smoothly and fire when the sights settle. */
    fight({ alt = false, rate = 0.2, tolerance = 0.07, filter, height, lead = 0 } = {}) {
      let e = api.locked;
      if (!e || e.hp <= 0 || !g.enemies.includes(e) || (filter && !filter(e))) e = api.locked = api.target(filter);
      api.fire(false, false);
      if (!e) return undefined;
      const p = api.enemyPoint(e, height);
      if (lead) p.addScaledVector(g.position.clone().sub(p).setY(0).normalize(), -lead);
      api.track(p, rate);
      if (api.error(p) < tolerance) api.fire(!alt, alt);
      return e;
    },
    /** Project a world point to screen pixels (for labels). */
    screen(point) {
      const p = point.clone().project(g.camera);
      return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, visible: p.z < 1 };
    },
    caption(kicker, title, body, from = 0.35, to = Infinity) {
      if (api.quiet) return;
      api.captionSpec = { kicker, title, body, from, to };
      caption.querySelector(".kicker").textContent = kicker;
      caption.querySelector("h2").innerHTML = title;
      caption.querySelector(".body").innerHTML = body;
    },
    card(html, from = 0, to = Infinity) {
      api.cardSpec = { from, to };
      card.innerHTML = `<div class="shade"></div>${html}`;
    },
    titleCard() {
      return `<div class="crest">${seal}</div><div class="logo"><h1>PURGATORY</h1><div class="logo-rule"><i></i><span>A REQUIEM IN STEEL</span><i></i></div></div>`;
    },
    /** Large centered title, e.g. for montage punches. */
    center(title, sub = "", from = 0, to = Infinity) {
      if (api.quiet) return;
      api.centerSpec = { from, to };
      center.querySelector("h2").innerHTML = title;
      center.querySelector("p").textContent = sub;
    },
    /** Name tag anchored above a world point; call every frame. */
    tag(id, text, point, opacity = 1) {
      if (api.quiet) return;
      let el = labels.querySelector(`[data-id="${id}"]`);
      if (!el) {
        el = document.createElement("div");
        el.className = "tag";
        el.dataset.id = id;
        el.textContent = text;
        labels.append(el);
      }
      const s = api.screen(point);
      el.style.left = s.x + "px";
      el.style.top = s.y + "px";
      el.style.opacity = s.visible ? String(opacity) : "0";
    },
    fadeOut(at, seconds = 0.6) {
      api.fadeOutSpec = { at, seconds };
    },
    fadeIn(seconds) {
      api.fadeSpec = { in: seconds };
    },
    flash(at) {
      api.flashAt = at;
    },
    hud(visible) {
      document.getElementById("app").style.visibility = visible ? "visible" : "hidden";
    },
  };

  function reset() {
    api.captionSpec = api.cardSpec = api.fadeSpec = api.centerSpec = api.fadeOutSpec = null;
    api.locked = undefined;
    labels.innerHTML = "";
    center.style.opacity = 0;
    api.flashAt = undefined;
    caption.style.opacity = 0;
    caption.style.left = caption.style.top = "";
    card.style.opacity = 0;
    card.innerHTML = "";
    fade.style.opacity = 0;
    flash.style.opacity = 0;
    api.hud(true);
    g.keys.clear();
    g.mouse = [false, false];
  }

  function overlays(t, duration) {
    const c = api.captionSpec;
    if (c) {
      const end = Math.min(c.to, duration - 0.45);
      const enter = ease((t - c.from) / 0.55),
        leave = smooth((t - end) / 0.4);
      caption.style.opacity = String(enter * (1 - leave));
      caption.style.transform = `translateX(${(1 - enter) * -48 + leave * -24}px)`;
      const h = caption.querySelector("h2");
      h.style.letterSpacing = `${lerp(0.06, -0.01, ease((t - c.from) / 0.9))}em`;
    }
    const k = api.cardSpec;
    if (k) {
      const enter = smooth((t - k.from) / 0.8),
        leave = smooth((t - k.to) / 0.7);
      card.style.opacity = String(enter * (1 - leave));
      const logo = card.querySelector(".logo h1");
      if (logo) {
        logo.style.letterSpacing = `${lerp(0.12, -0.055, ease((t - k.from) / 2.4))}em`;
        logo.style.transform = `scaleY(1.14) scale(${lerp(1.08, 1, ease((t - k.from) / 3))})`;
      }
      const rule = card.querySelector(".logo-rule");
      if (rule) rule.style.opacity = String(smooth((t - k.from - 0.9) / 0.8));
      card.querySelectorAll("[data-at]").forEach((el) => {
        const at = Number(el.dataset.at);
        el.style.opacity = String(smooth((t - k.from - at) / 0.7));
        el.style.transform = `translateY(${(1 - ease((t - k.from - at) / 0.8)) * 14}px)`;
      });
    }
    const m = api.centerSpec;
    if (m) {
      const enter = ease((t - m.from) / 0.35),
        leave = smooth((t - m.to) / 0.3);
      center.style.opacity = String(enter * (1 - leave));
      center.querySelector("h2").style.transform = `scale(${lerp(1.18, 1, enter) + (t - m.from) * 0.015})`;
    }
    const f = api.fadeSpec,
      o = api.fadeOutSpec;
    fade.style.opacity = String(
      Math.max(f ? 1 - smooth(t / f.in) : 0, o ? smooth((t - o.at) / o.seconds) : 0),
    );
    if (api.flashAt !== undefined)
      flash.style.opacity = String(t >= api.flashAt ? Math.max(0, 0.85 - (t - api.flashAt) * 2.4) : 0);
  }

  let current = null;
  window.__media = api;
  window.__director = {
    shots: {},
    define(name, shot) {
      this.shots[name] = shot;
    },
    begin(name) {
      const shot = this.shots[name];
      if (!shot) throw new Error("Unknown shot " + name);
      reset();
      api.quiet = !!shot.quiet;
      C.seed(hash(shot.seed || name));
      shot.setup(api);
      // Let the arena settle (weapon draw, shadows, physics) before frame 0.
      for (let i = 0; i < (shot.preroll ?? 18); i++) {
        shot.preframe?.(api, i);
        C.advance(1000 / FPS);
      }
      shot.start?.(api);
      events = [];
      shotStart = C.now;
      current = { shot, name, frame: 0 };
      return Math.round(shot.seconds * FPS);
    },
    /** Apply the shot script for the next frame, then advance virtual time. */
    step() {
      const { shot } = current;
      const i = current.frame++,
        t = i / FPS;
      shot.frame?.(api, i, t);
      // Hostile bolts that reach the camera burst into screen-filling particles; let them miss.
      for (const p of [...g.projectiles])
        if (p.hostile && p.mesh.position.distanceTo(g.position) < 2.4) {
          p.mesh.removeFromParent();
          g.projectiles.splice(g.projectiles.indexOf(p), 1);
        }
      overlays(t, shot.seconds);
      C.advance(1000 / FPS);
      return i;
    },
    events() {
      return events;
    },
    state() {
      return P.state();
    },
  };
})();
