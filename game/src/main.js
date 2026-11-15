// AMBER YARD — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. main.js owns the round flow, every shot's
// resolution and the HUD; the modules own their own state.
// ?shot=menu|fight|plant|win with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, GRENADE, ARMOUR } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createState, ECONOMY, ROUND, awardRound, nextRound } from './state.js';
import { hasLineOfSight } from './physics.js';
import { mulberry32 } from './util.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 32, 90);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const state = createState();
const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders);
const bomb = createBomb(scene, world, state, audio, effects);

// The player's hit volume: invisible, but bots shoot at it with the same
// raycaster the player shoots bots with. Opacity 0, never a shadow caster.
const playerHitBox = new THREE.Mesh(
  new THREE.BoxGeometry(0.7, 1.72, 0.7),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
);
playerHitBox.castShadow = false;
scene.add(playerHitBox);

const raycaster = new THREE.Raycaster();
const shootables = world.shootables.concat([]); // bots + player box appended below
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpOrigin = new THREE.Vector3();
const muzzle = new THREE.Vector3();

let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let stepAcc = 0;
let grenadeThrower = 'player';
let buyOpen = false;

// --- bots: created after the hooks they call, so the hooks close over main ---
const bots = createBots(scene, world, state, effects, audio, {
  onBotShot(bot, origin, dir, def) {
    resolveShot(origin, dir, def, { kind: 'bot', bot }, origin);
    bots.hearShot(origin, bot.team);
  },
  onBotKilled(bot) {
    checkRoundEnd();
  },
  onCarrierDropped(deadBot) {
    const alive = bots.bots.filter((b) => b.team === 'cobalt' && b.body.alive);
    if (alive.length === 0) return;
    alive.sort((a, b) => {
      const da = Math.hypot(a.body.position.x - deadBot.body.position.x, a.body.position.z - deadBot.body.position.z);
      const db = Math.hypot(b.body.position.x - deadBot.body.position.x, b.body.position.z - deadBot.body.position.z);
      return da - db;
    });
    bots.setCarrier(alive[0]);
    hud.banner('BOMB DROPPED', `${alive[0].name} picked it up — cover them`, 2600);
  },
  onBotPlant(bot, site, progress) {
    if (progress >= ROUND.plantSeconds && state.bomb.state === 'carried') {
      bomb.forcePlant(site);
      hud.banner('BOMB PLANTED', `Ember planted at ${site} — retake it or lose the round`, 3200);
    }
  },
  onBotDefuse(bot, progress) {
    if (progress >= ROUND.defuseSeconds && state.bomb.state === 'planted') {
      bomb.forceDefuse();
      endRound('cobalt', 'Bomb defused — site held');
    }
  },
});
shootables.push(...bots.hitMeshes, playerHitBox);

const weapons = createWeapons(camera, effects, audio, world.colliders, onExplode);
const input = createInput(renderer.domElement, onLockChange);

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    audio.unlock();
    audio.ambientStart();
  } else if ((state.phase === 'live' || state.phase === 'buy') && player.state.alive) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === 'menu' || state.phase === 'matchEnd') startMatch();
  else if (state.phase === 'roundEnd') state.timer = Math.min(state.timer, 0.5);
  input.requestLock();
});
hud.onBuy((kind) => buyItem(kind));

// --- shooting: one resolver for the player and every bot ---
function resolveShot(origin, dir, def, shooter, tracerFrom) {
  scene.updateMatrixWorld(true);
  raycaster.set(origin, dir);
  raycaster.far = def.range;
  const hits = raycaster.intersectObjects(shootables, false);
  const from = tracerFrom || origin;
  const colour = shooter.kind === 'player' ? 0xffd166 : shooter.bot.team === 'ember' ? 0xff6a3d : 0x5b9dff;
  for (const hit of hits) {
    const obj = hit.object;
    if (obj.userData.bot) {
      const bot = obj.userData.bot;
      if (!bot.body.alive) continue;
      if (shooter.kind === 'bot' && bot.team === shooter.bot.team) continue;
      const part = obj.userData.part;
      const dmg = def.damage * (part === 'head' ? def.headMult : 1) * (shooter.kind === 'bot' ? shooter.bot.skill.damageMul : 1);
      effects.tracer(from, hit.point, colour);
      effects.impact(hit.point, hit.face ? hit.face.normal : tmpVec.set(0, 1, 0), 'flesh');
      const killed = bots.damage(bot, dmg);
      if (shooter.kind === 'player') {
        hud.hitMarker(killed);
        audio.hit(killed);
        if (killed) {
          state.kills += 1;
          state.money += ECONOMY.kill;
          hud.killfeed('You', bot.name, part === 'head', 'cobalt');
          hud.setMoney(state.money);
        }
      } else if (killed) {
        hud.killfeed(shooter.bot.name, bot.name, part === 'head', shooter.bot.team);
      }
      return { type: 'bot', bot, part, killed };
    }
    if (obj === playerHitBox) {
      // No friendly fire: a Cobalt bot's bullet passes through the player.
      if (shooter.kind === 'player' || (shooter.kind === 'bot' && shooter.bot.team === 'cobalt')) continue;
      const head = hit.point.y > player.state.position.y + 1.35;
      const dmg = def.damage * (head ? def.headMult : 1) * shooter.bot.skill.damageMul;
      effects.tracer(from, hit.point, colour);
      const lost = player.damage(dmg);
      hud.damageFlash(Math.min(1, lost / 40));
      audio.hurt();
      // damage() returns 0 for a body already down: the death runs once.
      if (lost > 0 && !player.state.alive) onPlayerDeath(shooter.bot);
      return { type: 'player', head };
    }
    effects.tracer(from, hit.point, colour);
    effects.impact(hit.point, hit.face ? hit.face.normal : tmpVec.set(0, 1, 0), 'wall');
    return { type: 'wall' };
  }
  tmpVec.copy(dir).multiplyScalar(def.range).add(origin);
  effects.tracer(from, tmpVec, colour);
  return null;
}

function shootPlayer() {
  const def = weapons.def();
  if (!weapons.fire()) {
    audio.dryFire();
    weapons.reload();
    return;
  }
  camera.getWorldDirection(direction);
  const spread = weapons.spread(player.groundSpeed());
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  muzzle.set(0.26, -0.22, -1.05);
  camera.localToWorld(muzzle);
  audio.shot(weapons.state.slot);
  player.recoil(def.recoil * (0.9 + random() * 0.2), (random() * 2 - 1) * 0.003);
  resolveShot(camera.position, direction, def, { kind: 'player' }, muzzle);
  bots.hearShot(player.state.position, 'cobalt');
  hud.setAmmo(weapons.ammo[weapons.state.slot].mag, weapons.ammo[weapons.state.slot].reserve, def.name);
}

function onExplode(pos) {
  // Everyone inside the radius takes falloff damage; a wall between the
  // blast and a body quarters it. The thrower is credited with the kills.
  function blastAt(targetPos, chestY, apply) {
    const dx = targetPos.x - pos.x;
    const dy = targetPos.y + chestY - pos.y;
    const dz = targetPos.z - pos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > GRENADE.radius) return;
    tmpVec.set(targetPos.x, targetPos.y + chestY, targetPos.z);
    const blocked = !hasLineOfSight(world.colliders, pos, tmpVec);
    const dmg = GRENADE.damage * (1 - (dist / GRENADE.radius) * 0.85) * (blocked ? 0.25 : 1);
    apply(Math.max(12, dmg));
  }
  blastAt(player.state.position, 1.1, (dmg) => {
    if (!player.state.alive) return;
    const lost = player.damage(dmg);
    hud.damageFlash(Math.min(1, lost / 40));
    audio.hurt();
    if (lost > 0 && !player.state.alive) onPlayerDeath(null);
  });
  for (const bot of bots.bots) {
    if (!bot.body.alive) continue;
    blastAt(bot.body.position, 1.1, (dmg) => {
      const killed = bots.damage(bot, dmg);
      if (killed && grenadeThrower === 'player') {
        state.kills += 1;
        state.money += ECONOMY.kill;
        hud.killfeed('You', bot.name, false, 'cobalt');
        hud.setMoney(state.money);
      }
    });
  }
}

function onPlayerDeath(killer) {
  state.deaths += 1;
  if (killer) hud.killfeed(killer.name, 'You', false, 'ember');
  hud.banner('ELIMINATED', killer ? `Taken down by ${killer.name} — your Cobalt bots fight on` : 'Caught by the blast', 0);
  if (document.pointerLockElement) document.exitPointerLock();
  if (state.bomb.carrier === 'player') {
    const alive = bots.bots.filter((b) => b.team === 'cobalt' && b.body.alive);
    if (alive.length > 0) {
      alive.sort((a, b) => {
        const da = Math.hypot(a.body.position.x - player.state.position.x, a.body.position.z - player.state.position.z);
        const db = Math.hypot(b.body.position.x - player.state.position.x, b.body.position.z - player.state.position.z);
        return da - db;
      });
      bots.setCarrier(alive[0]);
      hud.banner('BOMB DROPPED', `${alive[0].name} picked it up — cover them`, 2600);
    }
  }
  checkRoundEnd();
}

function checkRoundEnd() {
  if (state.phase !== 'live') return;
  if (state.alive.ember === 0) {
    endRound('cobalt', 'Ember team eliminated');
  } else if (state.alive.cobalt === 0 && state.bomb.state !== 'planted') {
    endRound('ember', 'Cobalt team eliminated');
  }
}

function endRound(winner, reason) {
  if (state.phase !== 'live') return;
  const next = awardRound(state, winner, reason);
  hud.banner(winner === 'cobalt' ? 'ROUND WON' : 'ROUND LOST', reason, 0);
  hud.setBomb('hidden');
  hud.setScore(state.score.cobalt, state.score.ember, state.round);
  hud.setMoney(state.money);
  audio.roundWin(winner === 'cobalt');
  if (document.pointerLockElement) document.exitPointerLock();
}

function resetRound() {
  nextRound(state);
  bots.reset(state.round);
  player.reset(0, 16, 0);
  weapons.refill();
  bomb.reset();
  effects.reset();
  buyOpen = true;
  hud.showBuy(state.money, ownedMap());
  document.getElementById('buy-round').textContent = String(state.round);
  hud.setScore(state.score.cobalt, state.score.ember, state.round);
  hud.setMoney(state.money);
  hud.setBomb('hidden');
  hud.banner('', '');
}

function startMatch() {
  Object.assign(state, createState());
  state.phase = 'buy';
  state.timer = ROUND.buySeconds;
  weapons.reset();
  bots.reset(1);
  player.reset(0, 16, 0);
  bomb.reset();
  effects.reset();
  buyOpen = true;
  hud.hideOverlay();
  hud.showBuy(state.money, ownedMap());
  document.getElementById('buy-round').textContent = '1';
  hud.setScore(0, 0, 1);
  hud.setMoney(state.money);
  hud.setHealth(100, 0);
  hud.setAmmo(12, 36, 'Sidewinder P9');
  hud.setBomb('hidden');
  hud.banner('ROUND 1', 'Buy up — the round starts soon', 2600);
}

function ownedMap() {
  return {
    rifle: weapons.state.owned.rifle,
    smg: weapons.state.owned.smg,
    grenade: weapons.grenadeCount() >= 2,
    armour: player.state.armour >= 100,
  };
}

function buyItem(kind) {
  if (state.phase !== 'buy') return;
  let price = -1;
  if (kind === 'armour') {
    if (player.state.armour >= 100) return;
    price = ARMOUR.price;
  } else if (kind === 'grenade') {
    if (weapons.grenadeCount() >= 2) return;
    price = GRENADE.price;
  } else {
    const w = WEAPONS[kind];
    if (!w || weapons.state.owned[kind]) return;
    price = w.price;
  }
  if (state.money < price) {
    hud.banner('NOT ENOUGH MONEY', `You need $${price}`, 1200);
    return;
  }
  state.money -= price;
  if (kind === 'armour') {
    player.state.armour = 100;
  } else {
    weapons.buy(kind);
    if (kind === 'rifle' || kind === 'smg') weapons.select(kind);
  }
  audio.buy();
  hud.setMoney(state.money);
  hud.showBuy(state.money, ownedMap());
  hud.setAmmo(weapons.ammo[weapons.state.slot].mag, weapons.ammo[weapons.state.slot].reserve, weapons.def().name);
}

// --- the fixed step: simulation only, no rendering ---
function step(dt) {
  elapsed += dt;
  if (state.phase === 'buy') {
    state.timer -= dt;
    player.step(dt, input.state.keys, weapons.def().speedMul);
    weapons.step(dt);
    if (state.timer <= 0) {
      state.phase = 'live';
      state.timer = ROUND.roundSeconds;
      buyOpen = false;
      hud.hideBuy();
      audio.roundStart();
      hud.banner(`ROUND ${state.round}`, 'Plant the bomb at A or B', 2600);
    }
  } else if (state.phase === 'live') {
    state.timer -= dt;
    player.step(dt, input.state.keys, weapons.def().speedMul);
    weapons.step(dt);
    bots.step(dt, elapsed, player);
    const bombResult = bomb.step(dt);
    if (bombResult === 'exploded') {
      endRound('ember', 'Bomb detonated — site lost');
    }
    // Planting: the carrier holds E inside a site.
    if (state.bomb.state === 'carried' && state.bomb.carrier === 'player' && player.state.alive) {
      const p = player.state.position;
      const site = bomb.inSite(p, 'A') ? 'A' : bomb.inSite(p, 'B') ? 'B' : null;
      if (site && input.state.keys.has('KeyE')) {
        if (bomb.plantTick(dt, site)) {
          hud.banner('BOMB PLANTED', 'Defend it — 35 seconds on the fuse', 3000);
        }
      } else if (state.bomb.progress > 0) {
        state.bomb.progress = Math.max(0, state.bomb.progress - dt / ROUND.plantSeconds);
      }
    }
    // Bomb mesh rides on whoever carries it.
    if (state.bomb.state === 'carried') {
      if (state.bomb.carrier === 'player') {
        bomb.carryAt(player.state.position, player.state.yaw);
      } else {
        const carrier = bots.carrierBot();
        if (carrier) bomb.carryAt(carrier.body.position, carrier.body.yaw);
      }
    }
    if (state.timer <= 0 && state.phase === 'live') {
      endRound('ember', 'Time expired — Ember holds the sites');
    }
    checkRoundEnd();
  } else if (state.phase === 'roundEnd') {
    state.timer -= dt;
    player.step(dt, input.state.keys, weapons.def().speedMul);
    weapons.step(dt);
    if (state.timer <= 0) {
      if (state.matchWinner) {
        state.phase = 'matchEnd';
        hud.showOverlay('matchEnd', {
          won: state.matchWinner === 'cobalt',
          cobalt: state.score.cobalt,
          ember: state.score.ember,
          kills: state.kills,
          deaths: state.deaths,
        });
      } else {
        resetRound();
      }
    }
  }
  // Footsteps from distance travelled.
  if (player.state.alive && player.state.onGround) {
    stepAcc += player.groundSpeed() * dt;
    if (stepAcc > 2.4) {
      stepAcc = 0;
      audio.footstep(player.groundSpeed() > 4);
    }
  }
  // Player hit volume follows the body for the bots' raycasts.
  playerHitBox.position.set(player.state.position.x, player.state.position.y + 0.86, player.state.position.z);
  syncCamera();
}

function syncCamera() {
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const p = player.state;
  const dx = point.x - p.position.x;
  const dy = point.y - (p.position.y + p.eye);
  const dz = point.z - p.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

const siteVec = new THREE.Vector3();
function updateSiteMarkers() {
  const show = state.phase === 'live' || state.phase === 'buy';
  for (const letter of ['A', 'B']) {
    const site = world.sites[letter];
    siteVec.copy(site.center);
    siteVec.y = 1.2;
    siteVec.project(camera);
    const visible = show && siteVec.z < 1 && Math.abs(siteVec.x) < 1.05 && Math.abs(siteVec.y) < 1.05;
    hud.setSiteMarker(
      letter,
      (siteVec.x * 0.5 + 0.5) * window.innerWidth,
      (-siteVec.y * 0.5 + 0.5) * window.innerHeight,
      visible,
    );
  }
}

function refreshHud() {
  const def = weapons.def();
  const a = weapons.ammo[weapons.state.slot];
  hud.setHealth(player.state.health, player.state.armour);
  hud.setAmmo(a.mag, a.reserve, def.name);
  hud.setMoney(state.money);
  hud.setGrenades(weapons.grenadeCount());
  hud.setAlive(state.alive.cobalt, state.alive.ember);
  hud.setCrosshairGap(weapons.spread(player.groundSpeed()));
  if (state.phase === 'live') {
    if (state.bomb.state === 'planted') {
      hud.setTimer(state.bomb.fuse, true);
      hud.setBomb('planted', 0, state.bomb.fuse);
    } else {
      hud.setTimer(state.timer, state.timer < 15);
      if (state.bomb.state === 'carried' && state.bomb.carrier === 'player') {
        const planting = input.state.keys.has('KeyE') && (bomb.inSite(player.state.position, 'A') || bomb.inSite(player.state.position, 'B'));
        hud.setBomb(planting ? 'planting' : 'carried', state.bomb.progress, 0);
      } else {
        hud.setBomb('hidden');
      }
    }
  } else if (state.phase === 'buy') {
    hud.setTimer(state.timer, false);
    hud.setBomb('hidden');
  } else if (state.phase === 'roundEnd') {
    hud.setTimer(state.timer, false);
    hud.setBomb('hidden');
  }
  updateSiteMarkers();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const presses = input.takePresses();
    if (presses.mute) {
      state.muted = !state.muted;
      audio.setMuted(state.muted);
    }
    if (presses.buy && (state.phase === 'buy' || state.phase === 'live')) {
      if (state.phase === 'buy') {
        buyOpen = !buyOpen;
        if (buyOpen) hud.showBuy(state.money, ownedMap());
        else hud.hideBuy();
      }
    }
    if (presses.grenade && state.phase === 'live' && player.state.alive) {
      camera.getWorldDirection(direction);
      tmpOrigin.copy(camera.position);
      if (weapons.throwGrenade(tmpOrigin, direction)) grenadeThrower = 'player';
    }
    if (presses.slot > 0) {
      if (state.phase === 'buy' && buyOpen) {
        // Buy-menu keys: 1 rifle, 2 SMG, 3 grenade, 4 armour.
        const buyKind = presses.slot === 1 ? 'rifle' : presses.slot === 2 ? 'smg' : presses.slot === 3 ? 'grenade' : 'armour';
        buyItem(buyKind);
      } else if (state.phase === 'live') {
        // Field keys: 1 pistol, 2 SMG, 3 rifle.
        const slot = presses.slot === 1 ? 'pistol' : presses.slot === 2 ? 'smg' : 'rifle';
        if (weapons.select(slot)) {
          const d = weapons.def();
          hud.setAmmo(weapons.ammo[slot].mag, weapons.ammo[slot].reserve, d.name);
        }
      }
    }
    if (state.phase === 'live' && player.state.alive) {
      const def = weapons.def();
      const wantFire = input.state.firing && (def.auto || !prevFiring);
      if (wantFire && weapons.ready()) shootPlayer();
    }
    prevFiring = input.state.firing;
    if (input.state.keys.has('KeyR')) weapons.reload();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    world.update(dt, elapsed);
    effects.step(dt);
    refreshHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) {
    step(FIXED_STEP);
    effects.step(FIXED_STEP);
    world.update(FIXED_STEP, elapsed);
  }
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    refreshHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  startMatch();
  // startMatch leaves phase 'buy'; each shot overrides from there.
  const p = player.state;
  if (name === 'menu') {
    p.position.set(0, 0, 16);
    settle(10);
    aimAt(new THREE.Vector3(10, 1.2, -6));
    hud.setMoney(state.money);
    paintTwiceThenReady();
    return;
  }
  // Every other shot is mid-match: skip the buy phase.
  state.phase = 'live';
  state.timer = 78;
  hud.hideBuy();
  if (name === 'fight') {
    p.position.set(1.5, 0, 9);
    p.health = 76;
    const e0 = bots.bots[4];
    const e1 = bots.bots[5];
    e0.body.position.set(2.5, 0, 1.5);
    e0.body.yaw = Math.PI;
    e0.mode = 'hold';
    e1.body.position.set(-3.5, 0, -1);
    e1.body.yaw = Math.PI;
    e1.mode = 'hold';
    bots.bots[0].body.position.set(-1.5, 0, 12);
    bots.bots[0].mode = 'hold';
    settle(12);
    aimAt(new THREE.Vector3(2.5, 1.1, 1.5));
    shootPlayer();
    settle(8);
    hud.banner('', '');
    hud.hitMarker(false, 4000); // keep the hit marker up for the frozen frame
    // A fresh tracer in the frozen frame, from the muzzle to the bot.
    muzzle.set(0.26, -0.22, -1.05);
    camera.localToWorld(muzzle);
    tmpVec.set(2.5, 1.1, 1.5);
    effects.tracer(muzzle, tmpVec, 0xffd166);
    paintTwiceThenReady();
    return;
  }
  if (name === 'plant') {
    bomb.forcePlant('A');
    state.bomb.fuse = 18;
    state.bomb.carrier = 'player';
    p.position.set(22, 0, -5.5);
    const e0 = bots.bots[4];
    e0.body.position.set(17, 0, -11);
    e0.body.yaw = Math.PI * 0.75;
    e0.mode = 'hold';
    settle(8);
    aimAt(new THREE.Vector3(19.5, 0.6, -8.5));
    hud.banner('BOMB PLANTED', 'Defend it — 18 seconds on the fuse', 0);
    paintTwiceThenReady();
    return;
  }
  // win: the round just ended in Cobalt's favour.
  state.score.cobalt = 1;
  state.money = ECONOMY.start + ECONOMY.roundWin;
  state.phase = 'roundEnd';
  state.timer = 3.5;
  p.position.set(18, 0, -3);
  settle(6);
  aimAt(new THREE.Vector3(19.5, 1.0, -8.5));
  hud.banner('ROUND WON', 'Site A secured — bomb detonated', 0);
  hud.setScore(1, 0, 1);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
refreshHud();
// Debug handle for playtesting (read-only from the console): the live match.
window.__amber = { state, player, bots, weapons, bomb, world };
if (shot) runShot(shot);
else requestAnimationFrame(frame);
