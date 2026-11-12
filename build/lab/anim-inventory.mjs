// Animation inventory (EV-50): every clip in the game's character file with its length, key count and whether it moves the root (root
// motion), the game names that play it (src/assets.js CLIPS / MOTIONS, upper-body masks UB_*), and the interactions the directive asks for
// checked against them. Writes docs/design/anim-inventory.md. Usage: node build/lab/anim-inventory.mjs
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const ROOT = new URL('../../', import.meta.url);
const src = fs.readFileSync(new URL('src/assets.js', ROOT), 'utf8');
// the clip tables of assets.js, read from its text (the module itself loads files through the bundler)
const block = (re) => { const m = src.match(re); if (!m) throw new Error('assets.js changed: ' + re); return m[1]; };
const CLIPS = Function('return {' + block(/const CLIPS = \{([\s\S]*?)\n\};/) + '}')();
const MOTIONS = Function('return [' + block(/const MOTIONS = \[([\s\S]*?)\n\];/) + ']')();
const UPPER = new Set(Function('return [' + block(/const UPPER = new Set\(\[([\s\S]*?)\]\)/) + ']')());
for (const n of MOTIONS) CLIPS['U_' + n] = n;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(new URL('assets/character_game.glb', ROOT).pathname);
const rows = [];
for (const a of doc.getRoot().listAnimations()) {
  let dur = 0, keys = 0, root = 0;
  for (const ch of a.listChannels()) {
    const s = ch.getSampler(), inp = s.getInput(), out = s.getOutput(), node = ch.getTargetNode(), path = ch.getTargetPath();
    const n = inp.getCount(); keys += n; dur = Math.max(dur, inp.getElement(n - 1, [])[0]);
    if (path === 'translation' && node && /hips|pelvis|root/i.test(node.getName())) { const p0 = out.getElement(0, []), p1 = out.getElement(n - 1, []); root = Math.max(root, Math.hypot(p1[0] - p0[0], p1[2] - p0[2])); }
  }
  rows.push({ name: a.getName(), dur: +dur.toFixed(2), keys, rootM: +root.toFixed(2) });
}
const byFile = new Map(); for (const [game, file] of Object.entries(CLIPS)) (byFile.get(file) || byFile.set(file, []).get(file)).push(game);
// what the directive's interactions need (EV-53) and the clip that would serve each, if the file has one
const NEED = [['경사 보행', /slope|incline|uphill/i], ['계단', /stair/i], ['좁은 길 비켜 가기', /sidestep|squeeze|strafe/i], ['문 열기', /door/i], ['앉기 (벤치)', /sit/i], ['차 승하차', /\bcar\b|vehicle|getin|getout/i], ['운전 자세', /^driving/i], ['물건 들기', /pickup|carry|lift/i], ['밀기', /^push$/i], ['넘어짐·일어나기', /fall|getup|lay|rise/i], ['수영', /swim/i], ['사다리', /ladder/i], ['전화', /phone/i], ['총 조준·사격', /aim|shoot|pistol|rifle/i], ['근접 공격', /punch|melee|fight|sword/i]];
const names = rows.map((r) => r.name), have = (re) => names.filter((n) => re.test(n));
let md = `# 애니메이션 보유 목록 (EV-50)\n\n\`node build/lab/anim-inventory.mjs\`가 만든다. 캐릭터 파일 \`assets/character_game.glb\`의 클립 ${rows.length}개와 게임이 그 클립을 부르는 이름이다.\n\n`;
md += `- 루트 이동: 엉덩이 뼈가 처음과 끝에서 수평으로 움직인 거리다. 0이 아니면 클립이 몸을 옮긴다(이름의 _RM과 같다).\n- 게임 이름의 UB_ 마스크는 상체만 쓰는 판이다(UPPER ${UPPER.size}개).\n\n## 상호작용별 대조\n\n| 상호작용 | 있는 클립 |\n|---|---|\n`;
for (const [k, re] of NEED) { const h = have(re); md += `| ${k} | ${h.length ? h.slice(0, 8).join(', ') + (h.length > 8 ? ` 외 ${h.length - 8}` : '') : '**없음**'} |\n`; }
md += `\n## 클립 표\n\n| 클립 | 길이 s | 키 | 루트 이동 m | 게임 이름 |\n|---|---|---|---|---|\n`;
for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) md += `| ${r.name} | ${r.dur} | ${r.keys} | ${r.rootM} | ${(byFile.get(r.name) || []).map((g) => g + (UPPER.has(r.name) && g.startsWith('U_') ? ' (+UB_)' : '')).join(', ') || '—'} |\n`;
const missing = Object.entries(CLIPS).filter(([, f]) => !names.includes(f)).map(([g, f]) => `${g} → ${f}`);
md += `\n## 게임이 부르지만 파일에 없는 클립\n\n${missing.length ? missing.map((m) => '- ' + m).join('\n') : '없음.'}\n`;
md += `\n## 쓰이지 않는 클립\n\n${rows.filter((r) => !byFile.has(r.name)).length}개: ${rows.filter((r) => !byFile.has(r.name)).map((r) => r.name).join(', ') || '없음'}\n`;
fs.writeFileSync(new URL('docs/design/anim-inventory.md', ROOT), md);
console.log(JSON.stringify({ clips: rows.length, gameNames: Object.keys(CLIPS).length, missing: missing.length, unused: rows.filter((r) => !byFile.has(r.name)).length }));
