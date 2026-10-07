import { random } from "./random";
import * as T from "three";
import { softParticleTexture } from "./surface-effects";
/** Bounded transient effects; cosmetics never alter collision or damage. */
export class CombatEffects {
  private shellGeometry = new T.CylinderGeometry(0.018, 0.018, 0.075, 8);
  private shellMaterial = new T.MeshStandardMaterial({
    color: 0x9c7438,
    metalness: 0.75,
    roughness: 0.38,
  });
  private hullMaterial = new T.MeshStandardMaterial({
    color: 0x57261d,
    roughness: 0.78,
  });
  private capGeometry = new T.CylinderGeometry(0.019, 0.019, 0.019, 10);
  private smokeTexture = softParticleTexture();
  private smoke: {
    sprite: T.Sprite;
    velocity: T.Vector3;
    life: number;
    max: number;
    size: number;
    opacity: number;
  }[] = [];
  private shells: {
    mesh: T.Mesh;
    velocity: T.Vector3;
    spin: T.Vector3;
    life: number;
    bounces: number;
  }[] = [];
  private marks: { mesh: T.Mesh; life: number }[] = [];
  private markGeometry = new T.CircleGeometry(0.055, 12);
  private markMaterial = new T.MeshBasicMaterial({
    map: this.smokeTexture,
    color: 0x171714,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  constructor(private scene: T.Scene) {}
  eject(position: T.Vector3, rotation: T.Quaternion, shotgun: boolean) {
    if (this.shells.length >= 48) this.shells.shift()!.mesh.removeFromParent();
    const mesh = new T.Mesh(this.shellGeometry, this.shellMaterial);
    mesh.position.copy(position);
    mesh.quaternion.copy(rotation);
    if (shotgun) {
      mesh.material = this.hullMaterial;
      mesh.scale.set(1.45, 1.2, 1.45);
      const cap = new T.Mesh(this.capGeometry, this.shellMaterial);
      cap.position.y = -0.03;
      mesh.add(cap);
    }
    this.scene.add(mesh);
    this.shells.push({
      mesh,
      velocity: new T.Vector3(
        1.6 + random(),
        1.1 + random(),
        0.3,
      ).applyQuaternion(rotation),
      spin: new T.Vector3(8, 12, 6),
      life: 5,
      bounces: 0,
    });
  }
  impact(position: T.Vector3, normal: T.Vector3) {
    if (this.marks.length >= 60) {
      const old = this.marks.shift()!.mesh;
      old.removeFromParent();
      (old.material as T.Material).dispose();
    }
    const mesh = new T.Mesh(this.markGeometry, this.markMaterial.clone());
    mesh.position.copy(position).addScaledVector(normal, 0.008);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), normal);
    mesh.rotateZ(random() * 6.28);
    this.scene.add(mesh);
    this.marks.push({ mesh, life: 20 });
    for (let i = 0; i < 3; i++)
      this.puff(
        position.clone().addScaledVector(normal, 0.06),
        normal
          .clone()
          .multiplyScalar(0.4 + random() * 0.6)
          .add(
            new T.Vector3((random() - 0.5) * 0.4, 0.25, (random() - 0.5) * 0.4),
          ),
        0.7,
        0.16,
        0.38,
        0x9a8d77,
      );
  }
  muzzle(position: T.Vector3, direction: T.Vector3, heavy: boolean) {
    this.puff(
      position,
      direction
        .clone()
        .multiplyScalar(heavy ? 1.4 : 0.7)
        .add(new T.Vector3(0, 0.25, 0)),
      heavy ? 0.7 : 0.4,
      heavy ? 0.18 : 0.09,
      0.23,
      0x8d8980,
    );
  }
  explosion(position: T.Vector3, radius: number) {
    for (let i = 0; i < 7; i++) {
      const delta = new T.Vector3(
        (random() - 0.5) * 1.5,
        random(),
        (random() - 0.5) * 1.5,
      );
      this.puff(
        position.clone().addScaledVector(delta, 0.3),
        delta.multiplyScalar(2.5),
        0.3 + i * 0.035,
        radius * 0.22,
        0.85,
        i % 2 ? 0xff8525 : 0xffda83,
        true,
      );
    }
    for (let i = 0; i < 4; i++)
      this.puff(
        position.clone(),
        new T.Vector3((random() - 0.5) * 2, 1 + random(), (random() - 0.5) * 2),
        1.1,
        radius * 0.18,
        0.28,
        0x49453f,
      );
  }
  trail(position: T.Vector3) {
    this.puff(
      position.clone(),
      new T.Vector3(0, 0.25, 0),
      0.45,
      0.09,
      0.22,
      0xa9a293,
    );
  }
  private puff(
    position: T.Vector3,
    velocity: T.Vector3,
    life: number,
    size: number,
    opacity: number,
    color: number,
    luminous = false,
  ) {
    if (this.smoke.length >= 72) {
      const old = this.smoke.shift()!.sprite;
      old.removeFromParent();
      old.material.dispose();
    }
    const sprite = new T.Sprite(
      new T.SpriteMaterial({
        map: this.smokeTexture,
        color,
        transparent: true,
        alphaTest: 0.01,
        opacity,
        depthWrite: false,
        rotation: random() * 6.28,
        blending: luminous ? T.AdditiveBlending : T.NormalBlending,
        toneMapped: !luminous,
      }),
    );
    sprite.position.copy(position);
    sprite.layers.set(1);
    sprite.scale.setScalar(size);
    this.scene.add(sprite);
    this.smoke.push({ sprite, velocity, life, max: life, size, opacity });
  }
  update(dt: number) {
    for (const p of this.smoke) {
      p.life -= dt;
      p.sprite.position.addScaledVector(p.velocity, dt);
      p.velocity.multiplyScalar(Math.exp(-dt * 2));
      p.velocity.y += dt * 0.12;
      const age = 1 - p.life / p.max;
      p.sprite.scale.setScalar(p.size * (1 + age * 5));
      p.sprite.material.opacity =
        p.opacity * Math.max(0, 1 - age) * Math.min(1, age * 12);
      if (p.life <= 0) {
        p.sprite.removeFromParent();
        p.sprite.material.dispose();
      }
    }
    this.smoke = this.smoke.filter((p) => p.life > 0);
    for (const s of this.shells) {
      s.life -= dt;
      s.velocity.y -= 9.8 * dt;
      s.mesh.position.addScaledVector(s.velocity, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      if (s.mesh.position.y < 0.025) {
        s.mesh.position.y = 0.025;
        s.velocity.y = Math.abs(s.velocity.y) * 0.28;
        s.velocity.x *= 0.55;
        s.velocity.z *= 0.55;
        s.spin.multiplyScalar(0.4);
        if (++s.bounces > 3) {
          s.velocity.set(0, 0, 0);
          s.spin.set(0, 0, 0);
        }
      }
      if (s.life <= 0) s.mesh.removeFromParent();
    }
    this.shells = this.shells.filter((s) => s.life > 0);
    for (const m of this.marks) {
      m.life -= dt;
      (m.mesh.material as T.MeshBasicMaterial).opacity =
        0.68 * Math.min(1, Math.max(0, m.life) / 3);
      if (m.life <= 0) {
        m.mesh.removeFromParent();
        (m.mesh.material as T.Material).dispose();
      }
    }
    this.marks = this.marks.filter((m) => m.life > 0);
  }
  /** One untracked object per material variant, for shader warm-up. */
  samples(): T.Object3D[] {
    const shell = new T.Mesh(this.shellGeometry, this.shellMaterial);
    const hull = new T.Mesh(this.shellGeometry, this.hullMaterial);
    hull.add(new T.Mesh(this.capGeometry, this.shellMaterial));
    const mark = new T.Mesh(this.markGeometry, this.markMaterial);
    const sprites = [false, true].map((luminous) => {
      const sprite = new T.Sprite(
        new T.SpriteMaterial({
          map: this.smokeTexture,
          transparent: true,
          alphaTest: 0.01,
          depthWrite: false,
          blending: luminous ? T.AdditiveBlending : T.NormalBlending,
          toneMapped: !luminous,
        }),
      );
      sprite.layers.set(1);
      return sprite;
    });
    return [shell, hull, mark, ...sprites];
  }
  clear() {
    for (const s of this.shells) s.mesh.removeFromParent();
    for (const m of this.marks) {
      m.mesh.removeFromParent();
      (m.mesh.material as T.Material).dispose();
    }
    for (const p of this.smoke) {
      p.sprite.removeFromParent();
      p.sprite.material.dispose();
    }
    this.smoke = [];
    this.shells = [];
    this.marks = [];
  }
}
