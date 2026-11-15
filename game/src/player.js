// The player body: acceleration, friction, gravity, crouch and jump, moved by
// the shared physics helper. Health and armour live here too; damage is the
// only way in, and the HUD reads the numbers out.
import * as THREE from 'three';
import { moveBody } from './physics.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createPlayer(colliders) {
  const body = {
    position: new THREE.Vector3(0, 0, 16),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    radius: RADIUS,
    health: 100,
    armour: 0,
    alive: true,
  };
  const wish = new THREE.Vector3();
  // Reused probe: does a standing body fit here? Used to block un-crouching
  // under a low ceiling.
  const probe = new THREE.Box3();

  function fitsStanding() {
    probe.min.set(body.position.x - RADIUS, body.position.y + 0.02, body.position.z - RADIUS);
    probe.max.set(body.position.x + RADIUS, body.position.y + STAND_HEIGHT - 0.02, body.position.z + RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return false;
    return true;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  // `speedMul` lets the held weapon slow the player (a rifle is heavier than
  // a pistol). Returns nothing; the body is the state.
  function step(dt, keys, speedMul = 1) {
    if (!body.alive) return;
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !body.crouching) {
      body.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!crouching && body.crouching && fitsStanding()) {
      body.crouching = false;
      body.height = STAND_HEIGHT;
    }
    const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = (body.crouching ? CROUCH_SPEED : WALK_SPEED) * speedMul;
    const blend = Math.min(1, ((body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt) / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    if (keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;
    body.onGround = moveBody(body, colliders, dt);
  }

  // Armour absorbs half of each hit until it runs out; the rest hits health.
  // Returns the health actually lost, so the HUD can flash by severity.
  function damage(amount) {
    if (!body.alive) return 0;
    let rest = amount;
    if (body.armour > 0) {
      const absorbed = Math.min(body.armour, rest * 0.5);
      body.armour -= absorbed;
      rest -= absorbed;
    }
    body.health = Math.max(0, body.health - rest);
    if (body.health <= 0) body.alive = false;
    return rest;
  }

  function reset(x, z, yaw) {
    body.position.set(x, 0, z);
    body.velocity.set(0, 0, 0);
    body.yaw = yaw;
    body.pitch = 0;
    body.eye = STAND_EYE;
    body.height = STAND_HEIGHT;
    body.crouching = false;
    body.health = 100;
    body.armour = 0;
    body.alive = true;
    body.onGround = true;
  }

  return {
    state: body,
    step,
    look,
    recoil,
    damage,
    reset,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
  };
}
