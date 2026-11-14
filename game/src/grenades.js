// Ember charge: a thrown frag grenade. It arcs under gravity, bounces once off
// the floor, then bursts after a short fuse: radius damage that falls off with
// distance, half damage to the thrower. One live grenade at a time per thrower.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 14;
const FUSE = 1.15;
const RADIUS = 6.5;
const MAX_DAMAGE = 110;

export function createGrenades(scene, overlaps) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.4, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.5 }),
  );
  mesh.visible = false;
  mesh.castShadow = true;
  scene.add(mesh);
  const state = { active: false, fuse: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), bounced: false };
  const tmp = new THREE.Vector3();

  return {
    state,
    throwFrom(origin, direction) {
      if (state.active) return false;
      state.active = true;
      state.fuse = FUSE;
      state.bounced = false;
      state.pos.copy(origin);
      state.vel.copy(direction).multiplyScalar(16);
      state.vel.y += 4.5;
      mesh.visible = true;
      mesh.position.copy(state.pos);
      return true;
    },
    // Returns an explosion { x, y, z } when the fuse ends, else null.
    step(dt) {
      if (!state.active) return null;
      state.vel.y -= GRAVITY * dt;
      state.pos.addScaledVector(state.vel, dt);
      if (state.pos.y < 0.09) {
        state.pos.y = 0.09;
        if (!state.bounced) { state.vel.y = Math.abs(state.vel.y) * 0.45; state.vel.x *= 0.7; state.vel.z *= 0.7; state.bounced = true; }
        else { state.vel.y = 0; state.vel.x *= 0.8; state.vel.z *= 0.8; }
      }
      if (overlaps(state.pos.x, state.pos.y, state.pos.z, 0.1, 0.2, 0)) {
        state.vel.multiplyScalar(-0.3);
        state.pos.addScaledVector(state.vel, dt);
      }
      mesh.position.copy(state.pos);
      state.fuse -= dt;
      if (state.fuse > 0) return null;
      state.active = false;
      mesh.visible = false;
      tmp.copy(state.pos);
      return { x: tmp.x, y: tmp.y, z: tmp.z };
    },
    damageAt(x, y, z, isThrower) {
      const d = Math.hypot(x - state.pos.x, y - state.pos.y, z - state.pos.z);
      if (d > RADIUS) return 0;
      const falloff = 1 - d / RADIUS;
      return Math.round(MAX_DAMAGE * falloff * (isThrower ? 0.5 : 1));
    },
    reset() { state.active = false; mesh.visible = false; },
  };
}
