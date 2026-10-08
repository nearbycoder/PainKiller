// Trailer and screenshot shots. Each shot is staged from scratch with seeded randomness,
// so `capture.cjs` produces the same footage on every run.
(() => {
  const D = window.__director;
  const L = {
    hallowed: 0, vigils: 1, ossuary: 2, cathedral: 3, barrow: 4, cells: 5, stage: 6, ward: 7,
    frost: 8, parish: 9, fen: 10, platform: 11, foundry: 12, garrison: 13, dune: 14, bastion: 15,
    court: 16, spire: 17, wood: 18, seraph: 19, canals: 20, harbor: 21, abbey: 22, abyss: 23,
  };
  const W = { thresher: 0, shotgun: 1, stakes: 2, rocket: 3, tempest: 4 };
  const between = (t, a, b) => t >= a && t < b;
  const once = (t, at) => between(t, at, at + 1 / 30);
  const crowd = (a, list) => list.map(([type, x, z, opts]) => a.spawn(type, x, z, opts));
  const centroid = (a, enemies) => {
    const alive = enemies.filter((e) => e.hp > 0);
    const c = a.v(0, 0, 0);
    for (const e of alive) c.add(a.enemyPoint(e, 0.9));
    return alive.length ? c.multiplyScalar(1 / alive.length) : undefined;
  };

  // --- Cold open: three quick hits -------------------------------------------------
  D.define("open-horde", {
    seconds: 2.7,
    stills: [24],
    setup(a) {
      a.level(L.hallowed, 0);
      a.clearPickups();
      a.at(0.4, 22.5);
      a.look(0, -0.06);
      a.arm(W.rocket);
    },
    start(a) {
      this.horde = crowd(a, [
        ["shambler", -2.2, 12.4], ["shambler", 1.6, 11.8], ["skeleton", -0.6, 10.6], ["shambler", 3.2, 13.6],
        ["skeleton", -3.6, 11.2], ["shambler", 0.4, 14.2], ["brute", 0.8, 8.8], ["skeleton", 2.6, 10.2],
        ["shambler", -1.4, 15.4], ["skeleton", 4.2, 12.2], ["shambler", -4.4, 14.4],
      ]);
      a.fadeIn(0.45);
    },
    frame(a, i, t) {
      const c = centroid(a, this.horde);
      if (c && t < 1.9) a.track(c.add(a.v(0, -0.4, 0)), 0.25);
      a.fire(once(t, 0.5) || once(t, 1.5), false);
    },
  });
  D.define("open-storm", {
    seconds: 2.4,
    stills: [30],
    setup(a) {
      a.level(L.foundry, 1);
      a.clearPickups();
      a.at(-1, 14);
      a.look(0.05, -0.02);
      a.arm(W.tempest);
    },
    start(a) {
      this.group = crowd(a, [
        ["skeleton", -2, 5], ["knight", 1, 3.5], ["skeleton", 2.5, 6], ["monk", -3.5, 2.5],
        ["skeleton", 0, 1], ["shambler", 3.5, 2],
      ]);
    },
    frame(a, i, t) {
      if (t < 1.1) a.fight({ alt: true, rate: 0.22, tolerance: 0.08 });
      else {
        const c = centroid(a, this.group);
        if (c) a.track(c, 0.25);
        a.fire(between(t, 1.2, 1.3), between(t, 1.2, 1.3));
      }
    },
  });
  D.define("open-general", {
    seconds: 2.9,
    stills: [40],
    setup(a) {
      a.level(L.abyss, 0);
      a.clearPickups();
      a.at(0, 19);
      a.look(0, 0.1);
      a.arm(W.rocket);
    },
    start(a) {
      this.boss = a.spawn("boss", 0, 3);
      this.boss.cooldown = 0.25;
      this.boss.speed = 1.2;
    },
    frame(a, i, t) {
      const g = a.g,
        ring = g.rings[0];
      a.track(a.enemyPoint(this.boss).add(a.v(0, -0.6, 0)), 0.2);
      a.fire(once(t, 0.9), false);
      const d = ring ? Math.hypot(g.position.x - ring.mesh.position.x, g.position.z - ring.mesh.position.z) - ring.radius : 99;
      a.keys(...(d > 0 && d < 3.6 && g.grounded ? ["Space"] : []));
      a.flash(2.55);
    },
  });

  // --- Title ---------------------------------------------------------------------------
  D.define("title", {
    seconds: 5.6,
    stills: [120],
    preroll: 3,
    setup(a) {
      a.menu(L.hallowed);
      a.hud(false);
      a.card(
        `${a.titleCard()}<div class="tagline" data-at="2">An original gothic arena shooter</div>`,
        0.15,
      );
      a.flash(0);
    },
  });

  // --- Feature beats ---------------------------------------------------------------------
  D.define("sectors", {
    seconds: 5.6,
    stills: [20, 96],
    setup(a) {
      a.level(L.vigils, 0);
      a.clearPickups();
      a.at(0, 16);
      a.look(0, -0.03);
      a.arm(W.shotgun);
    },
    start(a) {
      a.g.notify("WAVE 1  /  THE GATES ARE SEALED", 2.4);
      this.queue = [
        ["shambler", -1.5, 7], ["skeleton", 2, 5], ["shambler", 0.5, 3], ["skeleton", -2.2, 1.5],
        ["shambler", 2.2, -0.5], ["skeleton", -0.8, -2.5], ["shambler", 1.4, -4.5], ["skeleton", -1.8, -6],
      ];
      a.caption("Sector by sector", "The gates seal behind you", "Hold out through three waves of the damned to open the way forward.", 0.5);
    },
    frame(a, i, t) {
      if (i % 12 === 0 && this.queue.length) a.spawn(...this.queue.shift());
      a.fight({ rate: 0.16, tolerance: 0.07 });
    },
  });
  D.define("thresher", {
    seconds: 5.8,
    stills: [40, 120],
    setup(a) {
      a.level(L.ossuary, 0);
      a.clearPickups();
      a.at(0, 14);
      a.look(0, -0.08);
      a.arm(W.thresher);
    },
    start(a) {
      this.near = crowd(a, [["skeleton", -0.8, 9.5], ["skeleton", 1.4, 10.5], ["shambler", -1.5, 11.5]]);
      this.far = a.spawn("shambler", 2, -6, { still: true });
      a.caption("Weapon I · Thresher", "Steel that never runs dry", "Grind through crowds with spinning blades, or hurl the head and call it back.", 0.5);
    },
    frame(a, i, t) {
      if (t < 3.3) {
        const e = a.target((e) => e !== this.far);
        a.fire(false, false);
        if (e) {
          a.track(a.enemyPoint(e, 1), 0.2);
          a.fire(e.model.root.position.distanceTo(a.g.position) < 3.6 && a.error(a.enemyPoint(e, 1)) < 0.2, false);
        }
      } else {
        a.track(a.enemyPoint(this.far, 1.2), 0.18);
        a.fire(false, once(t, 3.8));
      }
    },
  });
  D.define("freezer", {
    seconds: 6.0,
    stills: [24, 64, 140],
    setup(a) {
      a.level(L.hallowed, 2);
      a.clearPickups();
      a.at(0, 21);
      a.look(0, -0.05);
      a.arm(W.shotgun);
    },
    start(a) {
      this.brute = a.spawn("brute", 0.4, 13);
      this.knight = a.spawn("knight", -2.6, 9, { still: true });
      a.caption("Weapon II · Shotgun / Freezer", "Freeze them. Shatter them.", "Lock an enemy in ice with a freezing bolt, then break it apart at point-blank range.", 0.5);
    },
    frame(a, i, t) {
      const target = t < 2.7 ? this.brute : this.knight;
      a.track(a.enemyPoint(target, 1.3), 0.22);
      a.fire(once(t, 1.9) || once(t, 4.3), once(t, 0.4) || once(t, 3.0));
      a.keys(between(t, 0.8, 1.15) ? "KeyW" : "");
      if (once(t, 2.7)) a.release(this.knight, 9);
    },
  });
  D.define("stakes", {
    seconds: 5.6,
    stills: [20, 45, 80, 130],
    setup(a) {
      a.level(L.foundry, 0);
      a.clearPickups();
      a.at(2, -18.6);
      a.look(0, 0.02);
      a.arm(W.stakes);
    },
    start(a) {
      this.wall = crowd(a, [["skeleton", -0.5, -27, { still: true }], ["monk", 2.2, -27.1, { still: true }], ["skeleton", 4.8, -26.9, { still: true }]]);
      this.pair = crowd(a, [["shambler", -3.5, -24, { still: true }], ["shambler", -5.5, -25, { still: true }]]);
      a.caption("Weapon III · Stake Launcher / Grenade", "Pin the dead in place", "Stakes nail bodies to walls and ignite over distance. Grenades bounce before they blow.", 0.5);
    },
    frame(a, i, t) {
      if (t < 2.5) {
        const e = this.wall.find((e) => e.hp > 0);
        if (e) a.track(a.enemyPoint(e, 1.35), 0.22);
        a.fire(once(t, 0.45) || once(t, 1.25) || once(t, 2.05), false);
      } else {
        a.track(a.v(-4.5, 0.4, -24.5), 0.18);
        a.fire(false, once(t, 3.1));
      }
    },
  });
  D.define("rockets", {
    seconds: 5.6,
    stills: [24, 110],
    setup(a) {
      a.level(L.dune, 0);
      a.clearPickups();
      a.at(-2, 19);
      a.look(0, -0.05);
      a.arm(W.rocket);
    },
    start(a) {
      this.horde = crowd(a, [
        ["shambler", -2, 8], ["skeleton", 1, 7], ["shambler", 3, 9], ["brute", -0.5, 4], ["skeleton", -4, 6],
        ["hound", 2, 2], ["shambler", 5, 5], ["skeleton", -6, 9], ["knight", 0.5, 0], ["shambler", -2.5, 1],
      ]);
      a.caption("Weapon IV · Rocket / Chaingun", "Explosive crowd control", "Rockets scatter the horde; the rotary chaingun shreds whatever still stands.", 0.5);
    },
    frame(a, i, t) {
      if (t < 2.2) {
        const c = centroid(a, this.horde);
        if (c) a.track(c.add(a.v(0, -0.5, 0)), 0.2);
        a.fire(once(t, 0.45) || once(t, 1.4), false);
      } else a.fight({ alt: true, rate: 0.2, tolerance: 0.07 });
      a.keys(t > 2.2 ? "KeyD" : "");
    },
  });
  D.define("tempest", {
    seconds: 6.0,
    stills: [30, 90, 150],
    setup(a) {
      a.level(L.stage, 0);
      a.clearPickups();
      a.at(0, 18);
      a.look(0, -0.02);
      a.arm(W.tempest);
    },
    start(a) {
      this.group = crowd(a, [
        ["skeleton", -3, 9], ["witch", 2, 6], ["skeleton", 0, 7.5], ["monk", -1.5, 4], ["knight", 3.5, 8],
        ["skeleton", -4.5, 5], ["shambler", 1, 2.5], ["witch", -2.5, 1],
      ]);
      a.caption("Weapon V · Tempest", "Call down the storm", "Razor shuriken, lightning that leaps between targets, and a storm orb when you fire both.", 0.5);
    },
    frame(a, i, t) {
      if (t < 1.5) a.fight({ rate: 0.2, tolerance: 0.06 });
      else if (t < 3.6) a.fight({ alt: true, rate: 0.2, tolerance: 0.09 });
      else {
        const c = centroid(a, this.group);
        if (c) a.track(c, 0.2);
        a.fire(once(t, 3.9), once(t, 3.9));
        if (t > 4.6) a.fight({ alt: true, rate: 0.2, tolerance: 0.09 });
      }
    },
  });
  const roster = [
    ["shambler", "Shambler"], ["skeleton", "Skeleton"], ["monk", "Monk"], ["hound", "Hound"],
    ["knight", "Knight"], ["witch", "Witch"], ["brute", "Brute"],
  ];
  D.define("roster", {
    seconds: 7.0,
    stills: [80, 170],
    setup(a) {
      a.level(L.hallowed, 0);
      a.clearPickups();
      a.at(0, 23);
      a.look(0.34, -0.03);
    },
    start(a) {
      this.line = roster.map(([type], i) => {
        const e = a.spawn(type, -9 + i * 3, 13 + (i % 2) * 0.8, { still: true });
        a.face(e, 0, 23);
        return e;
      });
      a.caption("Seven breeds of the damned", "Know your enemy", "Rushers, casters, hounds and armored brutes. Every melee blow winds up first, so dodge it.", 0.6);
    },
    frame(a, i, t) {
      const g = a.g;
      g.yaw = a.lerp(0.34, -0.34, a.smooth(t / 4.4));
      if (once(t, 4.6)) this.line.forEach((e) => a.release(e, e.type === "monk" || e.type === "witch" ? 9 : 1));
      const fade = 1 - a.smooth((t - 4.4) / 0.5);
      this.line.forEach((e, n) => {
        const h = { hound: 1.25, brute: 3.1, witch: 2.7 }[e.type] || 2.35;
        a.tag(n, roster[n][1], e.model.root.position.clone().add(a.v(0, h, 0)), Math.min(fade, a.smooth((t - 0.3 - n * 0.25) / 0.4)));
      });
      if (t > 4.8) a.fight({ rate: 0.16, tolerance: 0.06 });
      if (t > 4.6 && g.weapon !== W.shotgun) g.equip(W.shotgun);
    },
  });
  D.define("general", {
    seconds: 6.4,
    stills: [45, 100, 160],
    setup(a) {
      a.level(L.dune, 0);
      a.clearPickups();
      a.at(0, 20);
      a.look(0, 0.08);
      a.arm(W.rocket);
    },
    start(a) {
      this.boss = a.spawn("boss", 0, 2);
      this.boss.hp = this.boss.maxHp * 0.71;
      this.boss.cooldown = 0.3;
      a.caption("Five chapter generals", "Bosses that fight back", "Projectile volleys, rage phases, reinforcements, and shockwaves you have to jump.", 0.6);
    },
    frame(a, i, t) {
      const g = a.g;
      const ring = g.rings[0];
      if (t < 3.6) a.track(a.enemyPoint(this.boss).add(a.v(0, -0.8, 0)), 0.16);
      else a.fight({ rate: 0.15, tolerance: 0.06 });
      a.fire(once(t, 1.0) || once(t, 2.6) || (t > 3.6 && g.mouse[0]), false);
      const d = ring ? Math.hypot(g.position.x - ring.mesh.position.x, g.position.z - ring.mesh.position.z) - ring.radius : 99;
      a.keys(...(d > 0 && d < 3.6 && g.grounded ? ["Space"] : []), ...(t > 3.6 ? ["KeyA"] : []));
    },
  });
  D.define("wraith", {
    seconds: 6.2,
    stills: [40, 70, 120, 170],
    setup(a) {
      a.level(L.bastion, 0);
      a.clearPickups();
      a.at(0, 18);
      a.look(0, -0.08);
      a.arm(W.shotgun);
      a.g.souls = 63;
    },
    start(a) {
      crowd(a, [["skeleton", -1.2, 13], ["shambler", 1.3, 12.6], ["skeleton", 0.1, 12]]);
      a.caption("Sixty-six souls", "Become the Wraith", "Every kill leaves a soul. Gather 66 for fifteen seconds of invulnerability and quadruple damage.", 0.6);
    },
    frame(a, i, t) {
      const g = a.g;
      if (once(t, 2.3))
        crowd(a, [["knight", -3, 7], ["brute", 2, 5], ["skeleton", 0, 9], ["shambler", 4, 8], ["knight", -5, 4], ["skeleton", 1, 2.5]]);
      if (g.demon > 0 && g.weapon !== W.rocket && t > 2.4) g.equip(W.rocket);
      a.fight(g.weapon === W.rocket ? { alt: true, rate: 0.22, tolerance: 0.08 } : { rate: 0.2, tolerance: 0.08 });
      a.keys(t < 1.4 ? "" : t % 2 < 1 ? "KeyA" : "KeyD");
    },
  });
  D.define("supplies", {
    seconds: 6.0,
    stills: [30, 70, 110, 160],
    setup(a) {
      a.level(L.hallowed, 0);
      a.clearPickups();
      const g = a.g;
      g.health = 22; // under a quarter: the red readout, edges and heartbeat until the pickup
      g.armor = 12;
      g.ammo[W.shotgun] = 4;
      g.altAmmo[W.shotgun] = 3;
      this.from = a.v(0, 1.75, 20.5);
      this.to = a.v(0, 1.75, 3.4);
      a.at(0, 20.5);
      a.look(0, -0.34);
      g.addPickup("health", a.v(-0.4, 0.65, 16.2));
      g.addPickup("armor", a.v(0.5, 0.65, 12.2));
      g.addPickup("ammo", a.v(-0.3, 0.65, 8.2));
      g.addPickup("secret", a.v(0.2, 0.9, 3.0));
    },
    start(a) {
      a.caption("Supplies & secrets", "Scavenge the battlefield", "Health, armor and ammunition drop from the fallen. At low health a heartbeat warns you. Hidden relics earn tarot cards.", 0.5);
    },
    frame(a, i, t) {
      const g = a.g;
      g.position.lerpVectors(this.from, this.to, a.smooth(t / 4.8));
      g.yaw = Math.sin(t * 1.3) * 0.06;
      g.pitch = a.lerp(-0.34, -0.12, a.smooth((t - 4) / 1.5));
    },
  });
  D.define("tarot-menu", {
    seconds: 2.6,
    stills: [60],
    preroll: 3,
    setup(a) {
      a.menu(L.court);
      const g = a.g;
      g.save.cards = [0, 1, 2];
      g.save.selectedCard = 0;
      a.click("page", "tarot");
    },
    frame(a, i, t) {
      if (once(t, 1.3)) a.click("card", 1);
      if (once(t, 2.3)) a.click("card", 0);
    },
  });
  D.define("tarot", {
    seconds: 5.4,
    stills: [40, 120],
    setup(a) {
      a.level(L.court, 0);
      a.clearPickups();
      const g = a.g;
      g.save.cards = [0, 1, 2];
      g.save.selectedCard = 0;
      a.at(0, 18);
      a.look(0, -0.03);
      a.arm(W.shotgun);
    },
    start(a) {
      crowd(a, [["skeleton", -1.5, 7], ["shambler", 1.5, 6], ["knight", 3, 4.5], ["skeleton", -3, 5], ["shambler", 0, 3], ["skeleton", 2, 1]]);
      a.caption("Grave Tarot", "Bend the rules", "Earn Wrath, Quickening and Bulwark, then unleash one per sector for 30 seconds of power.", 0.5);
    },
    frame(a, i, t) {
      if (once(t, 0.6)) a.g.activateCard();
      if (once(t, 2.4)) crowd(a, [["knight", -2, 5], ["shambler", 2.2, 4], ["skeleton", 0.5, 2.5], ["brute", -0.5, 0]]);
      a.fight({ rate: 0.2, tolerance: 0.07 });
      a.g.position.z = Math.min(21, a.g.position.z + 1.4 / 30);
    },
  });
  D.define("physics", {
    seconds: 5.6,
    stills: [30, 50, 75, 120],
    setup(a) {
      a.level(L.cathedral, 0);
      a.clearPickups();
      a.at(0, 20);
      a.look(0, 0);
      a.arm(W.stakes);
    },
    start(a) {
      this.group = crowd(a, [
        ["skeleton", -1.5, -6, { still: true }], ["shambler", 1, -7, { still: true }], ["skeleton", 0, -4.5, { still: true }],
        ["monk", 2.2, -5, { still: true }], ["shambler", -2.6, -7.5, { still: true }],
      ]);
      a.caption("Rapier physics", "Every hit lands with weight", "Shoot your own grenade to launch it. Ragdolls and blast impulses send the fallen flying.", 0.5);
    },
    frame(a, i, t) {
      const g = a.g;
      if (t < 0.3) a.look(0, 0);
      a.fire(false, once(t, 0.3));
      if (once(t, 1.15)) {
        const gr = g.projectiles.find((p) => p.kind === "grenade");
        if (gr) {
          const lead = gr.mesh.position.clone().addScaledVector(gr.velocity, gr.mesh.position.distanceTo(g.position) / 48);
          const aim = a.aim(lead);
          g.yaw = aim.yaw;
          g.pitch = aim.pitch;
          a.fire(true, false);
        }
      }
      if (t > 1.3) a.track(a.v(0, 0.3, -7), 0.08);
      a.keys(...(t > 1.6 && t < 3.3 ? ["KeyW", "ShiftLeft"] : []));
      if (once(t, 3.9)) a.fire(false, true);
    },
  });
  D.define("progress", {
    seconds: 6.8,
    stills: [45, 120, 200],
    setup(a) {
      a.level(L.vigils, 0);
      a.clearPickups();
      const g = a.g;
      g.wave = 3;
      g.remaining = 0;
      g.waveDelay = 0.7;
      a.at(0, -8);
      a.look(0, -0.02);
      a.arm(W.shotgun);
    },
    start(a) {
      this.last = a.spawn("skeleton", 0.5, -15);
      a.caption("Cleanse the sector", "Push ever deeper", "Clear the final wave and the gate opens. Step through, and the next sector fades in; every wave is a checkpoint.", 0.5);
    },
    frame(a, i, t) {
      const g = a.g;
      if (t < 0.8) a.fight({ rate: 0.25, tolerance: 0.08 });
      else {
        a.fire(false, false);
        a.track(a.v(0, 2.4, -28), 0.1);
        if (t > 1.6 && g.position.z > -24.5) g.position.z -= 4.2 / 30;
      }
      if (once(t, 5.5) && g.arenaCleared) {
        g.nextArena();
        a.at(0, 20);
        a.look(0, -0.02);
      }
      if (t > 5.5) a.track(a.v(0, 1.7, 0), 0.05);
    },
  });
  D.define("levels", {
    seconds: 3.8,
    stills: [30, 100],
    preroll: 3,
    setup(a) {
      a.menu(L.hallowed);
      a.click("page", "campaign");
    },
    frame(a, i, t) {
      const picks = [[0.7, 2, 6], [1.6, 3, 12], [2.5, 4, 17], [3.4, 5, 23]];
      for (const [at, chapter, level] of picks)
        if (once(t, at)) {
          a.click("chapter", chapter);
          a.click("select-level", level);
        }
    },
  });
  const tour = [L.cells, L.frost, L.court, L.fen, L.platform, L.spire, L.canals, L.abyss];
  D.define("campaign", {
    seconds: 5.8,
    stills: [10, 60, 110, 160],
    setup(a) {
      a.level(tour[0], 0);
      a.clearPickups();
      a.at(0, 24);
      a.hud(false);
      a.g.weaponModels.forEach((w) => (w.root.visible = false));
      this.cut = 0;
    },
    start(a) {
      a.caption("24 levels · 5 chapters", "A pilgrimage through the afterlife", "Cemeteries, cathedrals, foundries, drowned canals and the Abyss itself, across 22 environment themes.", 0.4);
    },
    frame(a, i, t) {
      const cut = Math.min(tour.length - 1, Math.floor(t / 0.72));
      if (cut !== this.cut) {
        this.cut = cut;
        a.level(tour[cut], cut % 2);
        // A hard cut between arenas: without the level start's fade from black (round 12),
        // which would dip every 0.72 s cut to black.
        document.getElementById("scene-fade").classList.remove("on");
        a.clearPickups();
        a.hud(false);
        a.g.weaponModels.forEach((w) => (w.root.visible = false));
      }
      const u = (t % 0.72) / 0.72;
      a.at(Math.sin(cut * 1.7) * 3, 24 - u * 4);
      a.look(Math.sin(cut * 2.3) * 0.18 - u * 0.05 * Math.sign(Math.sin(cut * 2.3)), 0.06);
    },
  });
  const STEPS = ["Low", "Medium", "High", "Ultra"];
  D.define("fidelity", {
    seconds: 6.6,
    stills: [30, 75, 120, 165],
    setup(a) {
      // Hallowed Ground's start view, between its lamps (the view round 12 compared).
      a.level(L.hallowed, 0);
      a.clearPickups();
      a.arm(W.rocket);
      a.look(a.g.yaw, 0.02);
      this.step = -1;
    },
    start(a) {
      a.caption("Graphics fidelity · Low", "From Low to Ultra", "Four steps. High and Ultra add bloom on lamps, fire and blasts, a colour grade and sharper shadows.", 0.3);
    },
    frame(a, i, t) {
      const g = a.g,
        step = Math.min(3, Math.floor(t / 1.5));
      if (step !== this.step) {
        this.step = step;
        g.applySettings({ ...g.settings(), quality: step });
        a.kicker("Graphics fidelity · " + STEPS[step]);
        // A fresh group for every step, so each one shows a blast.
        const d = g.direction();
        for (const [type, ahead, side] of [["shambler", 10, -1.6], ["skeleton", 9, 1.8], ["brute", 12, 0.3]]) {
          const p = g.position.clone().addScaledVector(d, ahead).add(a.v(-d.z * side, 0, d.x * side));
          a.spawn(type, p.x, p.z, { still: true });
        }
      }
      a.fire(once(t, step * 1.5 + 0.3), false);
    },
  });
  D.define("options", {
    seconds: 4.4,
    stills: [30, 90, 140],
    preroll: 3,
    setup(a) {
      a.menu(L.cathedral);
      a.click("page", "settings");
    },
    frame(a, i, t) {
      if (once(t, 1.5)) a.click("settings-tab", "controls");
      if (once(t, 2.9)) a.click("settings-tab", "gameplay");
    },
  });

  // --- Escalation montage ------------------------------------------------------------------
  const montage = [
    ["m-chaingun", L.harbor, W.rocket, (a) => crowd(a, [["skeleton", -2, 10], ["shambler", 1, 9], ["knight", 3, 11], ["skeleton", -4, 8], ["hound", 0, 6]]), (a) => a.fight({ alt: true, rate: 0.3, tolerance: 0.1 })],
    ["m-storm", L.spire, W.tempest, (a) => crowd(a, [["skeleton", -2, 8], ["witch", 1, 7], ["monk", 2.5, 9], ["skeleton", -3.5, 10], ["knight", 0, 5]]), (a, t) => { const c = a.target(); if (c) a.track(a.enemyPoint(c), 0.3); a.fire(between(t, 0.1, 0.2), between(t, 0.1, 0.2) || t > 0.5); }],
    ["m-shatter", L.frost, W.shotgun, (a) => crowd(a, [["brute", 0, 13]]), (a, t) => { const e = a.target(); if (e) a.track(a.enemyPoint(e, 1.3), 0.35); a.fire(once(t, 0.75), once(t, 0.1)); a.keys(t > 0.2 && t < 0.7 ? "KeyW" : ""); }],
    ["m-volley", L.seraph, W.rocket, (a) => { const b = a.spawn("boss", 0, 6); b.cooldown = 0.05; }, (a, t) => { a.track(a.v(0, 3, 6), 0.2); a.keys(t > 0.5 ? "KeyA" : ""); }],
    ["m-rockets", L.wood, W.rocket, (a) => crowd(a, [["shambler", -1, 10], ["skeleton", 1, 9.5], ["shambler", 0.5, 11.5], ["brute", -1.8, 8.5], ["skeleton", 2.2, 10.8]]), (a, t) => { a.track(a.v(0, 0.6, 10), 0.3); a.fire(once(t, 0.1), false); }],
    ["m-wraith", L.abbey, W.rocket, (a) => { a.g.demon = 12; crowd(a, [["skeleton", -1.5, 12.5], ["shambler", 1, 12], ["knight", 0, 10.5], ["skeleton", -3, 11], ["brute", 2.5, 13]]); }, (a) => a.fight({ alt: true, rate: 0.3, tolerance: 0.1 })],
    ["m-lightning", L.ossuary, W.tempest, (a) => crowd(a, [["skeleton", -1.5, 14], ["skeleton", 1, 13.5], ["monk", 0, 12.5], ["skeleton", 2.5, 14.5], ["shambler", -3, 13]]), (a) => a.fight({ alt: true, rate: 0.3, tolerance: 0.12 })],
    ["m-finale", L.abyss, W.rocket, (a) => crowd(a, [["shambler", -1, 12], ["skeleton", 1, 11], ["brute", 0, 9], ["knight", 2, 12.5], ["skeleton", -2.5, 11], ["shambler", 3, 10], ["hound", -1, 8]]), (a, t) => { a.track(a.v(0, 0.4, 10.5), 0.3); a.fire(once(t, 0.15), false); a.flash(1.05); }],
  ];
  for (const [name, level, weapon, populate, act] of montage)
    D.define(name, {
      seconds: name === "m-finale" ? 1.4 : 1.15,
      stills: [20],
      setup(a) {
        a.level(level, 0);
        a.clearPickups();
        a.at(0, 21);
        a.look(0, 0);
        a.arm(weapon);
      },
      start(a) {
        populate(a);
        if (name === "m-chaingun") a.center("No reloads", "Five weapons · ten fire modes", 0.05, 1.0);
        if (name === "m-rockets") a.center("No mercy", "Three difficulties, up to Torment", 0.05, 1.0);
      },
      frame(a, i, t) {
        act(a, t);
      },
    });

  // --- End card ---------------------------------------------------------------------------
  D.define("end", {
    seconds: 6.6,
    stills: [150],
    preroll: 3,
    setup(a) {
      a.menu(L.abyss);
      a.hud(false);
      a.card(
        `${a.titleCard()}<div class="tagline" data-at="1.4">An original gothic arena shooter</div><div class="url" data-at="2.2">github.com/nearbycoder/PainKiller</div><div class="meta" data-at="2.9">Linux desktop · Web browser · Free</div>`,
        0.2,
      );
      a.flash(0);
      a.fadeOut(5.7, 0.85);
    },
  });

  // --- README screenshots: the same staging without trailer overlays -------------------------
  const still = (name, from, stills, extra = {}) =>
    D.define(name, { ...D.shots[from], quiet: true, seed: from, stills, ...extra });
  D.define("ss-title", {
    seconds: 3,
    stills: [40, 70],
    preroll: 3,
    setup(a) {
      a.menu(L.hallowed);
    },
  });
  still("ss-horde", "open-horde", [18, 20, 22, 24, 26]);
  still("ss-shatter", "freezer", [58, 59, 60, 61, 62, 64, 130, 131, 132]);
  still("ss-lightning", "tempest", [48, 52, 56, 60, 66, 72, 80, 120, 124]);
  still("ss-general", "general", [12, 20, 33, 40, 50, 60]);
  still("ss-wraith", "wraith", [80, 100, 120, 140]);
  still("ss-abyss", "m-finale", [8, 12, 16, 20, 26, 33], { seconds: 1.4 });
  still("ss-levels", "levels", [40, 60, 90]);
  still("ss-tarot", "tarot-menu", [20, 40, 60]);

  D.order = [
    "open-horde", "open-storm", "open-general", "title", "sectors", "thresher", "freezer", "stakes", "rockets",
    "tempest", "roster", "general", "wraith", "supplies", "tarot-menu", "tarot", "physics", "progress", "levels",
    "campaign", "fidelity", "options", ...montage.map((m) => m[0]), "end",
  ];
})();
