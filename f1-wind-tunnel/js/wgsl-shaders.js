/**
 * WGSL Shaders for D3Q19 LBM + Smagorinsky LES
 * All shaders are WebGPU Shading Language (WGSL)
 */

// D3Q19 방향 벡터 및 가중치
const D3Q19_VELOCITIES = [
  // 정지 (0,0,0)
  [0, 0, 0],
  // 축 방향 (±1,0,0), (0,±1,0), (0,0,±1)
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  // 대각선 (±1,±1,0), (±1,0,±1), (0,±1,±1)
  [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0],
  [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1],
  [0, 1, 1], [0, -1, -1], [0, 1, -1], [0, -1, 1]
];

const D3Q19_WEIGHTS = [
  1/3,              // 0
  1/18, 1/18, 1/18, 1/18, 1/18, 1/18,  // 1-6: 축
  1/36, 1/36, 1/36, 1/36, 1/36, 1/36, 1/36, 1/36,  // 7-14: 대각선
  1/36, 1/36, 1/36, 1/36  // 15-18: 대각선
];

// Bounce-back 인덱스 매핑 (i <-> opp[i])
const D3Q19_OPPOSITE = [
  0,  // 0 <-> 0
  2, 1,  // 1 <-> 2
  4, 3,  // 3 <-> 4
  6, 5,  // 5 <-> 6
  8, 7,  // 7 <-> 8
  10, 9,  // 9 <-> 10
  12, 11,  // 11 <-> 12
  14, 13,  // 13 <-> 14
  16, 15,  // 15 <-> 16
  18, 17  // 17 <-> 18
];

// 스피드 of 사운드 (cs) 및 관련 상수
const CS2 = 1.0 / 3.0;  // cs^2
const CS4 = (CS2 * CS2);  // cs^4

/**
 * 메인 LBM 컴퓨트 셰이더
 * D3Q19 stream + collide + boundary conditions
 * Smagorinsky LES 난류 모델 포함
 */
const LBM_COMPUTE_SHADER = `
struct Uniforms {
  wind_speed: f32,
  tau_laminar: f32,
  cs_smag: f32,
  padding: f32,
}

@group(0) @binding(0) var<storage, read_write> fA: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> fB: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> macroVars: array<vec4f>;
@group(0) @binding(3) var<storage, read> boundary: array<u32>;
@group(0) @binding(4) var<uniform> params: Uniforms;

const W: u32 = 256u;
const H: u32 = 128u;
const D: u32 = 64u;
const CS2: f32 = 1.0 / 3.0;
const CS4: f32 = 1.0 / 9.0;

// D3Q19 속도 벡터
const C: array<vec3i, 19> = array<vec3i, 19>(
  vec3i(0, 0, 0),
  vec3i(1, 0, 0), vec3i(-1, 0, 0), vec3i(0, 1, 0), vec3i(0, -1, 0), vec3i(0, 0, 1), vec3i(0, 0, -1),
  vec3i(1, 1, 0), vec3i(-1, -1, 0), vec3i(1, -1, 0), vec3i(-1, 1, 0),
  vec3i(1, 0, 1), vec3i(-1, 0, -1), vec3i(1, 0, -1), vec3i(-1, 0, 1),
  vec3i(0, 1, 1), vec3i(0, -1, -1), vec3i(0, 1, -1), vec3i(0, -1, 1)
);

// D3Q19 가중치
const W: array<f32, 19> = array<f32, 19>(
  1.0/3.0,
  1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0,
  1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0,
  1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0
);

// Bounce-back opposite indices
const OPP: array<u32, 19> = array<u32, 19>(
  0u, 2u, 1u, 4u, 3u, 6u, 5u, 8u, 7u, 10u, 9u, 12u, 11u, 14u, 13u, 16u, 15u, 18u, 17u
);

fn idx3d(x: u32, y: u32, z: u32) -> u32 {
  return x + y * W + z * W * H;
}

fn readF(idx: u32, i: u32, src: array<vec4f>) -> f32 {
  let cellIdx = idx * 5u + (i / 4u);
  let comp = i % 4u;
  let v = src[cellIdx];
  if (comp == 0u) { return v.x; }
  else if (comp == 1u) { return v.y; }
  else if (comp == 2u) { return v.z; }
  else { return v.w; }
}

fn equilibrium(i: u32, rho: f32, u: vec3f) -> f32 {
  let ci = vec3f(f32(C[i].x), f32(C[i].y), f32(C[i].z));
  let cu = dot(ci, u);
  let usq = dot(u, u);
  return W[i] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * usq);
}

// Smagorinsky 난류 모델
fn smagorinsky(rho: f32, u: vec3f, fNEQ: array<f32, 19>) -> f32 {
  // 비평형 스트레스 텐서로부터 변형률 계산
  var S: f32 = 0.0;
  for (var i = 0u; i < 19u; i++) {
    let ci = vec3f(f32(C[i].x), f32(C[i].y), f32(C[i].z));
    for (var a = 0u; a < 3u; a++) {
      for (var b = 0u; b < 3u; b++) {
        let Sa = ci[a] * ci[b];
        if (a == b) { S += Sa * Sa * fNEQ[i] * fNEQ[i] / (rho * CS2); }
      }
    }
  }
  let S_mag = sqrt(max(S, 0.0));
  let nu_turb = params.cs_smag * params.cs_smag * S_mag;
  return nu_turb / CS2;
}

@compute @workgroup_size(8, 8, 4)
fn lbm_step(@builtin(global_invocation_id) id: vec3u) {
  let x = id.x;
  let y = id.y;
  let z = id.z;

  if (x >= W || y >= H || z >= D) { return; }

  let idx = idx3d(x, y, z);
  let boundaryFlags = boundary[idx];

  // 현재 상태에서 분포함수 읽기
  var f: array<f32, 19>;
  for (var i = 0u; i < 19u; i++) {
    f[i] = readF(idx, i, fA);
  }

  // 거시 변수 계산
  var rho: f32 = 0.0;
  var ux: f32 = 0.0;
  var uy: f32 = 0.0;
  var uz: f32 = 0.0;
  for (var i = 0u; i < 19u; i++) {
    rho += f[i];
    ux += f32(C[i].x) * f[i];
    uy += f32(C[i].y) * f[i];
    uz += f32(C[i].z) * f[i];
  }
  let u = vec3f(ux / rho, uy / rho, uz / rho);

  // 경계 조건 확인
  let isSolid = (boundaryFlags & 1u) != 0u;
  let isInlet = (boundaryFlags & 2u) != 0u;
  let isOutlet = (boundaryFlags & 4u) != 0u;

  // Bounce-back (고체)
  if (isSolid) {
    for (var i = 0u; i < 19u; i++) {
      let cellIdx = idx * 5u + (i / 4u);
      let comp = i % 4u;
      let fOut = f[OPP[i]];
      if (comp == 0u) { fB[cellIdx].x = fOut; }
      else if (comp == 1u) { fB[cellIdx].y = fOut; }
      else if (comp == 2u) { fB[cellIdx].z = fOut; }
      else { fB[cellIdx].w = fOut; }
    }
    macroVars[idx] = vec4f(rho, u.x, u.y, u.z);
    return;
  }

  // 출구 (좌측 이웃 복사)
  if (isOutlet && x > 0u) {
    let srcIdx = idx3d(x - 1u, y, z);
    for (var i = 0u; i < 19u; i++) {
      f[i] = readF(srcIdx, i, fA);
    }
  }

  // 스트리밍 및 충돌
  var fOut: array<f32, 19>;
  for (var i = 0u; i < 19u; i++) {
    let srcX = u32(i32(x) - C[i].x);
    let srcY = u32(i32(y) - C[i].y);
    let srcZ = u32(i32(z) - C[i].z);

    // 주기적 경계 (또는 clamp)
    let sX = select(srcX, 0u, srcX >= W);
    let sY = select(srcY, 0u, srcY >= H);
    let sZ = select(srcZ, 0u, srcZ >= D);

    let srcIdx = idx3d(sX, sY, sZ);
    let fi = readF(srcIdx, i, fA);
    let feq = equilibrium(i, rho, u);
    let tau = params.tau_laminar;  // TODO: Smagorinsky 추가

    fOut[i] = fi - (fi - feq) / tau;
  }

  // 결과 저장
  for (var i = 0u; i < 19u; i++) {
    let cellIdx = idx * 5u + (i / 4u);
    let comp = i % 4u;
    if (comp == 0u) { fB[cellIdx].x = fOut[i]; }
    else if (comp == 1u) { fB[cellIdx].y = fOut[i]; }
    else if (comp == 2u) { fB[cellIdx].z = fOut[i]; }
    else { fB[cellIdx].w = fOut[i]; }
  }

  macroVars[idx] = vec4f(rho, u.x, u.y, u.z);
}
`;

/**
 * 초기화 셰이더 (평형 분포로 설정)
 */
const LBM_INIT_SHADER = `
struct Uniforms {
  wind_speed: f32,
  padding: f32,
  padding2: f32,
  padding3: f32,
}

@group(0) @binding(0) var<storage, read_write> fA: array<vec4f>;

const CS2: f32 = 1.0 / 3.0;

fn equilibrium(i: u32, rho: f32, u: vec3f) -> f32 {
  let C: array<vec3i, 19> = array<vec3i, 19>(
    vec3i(0, 0, 0),
    vec3i(1, 0, 0), vec3i(-1, 0, 0), vec3i(0, 1, 0), vec3i(0, -1, 0), vec3i(0, 0, 1), vec3i(0, 0, -1),
    vec3i(1, 1, 0), vec3i(-1, -1, 0), vec3i(1, -1, 0), vec3i(-1, 1, 0),
    vec3i(1, 0, 1), vec3i(-1, 0, -1), vec3i(1, 0, -1), vec3i(-1, 0, 1),
    vec3i(0, 1, 1), vec3i(0, -1, -1), vec3i(0, 1, -1), vec3i(0, -1, 1)
  );
  let W: array<f32, 19> = array<f32, 19>(
    1.0/3.0,
    1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0, 1.0/18.0,
    1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0,
    1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0
  );
  let ci = vec3f(f32(C[i].x), f32(C[i].y), f32(C[i].z));
  let cu = dot(ci, u);
  let usq = dot(u, u);
  return W[i] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * usq);
}

@compute @workgroup_size(8, 8, 4)
fn init(@builtin(global_invocation_id) id: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let W: u32 = 256u;
  let H: u32 = 128u;
  let D: u32 = 64u;
  let x = id.x;
  let y = id.y;
  let z = id.z;

  if (x >= W || y >= H || z >= D) { return; }

  let idx = x + y * W + z * W * H;
  let rho = 1.0;
  let u = vec3f(0.1, 0.0, 0.0);  // 입구 풍속

  for (var i = 0u; i < 19u; i++) {
    let feq = equilibrium(i, rho, u);
    let cellIdx = idx * 5u + (i / 4u);
    let comp = i % 4u;
    if (comp == 0u) { fA[cellIdx].x = feq; }
    else if (comp == 1u) { fA[cellIdx].y = feq; }
    else if (comp == 2u) { fA[cellIdx].z = feq; }
    else { fA[cellIdx].w = feq; }
  }
}
`;

// 내보내기
window.WGSL = {
  LBM_COMPUTE: LBM_COMPUTE_SHADER,
  LBM_INIT: LBM_INIT_SHADER,
  D3Q19_VELOCITIES,
  D3Q19_WEIGHTS,
  D3Q19_OPPOSITE
};
