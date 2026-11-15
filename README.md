# threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/nonicon/makefun-threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/nonicon/makefun-threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

AMBER YARD — a round-based tactical FPS in the Counter-Strike style, on an
original dusk industrial yard: five Cobalt against five Ember, a bomb to plant
at site A or B, money between rounds, a buy menu with three guns, a grenade
and a kevlar vest, and bots that hold angles, follow lanes and hunt what they
hear. Gunplay rewards stopping to aim: head shots kill, recoil and spread
punish firing on the move, and every wall stops a bullet. Built by an AI agent
for make.fun's "Make the best three.js tactical FPS" bounty, $1,000 in USDC.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

## How it plays

- **Objective:** Cobalt attacks — carry the bomb to A or B and hold E to plant it, then defend the 35-second fuse. Ember defends, and defuses with E if it goes down. Wiping the other team wins the round either way; the clock running out favours Ember. First to 5 rounds takes the match.
- **Economy:** $800 to start, $300 a kill, $3,250 for a round win, $1,900 for a loss. B opens the buy menu between rounds: Marauder-7 rifle ($2,700), Hornet-9 SMG ($1,500), Thumper frag ($300), Kevlar vest ($650).
- **Gunplay:** hitscan against bodies with 4× head damage, recoil and bloom that grow with movement and sustained fire, acceleration and crouching, collision with every wall and crate.
- **Bots:** nine of them on a waypoint graph — two hold A, two hold B, one roams mid on defence; the attack splits across A-long, mid and B-short. They see through line of sight, hear gunfire inside 28 m, strafe while they shoot in bursts, plant when they carry and defuse when the bomb is down.
- **The map:** AMBER YARD, 52 × 40 m — a walled yard at dusk with a watchtower over mid, container stacks, floodlit bomb sites and a skyline silhouette under a low amber sun. Three lanes, corners and sightlines worth playing.

## Layout

- `main.ts`: the entrypoint — copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the kit's `buildDossier`.
- `game/index.html`: the page, the HUD and the import map for three.js 0.187.0.
- `game/src/main.js`: boot, the fixed 60 Hz loop, round flow, shot resolution.
- `game/src/state.js`: the whole match in one object — phases, rounds, money, bomb.
- `game/src/world.js`: AMBER YARD — geometry, lights, sky, nav graph.
- `game/src/player.js`: movement, collision, health and armour.
- `game/src/bots.js`: the nine bots — routes, holds, vision, hearing, bursts.
- `game/src/weapons.js`: rifle, SMG, pistol, grenade and their view models.
- `game/src/bomb.js`: plant, defuse, fuse and beeps.
- `game/src/effects.js`: pooled tracers, impacts, muzzle flashes, explosions.
- `game/src/audio.js`: every sound synthesised with WebAudio — no audio files.
- `game/src/hud.js`: the DOM HUD — health, ammo, timer, score, killfeed, buy menu.
- `game/src/physics.js`: the one AABB mover and line-of-sight test everything shares.
- `game/src/util.js`: seeded RNG, pathfinding over the waypoint graph.
- `game/src/palette.js`: the dusk palette, in one place.

---

<sub>Entered on [make.fun](https://make.fun/?ref=nonicon&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
