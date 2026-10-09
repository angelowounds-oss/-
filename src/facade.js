import * as THREE from 'three';
import colorUrl from '../assets/facade/facade_color.jpg';
import emisUrl from '../assets/facade/facade_emis.jpg';
import nrUrl from '../assets/facade/facade_nr.jpg';

// Real facade texture sets (supplied by the project owner), packed by build/facade_pack.mjs into vertical strips of square layers
// and uploaded as WebGL2 array textures. Until they decode, 1x1 dummies are bound and the shader keeps its procedural windows.
const dummy = () => { const t = new THREE.DataArrayTexture(new Uint8Array(4 * 4), 1, 1, 4); t.needsUpdate = true; return t; };

function loadArray(url, size, layers, srgb) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = size; cv.height = size * layers;
      const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, size, size * layers);
      const px = g.getImageData(0, 0, size, size * layers).data;
      const t = new THREE.DataArrayTexture(new Uint8Array(px.buffer), size, size, layers);
      t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
      resolve(t);
    };
    img.onerror = reject; img.src = url;
  });
}

// returns the sampler uniforms; `uHasTex` flips to 1 once all three arrays are on the GPU
export function facadeUniforms() {
  const u = { tFC: { value: dummy() }, tFE: { value: dummy() }, tFN: { value: dummy() }, uHasTex: { value: 0 } };
  Promise.all([loadArray(colorUrl, 1024, 4, true), loadArray(emisUrl, 512, 6, true), loadArray(nrUrl, 512, 4, false)])
    .then(([c, e, n]) => { u.tFC.value = c; u.tFE.value = e; u.tFN.value = n; u.uHasTex.value = 1; })
    .catch((err) => console.warn('facade textures unavailable, using procedural windows', err));
  return u;
}
