// The towers and cables of the named sea bridges in the game (WLD-22c, ADR-0037): bridgeparts.js finds each deck and builds the geometry; here one
// merged mesh per bridge in the highways' structure material (no new shader), a static box for each tower leg, hidden past SHOW.
import * as THREE from 'three';
import { BRIDGES } from './regions/index.js';
import { findDeck, bridgeParts } from './bridgeparts.js';
import { Acc } from './highways.js';
import { GR, grp } from './physics.js';

const SHOW = 14000;

export class Bridges {
  constructor(scene, mat, phys) {
    this.group = new THREE.Group(); this.group.name = 'bridges'; this.items = []; this.cols = [];
    for (const b of BRIDGES) {
      const D = findDeck(b); if (!D) continue;
      const A = new Acc(), legs = [], { top } = bridgeParts(b, D, A, legs), mesh = A.mesh(mat); mesh.name = 'bridge:' + b.id; this.group.add(mesh);
      this.items.push({ b, D, top, mesh, legs, tris: A.i.length / 3 });
      if (phys) for (const l of legs) {   // a tower leg stops a plane or a car that leaves the deck
        const R = phys.R, a = Math.atan2(D.tx, D.tz), q = { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }, hy = (l.y1 - l.y0) / 2;
        this.cols.push(phys.world.createCollider(R.ColliderDesc.cuboid(l.w / 2, hy, l.w / 2).setTranslation(l.x, l.y0 + hy, l.z).setRotation(q).setFriction(0.6).setCollisionGroups(grp(GR.STATIC, 0xffff))));
      }
    }
    scene.add(this.group);
  }
  // past SHOW the towers are hidden (the fog has taken them; the far land shows no bridges either)
  update(camera) { const x = camera.position.x, z = camera.position.z; for (const it of this.items) it.mesh.visible = Math.hypot(it.D.x - x, it.D.z - z) < SHOW; }
}
