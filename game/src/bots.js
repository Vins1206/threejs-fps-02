// The Slate defenders: four bots that hold the two sites, patrol the lanes on
// the waypoint graph, investigate gunfire, engage on sight, and defuse a
// planted spike. They see through a real line-of-sight raycast, react after a
// short delay, and miss more against a moving, crouched or distant target —
// so stopping, peeking and flanking beat standing in the open.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS, BOT_SPAWNS } from './world.js';

const NAMES = ['Vex', 'Moss', 'Rook', 'Fenn'];
const HEALTH = 100;
const WALK_SPEED = 3.1;
const ENGAGE_SPEED = 3.9;
const VIEW_DIST = 34;
const REACTION = 0.45;

export function createBots(scene, world, rng, hooks) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.6, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22262b'), roughness: 0.85 });
  const visorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.6 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.2, 0.8, 0.22);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);

  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const losFrom = new THREE.Vector3();
  const losDir = new THREE.Vector3();
  const toPlayer = new THREE.Vector3();
  const muzzle = new THREE.Vector3();
  const chest = new THREE.Vector3();

  const bots = [];
  for (let i = 0; i < 4; i += 1) {
    const group = new THREE.Group();
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.13, 0.4, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.13, 0.4, 0);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.16;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, darkMat);
    head.position.y = 1.66;
    head.userData.part = 'head';
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), visorMat);
    visor.position.set(0, 1.67, -0.14);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.22, 1.25, -0.3);
    group.add(legL, legR, torso, head, visor, gun);
    group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    scene.add(group);
    const bot = {
      name: NAMES[i], group, torso, head, health: HEALTH, alive: true,
      pos: group.position, yaw: 0, state: i < 2 ? 'hold' : 'patrol',
      home: BOT_SPAWNS[i], node: i * 5, seenTimer: 0, shootTimer: 1 + rng() * 0.5,
      burstLeft: 0, burstTimer: 0, acquireTimer: 0, fall: 0, hearPos: null,
      holdSpot: BOT_SPAWNS[i], patrolDir: 1,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    bot.pos.set(bot.home.x, 0, bot.home.z);
    bots.push(bot);
  }

  function canSee(bot, playerPos, playerAlive) {
    if (!playerAlive) return false;
    toPlayer.set(playerPos.x - bot.pos.x, 0, playerPos.z - bot.pos.z);
    const dist = Math.hypot(toPlayer.x, toPlayer.z);
    if (dist > VIEW_DIST) return false;
    const facing = Math.atan2(-toPlayer.x, -toPlayer.z);
    let diff = Math.abs(facing - bot.yaw);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > 1.9 && dist > 4) return false; // outside the bot's view cone
    losFrom.set(bot.pos.x, 1.55, bot.pos.z);
    losDir.set(playerPos.x - bot.pos.x, 1.3 - 1.55, playerPos.z - bot.pos.z).normalize();
    raycaster.set(losFrom, losDir);
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit || hit.distance > dist + 0.5;
  }

  function moveToward(bot, x, z, dt, speed) {
    const dx = x - bot.pos.x;
    const dz = z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.15) return true;
    const vx = (dx / dist) * speed;
    const vz = (dz / dist) * speed;
    bot.yaw = Math.atan2(-dx, -dz);
    const nx = bot.pos.x + vx * dt;
    if (!world.overlaps(nx, 0, bot.pos.z, 0.34, 1.72, 0.04)) bot.pos.x = nx;
    const nz = bot.pos.z + vz * dt;
    if (!world.overlaps(bot.pos.x, 0, nz, 0.34, 1.72, 0.04)) bot.pos.z = nz;
    return dist < 0.4;
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i += 1) {
      const d = (WAYPOINTS[i].x - x) ** 2 + (WAYPOINTS[i].z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function step(dt, player, match) {
    for (const bot of bots) {
      if (!bot.alive) {
        if (bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt / 0.4);
          bot.group.rotation.x = -bot.fall * 1.45;
        }
        continue;
      }
      bot.shootTimer -= dt;
      bot.seenTimer -= dt;
      const playerPos = player.position;
      const sees = canSee(bot, playerPos, player.alive);
      if (sees) {
        bot.seenTimer = 0.6;
        if (bot.acquireTimer <= 0) bot.acquireTimer = REACTION;
      }
      bot.acquireTimer -= dt;

      // Spike planted: the nearest alive bot runs to defuse; the rest converge.
      if (match.spike === 'planted' && match.spikePos) {
        bot.state = 'defuse';
        moveToward(bot, match.spikePos.x, match.spikePos.z, dt, ENGAGE_SPEED);
        continue;
      }
      if (bot.hearPos && bot.state !== 'engage') bot.state = 'investigate';
      if (bot.seenTimer > 0) bot.state = 'engage';

      if (bot.state === 'engage') {
        if (sees) {
          // Strafe a little while firing, never stand perfectly still.
          const strafe = Math.sin(match.time * 1.3 + bot.node) * 0.6;
          moveToward(bot, bot.pos.x + Math.cos(bot.yaw) * strafe, bot.pos.z - Math.sin(bot.yaw) * strafe, dt, 1.2);
          if (bot.acquireTimer <= 0 && bot.shootTimer <= 0) {
            bot.burstLeft = 3 + Math.floor(rng() * 3);
            bot.burstTimer = 0;
            bot.shootTimer = 0.9 + rng() * 0.7;
          }
        } else if (bot.hearPos) {
          moveToward(bot, bot.hearPos.x, bot.hearPos.z, dt, ENGAGE_SPEED);
        } else {
          bot.state = bot.node % 2 === 0 ? 'hold' : 'patrol';
        }
      } else if (bot.state === 'investigate' && bot.hearPos) {
        if (moveToward(bot, bot.hearPos.x, bot.hearPos.z, dt, ENGAGE_SPEED)) bot.hearPos = null;
      } else if (bot.state === 'patrol') {
        const node = WAYPOINTS[bot.node];
        if (moveToward(bot, node.x, node.z, dt, WALK_SPEED)) {
          bot.node = (bot.node + bot.patrolDir * 3 + WAYPOINTS.length) % WAYPOINTS.length;
          if (rng() < 0.3) bot.patrolDir *= -1;
        }
      } else { // hold: sway on the spot, watch the site
        bot.yaw += Math.sin(match.time * 0.5 + bot.node) * dt * 0.4;
      }

      // Burst fire: each round is a tracer plus a hit roll against the player.
      if (bot.burstLeft > 0) {
        bot.burstTimer -= dt;
        if (bot.burstTimer <= 0) {
          bot.burstTimer = 0.13;
          bot.burstLeft -= 1;
          muzzle.set(bot.pos.x, 1.3, bot.pos.z);
          chest.set(playerPos.x, playerPos.y + 1.2, playerPos.z);
          hooks.tracer(muzzle, chest);
          const dist = Math.hypot(playerPos.x - bot.pos.x, playerPos.z - bot.pos.z);
          const speed = Math.hypot(player.velocity.x, player.velocity.z);
          const crouch = player.crouching ? 0.06 : 0;
          const chance = Math.max(0.07, Math.min(0.5, 0.5 - dist * 0.011 - speed * 0.03 + crouch));
          const hit = rng() < chance;
          hooks.enemyShot(bot, hit, hit ? 9 + Math.floor(rng() * 8) : 0, dist);
        }
      }
      bot.group.rotation.y = bot.yaw;
      bot.group.rotation.x = 0;
    }
  }

  function damage(mesh, amount) {
    const bot = mesh.userData.bot;
    if (!bot || !bot.alive) return null;
    bot.health -= amount;
    if (bot.health > 0) return { bot, killed: false };
    bot.alive = false;
    bot.fall = 0;
    bot.burstLeft = 0;
    return { bot, killed: true };
  }

  return {
    bots,
    step,
    damage,
    aliveCount() { return bots.filter((b) => b.alive).length; },
    hear(x, z) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(bot.pos.x - x, bot.pos.z - z);
        if (d < 26) bot.hearPos = { x, z };
      }
    },
    aimPoint(index) {
      const bot = bots[index % bots.length];
      return { x: bot.pos.x, y: 1.2, z: bot.pos.z, bot };
    },
    reset() {
      for (let i = 0; i < bots.length; i += 1) {
        const bot = bots[i];
        bot.health = HEALTH;
        bot.alive = true;
        bot.fall = 0;
        bot.pos.set(bot.home.x, 0, bot.home.z);
        bot.yaw = Math.atan2(-(0 - bot.home.x), -(-8 - bot.home.z));
        bot.group.rotation.set(0, bot.yaw, 0);
        bot.state = i < 2 ? 'hold' : 'patrol';
        bot.node = nearestNode(bot.home.x, bot.home.z);
        bot.hearPos = null;
        bot.burstLeft = 0;
        bot.shootTimer = 1 + rng() * 0.5;
        bot.seenTimer = 0;
      }
    },
  };
}
