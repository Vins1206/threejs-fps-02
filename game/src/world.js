// Ember Yard: an original dusk freight yard, 48 x 36 m. Two bomb sites — Depot
// (west) and Silo (east) — joined by three lanes: a west container lane, a mid
// lane under the gantry crane, and an east lane past the fuel drums. Every box
// is a collider for players and bots and a surface a bullet stops on. No
// textures, no models: styled boxes, cylinders and fog in the yard palette.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { name: 'Depot', x: -17, z: -11, r: 3.2 },
  B: { name: 'Silo', x: 17, z: -11, r: 3.2 },
};
export const PLAYER_SPAWN = { x: 0, z: 15.5, yaw: 0 };
export const BOT_SPAWNS = [
  { x: -14, z: -13.5 },
  { x: -19, z: -6 },
  { x: 14, z: -13.5 },
  { x: 19, z: -6 },
];
// Patrol graph: bots walk node to node, so they follow real routes through the
// lanes instead of cutting across the yard in straight lines.
export const WAYPOINTS = [
  { x: -17, z: -11 }, { x: -13, z: -11 }, { x: -17, z: -5 }, { x: -10, z: -6 },
  { x: -6, z: -10 }, { x: -4, z: -2 }, { x: -12, z: 2 }, { x: -16, z: 6 },
  { x: 0, z: -8 }, { x: 0, z: 2 }, { x: 0, z: 9 },
  { x: 17, z: -11 }, { x: 13, z: -11 }, { x: 17, z: -5 }, { x: 10, z: -6 },
  { x: 6, z: -10 }, { x: 4, z: -2 }, { x: 12, z: 2 }, { x: 16, z: 6 },
  { x: -8, z: 12 }, { x: 8, z: 12 },
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of ['canvas', 'surface', 'hairline', 'ink', 'muted', 'accent', 'teal', 'rust', 'olive']) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.5 : 0.92,
      metalness: name === 'rust' || name === 'olive' ? 0.25 : 0.03,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  function cylinder(rTop, rBottom, h, x, y, z, mat, segments = 20) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // Colliders are axis-aligned boxes; a cylinder is approximated by its square.
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - rBottom, y - h / 2, z - rBottom),
      new THREE.Vector3(x + rBottom, y + h / 2, z + rBottom),
    ));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter, 5 m walls, open sky so the dusk key light reaches in.
  box(48.4, 0.4, 36.4, 0, -0.2, 0, 'surface');
  box(0.4, 5, 36.4, -24.2, 2.5, 0, 'hairline');
  box(0.4, 5, 36.4, 24.2, 2.5, 0, 'hairline');
  box(48.4, 5, 0.4, 0, 2.5, -18.2, 'hairline');
  box(48.4, 5, 0.4, 0, 2.5, 18.2, 'hairline');

  // Site pads: flat amber rings the spike can be planted on.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, 0.08, 28),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35 }));
    pad.position.set(s.x, 0.04, s.z);
    pad.receiveShadow = true;
    group.add(pad);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), materials.hairline);
    post.position.set(s.x, 1.3, s.z - s.r - 0.6);
    post.castShadow = true;
    group.add(post);
  }

  // Site B silo, the yard's landmark.
  cylinder(3, 3, 7.5, 19.5, 3.75, -14.5, 'rust');
  cylinder(3.3, 3.3, 0.5, 19.5, 7.7, -14.5, 'hairline');
  // Site A depot shed: low roof on posts, open on two sides.
  box(7, 0.3, 6, -17, 3.4, -12, 'hairline');
  box(0.35, 3.4, 0.35, -20.2, 1.7, -14.6, 'hairline');
  box(0.35, 3.4, 0.35, -13.8, 1.7, -14.6, 'hairline');
  box(0.35, 3.4, 0.35, -20.2, 1.7, -9.4, 'hairline');

  // Gantry crane across mid: two legs and a high beam (beam is above head height).
  box(0.8, 6, 0.8, -7, 3, 0, 'rust');
  box(0.8, 6, 0.8, 7, 3, 0, 'rust');
  box(15.6, 0.9, 1.1, 0, 6.2, 0, 'rust');
  box(2.2, 0.8, 1.4, -2, 5.5, 0, 'hairline'); // crane cab, high up

  // Containers form the three lanes. West lane: rust stack; east lane: olive.
  box(6, 2.6, 2.6, -16, 1.3, 2, 'rust');
  box(6, 2.6, 2.6, -16, 3.9, 2, 'olive');
  box(2.6, 2.6, 6, -11, 1.3, -4, 'olive');
  box(6, 2.6, 2.6, -6, 1.3, -13, 'rust');
  box(6, 2.6, 2.6, 16, 1.3, 2, 'olive');
  box(6, 2.6, 2.6, 16, 3.9, 2, 'rust');
  box(2.6, 2.6, 6, 11, 1.3, -4, 'rust');
  box(6, 2.6, 2.6, 6, 1.3, -13, 'olive');
  // Mid cover: crates to crouch behind, drums, a low wall at spawn.
  box(2.2, 1.1, 1.2, -3, 0.55, 4, 'hairline');
  box(2.2, 1.1, 1.2, 3, 0.55, 4, 'hairline');
  box(1.2, 1.1, 2.2, -1.5, 0.55, -6, 'hairline');
  box(1.2, 1.1, 2.2, 1.5, 0.55, -6, 'hairline');
  box(4.5, 0.9, 1, 0, 0.45, 12.5, 'hairline');
  cylinder(0.55, 0.55, 1.1, -9, 0.55, 8, 'teal');
  cylinder(0.55, 0.55, 1.1, -8, 0.55, 8.9, 'rust');
  cylinder(0.55, 0.55, 1.1, 9, 0.55, 8, 'rust');
  cylinder(0.55, 0.55, 1.1, 10, 0.55, 8.9, 'teal');
  box(1.4, 1.4, 1.4, -21, 0.7, -14, 'hairline');
  box(1.4, 1.4, 1.4, 13, 0.7, -15, 'hairline');
  box(1.4, 0.7, 1.4, 13, 0.35, -13.2, 'hairline');

  // Dusk light: low amber key from the west, cool teal fill, warm hemisphere.
  const sky = new THREE.HemisphereLight(new THREE.Color('#f2c98a'), new THREE.Color(PALETTE.canvas), 1.15);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.6);
  key.position.set(-18, 16, 10);
  key.target.position.set(4, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.teal), 0.5);
  fill.position.set(14, 10, 12);
  scene.add(fill);
  // Site beacons: amber point lights over each pad so the objective reads at a glance.
  for (const keyName of ['A', 'B']) {
    const s = SITES[keyName];
    const beacon = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 12);
    beacon.position.set(s.x, 3.2, s.z);
    scene.add(beacon);
  }

  // One shared AABB probe, reused by player and bots (no allocation per test).
  const probe = new THREE.Box3();
  function overlaps(x, y, z, radius, height, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }

  return { colliders, shootables, group, overlaps };
}
