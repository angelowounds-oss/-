import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import soldierB64 from '../assets/Soldier.glb';
import ferrariB64 from '../assets/ferrari.glb';
import hydrantB64 from '../assets/props/fire_hydrant.glb';
import trashB64 from '../assets/props/metal_trash_can.glb';
import boxB64 from '../assets/props/utility_box_01.glb';
import bagB64 from '../assets/props/trashbag.glb';
import plantB64 from '../assets/props/potted_plant_01.glb';
import sniperMagB64 from '../assets/props/sniper_mag.glb';
import livingB64 from '../assets/props/living_set.glb';
import streetPropsB64 from '../assets/props/street_props.glb';
import streetSignsB64 from '../assets/props/street_signs.glb';
import furnitureB64 from '../assets/interior/furniture.glb';
import res01B64 from '../assets/res/res_01.glb';
import res02B64 from '../assets/res/res_02.glb';
import res03B64 from '../assets/res/res_03.glb';
import res04B64 from '../assets/res/res_04.glb';
import res05B64 from '../assets/res/res_05.glb';
import res06B64 from '../assets/res/res_06.glb';
import res07B64 from '../assets/res/res_07.glb';
import res08B64 from '../assets/res/res_08.glb';
import res09B64 from '../assets/res/res_09.glb';
import res10B64 from '../assets/res/res_10.glb';

// Embedded CC assets: Soldier (three.js examples, Mixamo rig) and Ferrari 458 (CC-BY 4.0, vicent091036).
const b64ToBuf = (s) => { const bin = atob(s), n = bin.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
export const A = { soldier: null, ferrari: null, props: null, res: null, ok: false };

export async function loadAssets() {
  const loader = new GLTFLoader();
  try {
    const [s, f] = await Promise.all([loader.parseAsync(b64ToBuf(soldierB64), ''), loader.parseAsync(b64ToBuf(ferrariB64), '')]);
    A.soldier = s; A.ferrari = f;
    // CC0 Poly Haven street props (decimated, 256px textures); a failure here must not take the characters down with it
    try {
      const src = { fire_hydrant: hydrantB64, metal_trash_can: trashB64, utility_box_01: boxB64, trashbag: bagB64, potted_plant_01: plantB64, sniper_mag: sniperMagB64, living_set: livingB64, street_props: streetPropsB64, street_signs: streetSignsB64, furniture: furnitureB64 };
      const out = {};
      await Promise.all(Object.entries(src).map(async ([k, b]) => { out[k] = (await loader.parseAsync(b64ToBuf(b), '')).scene; }));
      A.props = out;
    } catch (e) { console.warn('prop load failed', e); }
    try {
      const rs = [res01B64, res02B64, res03B64, res04B64, res05B64, res06B64, res07B64, res08B64, res09B64, res10B64], out = {};
      await Promise.all(rs.map(async (b, k) => { out[k + 1] = (await loader.parseAsync(b64ToBuf(b), '')).scene; }));
      A.res = out;
    } catch (e) { console.warn('skyline load failed', e); }
    const box = new THREE.Box3().setFromObject(s.scene);
    A.soldierScale = 1.82 / (box.max.y - box.min.y);
    A.ok = true;
  } catch (e) { console.warn('asset load failed, procedural fallback', e); }
  return A.ok;
}

const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export function buildSoldier(look = {}, gunParts) {
  const root = skClone(A.soldier.scene);
  const wrap = new THREE.Group(), body = new THREE.Group();
  root.scale.multiplyScalar(A.soldierScale);
  root.rotation.y = Math.PI;
  body.add(root); wrap.add(body);
  const tint = new THREE.Color(look.top ?? 0x445566);
  const skinMats = [];
  const topMats = [];
  const bones = {}, skinMeshes = [];
  root.traverse((o) => {
    if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
    if (o.isMesh) {
      o.castShadow = true; o.frustumCulled = false; skinMeshes.push(o);
      o.material = o.material.clone();
      const m = o.material;
      if (/visor/i.test(o.name)) {
        m.color.set(0x050608); m.emissive = new THREE.Color(...(look.visor || [0.2, 0.9, 1])); m.emissiveIntensity = 2.2; m.roughness = 0.2; m.metalness = 0.8;
      } else {
        m.color.copy(tint).multiplyScalar(3.2); m.roughness = 0.62; m.metalness = 0.05;
        m.emissive = new THREE.Color(look.top ?? 0x445566); m.emissiveIntensity = 0.42; topMats.push(m);
      }
    }
  });
  const mixer = new THREE.AnimationMixer(root);
  const act = {};
  // base clips run permanently at weight 0; the retargeted UAL clips (U_*) are created on first use so idle actors do not pay for them
  const clipBy = new Map(A.soldier.animations.map((c) => [c.name, c]));
  for (const c of A.soldier.animations) if (c.name !== 'TPose' && !c.name.startsWith('U_')) { act[c.name] = mixer.clipAction(c); act[c.name].play(); act[c.name].weight = 0; }
  const clip = (name) => { if (act[name]) return act[name]; const c = clipBy.get(name); if (!c) return null; const a = (act[name] = mixer.clipAction(c)); a.play(); a.weight = 0; return a; };
  act.Idle.weight = 1;
  mixer.update(Math.random() * 2);
  // weapon mount on right hand
  const hand = bones.RightHand;
  root.updateWorldMatrix(true, true);
  const ws = new THREE.Vector3(); hand.getWorldScale(ws);
  const mount = new THREE.Group(); mount.scale.setScalar(1 / ws.x); mount.rotation.set(-Math.PI / 2, 0, Math.PI / 2); mount.position.set(0, 0.06 / ws.x, 0.0);
  hand.add(mount);
  const { pistol, rifle, muzzle } = gunParts();
  mount.add(pistol, rifle);
  const mz = new THREE.Object3D(); mz.position.set(0, 0.03, 0.3); mount.add(mz);
  const stub = () => new THREE.Object3D();
  return {
    group: wrap, body, torso: stub(), head: stub(), armL: stub(), armR: stub(), legL: stub(), legR: stub(), hand: mount, pistol, rifle, muzzle: mz,
    applySit(k) { this.sit = k; },
    setTop(hex) { for (const mm of topMats) { mm.color.set(hex).multiplyScalar(3.2); mm.emissive.set(hex); } },
    mixer, act, clip, bones, skinMeshes, skinned: true, aim: 0, aimYaw: 0, aimPitch: 0, phase: 0,
    // called after mixer update each frame
    applyPose(pose, pitch) {
      if (this.sit > 0.01) {
        const k2 = this.sit; wrap.updateWorldMatrix(true, false); wrap.getWorldQuaternion(wq);
        const rot2 = (b, axis, ang) => { b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(pq); pq.invert(); la.copy(axis).applyQuaternion(wq).applyQuaternion(pq).normalize(); qa.setFromAxisAngle(la, ang * k2); b.quaternion.premultiply(qa); };
        rot2(bones.LeftUpLeg, X, AIM.sitThigh); rot2(bones.RightUpLeg, X, AIM.sitThigh); rot2(bones.LeftLeg, X, AIM.sitKnee); rot2(bones.RightLeg, X, AIM.sitKnee);
        body.position.y = -0.5 * k2;
        return;
      }
      body.position.y = 0;
      if (pose < 0.01) return;
      const k = pose;
      wrap.updateWorldMatrix(true, false);
      wrap.getWorldQuaternion(wq);
      const rot = (b, axis, ang) => {
        b.parent.updateWorldMatrix(true, false);
        b.parent.getWorldQuaternion(pq); pq.invert();
        la.copy(axis).applyQuaternion(wq).applyQuaternion(pq).normalize();
        qa.setFromAxisAngle(la, ang * k); b.quaternion.premultiply(qa);
      };
      const up = clamp01(pitch);
      rot(bones.RightArm, X, AIM.rx - up * 0.9); rot(bones.RightArm, Y, AIM.ry);
      rot(bones.RightForeArm, X, AIM.rfx);
      rot(bones.LeftArm, X, AIM.lx - up * 0.9); rot(bones.LeftArm, Y, AIM.ly);
      rot(bones.LeftForeArm, X, AIM.lfx);
      if (bones.Spine1) rot(bones.Spine1, Y, AIM.spine);
    },
  };
}
const wq = new THREE.Quaternion(), pq = new THREE.Quaternion(), la = new THREE.Vector3();
const clamp01 = (v) => Math.max(-0.7, Math.min(0.7, v));
export const AIM = { sitThigh: -1.45, sitKnee: 1.5, rx: -1.35, ry: 0.35, rfx: -0.2, lx: -1.25, ly: -0.55, lfx: -0.5, spine: 0 };
// ---- Ferrari ----
const glowTexLazy = {};
export function buildFerrariModel(color) {
  const root = A.ferrari.scene.clone(true);
  const wrap = new THREE.Group();
  root.rotation.y = Math.PI; // model faces -Z; game cars face +Z
  wrap.add(root);
  const wheels = {};
  let bodyMesh = null;
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.name !== 'glass';
      if (o.material && o.material.name === 'Body_Color') {
        o.material = o.material.clone(); o.material.color.set(color); o.material.metalness = 0.7; o.material.roughness = 0.22;
        if (o.material.clearcoat !== undefined) o.material.clearcoat = 1;
        bodyMesh = bodyMesh || o;
      }
    }
    if (/^wheel_(fl|fr|rl|rr)$/.test(o.name)) wheels[o.name.slice(6)] = { node: o, base: o.quaternion.clone() };
  });
  // hide interior sound-alike clutter? keep; steering wheel visible through glass
  return { wrap, wheels, bodyMesh };
}
export function setFerrariWheels(w, spin, steer) {
  for (const k of ['fl', 'fr', 'rl', 'rr']) {
    const e = w[k]; if (!e) continue;
    q.copy(e.base);
    qa.setFromAxisAngle(X, -spin); q.multiply(qa);
    if (k[0] === 'f') { qb.setFromAxisAngle(Y, steer); q.premultiply(qb); }
    e.node.quaternion.copy(q);
  }
}
