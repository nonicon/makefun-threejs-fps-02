// effects.js — pooled, zero-allocation visuals. No geometry or material is
// created per call: tracers, muzzle quads and particle systems are allocated
// once here and recycled. Dead particles sit at y = -100.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const MUZZLE_COUNT = 8;
const SYSTEM_COUNT = 3;
const PARTICLES_PER_SYSTEM = 120;
const TRACER_LIFE = 0.07;
const MUZZLE_LIFE = 0.05;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

export function createEffects(scene) {
  // Scratch vectors — reused everywhere so step() never allocates.
  const _mid = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _pos = new THREE.Vector3();
  const _vel = new THREE.Vector3();

  // ---- Tracers: pool of stretched thin boxes, additive, depthWrite off. ----
  const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(tracerGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIdx = 0;

  // ---- Muzzle flash: pool of quads, additive, random roll, ~50 ms fade. ----
  const muzzleGeo = new THREE.PlaneGeometry(0.22, 0.22);
  const muzzles = [];
  for (let i = 0; i < MUZZLE_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.accent, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(muzzleGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    muzzles.push({ mesh, life: 0 });
  }
  let muzzleIdx = 0;

  // ---- Particles: 3 THREE.Points systems x 120, cycling slots. ----
  const systems = [];
  for (let s = 0; s < SYSTEM_COUNT; s++) {
    const positions = new Float32Array(PARTICLES_PER_SYSTEM * 3);
    const colors = new Float32Array(PARTICLES_PER_SYSTEM * 3);
    const velocities = new Float32Array(PARTICLES_PER_SYSTEM * 3);
    const life = new Float32Array(PARTICLES_PER_SYSTEM);
    const maxLife = new Float32Array(PARTICLES_PER_SYSTEM);
    for (let i = 0; i < PARTICLES_PER_SYSTEM; i++) positions[i * 3 + 1] = -100;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.07, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.visible = true;
    points.frustumCulled = false;
    scene.add(points);
    systems.push({ geo, positions, colors, velocities, life, maxLife, slot: 0 });
  }
  let systemIdx = 0;

  function spawn(sys, px, py, pz, nx, ny, nz, r, g, b, count, speed, spread) {
    for (let k = 0; k < count; k++) {
      const i = sys.slot;
      sys.slot = (sys.slot + 1) % PARTICLES_PER_SYSTEM;
      const i3 = i * 3;
      sys.positions[i3] = px;
      sys.positions[i3 + 1] = py;
      sys.positions[i3 + 2] = pz;
      // Velocity outward along the normal + random spread.
      _vel.set(
        nx + (Math.random() * 2 - 1) * spread,
        ny + (Math.random() * 2 - 1) * spread,
        nz + (Math.random() * 2 - 1) * spread,
      ).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      sys.velocities[i3] = _vel.x;
      sys.velocities[i3 + 1] = _vel.y;
      sys.velocities[i3 + 2] = _vel.z;
      sys.colors[i3] = r;
      sys.colors[i3 + 1] = g;
      sys.colors[i3 + 2] = b;
      sys.maxLife[i] = 0.25 + Math.random() * 0.35;
      sys.life[i] = sys.maxLife[i];
    }
    sys.geo.attributes.position.needsUpdate = true;
    sys.geo.attributes.color.needsUpdate = true;
  }

  // ---- Explosion: one expanding sphere + one PointLight flash. ----
  const boomGeo = new THREE.SphereGeometry(1, 16, 12);
  const boomMat = new THREE.MeshBasicMaterial({
    color: PALETTE.ember, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const boom = new THREE.Mesh(boomGeo, boomMat);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(PALETTE.accent, 0, 22, 1.6);
  boomLight.visible = false;
  scene.add(boomLight);
  let boomLife = 0;
  const BOOM_LIFE = 0.5;

  const KIND_COLORS = {
    wall: PALETTE.ink,   // pale sparks
    flesh: PALETTE.ember, // ember-red
    metal: PALETTE.gold,  // bright white-yellow
  };

  return {
    tracer(from, to, colorHex) {
      const t = tracers[tracerIdx];
      tracerIdx = (tracerIdx + 1) % TRACER_COUNT;
      _mid.addVectors(from, to).multiplyScalar(0.5);
      _to.copy(to).sub(from);
      const len = Math.max(_to.length(), 0.01);
      t.mesh.position.copy(_mid);
      t.mesh.lookAt(to);
      t.mesh.scale.set(1, 1, len);
      t.mesh.material.color.set(colorHex);
      t.mesh.material.opacity = 0.9;
      t.mesh.visible = true;
      t.life = TRACER_LIFE;
    },

    impact(point, normal, kind) {
      const rgb = hexToRgb(KIND_COLORS[kind] || PALETTE.ink);
      const sys = systems[systemIdx];
      systemIdx = (systemIdx + 1) % SYSTEM_COUNT;
      spawn(sys, point.x, point.y, point.z,
        normal.x, normal.y, normal.z,
        rgb[0], rgb[1], rgb[2], 14, 4.5, 0.9);
    },

    muzzle(position, direction) {
      const m = muzzles[muzzleIdx];
      muzzleIdx = (muzzleIdx + 1) % MUZZLE_COUNT;
      m.mesh.position.copy(position);
      _to.copy(position).add(direction);
      m.mesh.lookAt(_to);
      m.mesh.rotateZ(Math.random() * Math.PI * 2);
      m.mesh.material.opacity = 1;
      m.mesh.visible = true;
      m.life = MUZZLE_LIFE;
    },

    explode(position) {
      boom.position.copy(position);
      boom.scale.setScalar(0.2);
      boomMat.opacity = 0.75;
      boom.visible = true;
      boomLight.position.copy(position);
      boomLight.intensity = 60;
      boomLight.visible = true;
      boomLife = BOOM_LIFE;
      // Large burst from the shared pool.
      const rgb = hexToRgb(PALETTE.ember);
      const sys = systems[systemIdx];
      systemIdx = (systemIdx + 1) % SYSTEM_COUNT;
      spawn(sys, position.x, position.y, position.z, 0, 1, 0,
        rgb[0], rgb[1], rgb[2], 60, 8, 1.4);
    },

    burst(position, colorHex, count, speed) {
      const rgb = hexToRgb(colorHex);
      const sys = systems[systemIdx];
      systemIdx = (systemIdx + 1) % SYSTEM_COUNT;
      spawn(sys, position.x, position.y, position.z, 0, 1, 0,
        rgb[0], rgb[1], rgb[2], count, speed, 1.2);
    },

    step(dt) {
      for (let i = 0; i < TRACER_COUNT; i++) {
        const t = tracers[i];
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) { t.mesh.visible = false; t.mesh.material.opacity = 0; }
        else t.mesh.material.opacity = 0.9 * (t.life / TRACER_LIFE);
      }
      for (let i = 0; i < MUZZLE_COUNT; i++) {
        const m = muzzles[i];
        if (m.life <= 0) continue;
        m.life -= dt;
        if (m.life <= 0) { m.mesh.visible = false; m.mesh.material.opacity = 0; }
        else m.mesh.material.opacity = m.life / MUZZLE_LIFE;
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const f = Math.max(boomLife, 0) / BOOM_LIFE;
        boom.scale.setScalar(0.2 + (1 - f) * 5.5);
        boomMat.opacity = 0.75 * f;
        boomLight.intensity = 60 * f;
        if (boomLife <= 0) {
          boom.visible = false;
          boomLight.visible = false;
          boomLight.intensity = 0;
        }
      }
      for (let s = 0; s < SYSTEM_COUNT; s++) {
        const sys = systems[s];
        let anyAlive = false;
        for (let i = 0; i < PARTICLES_PER_SYSTEM; i++) {
          if (sys.life[i] <= 0) continue;
          anyAlive = true;
          sys.life[i] -= dt;
          const i3 = i * 3;
          if (sys.life[i] <= 0) {
            sys.positions[i3 + 1] = -100;
            sys.velocities[i3] = 0;
            sys.velocities[i3 + 1] = 0;
            sys.velocities[i3 + 2] = 0;
            continue;
          }
          sys.velocities[i3 + 1] -= 6 * dt; // light gravity
          sys.positions[i3] += sys.velocities[i3] * dt;
          sys.positions[i3 + 1] += sys.velocities[i3 + 1] * dt;
          sys.positions[i3 + 2] += sys.velocities[i3 + 2] * dt;
        }
        if (anyAlive) sys.geo.attributes.position.needsUpdate = true;
      }
    },

    reset() {
      for (let i = 0; i < TRACER_COUNT; i++) {
        tracers[i].life = 0;
        tracers[i].mesh.visible = false;
        tracers[i].mesh.material.opacity = 0;
      }
      for (let i = 0; i < MUZZLE_COUNT; i++) {
        muzzles[i].life = 0;
        muzzles[i].mesh.visible = false;
        muzzles[i].mesh.material.opacity = 0;
      }
      for (let s = 0; s < SYSTEM_COUNT; s++) {
        const sys = systems[s];
        sys.slot = 0;
        for (let i = 0; i < PARTICLES_PER_SYSTEM; i++) {
          sys.life[i] = 0;
          sys.maxLife[i] = 0;
          sys.positions[i * 3 + 1] = -100;
          sys.velocities[i * 3] = 0;
          sys.velocities[i * 3 + 1] = 0;
          sys.velocities[i * 3 + 2] = 0;
        }
        sys.geo.attributes.position.needsUpdate = true;
      }
      boomLife = 0;
      boom.visible = false;
      boomMat.opacity = 0;
      boomLight.visible = false;
      boomLight.intensity = 0;
    },
  };
}
