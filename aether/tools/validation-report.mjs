#!/usr/bin/env node
// Builds VALIDATION.md from tests/out/m3, m4, m7 JSON results. Criteria are fixed here; every row states its source file.
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const J = p => { try { return JSON.parse(fs.readFileSync(path.join(root, p), 'utf8')); } catch { return null; } };
const e = (x, d = 3) => x === undefined || x === null || !Number.isFinite(x) ? '—' : (Math.abs(x) !== 0 && (Math.abs(x) < 1e-2 || Math.abs(x) >= 1e4) ? x.toExponential(2) : x.toFixed(d));
/* Strouhal from upward zero crossings of Cl over the statistics window (same estimator as tests/validate.mjs) */
const zeroCross = (t, y) => { const n = y.length, m = y.reduce((a, b) => a + b, 0) / n, z = [];
  for (let i = 1; i < n; i++) { const a = y[i - 1] - m, b = y[i] - m; if (a < 0 && b >= 0) z.push(t[i - 1] + (t[i] - t[i - 1]) * (-a) / (b - a)); }
  return z.length < 3 ? { f: NaN, cycles: 0 } : { f: (z.length - 1) / (z[z.length - 1] - z[0]), cycles: z.length - 1 }; };
const stOf = d => { const W = (d.rec || []).filter(r => r.t >= (d.window?.from ?? 40) && Number.isFinite(r.Cl)); return zeroCross(W.map(r => r.t), W.map(r => r.Cl)); };
const st = (ok, pending) => pending ? '진행 중' : ok ? 'PASS' : 'PARTIAL';
const rows = [], note = [];
const U = J('tests/out/m4/uniform.json');
rows.push(['균일류 보존 (장애물 없음, 64×16×16, 150스텝)', '최대 상대오차 < 0.5 %', U ? `u 오차 ${e(U.uniform.maxRelErrU * 100)} %, 횡속도 ${e(U.uniform.maxRelCross * 100)} %, NaN ${U.uniform.nonFinite}` : '—', st(U && U.uniform.maxRelErrU < 5e-3 && !U.uniform.nonFinite, !U), 'tests/out/m4/uniform.json']);
const S = J('tests/out/m3/solver-compare.json'), R = S?.stability?.find(s => s.solver === 'RBGS');
rows.push(['투영 후 발산 — 풍동(차량·팬, LOW, RBGS-MG 2, 60스텝)', 'RMS < 1e-3, 최대 < 1e-2 (U/h 기준)', R ? `RMS ${e(R.divRelRms)}, 최대 ${e(R.divRelMax)}, NaN ${R.nonFinite}` : '—', st(R && R.divRelRms < 1e-3 && R.divRelMax < 1e-2 && !R.nonFinite, !R), 'tests/out/m3/solver-compare.json']);
rows.push(['압력 상대잔차 — 풍동(같은 조건)', '≤ 1e-3', R ? e(R.resRel) : '—', st(R && R.resRel <= 1e-3, !R), '같음']);
/* only results produced by the current force formula (forceModel tag) are reported; older files are listed as stale */
const FM = 'discrete-v2', stale = [];
const ok = (d, f) => { if (!d || d.error || !d.Cd) return false; if (d.forceModel !== FM) { stale.push(f); return false; } return true; };
const split = d => d.Cdp ? `, 압력 ${e(d.Cdp.mean)} / 마찰 ${e(d.Cd.mean - d.Cdp.mean)}` : '';
const cyl = {}; for (const r of [6, 8, 12, 16]) { const f = `tests/out/m4/cyl${r}.json`, d = J(f); if (ok(d, f)) cyl[r] = d; }
const W8 = J('tests/out/m4/cyl8wide.json'); if (ok(W8, 'tests/out/m4/cyl8wide.json')) cyl['8wide'] = W8;
for (const [r, d] of Object.entries(cyl)) {
  const lab = r === '8wide' ? '8셀/D, 폭 16D(차단율 6 %)' : `${r}셀/D, 폭 10D(차단율 10 %)`, f = `tests/out/m4/cyl${r}.json`;
  const S = stOf(d); rows.push([`원기둥 Re=200 ${lab} — 스트라우할 수 (Cl 영교차 ${S.cycles}주기)`, '0.18 ~ 0.22', `${e(S.f)} (DFT ${e(d.StDft?.value ?? d.St.value)}, 프로브 DFT ${e(d.StProbe?.value)})`, st(S.f >= 0.18 && S.f <= 0.22), f]);
  const err = (d.Cd.mean - 1.34) / 1.34;
  rows.push([`원기둥 Re=200 ${lab} — Cd (평균±표준편차)`, '문헌 1.34 ± 20 %', `${e(d.Cd.mean)} ± ${e(d.Cd.std)} (오차 ${e(err * 100, 1)} %${split(d)})`, st(Math.abs(err) <= 0.2), '같음']);
  rows.push([`원기둥 ${lab} — 발산/잔차 (마지막 스텝)`, 'RMS<1e-3, 최대<1e-2, 잔차≤1e-3', `RMS ${e(d.div.relRms)}, 최대 ${e(d.div.relMax)}, 잔차 ${e(d.residual.rel)}`, st(d.div.relRms < 1e-3 && d.div.relMax < 1e-2 && d.residual.rel <= 1e-3), '같음']);
}
const SP = J('tests/out/m4/sphere.json');
if (ok(SP, 'tests/out/m4/sphere.json')) { const err = (SP.Cd.mean - 1.09) / 1.09; rows.push(['구 Re=100 10셀/D — Cd', '문헌 1.09 ± 20 %', `${e(SP.Cd.mean)} ± ${e(SP.Cd.std)} (오차 ${e(err * 100, 1)} %${split(SP)})`, st(Math.abs(err) <= 0.2), 'tests/out/m4/sphere.json']); }
else rows.push(['구 Re=100 10셀/D — Cd', '문헌 1.09 ± 20 %', '—', '진행 중', 'tests/out/m4/sphere.json']);
const conv = Object.entries(cyl).filter(([r]) => r !== '8wide').map(([r, d]) => `${r}셀/D: Cd ${e(d.Cd.mean)}, St ${e(stOf(d).f)}`).join(' → ');
rows.push(['격자 수렴 3단계 (원기둥)', 'Cd·St 변화 추이 보고', conv || '—', Object.keys(cyl).filter(r => r !== '8wide').length >= 3 ? 'PASS(보고)' : '진행 중', 'tests/out/m4/cyl*.json']);
rows.push(['차량 Cd/Cl', '참고값으로만 표시', '화면에 "차량은 참고값" 표기, 평균±표준편차', 'PASS', 'src/ui.js']);
/* boundary-treatment comparison: cut-cell only vs + volume-fraction forcing; three force estimates per run */
const cmp = [];
for (const [f, lab, ref] of [['sphere8', '구 Re=100, 8셀/D, cut', 1.09], ['sphere8vf', '구 Re=100, 8셀/D, cut+vf', 1.09], ['cyl8', '원기둥 Re=200, 8셀/D, cut', 1.34], ['cyl8vf', '원기둥 Re=200, 8셀/D, cut+vf', 1.34]]) {
  const d = J(`tests/out/m4/${f}.json`); if (!d || d.error || !d.CdCV) { cmp.push(`| ${lab} | ${ref} | — | — | — | 진행 중 |`); continue; }
  const pct = x => e((x - ref) / ref * 100, 1) + ' %';
  cmp.push(`| ${lab} | ${ref} | ${e(d.Cd.mean)} (${pct(d.Cd.mean)}) | ${e(d.CdBudget?.mean)} (${pct(d.CdBudget?.mean)}) | ${e(d.CdCV.mean)} (${pct(d.CdCV.mean)}) | ${Math.abs(d.CdCV.mean - ref) / ref <= 0.2 ? 'PASS' : 'PARTIAL'} |`); }
const table = r => ['| 항목 | 기준 | 결과 | 판정 | 근거 |', '|---|---|---|---|---|', ...r.map(x => '| ' + x.join(' | ') + ' |')].join('\n');
let lbm = ''; for (const [m, sfx, coll] of [['FP32', '-trt', 'TRT'], ['FP32', '', '정규화 BGK'], ['FP16', '', '정규화 BGK'], ['MIXED', '', '정규화 BGK']]) { const d = J(`tests/out/m7/lbm-D8-${m}${sfx}.json`); if (d) lbm += `| ${m} | ${coll} | ${d.setup?.ok ? e(d.setup.bytesPerCell, 0) : '—'} | ${e(d.msPerStep, 1)} | ${d.Cd ? e(d.Cd.mean) + ' ± ' + e(d.Cd.std) : '—'} | ${d.St ? e(d.St.f) : '—'} | ${d.error ? '오류: ' + d.error.slice(0, 60) : d.nonFinite ? `NaN 발생 (t*≈${e(d.rec?.filter(r => Number.isFinite(r.Cd)).pop()?.tStar, 1)})` : '안정'} |\n`; }
const md = `# VALIDATION

자동 생성: \`node tools/validation-report.mjs\` (결과 JSON에서 표를 만듭니다). 환경: 헤드리스 Chromium + SwiftShader(수치 검증 전용).
판정: **PASS** 기준 충족 · **PARTIAL** 구현됐으나 기준 미달 · **ASSUMED** 직접 검증 불가 · **진행 중** 계산이 아직 끝나지 않음. NaN/Inf가 하나라도 있으면 실패로 처리합니다.

## MAC 투영 솔버

${table(rows)}

문헌값: 원기둥 Re=200(2D) St 0.19~0.20, Cd 1.31~1.40 (Williamson 1996, Henderson 1995, Braza 1986). 구 Re=100 Cd≈1.09 (Clift, Grace & Weber 1978; Johnson & Patel 1999 1.087).
설정: 원기둥 영역 16D×10D×(4셀, 준2D), 입구 균일류, 벽 slip(차단율 10 %), ν=UD/200, CFL 0.8, t=0~3에 약한 회전으로 대칭 깨기, 통계 구간 t≥40. 구 영역 12D×6D×6D, CFL 0.8, 통계 t≥15.

${stale.length ? `이전 힘 공식(벽 거리 h/2 가정)으로 만든 결과 파일은 표에서 제외: ${stale.map(f => '`' + f + '`').join(', ')}\n` : ''}
힘 계산: 압력은 φ 경사를 가로지르는 p·n 면적분, 점성은 확산 단계가 고체 면(θ=0)과 주고받는 운동량을 그대로 합산(이산 일관형, \`forceModel: ${FM}\`).

## 경계 처리 비교 — 부분체적(cut) vs 부분체적 + 체적분율 강제(vf, Kajishima 2001)

같은 흐름에서 힘을 세 가지로 구합니다. **검사체적(CV)** 값은 물체를 둘러싼 상자(−1.5D~3D, ±1.5D)의 운동량 수지(유속·압력·점성 응력·상자 내 운동량 변화)라 경계 처리와 힘 공식에 독립이며, 판정에 이것을 씁니다.

| 경우 | 문헌 Cd | 표면식 Cd | 운동량 수지식 Cd | 검사체적 Cd | 판정(CV, ±20 %) |
|---|---|---|---|---|---|
${cmp.join('\n')}

## 압력 솔버 비교 (M3B)

\`tests/out/m3/solver-compare.md\` 참조. 결론: **GMG(가중 야코비 평활)는 60스텝 안에 발산**, RBGS-MG 2사이클이 잔차 6.5e-4로 목표를 만족하는 가장 싼 설정 → 실시간 기본값. MGPCG는 8회에서 4e-4(0에서 시작)로 가장 정확하지만 비용이 더 큼.

## LBM 비교 (M7) — 원기둥 Re=200, 8셀/D, D3Q19 TRT

| 저장 | 충돌 | 바이트/셀 | ms/스텝(SwiftShader 상대) | Cd | St | 안정성 |
|---|---|---|---|---|---|---|
${lbm || '| — | — | — | — | — | — | 진행 중 |\n'}
LBM은 격자 단위 음속 제약으로 투영법보다 약 10배 많은 스텝이 필요합니다(같은 물리 시간 기준). 채택 결정은 ARCHITECTURE.md §5.
`;
fs.writeFileSync(path.join(root, 'VALIDATION.md'), md);
console.log(md);
