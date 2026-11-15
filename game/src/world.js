// AMBER YARD: an original dusk industrial yard, 52 x 40 m. Two bomb sites
// (A east, B west), three lanes (A-long, mid, B-short), a watchtower over mid
// and container stacks for cover. Everything is boxes, cylinders and canvas
// signs; every solid is a collider for players and bots and a surface a
// bullet stops on. The nav graph at the bottom is what the bots walk.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const YARD_X = 26; // half-width, east-west
const YARD_Z = 20; // half-depth, north-south
const WALL_H = 4.6;

function signTexture(letter, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(6, 6, 116, 116);
  g.fillStyle = fg;
  g.font = 'bold 82px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const C = (hex) => new THREE.Color(hex);
  const mat = {
    concrete: new THREE.MeshStandardMaterial({ color: C(PALETTE.surface), roughness: 0.95, metalness: 0.02 }),
    floor: new THREE.MeshStandardMaterial({ color: C(PALETTE.surface).multiplyScalar(1.05), roughness: 0.96, metalness: 0.02 }),
    steel: new THREE.MeshStandardMaterial({ color: C(PALETTE.hairline), roughness: 0.6, metalness: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ color: C(PALETTE.canvas), roughness: 0.9, metalness: 0.1 }),
    crate: new THREE.MeshStandardMaterial({ color: C(PALETTE.accent).multiplyScalar(0.42), roughness: 0.9, metalness: 0.02 }),
    containerBlue: new THREE.MeshStandardMaterial({ color: C(PALETTE.cobalt).multiplyScalar(0.5), roughness: 0.65, metalness: 0.4 }),
    containerRust: new THREE.MeshStandardMaterial({ color: C(PALETTE.ember).multiplyScalar(0.55), roughness: 0.7, metalness: 0.35 }),
    sand: new THREE.MeshStandardMaterial({ color: C(PALETTE.ink).multiplyScalar(0.42), roughness: 1, metalness: 0 }),
    amber: new THREE.MeshStandardMaterial({ color: C(PALETTE.accent), roughness: 0.5, metalness: 0.1, emissive: C(PALETTE.accent), emissiveIntensity: 0.7 }),
    lampA: new THREE.MeshStandardMaterial({ color: C(PALETTE.accent), emissive: C(PALETTE.accent), emissiveIntensity: 2.2 }),
    lampB: new THREE.MeshStandardMaterial({ color: C(PALETTE.accent), emissive: C(PALETTE.accent), emissiveIntensity: 2.2 }),
  };

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cyl(rTop, rBottom, h, x, y, z, material, segments = 12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // --- ground and perimeter ---
  box(YARD_X * 2 + 0.8, 0.4, YARD_Z * 2 + 0.8, 0, -0.2, 0, mat.floor);
  box(0.5, WALL_H, YARD_Z * 2 + 0.8, -YARD_X - 0.25, WALL_H / 2, 0, mat.concrete);
  box(0.5, WALL_H, YARD_Z * 2 + 0.8, YARD_X + 0.25, WALL_H / 2, 0, mat.concrete);
  box(YARD_X * 2 + 0.8, WALL_H, 0.5, 0, WALL_H / 2, -YARD_Z - 0.25, mat.concrete);
  box(YARD_X * 2 + 0.8, WALL_H, 0.5, 0, WALL_H / 2, YARD_Z + 0.25, mat.concrete);

  // Painted lane guides on the floor (flat, no collision).
  box(0.5, 0.02, 30, 0, 0.01, 0, mat.amber, false);
  box(0.5, 0.02, 14, 21.5, 0.01, 6, mat.amber, false);
  box(0.5, 0.02, 14, -21.5, 0.01, 6, mat.amber, false);

  // --- mid: crates, watchtower, sandbags ---
  box(2.2, 1.1, 2.2, 0, 0.55, 0, mat.crate);
  box(1.1, 1.1, 1.1, 0.6, 1.65, -0.3, mat.crate);
  box(1.1, 1.1, 1.1, -3.4, 0.55, 2.4, mat.crate);
  box(1.1, 1.1, 1.1, 3.4, 0.55, -2.4, mat.crate);
  box(2.4, 0.9, 1.2, -2.2, 0.45, 8.5, mat.sand);
  box(2.4, 0.9, 1.2, 2.2, 0.45, 8.5, mat.sand);
  // Watchtower over mid-north: four legs, a platform, a rail.
  for (const [lx, lz] of [[-7.4, -3.4], [-5.4, -3.4], [-7.4, -1.4], [-5.4, -1.4]]) {
    box(0.24, 3.1, 0.24, lx, 1.55, lz, mat.steel);
  }
  box(2.6, 0.22, 2.6, -6.4, 3.2, -2.4, mat.steel);
  box(2.6, 0.7, 0.12, -6.4, 3.65, -3.64, mat.steel);
  box(0.12, 0.7, 2.6, -7.64, 3.65, -2.4, mat.steel);
  box(0.12, 0.7, 2.6, -5.16, 3.65, -2.4, mat.steel);

  // --- A-long (east lane) cover ---
  box(1.2, 1.1, 1.2, 21.5, 0.55, 6, mat.crate);
  box(1.2, 2.2, 1.2, 22.5, 1.1, 1.5, mat.crate);
  box(2.4, 0.9, 1.2, 18, 0.45, 10, mat.sand);
  // --- B-short (west lane) cover ---
  box(1.2, 1.1, 1.2, -21.5, 0.55, 6, mat.crate);
  box(1.2, 2.2, 1.2, -22.5, 1.1, 1.5, mat.crate);
  box(2.4, 0.9, 1.2, -18, 0.45, 10, mat.sand);

  // --- containers mid-north, splitting the two sites' approaches ---
  box(6, 2.6, 2.6, 11, 1.3, -14, mat.containerBlue);
  box(6, 2.6, 2.6, 11, 3.9, -14, mat.containerRust);
  box(6, 2.6, 2.6, -11, 1.3, -14, mat.containerRust);
  box(2.6, 2.6, 2.6, 4, 1.3, -15, mat.containerBlue);

  // --- site A (east): walled compound, entrance south and west ---
  box(0.4, 3.4, 12, 24.5, 1.7, -8, mat.concrete); // east inner wall
  box(10.4, 3.4, 0.4, 19.5, 1.7, -14.2, mat.concrete); // north inner wall
  box(0.4, 3.4, 5, 14.3, 1.7, -11.7, mat.concrete); // west wall, gap at south
  box(5.4, 3.4, 0.4, 17, 1.7, -2.2, mat.concrete); // south wall, gap at east
  box(1.2, 1.1, 1.2, 22, 0.55, -11, mat.crate);
  box(1.2, 1.1, 1.2, 16.5, 0.55, -5, mat.crate);
  cyl(0.55, 0.55, 1.1, 20.5, 0.55, -12.5, mat.containerRust);
  cyl(0.55, 0.55, 1.1, 21.8, 0.55, -12.5, mat.containerRust);
  // --- site B (west): mirrored compound ---
  box(0.4, 3.4, 12, -24.5, 1.7, -8, mat.concrete);
  box(10.4, 3.4, 0.4, -19.5, 1.7, -14.2, mat.concrete);
  box(0.4, 3.4, 5, -14.3, 1.7, -11.7, mat.concrete);
  box(5.4, 3.4, 0.4, -17, 1.7, -2.2, mat.concrete);
  box(1.2, 1.1, 1.2, -22, 0.55, -11, mat.crate);
  box(1.2, 1.1, 1.2, -16.5, 0.55, -5, mat.crate);
  cyl(0.55, 0.55, 1.1, -20.5, 0.55, -12.5, mat.containerBlue);
  cyl(0.55, 0.55, 1.1, -21.8, 0.55, -12.5, mat.containerBlue);

  // --- floodlight poles ---
  for (const [px, pz] of [[-20, 14], [20, 14], [-20, -16], [20, -16]]) {
    cyl(0.09, 0.12, 6.4, px, 3.2, pz, mat.steel, 8);
    box(0.7, 0.22, 0.5, px, 6.5, pz, mat.lampA);
  }

  // --- site markers: glowing floor frames + wall signs ---
  function siteMarker(cx, cz, letter, lampMat) {
    const y = 0.03;
    box(5, 0.04, 0.35, cx, y, cz - 2.5, lampMat, false);
    box(5, 0.04, 0.35, cx, y, cz + 2.5, lampMat, false);
    box(0.35, 0.04, 5, cx - 2.5, y, cz, lampMat, false);
    box(0.35, 0.04, 5, cx + 2.5, y, cz, lampMat, false);
    const tex = signTexture(letter, '#14161a', '#f0a830');
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: false }),
    );
    sign.position.set(cx, 3.1, cz - 2.9);
    sign.rotation.y = 0; // faces south, toward the site's approaches
    group.add(sign);
  }
  siteMarker(19.5, -8.5, 'A', mat.lampA);
  siteMarker(-19.5, -8.5, 'B', mat.lampB);

  // --- dusk skyline silhouettes outside the walls ---
  const skyline = new THREE.Group();
  const skyMat = new THREE.MeshBasicMaterial({ color: C(PALETTE.canvas).multiplyScalar(0.55) });
  const skySeed = [38, -44, 52, -36, 46, -58, 34, -50, 60, -42];
  for (let i = 0; i < 10; i += 1) {
    const w = 8 + (i % 3) * 4;
    const h = 9 + ((i * 7) % 11);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), skyMat);
    const angle = (i / 10) * Math.PI * 2;
    m.position.set(Math.cos(angle) * skySeed[i % 10] * 0.9, h / 2 - 0.5, Math.sin(angle) * 42);
    skyline.add(m);
  }
  scene.add(skyline);
  // Low amber sun disc, west.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(6, 32),
    new THREE.MeshBasicMaterial({ color: C(PALETTE.accent), fog: false }),
  );
  sun.position.set(-58, 13, -30);
  sun.lookAt(0, 2, 0);
  scene.add(sun);

  // --- light: low amber key sun, cool hemisphere, two site floods ---
  const sky = new THREE.HemisphereLight(C('#3d5178'), C('#241d18'), 1.5);
  scene.add(sky);
  const key = new THREE.DirectionalLight(C(PALETTE.accent), 2.7);
  key.position.set(-24, 15, -14);
  key.target.position.set(4, 0, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -32;
  key.shadow.camera.right = 32;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 80;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(C(PALETTE.muted), 1.0);
  fill.position.set(18, 12, 16);
  scene.add(fill);
  const floodA = new THREE.PointLight(C(PALETTE.accent), 30, 20, 1.8);
  floodA.position.set(19.5, 5.5, -8.5);
  scene.add(floodA);
  const floodB = new THREE.PointLight(C(PALETTE.accent), 30, 20, 1.8);
  floodB.position.set(-19.5, 5.5, -8.5);
  scene.add(floodB);

  // --- drifting dust, for depth in the light ---
  const dustCount = 220;
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount * 2);
  for (let i = 0; i < dustCount; i += 1) {
    dustPos[i * 3] = (Math.random() * 2 - 1) * YARD_X;
    dustPos[i * 3 + 1] = Math.random() * 5 + 0.3;
    dustPos[i * 3 + 2] = (Math.random() * 2 - 1) * YARD_Z;
    dustSeed[i * 2] = Math.random() * 0.35 + 0.08;
    dustSeed[i * 2 + 1] = Math.random() * Math.PI * 2;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: C(PALETTE.accent), size: 0.05, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  scene.add(dust);

  // --- nav graph: waypoints the bots walk (x, z, links) ---
  const nodes = [
    { x: 0, z: 16, links: [1, 2, 3] }, // 0 cobalt spawn
    { x: 4, z: 16, links: [0, 4] }, // 1 cobalt spawn east
    { x: -4, z: 16, links: [0, 5] }, // 2 cobalt spawn west
    { x: 0, z: 8, links: [0, 4, 5, 6] }, // 3 cobalt mid
    { x: 10, z: 12, links: [1, 3, 7] }, // 4 to A-long
    { x: -10, z: 12, links: [2, 3, 8] }, // 5 to B-short
    { x: 0, z: 0, links: [3, 7, 8, 9] }, // 6 mid crates
    { x: 10, z: 0, links: [4, 6, 11] }, // 7 mid-east
    { x: -10, z: 0, links: [5, 6, 12] }, // 8 mid-west
    { x: 0, z: -8, links: [6, 10, 13, 14] }, // 9 mid-north
    { x: 8, z: -8, links: [9, 11, 15] }, // 10 to A
    { x: 16, z: -4, links: [7, 10, 16] }, // 11 A approach
    { x: -8, z: -8, links: [9, 12, 17] }, // 12 to B
    { x: -16, z: -4, links: [8, 12, 18] }, // 13 B approach
    { x: 0, z: -14, links: [9, 15, 17] }, // 14 north connector
    { x: 19.5, z: -8.5, links: [11, 16, 14] }, // 15 SITE A
    { x: 21, z: 2, links: [11, 15] }, // 16 A-long south
    { x: -19.5, z: -8.5, links: [13, 18, 14] }, // 17 SITE B
    { x: -21, z: 2, links: [13, 17] }, // 18 B-short south
    { x: 6, z: -12, links: [9, 14] }, // 19 mid-north hold
    { x: -6, z: -12, links: [9, 14] }, // 20 mid-north hold west
    { x: 21, z: 10, links: [4, 16] }, // 21 A-long mid
    { x: -21, z: 10, links: [5, 18] }, // 22 B-short mid
    { x: 0, z: -16, links: [14, 23, 24] }, // 23 ember spawn
    { x: 4, z: -16, links: [23, 14] }, // 24 ember spawn east
    { x: -4, z: -16, links: [23, 14] }, // 25 ember spawn west
  ];

  const sites = {
    A: { center: new THREE.Vector3(19.5, 0, -8.5), radius: 3.4, node: 15 },
    B: { center: new THREE.Vector3(-19.5, 0, -8.5), radius: 3.4, node: 17 },
  };
  const spawns = {
    cobalt: [
      new THREE.Vector3(0, 0, 16),
      new THREE.Vector3(4, 0, 16),
      new THREE.Vector3(-4, 0, 16),
      new THREE.Vector3(2, 0, 17.5),
      new THREE.Vector3(-2, 0, 17.5),
    ],
    ember: [
      new THREE.Vector3(0, 0, -16),
      new THREE.Vector3(4, 0, -16),
      new THREE.Vector3(-4, 0, -16),
      new THREE.Vector3(2, 0, -17.5),
      new THREE.Vector3(-2, 0, -17.5),
    ],
  };

  return {
    colliders,
    shootables,
    nodes,
    sites,
    spawns,
    group,
    // Dust drift + lamp breathing; purely visual, no gameplay state.
    update(dt, time) {
      const pos = dustGeo.attributes.position;
      for (let i = 0; i < dustCount; i += 1) {
        const s = dustSeed[i * 2];
        const p = dustSeed[i * 2 + 1] + time * 0.05;
        pos.array[i * 3] += Math.cos(p) * s * dt;
        pos.array[i * 3 + 1] += Math.sin(time * 0.3 + i) * 0.008;
        if (pos.array[i * 3] > YARD_X) pos.array[i * 3] = -YARD_X;
        if (pos.array[i * 3] < -YARD_X) pos.array[i * 3] = YARD_X;
      }
      pos.needsUpdate = true;
      const pulse = 1.9 + Math.sin(time * 2.1) * 0.35;
      mat.lampA.emissiveIntensity = pulse;
      mat.lampB.emissiveIntensity = pulse;
    },
  };
}
