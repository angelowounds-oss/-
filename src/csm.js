import * as THREE from 'three';

// Cascaded shadow maps for the sun / moon (EV-41), on the plain WebGL2 renderer.
//
// The lit key light (engine.js `moon`) is cascade 0. Cascades 1..3 are extra directional lights at intensity 0 that only own a shadow map.
// three.js puts shadow-casting directional lights first and in creation order, so the key light is directional light 0 and shadow i is
// cascade i. One patch of the light loop (below) gives light 0 a shadow made from all cascades: each fragment takes the finest cascade
// whose box holds it and blends into the next one across the box's edge band, so no seam shows; the last cascade fades out to unshadowed.
// The light and shadow counts never change at run time (a change would recompile every lit shader): a cascade the setting leaves out
// is parked far away and never redrawn, so no fragment falls into it.

export const CSM_MAX = 4;
export const CSM_SPLITS = [25, 80, 250, 800];   // far edge of each cascade (m) at the default reach
const EDGE = 0.08;                              // share of a cascade's box, at each edge, that blends into the next cascade

// the cascade-picking light loop; patched once, at import, before any lit shader is compiled
{
  const C = THREE.ShaderChunk, src = C.lights_fragment_begin;
  const a = src.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )'), b = src.indexOf('#if ( NUM_RECT_AREA_LIGHTS > 0 )');
  const call = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  if (a < 0 || b < a || !src.slice(a, b).includes('getShadow( directionalShadowMap[ i ]')) console.warn('csm: lights chunk layout changed, single shadow kept');
  else C.lights_fragment_begin = src.slice(0, a) + `#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	float csmShadow = 1.0;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	if ( receiveShadow ) {
		float csmAcc = 0.0, csmRem = 1.0, csmF; vec3 csmC; vec2 csmE;
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			csmC = vDirectionalShadowCoord[ i ].xyz / vDirectionalShadowCoord[ i ].w;
			csmE = min( csmC.xy, 1.0 - csmC.xy );
			csmF = ( csmRem > 0.002 && csmC.z <= 1.0 && csmC.z >= 0.0 ) ? smoothstep( 0.0, ${EDGE.toFixed(3)}, min( csmE.x, csmE.y ) ) : 0.0;
			if ( csmF > 0.0 ) {
				directionalLightShadow = directionalLightShadows[ i ];
				csmAcc += csmRem * csmF * getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] );
				csmRem *= 1.0 - csmF;
			}
		}
		#pragma unroll_loop_end
		csmShadow = csmAcc + csmRem;
	}
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if ( UNROLLED_LOOP_INDEX == 0 )
		directLight.color *= csmShadow;
		#endif
		if ( any( greaterThan( directLight.color, vec3( 0.0 ) ) ) ) ${call}
	}
	#pragma unroll_loop_end
#endif

` + src.slice(b);
}

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _c = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

// Holds the cascade lights and moves them each frame; engine.js makes it, daynight.js drives it
export class Cascades {
  // key: the lit directional light (cascade 0); the others are made here and added to the scene
  constructor(scene, key) {
    this.key = key; this.lights = [key]; this.n = CSM_MAX; this.reach = 1; this.size = 2048; this.frame = 0; this.on = true;
    this.radius = new Float32Array(CSM_MAX); this.updates = new Uint32Array(CSM_MAX);
    for (let i = 1; i < CSM_MAX; i++) {
      const l = new THREE.DirectionalLight(0xffffff, 0); l.castShadow = true; l.name = 'csm' + i;
      scene.add(l, l.target); this.lights.push(l);
    }
    for (const l of this.lights) { l.shadow.autoUpdate = false; l.shadow.camera.near = 1; }
    this.scene = scene; this.small = []; this.tiny = []; this.muted = []; this.mutedCount = new Uint32Array(CSM_MAX); this.scanAt = -1e9;
    // three draws the cascades one after another inside one shadow pass and calls updateMatrices just before each: that is where the
    // casters a cascade does not need are taken out of it (cull), and they are put back once the pass is over (restore, see engine.js)
    this.lights.forEach((l, i) => { const um = l.shadow.updateMatrices.bind(l.shadow); l.shadow.updateMatrices = (light, vp) => { um(light, vp); this.cull(i); }; });
  }
  // the small casters (people, car parts, props) and the instanced batches of tiny ones, found again twice a second (objects stream in and out)
  scan() {
    const small = (this.small.length = 0, this.small), tiny = (this.tiny.length = 0, this.tiny);
    this.scene.traverseVisible((o) => {
      if (!o.isMesh || !o.castShadow) return;
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      if (o.isInstancedMesh) { if (g.boundingSphere.radius < 2) tiny.push(o); return; }
      if (g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() < 3) small.push(o);
    });
  }
  // before cascade i is drawn: leave out each small caster whose shadow lies wholly inside the finer cascade i-1 (that one already
  // draws it, sharper, and the shader takes the finer cascade there); cascade 2 also skips sub-metre shapes and cascade 3 every
  // small caster and prop batch (at 0.2-0.6 m per texel they are a texel or two). The near cascade draws everything.
  cull(i) {
    this.restore();
    if (i === 0 || i >= this.n) return;
    const fine = this.lights[i - 1].shadow, M = fine.matrix, rf = this.radius[i - 1], y = Math.min(0.97, Math.max(0.23, this.dir ? this.dir.y : 0.5));
    const lean = Math.sqrt(1 - y * y) / y;                         // shadow length per metre of height
    const muted = this.muted;
    for (const o of this.small) {
      const g = o.geometry, bs = g.boundingSphere, rad = bs.radius * o.matrixWorld.getMaxScaleOnAxis(), reach = rad * (1 + 2 * lean) + 1;
      // past 80 m a person- or car-sized shape is a few texels of a shadow nobody can make out: the far cascades skip them outright
      if (i === 3 || (i === 2 && rad < 1)) { muted.push(o, o.layers.mask); o.layers.mask = 0; continue; }
      _c.copy(bs.center).applyMatrix4(o.matrixWorld).applyMatrix4(M);
      const m = EDGE + reach / (2 * rf);
      if (_c.x > m && _c.x < 1 - m && _c.y > m && _c.y < 1 - m && _c.z > 0 && _c.z < 1) { muted.push(o, o.layers.mask); o.layers.mask = 0; }
    }
    if (i >= 2) for (const o of this.tiny) if (i === 3 || o.geometry.boundingSphere.radius < 1) { muted.push(o, o.layers.mask); o.layers.mask = 0; }
    this.mutedCount[i] = muted.length / 2;
  }
  // put back every caster cull() took out (after each cascade and after the shadow pass, before the scene itself is drawn)
  restore() { const m = this.muted; for (let k = 0; k < m.length; k += 2) m[k].layers.mask = m[k + 1]; m.length = 0; }
  // cascade count (2..4), reach multiplier for every split past the first, and map size; a left-out cascade is parked and drawn once, small
  configure(n, reach, size) {
    n = Math.max(1, Math.min(CSM_MAX, n | 0)); size = Math.max(256, size | 0);
    const changed = n !== this.n || reach !== this.reach || size !== this.size;
    this.n = n; this.reach = reach; this.size = size;
    for (let i = 0; i < CSM_MAX; i++) {
      const l = this.lights[i], S = i < n ? size : 256;
      if (l.shadow.mapSize.x !== S) { l.shadow.mapSize.set(S, S); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } }
      if (i >= n) this.park(l);
    }
    if (changed) { this.frame = 0; this.due = true; }   // redraw every live cascade (and the parked ones, once) on the next frame
  }
  // shadows on / off for all cascades together (the shadow count is in every lit shader, so this recompiles; the settings menu only)
  setEnabled(on) { this.on = on; for (const l of this.lights) l.castShadow = on; }
  // far edge of cascade i (m)
  split(i) { return i === 0 ? CSM_SPLITS[0] : CSM_SPLITS[i] * this.reach; }
  // a cascade the setting leaves out: its box sits far from the world and it is drawn once, so the shader never picks it
  park(l) {
    l.target.position.set(0, -1e6, 0); l.position.set(0, -1e6 + 10, 0);
    Object.assign(l.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 1, far: 20 }); l.shadow.camera.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
  }
  // the shader warm-up: place and redraw every live cascade around the camera now, so the shadow pass compiles its programs then
  warm(cam) { this.frame = 0; return this.update(this.dir || UP, cam); }
  // per frame: dir = unit vector towards the sun / moon, cam = the view camera. Returns true when some cascade is due a redraw.
  // Each cascade's box is the smallest circle around the ground-plane wedge the camera sees up to that cascade's far edge, so it does
  // not change size as the camera turns; its centre is snapped to whole shadow texels in light space so its edges do not crawl.
  update(dir, cam) {
    if (!this.on) return false;
    this.dir = dir;
    if (performance.now() - this.scanAt > 500) { this.scanAt = performance.now(); this.scan(); }
    const f = this.frame++;
    _f.copy(dir).negate();                                     // light travel direction
    _r.crossVectors(_f, UP); if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0); _r.normalize(); _u.crossVectors(_r, _f);
    const e = cam.matrixWorld.elements, fx = -e[8], fz = -e[10], fl = Math.hypot(fx, fz) || 1;   // camera forward on the ground
    const th = Math.min(1.45, Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect));   // horizontal half-angle
    let due = false;
    for (let i = 0; i < this.n; i++) {
      // cascade 0 and 1 every frame, 2 every 2nd frame, 3 every 4th (staggered so they do not land on the same frame)
      const every = i < 2 ? 1 : i === 2 ? 2 : 4, off = i === 3 ? 1 : 0;
      if (f > 0 && (f + off) % every !== 0) continue;
      const d = this.split(i), cc = d * 0.5, r = Math.max(cc + 4, Math.hypot(d * Math.cos(th) - cc, d * Math.sin(th))) + 2;
      const l = this.lights[i], S = l.shadow.mapSize.x, tex = 2 * r / S;
      _c.set(cam.position.x + fx / fl * cc, cam.position.y - 10, cam.position.z + fz / fl * cc);
      const pr = Math.round(_c.dot(_r) / tex) * tex, pu = Math.round(_c.dot(_u) / tex) * tex, pf = _c.dot(_f);
      _c.copy(_r).multiplyScalar(pr).addScaledVector(_u, pu).addScaledVector(_f, pf);
      const back = r + 400;                                    // room behind the box for tall casters (towers, hills) up-sun
      l.target.position.copy(_c); l.position.copy(_c).addScaledVector(_f, -back);
      l.target.updateMatrixWorld(); l.updateMatrixWorld();
      const sc = l.shadow.camera, far = back + r + 60;
      if (sc.right !== r || sc.far !== far) { Object.assign(sc, { left: -r, right: r, top: r, bottom: -r, near: 1, far }); sc.updateProjectionMatrix(); }
      // a constant world-space depth bias (5 cm + half a texel) and a normal offset of about one texel, whatever the box size
      l.shadow.bias = -(0.05 + tex * 0.5) / (far - 1); l.shadow.normalBias = tex * 1.1;
      l.shadow.needsUpdate = true; this.updates[i]++; this.radius[i] = r; due = true;
    }
    if (due) this.due = true;   // engine.render turns this into one shadow pass
    return due;
  }
}
