(() => {
  const g = window.__PURGATORY__.game,
    V = g.position.constructor,
    saved = structuredClone(g.save),
    options = g.settings(),
    results = [];
  g.start(0, 0, false);
  g.clearDynamic();
  g.waveDelay = 9999;
  g.mode = "paused";
  g.position.set(0, 1.75, 24);
  g.camera.position.copy(g.position);
  g.camera.rotation.set(0, 0, 0);
  g.equip(1);
  for (let i = 0; i < 24; i++)
    g.spawnEnemy(
      i % 2 ? "skeleton" : "shambler",
      new V(((i % 8) - 3.5) * 2, 0, 8 - Math.floor(i / 8) * 5),
    );
  const renderer = g.renderer,
    gl = renderer.getContext(),
    ext = gl.getExtension("WEBGL_debug_renderer_info");
  for (const quality of [2, 1, 0]) {
    g.applySettings({
      ...options,
      quality,
      renderScale: 1,
      adaptiveResolution: false,
    });
    g.camera.fov = 78;
    g.camera.updateProjectionMatrix();
    const samples = [];
    for (let i = 0; i < 38; i++) {
      renderer.autoClear = true;
      renderer.shadowMap.needsUpdate = true;
      renderer.info.reset();
      const t = performance.now();
      g.renderWorld(1 / 60);
      if (quality === 0) {
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(g.weaponScene, g.weaponCamera);
      }
      gl.finish();
      if (i >= 8) samples.push(performance.now() - t);
    }
    samples.sort((a, b) => a - b);
    results.push({
      quality,
      medianMs: samples[15],
      p90Ms: samples[27],
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
    });
  }
  g.mode = "playing";
  g.invulnerable = 999;
  for (let i = 0; i < 8; i++) {
    const e = g.spawnEnemy("shambler", new V((i - 4) * 2, 0, 17));
    g.hitEnemy(e, 999, "explosion", new V(0, 1, -1).normalize());
  }
  const updates = [];
  for (let i = 0; i < 180; i++) {
    const t = performance.now();
    g.update(1 / 60);
    if (i >= 30) updates.push(performance.now() - t);
  }
  updates.sort((a, b) => a - b);
  const simulation = {
    actors: 24,
    ragdolls: 8,
    medianMs: updates[75],
    p90Ms: updates[135],
  };
  const output = {
    viewport: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
    gpu: ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER),
    render: results,
    simulation,
  };
  g.applySettings(options);
  g.save = saved;
  g.persist();
  g.loadArena();
  g.setMode("menu");
  return output;
})();
