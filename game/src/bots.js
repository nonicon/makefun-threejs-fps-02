// The nine other players: four Cobalt teammates, five Ember opponents. Each
// bot is a small state machine — route, hold, engage, plant, defuse — walking
// the map's waypoint graph, seeing through line of sight, hearing gunfire and
// shooting in bursts with a human reaction time. main.js resolves every shot;
// this module only decides where bots go and when they pull the trigger.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { moveBody, hasLineOfSight, flatDist } from './physics.js';
import { findPath, nearestNode, clamp } from './util.js';

const BOT_NAMES = {
  cobalt: ['Vex', 'Mira', 'Juno', 'Kade'],
  ember: ['Ash', 'Rook', 'Nyx', 'Sable', 'Onyx'],
};
const EYE = 1.45;
const WALK_SPEED = 4.2;
const FIGHT_SPEED = 2.2;
const SEE_DIST = 45;
const HEAR_DIST = 28;

const tmpEye = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

function buildBotMesh(team) {
  const group = new THREE.Group();
  const teamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[team]), roughness: 0.6, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), darkMat);
  legL.position.set(-0.11, 0.25, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), teamMat);
  torso.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skinMat);
  head.position.y = 1.45;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.06), teamMat);
  visor.position.set(0, 1.46, -0.14);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.55), darkMat);
  gun.position.set(0.18, 1.08, -0.3);
  group.add(legL, legR, torso, head, visor, gun);
  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
    }
  });
  return { group, legL, legR, torso, head, gun };
}

export function createBots(scene, world, state, effects, audio, hooks) {
  const bots = [];
  const hitMeshes = [];
  let idCounter = 0;

  function makeBot(team, index, round) {
    const mesh = buildBotMesh(team);
    scene.add(mesh.group);
    const skillTier = index === 0 ? 1.2 : index < 3 ? 1.0 : 0.8;
    const bot = {
      id: idCounter,
      team,
      index,
      name: BOT_NAMES[team][index % BOT_NAMES[team].length],
      body: {
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        yaw: 0,
        height: 1.72,
        radius: 0.34,
        alive: true,
        health: 100,
      },
      weapon: round === 1 ? (index % 2 === 0 ? 'smg' : 'pistol') : index % 3 === 0 ? 'smg' : 'rifle',
      mag: 0,
      reserve: 0,
      cooldown: 0,
      reloadLeft: 0,
      burstLeft: 0,
      burstPause: 0,
      mode: 'route',
      path: [],
      pathI: 0,
      holdNode: -1,
      holdYaw: 0,
      holdUntil: 0,
      target: null, // 'player' or a bot object
      reactAt: 0,
      lastSeen: new THREE.Vector3(),
      lastSeenAt: -99,
      alertedUntil: 0,
      strafeDir: 1,
      strafeUntil: 0,
      skill: {
        react: 0.55 / skillTier,
        aimErr: 0.026 / skillTier,
        damageMul: 0.8 + skillTier * 0.12,
        burst: 4 + Math.round(skillTier),
      },
      isCarrier: false,
      plantProgress: 0,
      defuseProgress: 0,
      fall: 0,
      walkPhase: Math.random() * 6,
      mesh,
    };
    mesh.torso.userData.bot = bot;
    mesh.torso.userData.part = 'torso';
    mesh.head.userData.bot = bot;
    mesh.head.userData.part = 'head';
    hitMeshes.push(mesh.torso, mesh.head);
    bot.mag = WEAPONS[bot.weapon].mag;
    bot.reserve = WEAPONS[bot.weapon].reserve;
    idCounter += 1;
    return bot;
  }

  for (let i = 0; i < 4; i += 1) bots.push(makeBot('cobalt', i, 1));
  for (let i = 0; i < 5; i += 1) bots.push(makeBot('ember', i, 1));

  // --- assignments: where each bot wants to be this round ---
  function assign(bot, round) {
    const emberHolds = { 0: 15, 1: 17, 2: 19, 3: 20, 4: 9 }; // A, B, mid holds
    if (bot.team === 'ember') {
      bot.holdNode = emberHolds[bot.index];
      bot.goalSite = bot.index === 0 ? 'A' : bot.index === 1 ? 'B' : null;
    } else {
      // Cobalt attacks: two push A, two push B, spreading through mid.
      bot.goalSite = bot.index % 2 === 0 ? 'A' : 'B';
      bot.holdNode = bot.goalSite === 'A' ? 15 : 17;
    }
    const start = nearestNode(world.nodes, bot.body.position.x, bot.body.position.z);
    bot.path = findPath(world.nodes, start, bot.holdNode) || [bot.holdNode];
    bot.pathI = 0;
    bot.mode = 'route';
  }

  function reset(round) {
    for (const bot of bots) {
      const spawn = world.spawns[bot.team][bot.index];
      bot.body.position.copy(spawn);
      bot.body.velocity.set(0, 0, 0);
      bot.body.yaw = bot.team === 'cobalt' ? Math.PI : 0;
      bot.body.alive = true;
      bot.body.health = 100;
      bot.weapon = round === 1 ? (bot.index % 2 === 0 ? 'smg' : 'pistol') : bot.index % 3 === 0 ? 'smg' : 'rifle';
      bot.mag = WEAPONS[bot.weapon].mag;
      bot.reserve = WEAPONS[bot.weapon].reserve;
      bot.cooldown = 0;
      bot.reloadLeft = 0;
      bot.burstLeft = 0;
      bot.burstPause = 0;
      bot.target = null;
      bot.isCarrier = false;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.fall = 0;
      bot.mesh.group.rotation.set(0, bot.body.yaw, 0);
      bot.mesh.group.position.copy(spawn);
      bot.mesh.group.visible = true;
      assign(bot, round);
    }
    // The bomb starts with the player; if the player is dead a Cobalt bot
    // takes it (main.js calls setCarrier when that happens).
    state.bomb.carrier = 'player';
  }

  function eyePos(bot, out) {
    return out.set(bot.body.position.x, bot.body.position.y + EYE, bot.body.position.z);
  }

  // Can `bot` see `targetPos` (a chest position)? Distance, facing cone
  // (wide when recently alerted) and a clear line of sight.
  function canSee(bot, targetPos, time) {
    const dx = targetPos.x - bot.body.position.x;
    const dz = targetPos.z - bot.body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > SEE_DIST) return false;
    const alert = time < bot.alertedUntil;
    if (!alert) {
      const facing = Math.atan2(-Math.sin(bot.body.yaw), -Math.cos(bot.body.yaw));
      const toTarget = Math.atan2(dx, dz);
      let diff = Math.abs(toTarget - facing);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > 1.15) return false;
    }
    eyePos(bot, tmpEye);
    tmpTarget.set(targetPos.x, targetPos.y + 1.1, targetPos.z);
    return hasLineOfSight(world.colliders, tmpEye, tmpTarget);
  }

  function setRoute(bot, node) {
    const start = nearestNode(world.nodes, bot.body.position.x, bot.body.position.z);
    bot.path = findPath(world.nodes, start, node) || [node];
    bot.pathI = 0;
    bot.mode = 'route';
  }

  // Gunfire heard: bots of the other team turn toward it and investigate.
  function hearShot(pos, team) {
    for (const bot of bots) {
      if (!bot.body.alive || bot.team === team) continue;
      if (flatDist(bot.body.position.x, bot.body.position.z, pos.x, pos.z) > HEAR_DIST) continue;
      bot.alertedUntil = Math.max(bot.alertedUntil, performance.now() / 1000 + 4);
      bot.lastSeen.set(pos.x, 0, pos.z);
      bot.lastSeenAt = performance.now() / 1000;
      if (bot.mode === 'hold' || bot.mode === 'route') {
        setRoute(bot, nearestNode(world.nodes, pos.x, pos.z));
      }
    }
  }

  // `amount` is the final damage (the shooter already applied head and
  // skill multipliers). Returns true when the bot dies from this hit.
  function damage(bot, amount) {
    if (!bot.body.alive) return false;
    bot.body.health -= amount;
    bot.alertedUntil = performance.now() / 1000 + 5;
    if (bot.body.health > 0) return false;
    bot.body.alive = false;
    bot.body.health = 0;
    bot.target = null;
    state.alive[bot.team] -= 1;
    if (bot.isCarrier) {
      bot.isCarrier = false;
      hooks.onCarrierDropped(bot);
    }
    hooks.onBotKilled(bot);
    return true;
  }

  function fireAt(bot, targetPos, time) {
    const def = WEAPONS[bot.weapon];
    if (bot.cooldown > 0 || bot.reloadLeft > 0) return;
    if (bot.mag <= 0) {
      bot.reloadLeft = def.reloadTime;
      return;
    }
    if (bot.burstLeft <= 0) {
      if (bot.burstPause > 0) return;
      bot.burstLeft = bot.skill.burst;
    }
    bot.mag -= 1;
    bot.burstLeft -= 1;
    bot.cooldown = def.fireGap * 1.15;
    if (bot.burstLeft === 0) bot.burstPause = 0.5 + Math.random() * 0.5;
    eyePos(bot, tmpEye);
    // Aim at the chest, sometimes the head, with skill error and a penalty
    // for a moving target.
    const aimY = Math.random() < 0.22 ? 1.5 : 1.1;
    tmpDir.set(targetPos.x - tmpEye.x, targetPos.y + aimY - tmpEye.y, targetPos.z - tmpEye.z).normalize();
    const err = bot.skill.aimErr * (1 + Math.random());
    tmpDir.x += (Math.random() * 2 - 1) * err;
    tmpDir.y += (Math.random() * 2 - 1) * err;
    tmpDir.z += (Math.random() * 2 - 1) * err;
    tmpDir.normalize();
    effects.muzzle(tmpEye, tmpDir);
    audio.shot(bot.weapon);
    hooks.onBotShot(bot, tmpEye, tmpDir, def);
  }

  function stepBot(bot, dt, time, player) {
    const body = bot.body;
    if (!body.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.mesh.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    bot.burstPause = Math.max(0, bot.burstPause - dt);
    if (bot.reloadLeft > 0) {
      bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);
      if (bot.reloadLeft === 0) {
        const def = WEAPONS[bot.weapon];
        const take = Math.min(def.mag - bot.mag, bot.reserve);
        bot.mag += take;
        bot.reserve -= take;
      }
    }

    // --- perception, staggered so not every bot thinks every tick ---
    if ((time * 10 + bot.id) % 1 < dt * 10) {
      let seen = null;
      let seenPos = null;
      if (player.state.alive && state.phase === 'live') {
        const p = player.state.position;
        tmpTarget.set(p.x, p.y, p.z);
        if (canSee(bot, tmpTarget, time)) {
          seen = 'player';
          seenPos = tmpTarget;
        }
      }
      if (!seen) {
        for (const other of bots) {
          if (other === bot || other.team === bot.team || !other.body.alive) continue;
          tmpTarget.set(other.body.position.x, other.body.position.y, other.body.position.z);
          if (canSee(bot, tmpTarget, time)) {
            seen = other;
            seenPos = tmpTarget;
            break;
          }
        }
      }
      if (seen) {
        if (bot.target !== seen) bot.reactAt = time + bot.skill.react;
        bot.target = seen;
        bot.lastSeen.copy(seenPos);
        bot.lastSeenAt = time;
        bot.alertedUntil = time + 4;
        if (bot.mode !== 'engage') bot.mode = 'engage';
      } else if (bot.target && time - bot.lastSeenAt > 2.5) {
        bot.target = null;
        if (bot.mode === 'engage') {
          // Lost them: push to where they were last seen.
          setRoute(bot, nearestNode(world.nodes, bot.lastSeen.x, bot.lastSeen.z));
        }
      }
    }

    // --- bomb duties override movement ---
    const bomb = state.bomb;
    if (bot.team === 'ember' && bomb.state === 'planted') {
      const site = world.sites[bomb.site];
      const d = flatDist(body.position.x, body.position.z, site.center.x, site.center.z);
      if (bot.mode !== 'defuse' && d < 2.2 && !bot.target) {
        bot.mode = 'defuse';
        bot.defuseProgress = 0;
      } else if (bot.mode !== 'defuse' && !bot.target) {
        setRoute(bot, site.node);
      }
    }
    if (bot.mode === 'defuse') {
      const site = world.sites[bomb.site];
      const d = flatDist(body.position.x, body.position.z, site.center.x, site.center.z);
      if (d > 2.6 || bot.target || bomb.state !== 'planted') {
        bot.mode = 'route';
        bot.defuseProgress = 0;
        setRoute(bot, site.node);
      } else {
        bot.defuseProgress += dt;
        hooks.onBotDefuse(bot, bot.defuseProgress);
        faceToward(bot, site.center.x, site.center.z, dt);
        return;
      }
    }
    if (bot.isCarrier && bomb.state === 'carried' && !bot.target) {
      const site = world.sites[bot.goalSite];
      const d = flatDist(body.position.x, body.position.z, site.center.x, site.center.z);
      if (d < 2.2) {
        bot.mode = 'plant';
        bot.plantProgress += dt;
        hooks.onBotPlant(bot, bot.goalSite, bot.plantProgress);
        return;
      }
      if (bot.mode !== 'route') setRoute(bot, site.node);
    }

    // --- engage: strafe and shoot ---
    if (bot.mode === 'engage' && bot.target) {
      const tPos = bot.target === 'player' ? player.state.position : bot.target.body.position;
      faceToward(bot, tPos.x, tPos.z, dt);
      if (time > bot.strafeUntil) {
        bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
        bot.strafeUntil = time + 0.7 + Math.random() * 0.8;
      }
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      const mx = cos * bot.strafeDir;
      const mz = -sin * bot.strafeDir;
      body.velocity.x = mx * FIGHT_SPEED;
      body.velocity.z = mz * FIGHT_SPEED;
      body.velocity.y -= 20 * dt;
      body.onGround = moveBody(body, world.colliders, dt);
      if (time >= bot.reactAt) {
        tmpTarget.set(tPos.x, tPos.y, tPos.z);
        fireAt(bot, tmpTarget, time);
      }
      syncMesh(bot, dt);
      return;
    }

    // --- route / hold ---
    if (bot.mode === 'route' && bot.path.length > 0) {
      const node = world.nodes[bot.path[Math.min(bot.pathI, bot.path.length - 1)]];
      const dx = node.x - body.position.x;
      const dz = node.z - body.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.9) {
        bot.pathI += 1;
        if (bot.pathI >= bot.path.length) {
          bot.mode = 'hold';
          bot.holdUntil = time + 2 + Math.random() * 3;
          bot.holdYaw = bot.goalSite === 'A' ? -Math.PI / 2 : Math.PI / 2;
          if (bot.team === 'ember') bot.holdYaw = Math.PI;
        }
      } else {
        const inv = 1 / dist;
        body.velocity.x = dx * inv * WALK_SPEED;
        body.velocity.z = dz * inv * WALK_SPEED;
        faceToward(bot, node.x, node.z, dt);
      }
    } else if (bot.mode === 'hold') {
      body.velocity.x = 0;
      body.velocity.z = 0;
      body.yaw += (bot.holdYaw - body.yaw) * Math.min(1, dt * 3);
      if (time > bot.holdUntil) {
        // Rotate to a new hold: the other site's approach, or mid.
        const next = bot.team === 'ember' ? (bot.holdNode === 15 ? 17 : 15) : bot.holdNode;
        setRoute(bot, next);
      }
    }
    body.velocity.y -= 20 * dt;
    body.onGround = moveBody(body, world.colliders, dt);
    syncMesh(bot, dt);
  }

  function faceToward(bot, x, z, dt) {
    const dx = x - bot.body.position.x;
    const dz = z - bot.body.position.z;
    const want = Math.atan2(-dx, -dz);
    let diff = want - bot.body.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.body.yaw += clamp(diff, -dt * 6, dt * 6);
  }

  function syncMesh(bot, dt) {
    const m = bot.mesh;
    const speed = Math.hypot(bot.body.velocity.x, bot.body.velocity.z);
    bot.walkPhase += dt * (4 + speed * 1.6);
    const swing = Math.min(0.5, speed * 0.09) * Math.sin(bot.walkPhase);
    m.legL.rotation.x = swing;
    m.legR.rotation.x = -swing;
    m.group.position.copy(bot.body.position);
    m.group.rotation.y = bot.body.yaw;
  }

  // Gentle separation so bots never stand inside each other.
  function separate() {
    for (let i = 0; i < bots.length; i += 1) {
      const a = bots[i];
      if (!a.body.alive) continue;
      for (let j = i + 1; j < bots.length; j += 1) {
        const b = bots[j];
        if (!b.body.alive) continue;
        const dx = b.body.position.x - a.body.position.x;
        const dz = b.body.position.z - a.body.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (0.8 - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          a.body.position.x -= nx * push;
          a.body.position.z -= nz * push;
          b.body.position.x += nx * push;
          b.body.position.z += nz * push;
        }
      }
    }
  }

  return {
    bots,
    hitMeshes,
    reset,
    hearShot,
    damage,
    step(dt, time, player) {
      for (const bot of bots) stepBot(bot, dt, time, player);
      separate();
    },
    aliveCount(team) {
      let n = 0;
      for (const b of bots) if (b.team === team && b.body.alive) n += 1;
      return n;
    },
    setCarrier(bot) {
      for (const b of bots) b.isCarrier = false;
      if (bot) {
        bot.isCarrier = true;
        state.bomb.carrier = bot.name;
      }
    },
    carrierBot() {
      for (const b of bots) if (b.isCarrier) return b;
      return null;
    },
  };
}
