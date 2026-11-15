// The objective: one bomb, two sites, a 35-second fuse. Cobalt plants it,
// Ember defuses it. This module owns the plant/defuse progress, the fuse and
// the beeps; main.js decides who is planting (player holding E, or a bot the
// AI sent to the site) and calls the matching method each tick.
import * as THREE from 'three';
import { ROUND, ECONOMY } from './state.js';

export function createBomb(scene, world, state, audio, effects) {
  // The bomb itself: a small dark case with an amber light, visible while
  // carried (on the carrier's hip) or planted at the site.
  const caseMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1e2228'), roughness: 0.5, metalness: 0.6 });
  const lightMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f0a830'), emissive: new THREE.Color('#f0a830'), emissiveIntensity: 2 });
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.24), caseMat);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), lightMat);
  lamp.position.set(0, 0.1, 0);
  mesh.add(body, lamp);
  mesh.visible = false;
  scene.add(mesh);

  let beepAt = 0;
  let exploded = false;

  function siteOf(letter) {
    return world.sites[letter];
  }

  // Is `pos` inside the plant zone of `site`? The zone is the glowing frame.
  function inSite(pos, letter) {
    const site = siteOf(letter);
    return Math.abs(pos.x - site.center.x) < site.radius && Math.abs(pos.z - site.center.z) < site.radius;
  }

  return {
    mesh,
    inSite,
    // A bot that held the plant all the way plants at once: same end state
    // as plantTick reaching 1, without another tick of progress.
    forcePlant(site) {
      const bomb = state.bomb;
      bomb.progress = 0;
      bomb.state = 'planted';
      bomb.site = site;
      bomb.fuse = ROUND.bombSeconds;
      beepAt = 0;
      exploded = false;
      mesh.visible = true;
      const c = siteOf(site).center;
      mesh.position.set(c.x, 0.12, c.z);
      state.money += ECONOMY.plant;
      state.plants += 1;
      audio.plant();
    },
    // Same for a bot that held the defuse all the way.
    forceDefuse() {
      const bomb = state.bomb;
      bomb.progress = 0;
      bomb.state = 'defused';
      mesh.visible = false;
      state.money += ECONOMY.defuse;
      state.defuses += 1;
      audio.defuse();
    },
    // Advance planting while the planter stands in the site. Returns the
    // progress 0..1; at 1 the bomb is planted and the fuse starts.
    plantTick(dt, site) {
      const bomb = state.bomb;
      bomb.progress += dt / ROUND.plantSeconds;
      if (bomb.progress >= 1) {
        bomb.progress = 0;
        bomb.state = 'planted';
        bomb.site = site;
        bomb.fuse = ROUND.bombSeconds;
        beepAt = 0;
        exploded = false;
        mesh.visible = true;
        const c = siteOf(site).center;
        mesh.position.set(c.x, 0.12, c.z);
        state.money += ECONOMY.plant;
        state.plants += 1;
        audio.plant();
        return true;
      }
      return false;
    },
    // Advance defusing while the defuser stands at the planted bomb.
    defuseTick(dt) {
      const bomb = state.bomb;
      bomb.progress += dt / ROUND.defuseSeconds;
      if (bomb.progress >= 1) {
        bomb.progress = 0;
        bomb.state = 'defused';
        mesh.visible = false;
        state.money += ECONOMY.defuse;
        state.defuses += 1;
        audio.defuse();
        return true;
      }
      return false;
    },
    // The fuse: beeps that speed up as it runs down, then the blast.
    step(dt) {
      const bomb = state.bomb;
      if (bomb.state !== 'planted') return null;
      bomb.fuse -= dt;
      // Beep interval shrinks from 1.0 s to 0.25 s as the fuse runs down.
      const interval = 0.25 + (bomb.fuse / ROUND.bombSeconds) * 0.75;
      beepAt -= dt;
      if (beepAt <= 0) {
        beepAt = interval;
        audio.beep();
        lightMat.emissiveIntensity = lightMat.emissiveIntensity > 1 ? 0.2 : 2;
      }
      if (bomb.fuse <= 0 && !exploded) {
        exploded = true;
        bomb.state = 'exploded';
        mesh.visible = false;
        const c = siteOf(bomb.site).center;
        effects.explode(new THREE.Vector3(c.x, 0.6, c.z));
        audio.explosion();
        return 'exploded';
      }
      return null;
    },
    // Where the bomb mesh sits while carried: on the carrier's hip.
    carryAt(pos, yaw) {
      const bomb = state.bomb;
      if (bomb.state !== 'carried') return;
      mesh.visible = true;
      const x = pos.x + Math.sin(yaw) * 0.28;
      const z = pos.z + Math.cos(yaw) * 0.28;
      mesh.position.set(x, pos.y + 0.85, z);
      mesh.rotation.y = yaw;
    },
    hide() {
      mesh.visible = false;
    },
    reset() {
      state.bomb.state = 'carried';
      state.bomb.site = null;
      state.bomb.progress = 0;
      state.bomb.fuse = 0;
      exploded = false;
      mesh.visible = false;
    },
  };
}
