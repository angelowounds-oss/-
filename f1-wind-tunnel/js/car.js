/**
 * F1 Car: 3D 경계 조건 래스터화 + Three.js 모델
 */

/**
 * 3D F1 차체를 경계 텍스처로 래스터화
 * @param {number} W - 격자 너비
 * @param {number} H - 격자 높이
 * @param {number} D - 격자 깊이
 * @param {number} spoilerAngle - 리어윙 각도 (도)
 * @returns {Uint32Array} 경계 플래그 배열
 */
function buildBoundary3D(W, H, D, spoilerAngle = 15) {
  const boundary = new Uint32Array(W * H * D);

  // 격자 좌표를 월드 좌표로 변환
  // x: 0 ~ W → -2 ~ +2 (너비 4m)
  // y: 0 ~ H → -1 ~ +1 (높이 2m)
  // z: 0 ~ D → -3 ~ +1 (깊이 4m)

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

  // 격자 셀 내부 함수들
  const isInMainBody = (wx, wy, wz) => {
    // 메인 바디: 회전 타원체
    const centerX = 0.0;
    const centerY = 0.3;
    const centerZ = -0.5;
    const radiusX = 0.35;
    const radiusY = 0.25;
    const radiusZ = 1.8;

    const dx = (wx - centerX) / radiusX;
    const dy = (wy - centerY) / radiusY;
    const dz = (wz - centerZ) / radiusZ;
    return dx * dx + dy * dy + dz * dz < 1.0;
  };

  const isInFrontWing = (wx, wy, wz) => {
    return wx > 1.8 && wx < 2.3 &&
           wy > -0.3 && wy < 0.1 &&
           wz > -1.0 && wz < 1.0;
  };

  const isInRearWing = (wx, wy, wz, angle) => {
    // 리어윙: 스포일러 각도 적용
    const baseZ = -1.8;
    const baseY = 0.9;
    const wingLength = 1.6;
    const wingThickness = 0.08;

    // 각도에 따른 회전 적용 (간단한 근사)
    const angleRad = (angle * Math.PI) / 180;
    const rotZ = wz - baseZ;
    const rotY = wy - baseY;
    const rotZ_rot = rotZ * Math.cos(angleRad) - rotY * Math.sin(angleRad);
    const rotY_rot = rotZ * Math.sin(angleRad) + rotY * Math.cos(angleRad);

    return wx > -2.0 && wx < -1.5 &&
           rotY_rot > -0.05 && rotY_rot < wingThickness &&
           rotZ_rot > -wingLength / 2 && rotZ_rot < wingLength / 2;
  };

  const isInTire = (wx, wy, wz, centerX, centerY, centerZ, radius) => {
    const dx = wx - centerX;
    const dy = wy - centerY;
    const dz = wz - centerZ;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) < radius;
  };

  const isInSidepod = (wx, wy, wz, side) => {
    const sidePosX = side > 0 ? 0.4 : -0.4;
    return Math.abs(wx - sidePosX) < 0.3 &&
           wy > -0.2 && wy < 0.4 &&
           wz > -1.0 && wz < 1.5;
  };

  // 래스터화 루프
  const angleRad = (spoilerAngle * Math.PI) / 180;

  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      for (let z = 0; z < D; z++) {
        const idx = x + y * W + z * W * H;

        // 월드 좌표
        const wx = x * scale.x + offset.x;
        const wy = y * scale.y + offset.y;
        const wz = z * scale.z + offset.z;

        let flags = 0;

        // 입구 (x = 0)
        if (x === 0) {
          flags |= 2;  // INLET
        }

        // 출구 (x = W-1)
        if (x === W - 1) {
          flags |= 4;  // OUTLET
        }

        // 상단/하단 벽 (y = 0 또는 y = H-1)
        if (y === 0 || y === H - 1) {
          flags |= 1;  // SOLID
        }

        // 차체 고체 조건
        if (!flags &&
            (isInMainBody(wx, wy, wz) ||
             isInFrontWing(wx, wy, wz) ||
             isInRearWing(wx, wy, wz, spoilerAngle) ||
             isInTire(wx, wy, wz, 1.5, -0.4, -1.7, 0.35) ||
             isInTire(wx, wy, wz, -1.5, -0.4, -1.7, 0.35) ||
             isInTire(wx, wy, wz, 1.5, -0.4, 1.4, 0.35) ||
             isInTire(wx, wy, wz, -1.5, -0.4, 1.4, 0.35) ||
             isInSidepod(wx, wy, wz, 1) ||
             isInSidepod(wx, wy, wz, -1))) {
          flags |= 1;  // SOLID
        }

        boundary[idx] = flags;
      }
    }
  }

  return boundary;
}

/**
 * Three.js로 F1 차량 3D 모델 생성
 */
function buildF1Car() {
  const car = new THREE.Group();

  // 재질
  const redMat = new THREE.MeshPhysicalMaterial({
    color: 0xcc0000,
    metalness: 0.3,
    roughness: 0.4,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1
  });

  const blackMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a1a1a,
    metalness: 0.2,
    roughness: 0.8
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    metalness: 0.0,
    roughness: 0.9
  });

  // 바디: CapsuleGeometry
  const bodyGeom = new THREE.CapsuleGeometry(0.35, 3.2, 8, 16);
  bodyGeom.rotateZ(Math.PI / 2);
  const bodyMesh = new THREE.Mesh(bodyGeom, redMat);
  car.add(bodyMesh);

  // 노즈콘: ConeGeometry
  const noseGeom = new THREE.ConeGeometry(0.12, 1.2, 8);
  noseGeom.rotateZ(-Math.PI / 2);
  const noseMesh = new THREE.Mesh(noseGeom, redMat);
  noseMesh.position.set(2.2, 0.0, 0.0);
  car.add(noseMesh);

  // 프론트윙
  const fwGeom = new THREE.BoxGeometry(0.6, 0.04, 1.8);
  const fwMesh = new THREE.Mesh(fwGeom, blackMat);
  fwMesh.position.set(2.0, -0.3, 0.0);
  car.add(fwMesh);

  // 리어윙 그룹 (애니메이션용)
  const rearWingGroup = new THREE.Group();
  rearWingGroup.position.set(-1.8, 0.9, 0.0);

  const rwGeom = new THREE.BoxGeometry(0.5, 0.05, 1.6);
  const rwMesh = new THREE.Mesh(rwGeom, blackMat);
  rearWingGroup.add(rwMesh);

  // 리어윙 엔드플레이트
  for (const z of [-0.82, 0.82]) {
    const epGeom = new THREE.BoxGeometry(0.5, 0.4, 0.04);
    const epMesh = new THREE.Mesh(epGeom, blackMat);
    epMesh.position.z = z;
    rearWingGroup.add(epMesh);
  }

  car.add(rearWingGroup);
  car.rearWingGroup = rearWingGroup;

  // 타이어
  const tirePositions = [
    [1.5, -0.4, 0.85],
    [1.5, -0.4, -0.85],
    [-1.2, -0.4, 0.85],
    [-1.2, -0.4, -0.85]
  ];

  for (const [x, y, z] of tirePositions) {
    const tireGeom = new THREE.TorusGeometry(0.33, 0.13, 8, 16);
    tireGeom.rotateY(Math.PI / 2);
    const tireMesh = new THREE.Mesh(tireGeom, tireMat);
    tireMesh.position.set(x, y, z);
    car.add(tireMesh);
  }

  // 사이드포드
  for (const z of [0.4, -0.4]) {
    const spGeom = new THREE.BoxGeometry(1.4, 0.3, 0.35);
    const spMesh = new THREE.Mesh(spGeom, redMat);
    spMesh.position.set(-0.2, -0.1, z);
    car.add(spMesh);
  }

  // 헤일로
  const haloGeom = new THREE.TorusGeometry(0.3, 0.025, 8, 24, Math.PI);
  const haloMesh = new THREE.Mesh(haloGeom, blackMat);
  haloMesh.position.set(0.3, 0.45, 0.0);
  car.add(haloMesh);

  return car;
}

/**
 * 스포일러 각도 업데이트
 */
function updateSpoilerAngle(carGroup, angleInDegrees) {
  if (carGroup.rearWingGroup) {
    carGroup.rearWingGroup.rotation.x = THREE.MathUtils.degToRad(angleInDegrees);
  }
}

// 전역 변수로 내보내기
window.CarUtils = {
  buildBoundary3D,
  buildF1Car,
  updateSpoilerAngle
};
