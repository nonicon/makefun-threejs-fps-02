// The armoury: three guns and one grenade. The numbers are the game — a rifle
// that kills in three torso hits or one head shot, an SMG that sprays, a pistol
// that stays honest. The module owns the player's ammo, the view models and
// the grenade's flight; main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { moveBody } from './physics.js';

export const WEAPONS = {
  pistol: {
    name: 'Sidewinder P9', price: 0, damage: 32, headMult: 4, legMult: 0.7,
    fireGap: 0.16, auto: false, mag: 12, reserve: 36, reloadTime: 1.4,
    spreadStill: 0.003, spreadMove: 0.02, recoil: 0.011, speedMul: 1.0, range: 60,
  },
  smg: {
    name: 'Hornet-9', price: 1500, damage: 26, headMult: 4, legMult: 0.7,
    fireGap: 0.075, auto: true, mag: 32, reserve: 96, reloadTime: 1.8,
    spreadStill: 0.004, spreadMove: 0.026, recoil: 0.007, speedMul: 0.97, range: 50,
  },
  rifle: {
    name: 'Marauder-7', price: 2700, damage: 34, headMult: 4, legMult: 0.7,
    fireGap: 0.11, auto: true, mag: 25, reserve: 75, reloadTime: 2.2,
    spreadStill: 0.0022, spreadMove: 0.028, recoil: 0.012, speedMul: 0.93, range: 80,
  },
};
export const GRENADE = { name: 'Thumper frag', price: 300, damage: 120, radius: 6, fuse: 1.6 };
export const ARMOUR = { name: 'Kevlar vest', price: 650 };

const MUZZLE_LOCAL = new THREE.Vector3(0.26, -0.22, -1.05);
const muzzleWorld = new THREE.Vector3();

function buildGunModel(kind) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });
  const model = new THREE.Group();
  const add = (w, h, d, x, y, z, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  };
  if (kind === 'pistol') {
    add(0.05, 0.07, 0.24, 0, 0, -0.1, body);
    add(0.045, 0.1, 0.06, 0, -0.07, 0.02, grip);
    add(0.02, 0.02, 0.05, 0, 0.045, -0.2, accent);
  } else if (kind === 'smg') {
    add(0.08, 0.09, 0.34, 0, 0, -0.08, body);
    add(0.04, 0.04, 0.3, 0, 0.02, -0.34, grip);
    add(0.06, 0.09, 0.05, 0, -0.08, 0.06, grip);
    add(0.03, 0.03, 0.1, 0, 0.06, -0.2, accent);
  } else {
    add(0.09, 0.1, 0.44, 0, 0, -0.06, body);
    add(0.045, 0.045, 0.42, 0, 0.025, -0.42, grip);
    add(0.075, 0.08, 0.22, 0, -0.02, 0.28, grip);
    add(0.03, 0.05, 0.08, 0, 0.07, -0.12, accent);
  }
  model.position.set(0.26, -0.24, -0.52);
  model.scale.setScalar(0.8);
  model.visible = false;
  return model;
}

export function createWeapons(camera, effects, audio, colliders, onExplode) {
  const models = {
    pistol: buildGunModel('pistol'),
    smg: buildGunModel('smg'),
    rifle: buildGunModel('rifle'),
  };
  for (const m of Object.values(models)) camera.add(m);
  models.pistol.visible = true;

  const ammo = {
    pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
    smg: { mag: 0, reserve: 0 },
    rifle: { mag: 0, reserve: 0 },
  };
  const state = {
    slot: 'pistol',
    owned: { pistol: true, smg: false, rifle: false },
    grenades: 0,
    cooldown: 0,
    reloadLeft: 0,
    bloom: 0, // spread growth from sustained fire, decays when not firing
    kick: 0,
  };
  const grenades = []; // live thrown grenades
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.4, metalness: 0.6 });

  function def() {
    return WEAPONS[state.slot];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.9);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.slot];
    model.position.z = -0.52 + state.kick;
    model.rotation.x = state.kick * 2.2;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const d = def();
      model.rotation.x = -0.55 * Math.min(1, (d.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const a = ammo[state.slot];
        const take = Math.min(d.mag - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
    // Grenade flight: gravity, bounce off the world, fuse, then boom.
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.body.velocity.y -= 20 * dt;
      const vx = g.body.velocity.x;
      const vz = g.body.velocity.z;
      moveBody(g.body, colliders, dt);
      if (g.body.velocity.x === 0 && vx !== 0) {
        g.body.velocity.x = -vx * 0.45;
        audio.bounce();
      }
      if (g.body.velocity.z === 0 && vz !== 0) {
        g.body.velocity.z = -vz * 0.45;
        audio.bounce();
      }
      if (g.body.position.y === 0 && g.body.velocity.y === 0) {
        g.body.velocity.x *= 0.9;
        g.body.velocity.z *= 0.9;
      }
      g.mesh.position.copy(g.body.position);
      g.mesh.position.y += 0.1;
      if (g.fuse <= 0) {
        const pos = g.mesh.position.clone();
        effects.explode(pos);
        audio.explosion();
        onExplode(pos);
        g.mesh.parent.remove(g.mesh);
        grenades.splice(i, 1);
      }
    }
  }

  return {
    state,
    ammo,
    def,
    step,
    ready() {
      const a = ammo[state.slot];
      return a.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    // Consumes a round and starts the firing animation. Returns false when
    // the magazine is empty (main.js plays the dry click).
    fire() {
      const a = ammo[state.slot];
      if (a.mag <= 0) return false;
      a.mag -= 1;
      state.cooldown = def().fireGap;
      state.bloom = Math.min(0.02, state.bloom + 0.0035);
      state.kick = 0.035;
      muzzleWorld.copy(MUZZLE_LOCAL);
      camera.localToWorld(muzzleWorld);
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      effects.muzzle(muzzleWorld, dir);
      return true;
    },
    reload() {
      const d = def();
      const a = ammo[state.slot];
      if (state.reloadLeft > 0 || a.mag === d.mag || a.reserve === 0) return;
      state.reloadLeft = d.reloadTime;
      audio.reload();
    },
    spread(speed) {
      const d = def();
      const moving = Math.min(1, speed / 5.4);
      return d.spreadStill + moving * d.spreadMove + state.bloom;
    },
    select(slot) {
      if (!state.owned[slot] || state.slot === slot) return false;
      models[state.slot].visible = false;
      state.slot = slot;
      models[slot].visible = true;
      state.reloadLeft = 0;
      state.kick = 0;
      return true;
    },
    // Buy during the buy phase. Returns the price, or -1 when not buyable.
    buy(kind) {
      if (kind === 'grenade') {
        if (state.grenades >= 2) return -1;
        state.grenades += 1;
        return GRENADE.price;
      }
      if (kind === 'armour') return ARMOUR.price;
      const w = WEAPONS[kind];
      if (!w || state.owned[kind]) return -1;
      state.owned[kind] = true;
      ammo[kind] = { mag: w.mag, reserve: w.reserve };
      return w.price;
    },
    throwGrenade(origin, direction) {
      if (state.grenades <= 0) return false;
      state.grenades -= 1;
      const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
      mesh.castShadow = true;
      camera.parent.add(mesh);
      const body = {
        position: origin.clone(),
        velocity: direction.clone().multiplyScalar(13).add(new THREE.Vector3(0, 4.5, 0)),
        height: 0.2,
        radius: 0.12,
      };
      mesh.position.copy(body.position);
      grenades.push({ mesh, body, fuse: GRENADE.fuse });
      return true;
    },
    grenadeCount() {
      return state.grenades;
    },
    refill() {
      // Fresh round: pistol back to full, owned guns topped to one magazine
      // plus reserve (Counter-Strike keeps what you had; this is the arcade
      // read: ammo is cheap, money is for guns, not bullets).
      for (const kind of Object.keys(ammo)) {
        if (!state.owned[kind]) continue;
        ammo[kind].mag = WEAPONS[kind].mag;
        ammo[kind].reserve = WEAPONS[kind].reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.bloom = 0;
      state.kick = 0;
    },
    reset() {
      state.owned = { pistol: true, smg: false, rifle: false };
      state.slot = 'pistol';
      state.grenades = 0;
      for (const m of Object.values(models)) m.visible = false;
      models.pistol.visible = true;
      this.refill();
      for (const g of grenades) g.mesh.parent.remove(g.mesh);
      grenades.length = 0;
    },
  };
}
