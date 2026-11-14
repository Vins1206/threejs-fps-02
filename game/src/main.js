// Ember Yard boot and the one loop: a fixed 60 Hz simulation feeding a render
// at the display's rate. main.js owns the round flow (buy -> live -> round end),
// the player's ray, the plant/defuse objective and the score; the modules own
// their own jobs. ?shot=start|buy|play|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes and sets __shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, PLAYER_SPAWN } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, SLOT_KEYS, GRENADE_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenades.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMatch, scoreRound, nextRound, addFeed, ROUND_TIME, BUY_TIME, PLANT_TIME, FUSE_TIME, DEFUSE_TIME } from './state.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const match = createMatch();
const player = createPlayer(world.overlaps, PLAYER_SPAWN);
const weapons = createWeapons(camera);
const grenades = createGrenades(scene, world.overlaps);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

const bots = createBots(scene, world, random, {
  tracer(a, b) { effects.tracer(a, b); },
  enemyShot(bot, hit, damage, dist) {
    audio.enemyShot(dist);
    if (!hit || !player.state.alive) return;
    const died = player.damage(damage);
    hud.damageFlash();
    if (died) onPlayerDeath(bot.name);
  },
});
const shootables = world.shootables.concat(bots.bots.flatMap((b) => [b.torso, b.head]));

const hud = createHud({
  play() {
    audio.unlock();
    if (shot) return;
    if (match.phase === 'menu') startMatch();
    else if (match.phase === 'roundEnd') advanceRound();
    else if (match.phase === 'matchEnd') restartMatch();
    else input.requestLock();
  },
  buy(key) {
    if (match.phase !== 'buy') { hud.message('The shop is only open before the round.'); return; }
    if (key === 'grenade') {
      const res = weapons.buyGrenade(match.money);
      if (res.ok) { match.money = res.money; audio.buy(); hud.updateBuy(match.money, weapons.owned, weapons.state.grenades); }
      else hud.message(res.reason);
      return;
    }
    const res = weapons.buy(key, match.money);
    if (res.ok) {
      match.money = res.money;
      audio.buy();
      weapons.switchTo(key);
      hud.updateBuy(match.money, weapons.owned, weapons.state.grenades);
    } else hud.message(res.reason);
  },
});

const body = player.state;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let plantBeepAt = 0;
let defuseBeepAt = 0;

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function startMatch() {
  match.phase = 'buy';
  match.timer = BUY_TIME;
  hud.hideOverlay();
  hud.showBuy(match.money, weapons.owned, weapons.state.grenades);
  hud.message('Buy phase — B opens the shop. Plant at Depot (A) or Silo (B).');
  input.requestLock();
}

function startRound() {
  match.phase = 'live';
  match.timer = ROUND_TIME;
  hud.hideBuy();
  hud.message(`Round ${match.round} — plant the spike at A or B.`);
}

function advanceRound() {
  if (match.matchWinner) {
    match.phase = 'matchEnd';
    hud.showOverlay('matchEnd', { winner: match.matchWinner, wins: match.wins, losses: match.losses, kills: match.kills, plants: match.plants });
    if (document.pointerLockElement) document.exitPointerLock();
    return;
  }
  nextRound(match);
  player.reset();
  weapons.resetRound();
  bots.reset();
  grenades.reset();
  match.timer = BUY_TIME;
  hud.hideOverlay();
  hud.showBuy(match.money, weapons.owned, weapons.state.grenades);
  hud.message(`Round ${match.round} — buy phase.`);
  input.requestLock();
}

function restartMatch() {
  const fresh = createMatch();
  Object.assign(match, fresh);
  player.reset();
  weapons.resetRound();
  bots.reset();
  grenades.reset();
  startMatch();
}

function onPlayerDeath(byName) {
  match.deaths += 1;
  addFeed(match, `${byName} dropped you`, false);
  hud.setFeed(match.feed);
  audio.roundLose();
  if (match.spike === 'planted') {
    hud.message('You are down — the spike is still ticking.');
    return; // the fuse or a defuse still decides the round
  }
  endRound('slate', `You were dropped by ${byName}.`);
}

function endRound(winner, reason) {
  if (match.phase === 'roundEnd' || match.phase === 'matchEnd') return;
  scoreRound(match, winner, reason);
  addFeed(match, reason, winner === 'ember');
  hud.setFeed(match.feed);
  hud.hideBuy();
  hud.setPlant(null, 0);
  if (winner === 'ember') audio.roundWin();
  else audio.roundLose();
  hud.showOverlay('roundEnd', { winner, reason: `${reason} Ember ${match.wins} — ${match.losses} Slate.` });
  if (document.pointerLockElement) document.exitPointerLock();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (match.phase === 'menu') startMatch();
  } else if (match.phase === 'live' || match.phase === 'buy') {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(x, y, z) {
  const dx = x - body.position.x;
  const dy = y - (body.position.y + body.eye);
  const dz = z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function nearestSite() {
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    if (Math.hypot(body.position.x - s.x, body.position.z - s.z) <= s.r) return key;
  }
  return null;
}

function shoot(spread) {
  const def = weapons.def();
  if (!weapons.takeRound()) { audio.dry(); return false; }
  camera.getWorldDirection(direction);
  let hitSomething = false;
  for (let p = 0; p < def.pellets; p += 1) {
    tmpVec.copy(direction);
    tmpVec.x += (random() * 2 - 1) * spread;
    tmpVec.y += (random() * 2 - 1) * spread;
    tmpVec.z += (random() * 2 - 1) * spread;
    tmpVec.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, tmpVec);
    const hit = raycaster.intersectObjects(shootables, false)[0];
    muzzlePos.set(camera.position.x, camera.position.y - 0.15, camera.position.z);
    if (!hit) {
      tmpVec.addScaledVector(direction, 60);
      effects.tracer(muzzlePos, tmpVec);
      continue;
    }
    effects.tracer(muzzlePos, hit.point);
    const botMesh = hit.object.userData.bot;
    if (botMesh) {
      const isHead = hit.object.userData.part === 'head';
      const dmg = Math.round(def.damage * (isHead ? def.headMult : 1));
      const result = bots.damage(hit.object, dmg);
      hitSomething = true;
      hud.hitMarker(result && result.killed, shot ? 4000 : 120);
      audio.hit();
      if (result && result.killed) {
        match.kills += 1;
        match.money += 300;
        addFeed(match, `You dropped ${result.bot.name}${isHead ? ' — headshot' : ''}`, true);
        hud.setFeed(match.feed);
        audio.kill();
        bots.hear(hit.point.x, hit.point.z);
        if (bots.aliveCount() === 0) endRound('ember', 'All four Slate defenders are down.');
      }
    } else {
      effects.impact(hit.point, random);
    }
  }
  weapons.pullTrigger();
  audio.shot(def.kind);
  player.recoil(weapons.recoil(), (random() * 2 - 1) * 0.003);
  bots.hear(body.position.x, body.position.z);
  return hitSomething;
}

function explodeSpike() {
  match.spike = 'detonated';
  effects.blast(match.spikePos);
  audio.explosion();
  endRound('ember', `Spike detonated at ${match.spikeSite === 'A' ? 'Depot' : 'Silo'}.`);
}

function step(dt) {
  match.time += dt;
  if (match.phase === 'buy') {
    match.timer -= dt;
    player.step(dt, input.state.keys);
    if (match.timer <= 0) startRound();
  } else if (match.phase === 'live') {
    match.timer -= dt;
    player.step(dt, input.state.keys);
    weapons.step(dt);
    bots.step(dt, body, match);
    const boom = grenades.step(dt);
    if (boom) {
      effects.blast(boom);
      audio.explosion();
      for (const bot of bots.bots) {
        if (!bot.alive) continue;
        const dmg = grenades.damageAt(bot.pos.x, bot.pos.y + 1.2, bot.pos.z, false);
        if (dmg > 0) {
          const result = bots.damage(bot.torso, dmg);
          if (result && result.killed) {
            match.kills += 1;
            match.money += 300;
            addFeed(match, `Ember charge dropped ${bot.name}`, true);
            hud.setFeed(match.feed);
          }
        }
      }
      const selfDmg = grenades.damageAt(body.position.x, body.position.y + 1.2, body.position.z, true);
      if (selfDmg > 0 && player.state.alive) {
        const died = player.damage(selfDmg);
        hud.damageFlash();
        if (died) onPlayerDeath('your own charge');
      }
      if (bots.aliveCount() === 0 && match.phase === 'live') endRound('ember', 'All four Slate defenders are down.');
    }
    effects.step(dt);

    // Planting: hold E on a site pad while carrying the spike.
    const site = nearestSite();
    if (match.spike === 'carried' && site && input.state.keys.has('KeyE') && player.state.alive) {
      match.spikeSite = site;
      match.plantProgress += dt / PLANT_TIME;
      hud.setPlant(`PLANTING SPIKE — ${SITES[site].name}`, match.plantProgress);
      if (match.time - plantBeepAt > 0.75) { plantBeepAt = match.time; audio.plantBeep(); }
      if (match.plantProgress >= 1) {
        match.spike = 'planted';
        match.plants += 1;
        match.spikePos = { x: body.position.x, z: body.position.z };
        match.timer = FUSE_TIME;
        match.money += 300;
        addFeed(match, `Spike planted at ${SITES[site].name}`, true);
        hud.setFeed(match.feed);
        hud.setPlant(null, 0);
        hud.message('Spike planted — defend it for 30 seconds.');
        audio.plantBeep();
      }
    } else {
      if (match.spike === 'carried') {
        match.plantProgress = Math.max(0, match.plantProgress - dt / PLANT_TIME);
        hud.setPlant(site ? 'HOLD E TO PLANT' : null, match.plantProgress);
      }
    }

    // Planted: fuse ticks down; a defender on the spike defuses it.
    if (match.spike === 'planted') {
      hud.setPlant('SPIKE PLANTED — DEFEND IT', 1 - match.timer / FUSE_TIME);
      let defuser = null;
      for (const bot of bots.bots) {
        if (bot.alive && match.spikePos && Math.hypot(bot.pos.x - match.spikePos.x, bot.pos.z - match.spikePos.z) < 2) { defuser = bot; break; }
      }
      if (defuser) {
        match.defuseProgress += dt / DEFUSE_TIME;
        if (match.time - defuseBeepAt > 0.5) { defuseBeepAt = match.time; audio.plantBeep(); }
        if (match.defuseProgress >= 1) {
          match.spike = 'defused';
          endRound('slate', `${defuser.name} defused the spike.`);
        }
      } else match.defuseProgress = Math.max(0, match.defuseProgress - dt / DEFUSE_TIME);
      if (match.timer <= 0 && match.phase === 'live') explodeSpike();
    } else if (match.timer <= 0) {
      endRound('slate', 'Time expired — Slate holds the yard.');
    }
  } else if (match.phase === 'roundEnd') {
    match.timer -= dt;
    weapons.step(dt);
    effects.step(dt);
    if (match.timer <= 0) advanceRound();
  }

  // HUD, every step (guards inside make unchanged writes free).
  const a = weapons.ammo[weapons.state.current];
  hud.setAmmo(a.mag, a.reserve, weapons.def().name + (weapons.state.grenades ? ` · ${weapons.state.grenades}x charge` : ''));
  hud.setHealth(player.state.health);
  hud.setMoney(match.money);
  hud.setScore(match.wins, match.losses, match.round);
  hud.setTimer(match.phase === 'live' || match.phase === 'buy' ? fmtTime(match.timer) : match.phase === 'roundEnd' ? '—' : fmtTime(match.timer));
  hud.setSpread(weapons.spread(player.groundSpeed(), player.state.crouching));
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const pressed = input.takePressed();
    if (!shot && match.phase !== 'menu') {
      if (pressed.has('KeyB') && match.phase === 'buy') {
        const buyEl = document.getElementById('buy');
        if (buyEl.hidden) hud.showBuy(match.money, weapons.owned, weapons.state.grenades);
        else hud.hideBuy();
      }
      if (pressed.has('KeyR')) { if (weapons.reload()) audio.reload(); }
      if (pressed.has('KeyG') && weapons.state.grenades > 0 && match.phase === 'live') {
        camera.getWorldDirection(direction);
        if (grenades.throwFrom(tmpVec.set(body.position.x, body.position.y + body.eye, body.position.z), direction)) {
          weapons.state.grenades -= 1;
          audio.reload();
        }
      }
      for (const code of Object.keys(SLOT_KEYS)) {
        if (pressed.has(code)) weapons.switchTo(SLOT_KEYS[code]);
      }
    }
    if (input.state.firing && match.phase === 'live' && player.state.alive && weapons.ready()) {
      shoot(shot ? 0 : weapons.spread(player.groundSpeed(), player.state.crouching));
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  if (name === 'start') {
    body.position.set(0, 0, 15.5);
    settle(10);
    aimAt(-6, 1.6, -8);
    hud.showOverlay('start');
  } else if (name === 'buy') {
    match.phase = 'buy';
    match.money = 3200;
    weapons.buy('rifle', match.money);
    match.money = 3200 - 2700;
    weapons.switchTo('rifle');
    body.position.set(-2, 0, 10);
    settle(10);
    aimAt(17, 2, -11);
    hud.showBuy(match.money, weapons.owned, weapons.state.grenades);
    hud.message('Buy phase — Longspur rifle, $500 left.');
  } else if (name === 'play' || name === 'end') {
    match.phase = 'live';
    match.timer = 84;
    match.wins = name === 'end' ? 3 : 1;
    match.losses = name === 'end' ? 1 : 0;
    match.money = 5000;
    weapons.buy('rifle', match.money);
    weapons.switchTo('rifle');
    match.money = 2450;
    body.position.set(-1, 0, 6);
    settle(10);
    // Stage one defender in the open mid lane, facing the player, so the
    // capture is a real firefight down a clear sightline, not shots into a
    // container. (The rifle buy above needs $2,700; the staged $5,000 funds it.)
    const staged = bots.bots[2];
    staged.pos.set(2, 0, -2);
    staged.state = 'hold';
    staged.yaw = Math.atan2(3, -8);
    staged.group.rotation.y = staged.yaw;
    // Fire at the staged defender until one drops, then hold the frame.
    const target = bots.aimPoint(2);
    for (let round = 0; round < 12; round += 1) {
      aimAt(target.x, 1.35, target.z);
      shoot(0);
      settle(7);
      if (bots.aliveCount() < 4) break;
    }
    if (name === 'play') {
      settle(6);
      aimAt(bots.aimPoint(2).x, 1.3, bots.aimPoint(2).z);
    } else {
      match.spike = 'detonated';
      match.spikeSite = 'B';
      scoreRound(match, 'ember', 'Spike detonated at Silo.');
      hud.showOverlay('roundEnd', { winner: 'ember', reason: 'Spike detonated at Silo. Ember 4 — 1 Slate.' });
    }
  }
  hud.setAmmo(weapons.ammo[weapons.state.current].mag, weapons.ammo[weapons.state.current].reserve, weapons.def().name);
  hud.setHealth(player.state.health);
  hud.setMoney(match.money);
  hud.setScore(match.wins, match.losses, match.round);
  hud.setTimer(fmtTime(match.timer));
  document.body.dataset.shotInfo = JSON.stringify({
    shot: name, phase: match.phase, aliveBots: bots.aliveCount(),
    kills: match.kills, money: match.money, mag: weapons.ammo[weapons.state.current].mag,
    health: player.state.health, wins: match.wins, losses: match.losses,
  });
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.setAmmo(weapons.ammo.pistol.mag, weapons.ammo.pistol.reserve, 'Kestrel-9');
hud.setHealth(100);
hud.setMoney(800);
hud.setScore(0, 0, 1);
hud.setTimer(fmtTime(BUY_TIME));
if (shot) runShot(shot);
else requestAnimationFrame(frame);
