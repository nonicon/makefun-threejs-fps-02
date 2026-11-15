// The one physics helper every moving body shares: an axis-aligned box pushed
// through the world's colliders one axis at a time, so a wall never swallows a
// body and nobody needs their own copy of the resolve. Bodies are plain objects
// with position (Vector3, feet), velocity (Vector3), height and radius.
import * as THREE from 'three';

const probe = new THREE.Box3();

function overlaps(colliders, x, y, z, radius, height, lift) {
  probe.min.set(x - radius, y + lift, z - radius);
  probe.max.set(x + radius, y + height - lift, z + radius);
  for (let i = 0; i < colliders.length; i += 1) {
    if (probe.intersectsBox(colliders[i])) return colliders[i];
  }
  return null;
}

// Moves `body` for one step. Gravity and jumping belong to the caller; this
// only integrates velocity and resolves the world. Returns true when the body
// is standing on something. `lift` keeps feet and crown out of the horizontal
// tests, so standing on the floor is not read as walking into a wall.
export function moveBody(body, colliders, dt) {
  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlaps(colliders, nextX, body.position.y, body.position.z, body.radius, body.height, 0.04)) {
    body.position.x = nextX;
  } else {
    body.velocity.x = 0;
  }
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlaps(colliders, body.position.x, body.position.y, nextZ, body.radius, body.height, 0.04)) {
    body.position.z = nextZ;
  } else {
    body.velocity.z = 0;
  }
  body.position.y += body.velocity.y * dt;
  let onGround = false;
  const hit = overlaps(colliders, body.position.x, body.position.y, body.position.z, body.radius, body.height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    onGround = true;
  }
  body.velocity.y = Math.max(-30, body.velocity.y);
  return onGround;
}

// Line of sight between two points, blocked by any collider. Steps along the
// segment in 0.5 m hops and tests a point-sized probe; cheap enough for a few
// bot checks per tick and far cheaper than a raycast against every mesh.
const losProbe = new THREE.Box3();
export function hasLineOfSight(colliders, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dy, dz);
  const steps = Math.max(1, Math.ceil(dist / 0.5));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    const z = from.z + dz * t;
    losProbe.min.set(x - 0.05, y - 0.05, z - 0.05);
    losProbe.max.set(x + 0.05, y + 0.05, z + 0.05);
    for (let c = 0; c < colliders.length; c += 1) {
      if (losProbe.intersectsBox(colliders[c])) return false;
    }
  }
  return true;
}

// Horizontal distance only; the simulation thinks in the ground plane.
export function flatDist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}
