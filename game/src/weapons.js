// The arsenal: four guns and one grenade, each with its own numbers. Accuracy
// is the economy of the game: standing still is tight, moving or spraying is
// wide, crouching steadies the aim. Headshots pay double-plus. main.js owns the
// ray and the damage; this module owns the gun's state and its view model.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const ARSENAL = {
  pistol: { name: 'Kestrel-9', kind: 'pistol', price: 0, damage: 26, headMult: 3, mag: 12, reserve: 48, gap: 0.14, reload: 1.4, spreadStill: 0.004, spreadMove: 0.02, pellets: 1, auto: false },
  rifle: { name: 'Longspur', kind: 'rifle', price: 2700, damage: 34, headMult: 3, mag: 30, reserve: 90, gap: 0.105, reload: 2.1, spreadStill: 0.0016, spreadMove: 0.026, pellets: 1, auto: true },
  smg: { name: 'Hornet', kind: 'smg', price: 1500, damage: 22, headMult: 3, mag: 32, reserve: 96, gap: 0.07, reload: 1.7, spreadStill: 0.006, spreadMove: 0.03, pellets: 1, auto: true },
  shotgun: { name: 'Breacher', kind: 'shotgun', price: 1100, damage: 11, headMult: 2, mag: 6, reserve: 24, gap: 0.85, reload: 2.4, spreadStill: 0.03, spreadMove: 0.045, pellets: 8, auto: false },
};
export const GRENADE_PRICE = 300;
export const SLOT_KEYS = { Digit1: 'pistol', Digit2: 'rifle', Digit3: 'smg', Digit4: 'shotgun' };

export function createWeapons(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const amber = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.2 });

  // One view model, rebuilt per weapon from shared geometries (no new geometry
  // in the hot loop): receiver + barrel + stock, scaled per gun.
  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
  barrel.position.set(0, 0.025, -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, 0.3);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), amber);
  sight.position.set(0, 0.075, -0.05);
  model.add(receiver, barrel, stock, sight);
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = { pistol: true, rifle: false, smg: false, shotgun: false };
  const ammo = {};
  for (const key of Object.keys(ARSENAL)) ammo[key] = { mag: ARSENAL[key].mag, reserve: ARSENAL[key].reserve };
  const state = { current: 'pistol', cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, grenades: 0 };

  function applyModel() {
    const def = ARSENAL[state.current];
    const scale = def.kind === 'shotgun' ? 1.25 : def.kind === 'rifle' ? 1.15 : def.kind === 'smg' ? 0.9 : 0.7;
    model.scale.set(scale, scale, scale);
    barrel.scale.set(1, 1, def.kind === 'shotgun' ? 0.8 : def.kind === 'rifle' ? 1.3 : 1);
  }
  applyModel();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const a = ammo[state.current];
        const need = def().mag - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
  }
  function def() { return ARSENAL[state.current]; }

  return {
    state, owned, ammo,
    def,
    step,
    ready() {
      const a = ammo[state.current];
      return a.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = def().kind === 'shotgun' ? 0.11 : def().kind === 'rifle' ? 0.06 : 0.045;
    },
    takeRound() {
      const a = ammo[state.current];
      if (a.mag <= 0) return false;
      a.mag -= 1;
      return true;
    },
    reload() {
      const a = ammo[state.current];
      if (state.reloadLeft > 0 || a.mag === def().mag || a.reserve === 0) return false;
      state.reloadLeft = def().reload;
      return true;
    },
    spread(speed, crouching) {
      const d = def();
      const move = Math.min(1, speed / 5.2) * d.spreadMove;
      const crouch = crouching ? 0.6 : 1;
      return (d.spreadStill + move) * crouch;
    },
    recoil() {
      const d = def();
      return d.kind === 'shotgun' ? 0.028 : d.kind === 'rifle' ? 0.011 : d.kind === 'smg' ? 0.007 : 0.009;
    },
    switchTo(key) {
      if (!owned[key] || key === state.current || state.reloadLeft > 0) return false;
      state.current = key;
      state.cooldown = Math.max(state.cooldown, 0.25);
      applyModel();
      return true;
    },
    buy(key, money) {
      if (owned[key]) return { ok: false, money, reason: 'already owned' };
      const price = ARSENAL[key].price;
      if (money < price) return { ok: false, money, reason: 'not enough credits' };
      owned[key] = true;
      ammo[key] = { mag: ARSENAL[key].mag, reserve: ARSENAL[key].reserve };
      return { ok: true, money: money - price, reason: '' };
    },
    buyGrenade(money) {
      if (money < GRENADE_PRICE) return { ok: false, money, reason: 'not enough credits' };
      state.grenades += 1;
      return { ok: true, money: money - GRENADE_PRICE, reason: '' };
    },
    resetRound() {
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      for (const key of Object.keys(ARSENAL)) {
        if (owned[key]) ammo[key] = { mag: ARSENAL[key].mag, reserve: ARSENAL[key].reserve };
      }
      state.current = owned.rifle ? 'rifle' : 'pistol';
      applyModel();
    },
  };
}
