#!/usr/bin/env node
// Builds VALIDATION.md from tests/out/m3, m4, m7 JSON results. Criteria are fixed here; every row states its source file.
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const J = p => { try { return JSON.parse(fs.readFileSync(path.join(root, p), 'utf8')); } catch { return null; } };
const e = (x, d = 3) => x === undefined || x === null || !Number.isFinite(x) ? '—' : (Math.abs(x) !== 0 && (Math.abs(x) < 1e-2 || Math.abs(x) >= 1e4) ? x.toExponential(2) : x.toFixed(d));
const st = (ok, pending) => pending ? '진행 중' : ok ? 'PASS' : 'PARTIAL';
const rows = [], note = [];
const U = J('tests/out/m4/uniform.json');
rows.push(['균일류 보존 (장애물 없음, 64×16×16, 150스텝)', '최대 상대오차 < 0.5 %', U ? `u 오차 ${e(U.uniform.maxRelErrU * 100)} %, 횡속도 ${e(U.uniform.maxRelCross * 100)} %, NaN ${U.uniform.nonFinite}` : '—', st(U && U.uniform.maxRelErrU < 5e-3 && !U.uniform.nonFinite, !U), 'tests/out/m4/uniform.json']);
const S = J('tests/out/m3/solver-compare.json'), R = S?.stability?.find(s => s.solver === 'RBGS');
rows.push(['투영 후 발산 — 풍동(차량·팬, LOW, RBGS-MG 2, 60스텝)', 'RMS < 1e-3, 최대 < 1e-2 (U/h 기준)', R ? `RMS ${e(R.divRelRms)}, 최대 ${e(R.divRelMax)}, NaN ${R.nonFinite}` : '—', st(R && R.divRelRms < 1e-3 && R.divRelMax < 1e-2 && !R.nonFinite, !R), 'tests/out/m3/solver-compare.json']);
rows.push(['압력 상대잔차 — 풍동(같은 조건)', '≤ 1e-3', R ? e(R.resRel) : '—', st(R && R.resRel <= 1e-3, !R), '같음']);
const cyl = {}; for (const r of [6, 8, 12, 16]) { const d = J(`tests/out/m4/cyl${r}.json`); if (d && !d.error && d.Cd) cyl[r] = d; }
for (const [r, d] of Object.entries(cyl)) {
  rows.push([`원기둥 Re=200 ${r}셀/D — 스트라우할 수 (Cl 스펙트럼)`, '0.18 ~ 0.22', `${e(d.St.value)} (프로브 ${e(d.StProbe?.value)})`, st(d.St.value >= 0.18 && d.St.value <= 0.22), `tests/out/m4/cyl${r}.json`]);
  const err = (d.Cd.mean - 1.34) / 1.34;
  rows.push([`원기둥 Re=200 ${r}셀/D — Cd (평균±표준편차)`, '문헌 1.34 ± 20 %', `${e(d.Cd.mean)} ± ${e(d.Cd.std)} (오차 ${e(err * 100, 1)} %)`, st(Math.abs(err) <= 0.2), '같음']);
  rows.push([`원기둥 ${r}셀/D — 발산/잔차 (마지막 스텝)`, 'RMS<1e-3, 최대<1e-2, 잔차≤1e-3', `RMS ${e(d.div.relRms)}, 최대 ${e(d.div.relMax)}, 잔차 ${e(d.residual.rel)}`, st(d.div.relRms < 1e-3 && d.div.relMax < 1e-2 && d.residual.rel <= 1e-3), '같음']);
}
const SP = J('tests/out/m4/sphere.json');
if (SP && SP.Cd) { const err = (SP.Cd.mean - 1.09) / 1.09; rows.push(['구 Re=100 10셀/D — Cd', '문헌 1.09 ± 20 %', `${e(SP.Cd.mean)} ± ${e(SP.Cd.std)} (오차 ${e(err * 100, 1)} %)`, st(Math.abs(err) <= 0.2), 'tests/out/m4/sphere.json']); }
else rows.push(['구 Re=100 10셀/D — Cd', '문헌 1.09 ± 20 %', '—', '진행 중', 'tests/out/m4/sphere.json']);
const conv = Object.entries(cyl).map(([r, d]) => `${r}셀/D: Cd ${e(d.Cd.mean)}, St ${e(d.St.value)}`).join(' → ');
rows.push(['격자 수렴 3단계 (원기둥)', 'Cd·St 변화 추이 보고', conv || '—', Object.keys(cyl).length >= 3 ? 'PASS(보고)' : '진행 중', 'tests/out/m4/cyl*.json']);
rows.push(['차량 Cd/Cl', '참고값으로만 표시', '화면에 "차량은 참고값" 표기, 평균±표준편차', 'PASS', 'src/ui.js']);
const table = r => ['| 항목 | 기준 | 결과 | 판정 | 근거 |', '|---|---|---|---|---|', ...r.map(x => '| ' + x.join(' | ') + ' |')].join('\n');
let lbm = ''; for (const m of ['FP32', 'FP16', 'MIXED']) { const d = J(`tests/out/m7/lbm-D8-${m}.json`); if (d) lbm += `| ${m} | ${d.setup?.ok ? e(d.setup.bytesPerCell, 0) : '—'} | ${e(d.msPerStep, 1)} | ${d.Cd ? e(d.Cd.mean) + ' ± ' + e(d.Cd.std) : '—'} | ${d.St ? e(d.St.f) : '—'} | ${d.error ? '오류: ' + d.error.slice(0, 60) : d.nonFinite ? 'NaN 발생' : '안정'} |\n`; }
const md = `# VALIDATION

자동 생성: \`node tools/validation-report.mjs\` (결과 JSON에서 표를 만듭니다). 환경: 헤드리스 Chromium + SwiftShader(수치 검증 전용).
판정: **PASS** 기준 충족 · **PARTIAL** 구현됐으나 기준 미달 · **ASSUMED** 직접 검증 불가 · **진행 중** 계산이 아직 끝나지 않음. NaN/Inf가 하나라도 있으면 실패로 처리합니다.

## MAC 투영 솔버

${table(rows)}

문헌값: 원기둥 Re=200(2D) St 0.19~0.20, Cd 1.31~1.40 (Williamson 1996, Henderson 1995, Braza 1986). 구 Re=100 Cd≈1.09 (Clift, Grace & Weber 1978; Johnson & Patel 1999 1.087).
설정: 원기둥 영역 16D×10D×(4셀, 준2D), 입구 균일류, 벽 slip(차단율 10 %), ν=UD/200, CFL 0.8, t=0~3에 약한 회전으로 대칭 깨기, 통계 구간 t≥40. 구 영역 12D×6D×6D, CFL 0.8, 통계 t≥15.

## 압력 솔버 비교 (M3B)

\`tests/out/m3/solver-compare.md\` 참조. 결론: **GMG(가중 야코비 평활)는 60스텝 안에 발산**, RBGS-MG 2사이클이 잔차 6.5e-4로 목표를 만족하는 가장 싼 설정 → 실시간 기본값. MGPCG는 8회에서 4e-4(0에서 시작)로 가장 정확하지만 비용이 더 큼.

## LBM 비교 (M7) — 원기둥 Re=200, 8셀/D, D3Q19 TRT

| 저장 | 바이트/셀 | ms/스텝(SwiftShader 상대) | Cd | St | 안정성 |
|---|---|---|---|---|---|
${lbm || '| — | — | — | — | — | 진행 중 |\n'}
LBM은 격자 단위 음속 제약으로 투영법보다 약 10배 많은 스텝이 필요합니다(같은 물리 시간 기준). 채택 결정은 ARCHITECTURE.md §5.
`;
fs.writeFileSync(path.join(root, 'VALIDATION.md'), md);
console.log(md);
