(() => {
  const g = __PURGATORY__.game,
    V = g.position.constructor,
    B = g.box3.constructor,
    save = structuredClone(g.save),
    options = g.settings(),
    results = [];
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
  const key = (code, repeat = false) => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { code, bubbles: true, repeat }),
    );
    document.body.dispatchEvent(
      new KeyboardEvent("keyup", { code, bubbles: true }),
    );
  };
  g.start(0, 0, false);
  g.clearDynamic();
  g.waveDelay = 9999;
  check("R/V cycle once per press, wrap, and do not repeat while held", () => {
    g.equip(4);
    key("KeyR");
    assert(g.weapon === 0, "No wrap");
    key("KeyR", true);
    assert(g.weapon === 0, "Held key repeated");
    key("KeyV");
    assert(g.weapon === 4, "Previous failed");
  });
  check(
    "HUD selector chooses weapons directly and via next/previous buttons",
    () => {
      document
        .querySelector('[data-action="equip-weapon"][data-value="1"]')
        .click();
      assert(g.weapon === 1, "Direct selection failed");
      document
        .querySelector('[data-action="cycle-weapon"][data-value="1"]')
        .click();
      assert(g.weapon === 2, "Next button failed");
      document
        .querySelector('[data-action="cycle-weapon"][data-value="-1"]')
        .click();
      assert(g.weapon === 1, "Previous button failed");
    },
  );
  check("a wheel event burst changes only one weapon", () => {
    g.equip(1);
    for (let i = 0; i < 30; i++)
      g.canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 100,
          bubbles: true,
          cancelable: true,
        }),
      );
    assert(g.weapon === 2, "Wheel overshot");
  });
  check(
    "all humanoids use animated skeletons; armor follows bones at actor scale",
    () => {
      for (const type of [
        "shambler",
        "skeleton",
        "monk",
        "witch",
        "knight",
        "brute",
        "boss",
      ]) {
        const e = g.spawnEnemy(type, new V(0, 0, 0));
        e.model.animate(0.15, 3, false);
        const bone = e.model.root.getObjectByName("CityDeadOutfitLeftArm");
        assert(bone?.isBone, "No full rig " + type);
        const before = bone.quaternion.clone();
        e.model.action("attack");
        e.model.animate(0.36, 0, false);
        assert(before.angleTo(bone.quaternion) > 0.01, "Static attack " + type);
        if (!["shambler", "skeleton"].includes(type)) {
          const pieces = [];
          e.model.root.traverse((o) => {
            if (o.userData.archetype === type) pieces.push(o);
          });
          assert(pieces.length > 3, "Missing clothing " + type);
          const size = new B().setFromObject(pieces[0]).getSize(new V());
          assert(
            size.length() > 0.08 && size.length() < 5,
            "Wrong attachment units " + type,
          );
        }
      }
    },
  );
  check(
    "Medium/High smooth the world and weapons; Low bypasses postprocessing",
    () => {
      for (const quality of [0, 1, 2]) {
        g.applySettings({ ...options, quality, adaptiveResolution: false });
        g.renderWorld();
        assert(g.ao.enabled === (quality === 2), "Wrong AO preset");
        if (quality > 0)
          assert(
            g.weaponPass.enabled && g.aa.enabled,
            "Missing composed weapon/AA pass",
          );
      }
    },
  );
  check("larger rigged bosses produce finite articulated physics", () => {
    const e = g.enemies.find((e) => e.type === "boss");
    g.hitEnemy(e, 99999, "explosion", new V(0, 0, -1));
    const r = g.corpses.at(-1).ragdoll;
    for (let i = 0; i < 30; i++) g.physics.step(1 / 60);
    assert(
      r.bodies.length === 11 &&
        r.bodies.every((b) => Number.isFinite(b.translation().y)),
      "Invalid boss physics",
    );
  });
  check("retiring animated enemies releases their GPU bone textures", () => {
    g.clearDynamic();
    g.camera.position.set(0, 1.75, 24);
    g.camera.rotation.set(0, 0, 0);
    for (let i = 0; i < 10; i++)
      g.spawnEnemy("skeleton", new V((i - 5) * 1.1, 0, 15));
    g.renderer.render(g.scene, g.camera);
    const during = g.renderer.info.memory.textures;
    g.clearDynamic();
    g.renderer.render(g.scene, g.camera);
    assert(
      g.renderer.info.memory.textures <= during - 10,
      "Bone textures leaked",
    );
  });
  g.applySettings(options);
  g.save = save;
  g.persist();
  g.loadArena();
  g.setMode("menu");
  return results;
})();
