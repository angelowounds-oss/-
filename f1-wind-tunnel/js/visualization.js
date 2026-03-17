/**
 * Visualization: 슬라이스 평면 및 3D 입자 렌더링
 */

class Visualization {
  constructor(scene, W, H, D) {
    this.scene = scene;
    this.W = W;
    this.H = H;
    this.D = D;
    this.currentSliceType = 'xz';
    this.currentSliceIndex = Math.floor(H / 2);

    this.sliceMesh = null;
    this.sliceTexture = null;
    this.sliceCanvas = null;

    this._initSlicePlane();
  }

  _initSlicePlane() {
    // Canvas 기반 텍스처 생성
    const canvasWidth = this.W;
    const canvasHeight = this.currentSliceType === 'xz' ? this.D : this.D;

    this.sliceCanvas = document.createElement('canvas');
    this.sliceCanvas.width = canvasWidth;
    this.sliceCanvas.height = canvasHeight;

    this.sliceTexture = new THREE.CanvasTexture(this.sliceCanvas);
    this.sliceTexture.minFilter = THREE.NearestFilter;
    this.sliceTexture.magFilter = THREE.NearestFilter;

    // 슬라이스 평면 메시 생성
    const planeGeom = new THREE.PlaneGeometry(
      this.currentSliceType === 'xz' ? 4 : 2,  // 월드 너비
      this.currentSliceType === 'xz' ? 4 : 4   // 월드 높이
    );

    const planeMat = new THREE.MeshBasicMaterial({ map: this.sliceTexture });
    this.sliceMesh = new THREE.Mesh(planeGeom, planeMat);

    // 평면 위치 설정
    if (this.currentSliceType === 'xz') {
      this.sliceMesh.rotation.x = -Math.PI / 2;
      this.sliceMesh.position.y = -1 + (this.currentSliceIndex / this.H) * 2;
    } else {
      this.sliceMesh.position.x = -2 + 2;
    }

    this.sliceMesh.renderOrder = -1;  // 먼저 렌더링
    this.scene.add(this.sliceMesh);
  }

  /**
   * 슬라이스 데이터를 캔버스 텍스처로 렌더링
   */
  renderSlice(sliceData) {
    const ctx = this.sliceCanvas.getContext('2d');
    const imageData = ctx.createImageData(this.sliceCanvas.width, this.sliceCanvas.height);
    const data = imageData.data;

    const len = sliceData.length / 4;
    for (let i = 0; i < len; i++) {
      const rho = sliceData[i * 4 + 0];
      const ux = sliceData[i * 4 + 1];
      const uy = sliceData[i * 4 + 2];
      const uz = sliceData[i * 4 + 3];

      // 속도 크기
      const speed = Math.sqrt(ux * ux + uy * uy + uz * uz);
      const t = Math.min(speed / 0.3, 1.0);  // 정규화

      // 컬러맵: 파랑 → 시안 → 녹색 → 노랑 → 빨강
      let r, g, b;
      if (t < 0.25) {
        const f = t / 0.25;
        r = 0;
        g = f * 255;
        b = 255;
      } else if (t < 0.5) {
        const f = (t - 0.25) / 0.25;
        r = 0;
        g = 255;
        b = (1 - f) * 255;
      } else if (t < 0.75) {
        const f = (t - 0.5) / 0.25;
        r = f * 255;
        g = 255;
        b = 0;
      } else {
        const f = (t - 0.75) / 0.25;
        r = 255;
        g = (1 - f) * 255;
        b = 0;
      }

      const idx = i * 4;
      data[idx + 0] = Math.round(r);
      data[idx + 1] = Math.round(g);
      data[idx + 2] = Math.round(b);
      data[idx + 3] = 200;
    }

    ctx.putImageData(imageData, 0, 0);
    this.sliceTexture.needsUpdate = true;
  }

  /**
   * 슬라이스 평면 타입 변경
   */
  setSliceType(type) {
    if (type === this.currentSliceType) return;

    this.currentSliceType = type;
    this.scene.remove(this.sliceMesh);
    this._initSlicePlane();
  }

  /**
   * 슬라이스 인덱스 변경
   */
  setSliceIndex(index) {
    this.currentSliceIndex = Math.max(0, Math.min(index, this.H - 1));
    if (this.currentSliceType === 'xz') {
      this.sliceMesh.position.y = -1 + (this.currentSliceIndex / this.H) * 2;
    }
  }
}

/**
 * 3D 파티클 시스템 (간단한 클라우드)
 */
class ParticleCloud {
  constructor(scene, count = 5000) {
    this.scene = scene;
    this.count = count;
    this.particles = null;
    this.particleData = new Float32Array(count * 3);

    this._initParticles();
  }

  _initParticles() {
    // 랜덤 위치 초기화
    for (let i = 0; i < this.count; i++) {
      this.particleData[i * 3 + 0] = Math.random() * 4 - 2;  // x: -2 ~ 2
      this.particleData[i * 3 + 1] = Math.random() * 2 - 1;  // y: -1 ~ 1
      this.particleData[i * 3 + 2] = Math.random() * 4 - 3;  // z: -3 ~ 1
    }

    // BufferGeometry
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.particleData, 3));

    // Material
    const mat = new THREE.PointsMaterial({
      size: 0.02,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.6,
      color: 0x00ff88
    });

    this.particles = new THREE.Points(geom, mat);
    this.scene.add(this.particles);
  }

  /**
   * 파티클 위치 업데이트
   * @param {Float32Array} macroVars - (rho, ux, uy, uz) 데이터
   * @param {number} dt - 타임스텝
   */
  updatePositions(macroVars, W, H, D, dt = 0.01) {
    const scale = {
      x: 4 / W,
      y: 2 / H,
      z: 4 / D
    };
    const offset = {
      x: -2,
      y: -1,
      z: -3
    };

    for (let i = 0; i < this.count; i++) {
      const x = this.particleData[i * 3 + 0];
      const y = this.particleData[i * 3 + 1];
      const z = this.particleData[i * 3 + 2];

      // 격자 좌표로 변환
      const gx = Math.floor((x - offset.x) / scale.x);
      const gy = Math.floor((y - offset.y) / scale.y);
      const gz = Math.floor((z - offset.z) / scale.z);

      // 경계 체크
      if (gx < 0 || gx >= W || gy < 0 || gy >= H || gz < 0 || gz >= D) {
        // 리스폰
        this.particleData[i * 3 + 0] = -2;
        this.particleData[i * 3 + 1] = Math.random() * 2 - 1;
        this.particleData[i * 3 + 2] = -2.9 + Math.random() * 0.2;
        continue;
      }

      const idx = (gx + gy * W + gz * W * H) * 4;
      if (idx + 3 >= macroVars.length) continue;

      const ux = macroVars[idx + 1];
      const uy = macroVars[idx + 2];
      const uz = macroVars[idx + 3];

      // 업데이트 (월드 단위로 변환)
      this.particleData[i * 3 + 0] += ux * scale.x * dt * 10;
      this.particleData[i * 3 + 1] += uy * scale.y * dt * 10;
      this.particleData[i * 3 + 2] += uz * scale.z * dt * 10;
    }

    this.particles.geometry.attributes.position.needsUpdate = true;
  }
}

// 전역 변수로 내보내기
window.VisualizationUtils = {
  Visualization,
  ParticleCloud
};
