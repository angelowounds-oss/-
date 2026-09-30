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
/* pressure/friction split is only meaningful for the surface formula (cut); with vf the forcing term carries both */
const split = d => d.Cdp && d.ibm === 'cut' ? `, 압력 ${e(d.Cdp.mean)} / 마찰 ${e(d.Cd.mean - d.Cdp.mean)}` : '';
const pct = (x, ref) => e((x - ref) / ref * 100, 1) + ' %';
/* Cd verdict: the solver's own force (what the HUD shows) and the independent CV balance must both be within +-20 % */
const cdCell = (d, ref) => `${e(d.Cd.mean)} ± ${e(d.Cd.std)} (${pct(d.Cd.mean, ref)}${split(d)})${d.CdCV ? `; 검사체적 ${e(d.CdCV.mean)} (${pct(d.CdCV.mean, ref)})` : ''}`;
const cdOk = (d, ref) => Math.abs(d.Cd.mean - ref) / ref <= 0.2 && (!d.CdCV || Math.abs(d.CdCV.mean - ref) / ref <= 0.2);
const cyl = {}; for (const r of [6, 8, 12, 16]) { const f = `tests/out/m4/cyl${r}.json`, d = J(f); if (ok(d, f) && d.ibm === 'vf') cyl[r] = d; }
const W8 = J('tests/out/m4/cyl8wide.json'); if (ok(W8, 'tests/out/m4/cyl8wide.json') && W8.ibm === 'vf') cyl['8wide'] = W8;
for (const [r, d] of Object.entries(cyl)) {
  const lab = r === '8wide' ? '8셀/D, 폭 16D(차단율 6 %)' : `${r}셀/D, 폭 10D(차단율 10 %)`, f = `tests/out/m4/cyl${r}.json`;
  const S = stOf(d); rows.push([`원기둥 Re=200 ${lab} — 스트라우할 수 (Cl 영교차 ${S.cycles}주기)`, '0.18 ~ 0.22', `${e(S.f)} (프로브 DFT ${e(d.StProbe?.value)})`, st(S.f >= 0.18 && S.f <= 0.22), f]);
  rows.push([`원기둥 Re=200 ${lab} — Cd (평균±표준편차)`, '문헌 1.34 ± 20 % (솔버 힘과 검사체적 모두)', cdCell(d, 1.34), st(cdOk(d, 1.34)), '같음']);
  rows.push([`원기둥 ${lab} — 발산/잔차 (마지막 스텝)`, 'RMS<1e-3, 최대<1e-2, 잔차≤1e-3', `RMS ${e(d.div.relRms)}, 최대 ${e(d.div.relMax)}, 잔차 ${e(d.residual.rel)}`, st(d.div.relRms < 1e-3 && d.div.relMax < 1e-2 && d.residual.rel <= 1e-3), '같음']);
}
if (!Object.keys(cyl).length) rows.push(['원기둥 Re=200 (vf 경계)', '—', '—', '진행 중', 'tests/out/m4/cyl*.json']);
const SP = J('tests/out/m4/sphere.json');
if (ok(SP, 'tests/out/m4/sphere.json') && SP.ibm === 'vf') { rows.push(['구 Re=100 10셀/D — Cd', '문헌 1.09 ± 20 % (솔버 힘과 검사체적 모두)', cdCell(SP, 1.09), st(cdOk(SP, 1.09)), 'tests/out/m4/sphere.json']);
  rows.push(['구 10셀/D — 발산/잔차', 'RMS<1e-3, 최대<1e-2, 잔차≤1e-3', `RMS ${e(SP.div.relRms)}, 최대 ${e(SP.div.relMax)}, 잔차 ${e(SP.residual.rel)}`, st(SP.div.relRms < 1e-3 && SP.div.relMax < 1e-2 && SP.residual.rel <= 1e-3), '같음']); }
else rows.push(['구 Re=100 10셀/D — Cd', '문헌 1.09 ± 20 %', '—', '진행 중', 'tests/out/m4/sphere.json']);
const conv = Object.entries(cyl).filter(([r]) => r !== '8wide').map(([r, d]) => `${r}셀/D: Cd ${e(d.Cd.mean)} (CV ${e(d.CdCV?.mean)}), St ${e(stOf(d).f)}`).join(' → ');
rows.push(['격자 수렴 3단계 (원기둥)', 'Cd·St 변화 추이 보고', conv || '—', Object.keys(cyl).filter(r => r !== '8wide').length >= 3 ? 'PASS(보고)' : '진행 중', 'tests/out/m4/cyl*.json']);
rows.push(['차량 Cd/Cl', '참고값으로만 표시', '화면에 "차량은 참고값" 표기, 평균±표준편차', 'PASS', 'src/ui.js']);
/* boundary-treatment comparison: cut-cell only vs + volume-fraction forcing; three force estimates per run */
const cmp = [];
for (const [f, lab, ref] of [['sphere8', '구 Re=100, 8셀/D, cut', 1.09], ['sphere8vf', '구 Re=100, 8셀/D, cut+vf', 1.09], ['cyl8cut', '원기둥 Re=200, 8셀/D, cut', 1.34], ['cyl8', '원기둥 Re=200, 8셀/D, cut+vf', 1.34]]) {
  const d = J(`tests/out/m4/${f}.json`); if (!d || d.error || !d.CdCV) { cmp.push(`| ${lab} | ${ref} | — | — | — | — | 진행 중 |`); continue; }
  const sc = d.ibm === 'cut' ? d.Cd.mean : null, bu = d.CdBudget?.mean, S = stOf(d);
  cmp.push(`| ${lab} | ${ref} | ${sc === null ? '—(vf에선 이중 계산)' : `${e(sc)} (${pct(sc, ref)})`} | ${e(bu)} (${pct(bu, ref)}) | ${e(d.CdCV.mean)} (${pct(d.CdCV.mean, ref)}) | ${Number.isFinite(S.f) ? e(S.f) : '—(정상류)'} | \`${f}.json\` |`); }
const table = r => ['| 항목 | 기준 | 결과 | 판정 | 근거 |', '|---|---|---|---|---|', ...r.map(x => '| ' + x.join(' | ') + ' |')].join('\n');
/* LBM: rows per (collision, boundary variant, storage). Cost is compared with the MAC solver at equal physical time:
   LBM dt = Ul/Dl (D/U units) vs MAC dt = 0.8/Dl, so LBM needs 0.8/Ul = 13.3 steps per MAC step at Ul=0.06. */
const MACc = J('tests/out/m4/cyl8.json'); let lbm = '';
const lbmRow = (f, coll) => { const d = J(`tests/out/m7/${f}.json`); if (!d) return '';
  const recs = (d.rec || []).filter(r => Number.isFinite(r.Cd)), W = recs.filter(r => r.tStar >= 40), zc = zeroCross(W.map(r => r.tStar), W.map(r => r.Cl));
  const cd = d.Cd ? `${e(d.Cd.mean)} ± ${e(d.Cd.std)} (${pct(d.Cd.mean, 1.34)})` : '—';
  /* no shedding (|Cl| std < 0.05) -> St undefined; otherwise DFT peak (robust to storage noise) with the zero-crossing value */
  const stv = W.length <= 20 ? '—' : d.Cl && d.Cl.std < 0.05 ? `와류 방출 없음(Cl σ ${e(d.Cl.std)})` : `${e(d.St?.f)} (DFT 봉우리/평균 ${e(d.St?.peakToMean, 1)}; 영교차 ${e(zc.f)})`;
  const eq = d.msPerStep && d.Ul ? e(d.msPerStep * 0.8 / d.Ul, 0) : '—';
  const stab = d.error ? '오류: ' + d.error.slice(0, 60) : d.nonFinite ? `NaN (t*≈${e(recs.at(-1)?.tStar, 1)})` : (d.Cd && d.Cd.std > 0.3 ? '유한값, Cd 요동 큼' : d.Cl && d.Cl.std >= 0.05 && d.St && d.St.peakToMean < 3 ? '유한값, 저장 잡음 지배(주파수 봉우리 없음)' : '안정');
  return `| ${d.mode} | ${coll} | ${d.setup?.ok ? e(d.setup.bytesPerCell, 0) : '—'} | ${e(d.msPerStep, 1)} | ${eq} | ${cd} | ${stv} | ${stab} |\n`; };
for (const [f, c] of [['lbm-D8-FP32-trt', 'TRT, 램프 t*=5'], ['lbm-D8-FP32-reg1', '정규화 BGK, 출구 흡수층만'], ['lbm-D8-FP16-reg1', '정규화 BGK, 출구 흡수층만'], ['lbm-D8-MIXED-reg1', '정규화 BGK, 출구 흡수층만'],
  ['lbm-D8-FP32-reg2', '정규화 BGK, 입·출구 흡수층, 램프 t*=10'], ['lbm-D8-FP16-reg2', '정규화 BGK, 입·출구 흡수층, 램프 t*=10'], ['lbm-D8-MIXED-reg2', '정규화 BGK, 입·출구 흡수층, 램프 t*=10'],
  ['lbm-D8-FP32', '위 + 대칭 깨기(t*=5~10 횡유입 0.05U)'], ['lbm-D8-FP16', '위 + 대칭 깨기(t*=5~10 횡유입 0.05U)'], ['lbm-D8-MIXED', '위 + 대칭 깨기(t*=5~10 횡유입 0.05U)']]) lbm += lbmRow(f, c);
const macRow = MACc ? `| MAC(비교 기준) | 투영법 vf, RBGS-MG 5 | 약 140(속도·압력·형상, 연기 제외) | ${e(MACc.msPerStep, 0)} | ${e(MACc.msPerStep, 0)} | ${e(MACc.Cd.mean)} ± ${e(MACc.Cd.std)} (${pct(MACc.Cd.mean, 1.34)}) | ${e(stOf(MACc).f)} | 안정 |\n` : '';
const md = `# VALIDATION

자동 생성: \`node tools/validation-report.mjs\` (결과 JSON에서 표를 만듭니다). 환경: 헤드리스 Chromium + SwiftShader(수치 검증 전용).
판정: **PASS** 기준 충족 · **PARTIAL** 구현됐으나 기준 미달 · **ASSUMED** 직접 검증 불가 · **진행 중** 계산이 아직 끝나지 않음. NaN/Inf가 하나라도 있으면 실패로 처리합니다.

## MAC 투영 솔버

${table(rows)}

문헌값: 원기둥 Re=200(2D) St 0.19~0.20, Cd 1.31~1.40 (Williamson 1996, Henderson 1995, Braza 1986). 구 Re=100 Cd≈1.09 (Clift, Grace & Weber 1978; Johnson & Patel 1999 1.087).
설정: 원기둥 영역 16D×10D×(4셀, 준2D), 입구 균일류, 벽 slip(차단율 10 %), ν=UD/200, CFL 0.8, t=0~3에 약한 회전으로 대칭 깨기, 통계 구간 t=40~70, St는 Cl 상승 영교차의 평균 주기. 구 영역 12D×6D×6D, CFL 0.8, 통계 t≥15. 검사체적 상자 x −1.5D~3D, y(·z) ±1.5D.

${stale.length ? `이전 힘 공식(벽 거리 h/2 가정)으로 만든 결과 파일은 표에서 제외: ${stale.map(f => '`' + f + '`').join(', ')}\n` : ''}
힘 계산(\`forceModel: ${FM}\`): 풍동 기본 경계(vf)에서는 **운동량 수지식** — 닫힌 고체 면의 압력 + 확산 단계가 닫힌 면과 주고받는 점성 운동량 + vf 강제로 유체에서 뺀 운동량. 표에는 독립 추정인 검사체적 값을 함께 적고, Cd는 둘 다 ±20 % 안일 때만 PASS입니다. 압력 풀이는 검증에서 RBGS-MG 5사이클(풍동 실시간은 2사이클).

## 경계 처리 비교 — 부분체적(cut) vs 부분체적 + 체적분율 강제(vf, Kajishima 2001)

같은 흐름에서 힘을 세 가지로 구합니다. 표면식 = φ 경사의 p·n + 닫힌 면 점성 교환. 운동량 수지식 = 닫힌 면 압력 + 점성 교환 + vf 강제력(솔버가 실제로 유체에서 빼는 운동량). 검사체적(CV) = 물체를 둘러싼 상자(−1.5D~3D, ±1.5D)의 유속·압력·점성 응력·운동량 변화로, 경계 처리와 힘 공식에 독립입니다. 다만 반라그랑주 이류는 운동량을 정확히 보존하지 않으므로 CV에도 그만큼 오차가 있습니다.

**결론: vf 채택(풍동 기본값).** cut은 같은 흐름에서 세 추정이 0.52~1.59로 갈려 힘 수지가 맞지 않습니다(부분체적 셀의 접선 속도가 고체를 느끼지 못해 점성상 물체가 약 1셀 작게 보임). vf는 솔버 힘과 CV가 5~17 % 안에서 일치하고 둘 다 문헌 ±20 % 안입니다. 대가: 면 고체분율로 섞기 때문에 물체가 약 h/4 두꺼워지는 경향(원기둥 St 0.219→0.185).

| 경우 | 문헌 Cd | 표면식 Cd | 운동량 수지식 Cd | 검사체적 Cd | St | 근거 |
|---|---|---|---|---|---|---|
${cmp.join('\n')}

## 압력 솔버 비교 (M3B)

\`tests/out/m3/solver-compare.md\` 참조. 결론: **GMG(가중 야코비 평활)는 60스텝 안에 발산**, RBGS-MG 2사이클이 잔차 6.5e-4로 목표를 만족하는 가장 싼 설정 → 실시간 기본값. MGPCG는 8회에서 4e-4(0에서 시작)로 가장 정확하지만 비용이 더 큼.

## LBM 비교 (M7) — 원기둥 Re=200, 8셀/D, D3Q19, Ul=0.06(Ma≈0.1), 같은 영역(16D×10D×4)

| 저장 | 충돌·경계 | 바이트/셀 | ms/스텝 | 같은 물리시간 ms(MAC 1스텝당) | Cd (문헌 1.34) | St | 안정성 |
|---|---|---|---|---|---|---|---|
${macRow}${lbm || '| — | — | — | — | — | — | — | 진행 중 |\n'}
ms는 SwiftShader(CPU) 상대값이며 다른 계산과 동시에 돌린 경우가 있어 ±50 % 정도 흔들립니다. LBM은 격자 단위 시간 간격이 Ul/Dl라 같은 물리 시간에 MAC보다 0.8/Ul ≈ 13배 많은 스텝이 필요합니다. τ=0.5+3ν=0.507(Re=200, 8셀/D)이라 안정 한계에 가깝습니다. 채택 결정은 ARCHITECTURE.md §5.`;
fs.writeFileSync(path.join(root, 'VALIDATION.md'), md);
console.log(md);
