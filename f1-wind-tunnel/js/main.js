/**
 * Main Entry Point: F1 Wind Tunnel WebGPU LBM Simulation
 */

let lbm = null;
let scene = null;
let camera = null;
let rendererThree = null;
let carGroup = null;
let visualization = null;
let particleCloud = null;
let orbitControls = null;

// 상태
let state = {
  windSpeed: 0.1,
  tau: 0.8,
  cSmag: 0.1,
  spoilerAngle: 15,
  sliceType: 'xz'
};

// 성능 모니터링
let frameCount = 0;
let lastFpsTime = 0;
let fps = 0;

async function init() {
  console.log('Initializing F1 Wind Tunnel Simulation...');

  // WebGPU 캔버스
  const gpuCanvas = document.getElementById('gpu-canvas');

  // Three.js 캔버스
  const threeCanvas = document.getElementById('three-canvas');

  // LBM 초기화
  try {
    lbm = new LBM3D(gpuCanvas, 256, 128, 64);
    await new Promise(r => setTimeout(r, 100));  // GPU 초기화 대기
  } catch (e) {
    console.error('LBM3D initialization failed:', e);
    alert('WebGPU not supported. Please use Chrome 113+ or Safari 18+');
    return;
  }

  // Three.js 씬 설정
  setupThreeJS(threeCanvas);

  // 경계 조건 설정
  const boundary = CarUtils.buildBoundary3D(256, 128, 64, state.spoilerAngle);
  lbm.setBoundaryData(boundary);

  // UI 연결
  setupUI();

  console.log('Initialization complete');

  // 애니메이션 루프 시작
  animate();
}

function setupThreeJS(canvas) {
  // 씬
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000a1a);
  scene.fog = new THREE.Fog(0x000a1a, 20, 80);

  // 카메라
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(3, 2, 4);
  camera.lookAt(0, 0, -0.5);

  // 렌더러
  rendererThree = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  rendererThree.setSize(window.innerWidth, window.innerHeight);
  rendererThree.shadowMap.enabled = true;

  // 조명
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(5, 10, 5);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  // 그리드
  const gridHelper = new THREE.GridHelper(10, 20, 0x222244, 0x111133);
  gridHelper.position.y = -1;
  scene.add(gridHelper);

  // 차량 모델
  carGroup = CarUtils.buildF1Car();
  carGroup.castShadow = true;
  carGroup.receiveShadow = true;
  scene.add(carGroup);

  // 시각화
  visualization = new VisualizationUtils.Visualization(scene, 256, 128, 64);
  particleCloud = new VisualizationUtils.ParticleCloud(scene, 3000);

  // OrbitControls
  orbitControls = new THREE.OrbitControls(camera, canvas);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.05;
  orbitControls.autoRotate = false;
  orbitControls.target.set(0, 0, -0.5);

  // 윈도우 리사이즈
  window.addEventListener('resize', onWindowResize);
}

function setupUI() {
  // 바람 속도
  document.getElementById('wind-speed').addEventListener('input', (e) => {
    state.windSpeed = parseFloat(e.target.value);
    document.getElementById('wind-val').textContent = state.windSpeed.toFixed(3);
    lbm.setParameters(state.windSpeed, state.tau, state.cSmag);
  });

  // 점성
  document.getElementById('tau').addEventListener('input', (e) => {
    state.tau = parseFloat(e.target.value);
    document.getElementById('tau-val').textContent = state.tau.toFixed(2);
    lbm.setParameters(state.windSpeed, state.tau, state.cSmag);
  });

  // 스포일러 각도
  document.getElementById('spoiler').addEventListener('input', (e) => {
    state.spoilerAngle = parseInt(e.target.value);
    document.getElementById('spoiler-val').textContent = state.spoilerAngle + '°';

    // 경계 재생성
    const boundary = CarUtils.buildBoundary3D(256, 128, 64, state.spoilerAngle);
    lbm.setBoundaryData(boundary);

    // 3D 모델 업데이트
    if (carGroup) {
      CarUtils.updateSpoilerAngle(carGroup, state.spoilerAngle);
    }
  });

  // 슬라이스 평면
  document.getElementById('slice-plane').addEventListener('change', (e) => {
    state.sliceType = e.target.value;
    visualization.setSliceType(state.sliceType);
  });
}

async function animate() {
  requestAnimationFrame(animate);

  // LBM 스텝 (10 서브스텝)
  for (let i = 0; i < 10; i++) {
    lbm.step();
  }

  // 슬라이스 데이터 읽기 (매 프레임이 아니라 5프레임마다)
  if (frameCount % 5 === 0) {
    lbm.readSlice(state.sliceType).then((sliceData) => {
      visualization.renderSlice(sliceData);
    });

    // 파티클 업데이트
    lbm.readMacroVars().then((macroVars) => {
      particleCloud.updatePositions(macroVars, 256, 128, 64, 0.01);
    });
  }

  // Three.js 렌더링
  orbitControls.update();
  rendererThree.render(scene, camera);

  // FPS 계산
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastFpsTime = now;
    updateHUD();
  }

  if (frameCount % 10 === 0) {
    updateHUD();
  }
}

function updateHUD() {
  document.getElementById('fps').textContent = fps.toFixed(0);

  // Reynolds 수 계산
  const L = 50;  // 특성 길이 (격자 단위)
  const nu = (state.tau - 0.5) / 3.0;
  const re = (state.windSpeed * L) / (nu + 0.001);
  document.getElementById('reynolds').textContent = re.toFixed(0);

  // 계산 시간
  document.getElementById('compute-time').textContent = lbm.getLastStepTime().toFixed(2);
}

function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  rendererThree.setSize(width, height);
}

// 페이지 로드 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init().catch(console.error);
}
