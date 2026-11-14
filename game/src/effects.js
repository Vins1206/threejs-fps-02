// Tracers, impact sparks and the spike blast: pooled meshes, no allocation in
// the hot loop. A tracer is a stretched amber box from muzzle to hit point;
// sparks are a small burst of points that fade; the blast is an expanding ring.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 8;
const SPARKS = 10;

export function createEffects(scene) {
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), tracerMat);
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }
  let tracerNext = 0;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.14, transparent: true, opacity: 0 }));
  scene.add(sparks);
  const sparkVel = [];
  for (let i = 0; i < SPARKS; i += 1) sparkVel.push(new THREE.Vector3());
  let sparkLife = 0;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.55, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  let ringLife = 0;

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const mid = new THREE.Vector3();

  return {
    tracer(a, b) {
      const t = tracers[tracerNext];
      tracerNext = (tracerNext + 1) % TRACERS;
      from.copy(a);
      to.copy(b);
      mid.addVectors(from, to).multiplyScalar(0.5);
      t.mesh.position.copy(mid);
      t.mesh.lookAt(to);
      t.mesh.scale.set(1, 1, from.distanceTo(to));
      t.mesh.visible = true;
      t.life = 0.09;
    },
    impact(point, seedRandom) {
      for (let i = 0; i < SPARKS; i += 1) {
        sparkPos[i * 3] = point.x;
        sparkPos[i * 3 + 1] = point.y;
        sparkPos[i * 3 + 2] = point.z;
        sparkVel[i].set(seedRandom() * 2 - 1, seedRandom() * 1.2, seedRandom() * 2 - 1).multiplyScalar(3);
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparks.material.opacity = 1;
      sparkLife = 0.35;
    },
    blast(point) {
      ring.position.set(point.x, 0.15, point.z);
      ring.visible = true;
      ringLife = 0.7;
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
      if (sparkLife > 0) {
        sparkLife -= dt;
        for (let i = 0; i < SPARKS; i += 1) {
          sparkPos[i * 3] += sparkVel[i].x * dt;
          sparkPos[i * 3 + 1] += sparkVel[i].y * dt;
          sparkPos[i * 3 + 2] += sparkVel[i].z * dt;
          sparkVel[i].y -= 6 * dt;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        sparks.material.opacity = Math.max(0, sparkLife / 0.35);
      }
      if (ringLife > 0) {
        ringLife -= dt;
        const k = 1 - ringLife / 0.7;
        ring.scale.setScalar(1 + k * 14);
        ring.material.opacity = Math.max(0, 1 - k);
        if (ringLife <= 0) ring.visible = false;
      }
    },
  };
}
