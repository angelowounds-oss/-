#!/usr/bin/env node
// Builds assets/reference-results.js (the built-in "precomputed reference results") from the finished offline runs in data/reference/runs/*.json.
// Nothing is invented: a car gets an entry only if at least one of its runs finished (done: true), the headline numbers come from its finest finished grid, and the grid study lists every finished grid.
//   node tools/offline/make-reference.mjs
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'), dir = path.join(root, 'data/reference/runs');
const runs = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).filter(r => r.done && r.summary && Number.isFinite(r.summary.Cd)) : [];
const out = [];
for (const car of [...new Set(runs.map(r => r.car))]) {
  const rs = runs.filter(r => r.car === car).sort((a, b) => a.summary.cellM - b.summary.cellM), fine = rs[0], s = fine.summary;
  out.push({ schema: 'aether-reference-v1', car,
    label: { title: '사전 계산(오프라인, 실시간 아님)', method: 'AETHER MAC 솔버(교차 격자·부분체적·LES), 오프라인 실행', source: 'tools/offline/fine-run.mjs, 헤드리스 Chromium(SwiftShader, CPU) — 이 저장소의 같은 솔버', gridCellM: s.cellM, gridCells: s.N, U: fine.setup?.U ?? 5, yawDeg: fine.setup?.yawDeg ?? 0, simTimeS: s.simTimeS, averagedWindowS: s.windowS, date: (fine.finished || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      limits: '같은 솔버를 촘촘한 격자로 돌린 값이라 격자 오차는 줄지만 절대 Cd가 실제 풍동 값과 같다는 뜻은 아님(KNOWN_LIMITATIONS L36, Ahmed 문헌 대비 약 2.2배). Cl은 신뢰 불가(L4). 상대 비교·수렴 추세 참고용' },
    forces: { Cd: s.Cd, CdStd: s.CdStd ?? undefined, Cl: s.Cl ?? undefined, ClStd: s.ClStd ?? undefined, A: s.A ?? undefined },
    gridStudy: rs.map(r => ({ cellM: r.summary.cellM, Cd: r.summary.Cd, CdStd: r.summary.CdStd ?? undefined, Cl: r.summary.Cl ?? undefined, simTimeS: r.summary.simTimeS })) });
}
fs.writeFileSync(path.join(root, 'assets/reference-results.js'), '(window.__ASSETS=window.__ASSETS||{}).REFERENCE_RESULTS=' + JSON.stringify(out) + ';\n');
console.log('reference entries:', out.map(o => `${o.car} (${o.gridStudy.length} grids, finest ${o.label.gridCellM} m, Cd ${o.forces.Cd})`).join('; ') || 'none');
