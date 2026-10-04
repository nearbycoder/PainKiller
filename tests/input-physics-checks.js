(() => {
  const api = window.__PURGATORY__,
    g = api.game,
    V = g.position.constructor,
    results = [],
    saved = structuredClone(g.save),
    options = g.settings();
  const assert = (ok, msg) => {
    if (!ok) throw Error(msg);
  };
  const check = (name, fn) => {
    try {
      results.push({ name, passed: true, detail: fn() });
    } catch (e) {
      results.push({ name, passed: false, error: String(e) });
    }
  };
  const setup = () => {
    api.start(0, 0);
    g.clearDynamic();
    g.waveDelay = 9999;
    g.controls.clear();
    g.controls.poll(1 / 60, []);
    g.invulnerable = 999;
    g.sound.setVolume(0);
  };
  const pad = (buttons = [], axes = [0, 0, 0, 0]) => ({
    connected: true,
    mapping: "standard",
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: buttons.includes(i),
      value: buttons.includes(i) ? 1 : 0,
    })),
  });
  const poll = (buttons = [], axes) =>
    g.controls.poll(1 / 60, [pad(buttons, axes)]);
  check(
    "stake shot creates an articulated corpse and pins it to the wall",
    () => {
      setup();
      g.physics.reset([{ x: 0, z: -5, w: 10, d: 0.5, h: 5 }]);
      g.position.set(0, 1.75, 8);
      g.pitch = -0.04;
      g.yaw = 0;
      g.equip(2);
      const e = g.spawnEnemy("shambler", new V(0, 0, 2));
      e.hp = 1;
      e.speed = 0;
      g.shoot();
      api.step(90);
      assert(!g.enemies.includes(e), "Stake missed");
      const r = g.corpses[0]?.ragdoll;
      assert(r?.bodies.length === 11, "No articulated body");
      assert(r.pinned, "Not pinned");
      assert(Math.abs(r.anchor.translation().z + 4.69) < 0.15, "Wrong wall");
      assert(
        g.embeddedStakes.some((s) => s.mesh.parent?.type === "Bone"),
        "Stake not attached to body",
      );
      return { bodies: r.bodies.length, anchor: r.anchor.translation() };
    },
  );
  check(
    "corpses have bounded lifetime/population and arena changes remove bodies",
    () => {
      setup();
      for (let i = 0; i < 12; i++) {
        const e = g.spawnEnemy(
          i % 2 ? "skeleton" : "shambler",
          new V(i - 6, 0, 5),
        );
        g.hitEnemy(e, 999, "explosion", new V(0, 0, -1));
      }
      assert(
        g.corpses.length === 8 && g.physics.ragdolls.size === 8,
        "Unbounded corpses",
      );
      api.start(1, 0);
      assert(
        g.physics.ragdolls.size === 0 && g.corpses.length === 0,
        "Physics leaked between levels",
      );
    },
  );
  check(
    "nonlethal impacts deflect pose and stagger without restarting the walking clip",
    () => {
      setup();
      const e = g.spawnEnemy("shambler", new V(0, 0, 10));
      e.hp = 999;
      e.model.animate(1 / 60, 2, false);
      const bone = e.model.root.getObjectByName("CityDeadOutfitSpine2");
      const before = bone.quaternion.clone();
      g.hitEnemy(e, 1, "shotgun", new V(1, 0, -1).normalize());
      e.model.animate(1 / 60, 2, false);
      assert(e.stagger > 0 && e.knockback.length() > 0, "No physical reaction");
      assert(before.angleTo(bone.quaternion) > 0.001, "Pose did not react");
    },
  );
  check(
    "storm combination requires and consumes both ammunition types atomically",
    () => {
      setup();
      g.equip(4);
      g.controls.primary = true;
      g.ammo[4] = 3;
      g.altAmmo[4] = 15;
      g.shoot(true);
      assert(
        g.ammo[4] === 3 && g.altAmmo[4] === 15 && g.projectiles.length === 0,
        "Partial spend on failed combo",
      );
      g.cooldown = 0;
      g.altAmmo[4] = 16;
      g.shoot(true);
      assert(g.ammo[4] === 2 && g.altAmmo[4] === 0, "Incorrect combo cost");
    },
  );
  check(
    "controller analog movement, looking, trigger fire and shoulder selection",
    () => {
      setup();
      g.equip(1);
      const z = g.position.z,
        yaw = g.yaw,
        ammo = g.ammo[1];
      for (let i = 0; i < 30; i++) {
        poll([7], [0, -1, 0.4, 0]);
        api.step(1);
      }
      assert(g.position.z < z - 1, "Stick did not move");
      assert(g.yaw !== yaw, "Stick did not aim");
      assert(g.ammo[1] < ammo, "Trigger did not fire");
      poll([5]);
      assert(g.weapon === 2, "Shoulder did not select");
      poll([5]);
      assert(g.weapon === 2, "Held shoulder repeated");
    },
  );
  check("controller pause clears fire and disconnect pauses safely", () => {
    poll([]);
    poll([9]);
    assert(g.mode === "paused" && !g.controls.primary, "Pause failed");
    poll([]);
    poll([9]);
    assert(g.mode === "playing", "Resume failed");
    poll([7]);
    g.controls.poll(1 / 60, []);
    assert(
      g.mode === "paused" && !g.controls.primary && g.controls.moveY === 0,
      "Disconnect left active input",
    );
  });
  check("controller navigates menus and opens options", () => {
    g.setMode("menu");
    poll([]);
    const before = document.activeElement;
    poll([13]);
    assert(document.activeElement !== before, "D-pad failed");
    poll([]);
    document
      .querySelector('[data-action="page"][data-value="settings"]')
      .focus();
    poll([0]);
    assert(
      document.querySelector('[data-action="settings-tab"]'),
      "Controller confirm failed",
    );
    poll([]);
    poll([1]);
    assert(
      document.querySelector('[data-action="page"][data-value="settings"]'),
      "Controller back failed",
    );
    g.controls.poll(1 / 60, []);
  });
  check(
    "independent touch movement, aiming and firing release on cancellation",
    () => {
      setup();
      const move = document.getElementById("touch-move"),
        look = document.getElementById("touch-look"),
        fire = document.querySelector('[data-touch="primary"]'),
        nodes = [move, look, fire],
        originals = nodes.map((n) => [
          n.setPointerCapture,
          n.hasPointerCapture,
          n.releasePointerCapture,
        ]);
      // Synthetic PointerEvents are not browser-owned pointers; emulate capture bookkeeping only.
      nodes.forEach((n) => {
        n.setPointerCapture = () => {};
        n.hasPointerCapture = () => false;
        n.releasePointerCapture = () => {};
      });
      const event = (n, type, id, x, y) =>
        n.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType: "touch",
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      try {
        const z = g.position.z,
          yaw = g.yaw;
        g.equip(1);
        const ammo = g.ammo[1];
        event(move, "pointerdown", 21, 80, 300);
        event(move, "pointermove", 21, 80, 240);
        event(look, "pointerdown", 22, 500, 200);
        event(look, "pointermove", 22, 530, 210);
        event(fire, "pointerdown", 23, 750, 300);
        for (let i = 0; i < 20; i++) {
          g.controls.poll(1 / 60, []);
          api.step(1);
        }
        assert(
          g.position.z < z - 0.5 && g.yaw !== yaw && g.ammo[1] < ammo,
          "Simultaneous touch failed",
        );
        for (const [i, n] of nodes.entries())
          event(n, "pointercancel", 21 + i, 0, 0);
        g.controls.poll(1 / 60, []);
        assert(
          !g.controls.primary && g.controls.moveY === 0,
          "Cancel left input held",
        );
        event(move, "pointerdown", 41, 80, 300);
        event(move, "pointermove", 41, 80, 240);
        g.setMode("paused");
        g.setMode("playing");
        event(move, "pointerdown", 42, 80, 300);
        event(move, "pointermove", 42, 100, 300);
        g.controls.poll(1 / 60, []);
        assert(
          g.controls.moveX > 0 && g.controls.moveY === 0,
          "Pause did not reset pointer ownership",
        );
      } finally {
        nodes.forEach((n, i) => {
          [n.setPointerCapture, n.hasPointerCapture, n.releasePointerCapture] =
            originals[i];
        });
        g.controls.clear();
      }
    },
  );
  check("authored church walls stop and pin bodies", () => {
    setup();
    const e = g.spawnEnemy("shambler", new V(10, 0, -26));
    e.model.animate(0.12, 2, false);
    g.hitEnemy(e, 999, "stake", new V(0, 0, -1), new V(10, 1.4, -26));
    for (let i = 0; i < 90; i++) g.physics.step(1 / 60);
    assert(g.corpses[0].ragdoll.pinned, "Missing architectural collision");
    assert(
      g.corpses[0].ragdoll.anchor.translation().z > -35,
      "Passed through church wall",
    );
  });
  check(
    "stakes pierce adjacent enemies within a single simulation step",
    () => {
      setup();
      g.equip(2);
      g.position.set(0, 1.75, 5);
      g.pitch = -0.1;
      g.yaw = 0;
      const targets = [3.5, 3.2].map((z) =>
        g.spawnEnemy("brute", new V(0, 0, z)),
      );
      targets.forEach((e) => (e.hp = 999));
      g.shoot();
      g.updateProjectiles(1 / 60);
      assert(
        targets.every((e) => e.hp < 999),
        "Stake skipped a nearby target",
      );
    },
  );
  check("projectiles cannot spawn through cover close to the muzzle", () => {
    setup();
    g.arena.colliders.push({ x: 0, z: 23.5, w: 4, d: 0.1, h: 4 });
    g.equip(3);
    g.yaw = 0;
    g.pitch = 0;
    g.shoot();
    assert(
      g.projectiles[0].mesh.position.z > 23.55,
      "Projectile spawned behind wall",
    );
    g.updateProjectiles(1 / 60);
    assert(g.projectiles.length === 0, "Rocket passed through cover");
  });
  g.controls.poll(1 / 60, []);
  g.applySettings(options);
  g.save = saved;
  g.persist();
  g.level = saved.level;
  g.room = 0;
  g.loadArena();
  g.setMode("menu");
  return results;
})();
