// The graphics and screen settings (2026-11-10, user request: far view distance and a settings window with many separate options, not just low / medium /
// ultra). Every option has a real effect that is applied at once, is saved, and goes back to the preset's value on a reset. What is not chosen follows the
// preset, and the 'auto' preset follows the quality tier the game picked for the machine (engine.js QUALITY), as before this window existed.
//  - engine values (engine.js eng.ov): render resolution, shadow size / reach / rate, anti-aliasing, AO, bloom, film effects, fog, brightness, post-processing
//  - the view distance (util.js VIEW): the fog's reach and how far the streamed things (forest, city tiles, road pieces, country roads, sites) are built
//  - the game's own (game.opt): field of view, screen shake, population, the frame cap, the automatic resolution
//  - the driving aid (physics.js PHYS.assist, EV-11)
import { setViewDistance } from './util.js';
import { FXQ } from './fx.js';
import { PHYS } from './physics.js';

const KEY = 'neon_gfx';
const el = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const pct = (v) => Math.round(v * 100) + '%';

// The presets: a quality tier of the engine and the values that go with it. 'auto' changes nothing: the tier the machine got and the game's own scaling.
export const PRESETS = [
  { id: 'auto', name: '자동 (기기에 맞춤)', tier: null, v: {} },
  { id: 'lowest', name: '최저', tier: 0, v: { view: 0.6 } },
  { id: 'low', name: '낮음', tier: 1, v: { view: 0.8, res: 0.75, shadow: 1024, shadowDist: 60, shadowEvery: 2, ao: false, bloom: 0.5, traffic: 0.7, npc: 0.7, trees: 0.5 } },
  { id: 'medium', name: '보통', tier: 1, v: { view: 1 } },
  { id: 'high', name: '높음', tier: 2, v: { view: 1.5 } },
  { id: 'ultra', name: '울트라', tier: 3, v: { view: 3, shadowDist: 110, trees: 1.25 } },
  { id: 'extreme', name: '극한 (아주 멀리)', tier: 3, v: { view: 8, shadow: 4096, shadowDist: 150, res: 1.25, traffic: 1.4, npc: 1.4, trees: 1.5 } },
];

const NULL = null, TIER = '화질 단계 기본';
// An option: id, label, kind (select: list of [value, text]; range: min / max / step / fmt; toggle), def (what it is when nothing sets it; null = the tier's),
// cost (what it takes of the frame rate), tip (the line shown while the pointer is on it)
export const TABS = [
  { id: 'view', name: '시야·환경', items: [
    { id: 'view', label: '시야 거리', kind: 'select', def: 1, cost: '높음', tip: '멀리까지 보이는 거리. 안개가 걷히는 거리와 숲·도시·도로·시설이 그려지는 거리가 함께 늘어납니다. 먼 설정일수록 그리는 양이 많아집니다.',
      list: [[0.6, '아주 가까이'], [0.8, '가까이'], [1, '보통 (기본)'], [1.5, '조금 멀리'], [2, '멀리'], [3, '아주 멀리'], [5, '초원거리'], [8, '극한']] },
    { id: 'fog', label: '안개 농도', kind: 'range', min: 0, max: 1.5, step: 0.1, def: 1, fmt: pct, cost: '낮음', tip: '대기의 짙기. 0%는 안개가 없어 멀리까지 또렷하지만 먼 곳이 갑자기 나타나 보일 수 있습니다.' },
    { id: 'trees', label: '식생 밀도', kind: 'range', min: 0.25, max: 1.5, step: 0.25, def: 1, fmt: pct, cost: '중간', tip: '나무와 풀의 양.' },
    { id: 'rain', label: '비 입자 밀도', kind: 'range', min: 0, max: 1, step: 0.1, def: 1, fmt: pct, cost: '낮음', tip: '비가 올 때 그리는 빗줄기의 양.' },
    { id: 'detail', label: '건물 디테일', kind: 'select', def: null, cost: '중간', tip: '단순: 사진 질감과 풍화, 요철 없이 단순한 외벽. 표준: 모든 외벽 디테일.', list: [[NULL, TIER], ['simple', '단순'], ['full', '표준']] },
  ] },
  { id: 'gfx', name: '그래픽', items: [
    { id: 'res', label: '렌더 해상도', kind: 'select', def: null, cost: '높음', tip: '화면 픽셀 대비 그리는 해상도. 100%가 화면 그대로, 125% 이상은 선명하지만 무겁습니다. HUD는 항상 선명합니다.',
      list: [[NULL, TIER], [0.5, '50%'], [0.6, '60%'], [0.7, '70%'], [0.8, '80%'], [0.9, '90%'], [1, '100%'], [1.25, '125%'], [1.5, '150%']] },
    { id: 'dynRes', label: '자동 해상도 조절', kind: 'toggle', def: true, cost: '', tip: '프레임이 떨어지면 해상도를 잠깐 낮추고, 여유가 생기면 되돌립니다.' },
    { id: 'aa', label: '안티 에일리어싱', kind: 'select', def: null, cost: '낮음', tip: '모서리의 계단을 부드럽게 합니다 (SMAA).', list: [[NULL, TIER], [false, '끔'], [true, 'SMAA']] },
    { id: 'shadow', label: '그림자 품질', kind: 'select', def: null, cost: '높음', tip: '그림자 지도의 크기. 높을수록 그림자 가장자리가 또렷합니다.', list: [[NULL, TIER], [0, '끔'], [512, '낮음'], [1024, '보통'], [2048, '높음'], [4096, '매우 높음']] },
    { id: 'shadowDist', label: '그림자 거리', kind: 'range', min: 40, max: 200, step: 10, def: 85, fmt: (v) => v + ' m', cost: '중간', tip: '내 주변 어디까지 그림자를 그리는가. 멀수록 그림자가 흐려집니다.' },
    { id: 'shadowEvery', label: '그림자 갱신 주기', kind: 'select', def: null, cost: '중간', tip: '그림자를 몇 프레임마다 다시 그리는가. 길수록 가볍지만 움직이는 그림자가 끊깁니다.', list: [[NULL, TIER], [1, '매 프레임'], [2, '2프레임마다'], [3, '3프레임마다'], [4, '4프레임마다']] },
    { id: 'ao', label: '주변광 차폐 (AO)', kind: 'select', def: null, cost: '높음', tip: '모서리와 틈에 생기는 은은한 그늘.', list: [[NULL, TIER], [false, '끔'], [true, '켬']] },
    { id: 'bloom', label: '블룸 (빛 번짐)', kind: 'range', min: 0, max: 2, step: 0.1, def: 1, fmt: pct, cost: '중간', tip: '네온과 불빛의 번짐. 0%는 끕니다.' },
    { id: 'post', label: '후처리 전체', kind: 'select', def: null, cost: '높음', tip: '블룸, 안티 에일리어싱, 색 보정을 한꺼번에 끕니다. 가장 가벼운 화면.', list: [[NULL, TIER], [true, '켬'], [false, '끔']] },
  ] },
  { id: 'fx', name: '효과', items: [
    { id: 'particles', label: '이펙트 입자', kind: 'range', min: 0, max: 1, step: 0.1, def: 1, fmt: pct, cost: '중간', tip: '불꽃, 연기, 불씨의 양.' },
    { id: 'speedBlur', label: '속도 블러', kind: 'range', min: 0, max: 1.5, step: 0.1, def: 1, fmt: pct, cost: '낮음', tip: '빠르게 달릴 때 가장자리가 흐려지는 효과.' },
    { id: 'aber', label: '색수차', kind: 'range', min: 0, max: 3, step: 0.25, def: 1, fmt: pct, cost: '낮음', tip: '화면 가장자리의 색 번짐.' },
    { id: 'vig', label: '비네팅', kind: 'range', min: 0, max: 2, step: 0.1, def: 1, fmt: pct, cost: '낮음', tip: '화면 모서리를 어둡게.' },
    { id: 'grain', label: '필름 그레인', kind: 'range', min: 0, max: 3, step: 0.25, def: 1, fmt: pct, cost: '낮음', tip: '화면의 잔 노이즈.' },
    { id: 'shake', label: '화면 흔들림', kind: 'range', min: 0, max: 1.5, step: 0.1, def: 1, fmt: pct, cost: '', tip: '폭발, 충돌, 총격의 화면 흔들림.' },
  ] },
  { id: 'pop', name: '밀도', items: [
    { id: 'traffic', label: '교통량', kind: 'range', min: 0.25, max: 2, step: 0.25, def: 1, fmt: pct, cost: '중간', tip: '도시의 달리는 차 수.' },
    { id: 'npc', label: '보행자 수', kind: 'range', min: 0.25, max: 2, step: 0.25, def: 1, fmt: pct, cost: '중간', tip: '거리의 사람 수.' },
    { id: 'parked', label: '주차 차량', kind: 'range', min: 0, max: 2, step: 0.25, def: 1, fmt: pct, cost: '낮음', tip: '길가에 세워 둔 차 수. 바꾼 값은 다음 시작부터 적용됩니다.' },
  ] },
  { id: 'screen', name: '화면', items: [
    { id: 'fov', label: '시야각 보정', kind: 'range', min: -15, max: 30, step: 1, def: 0, fmt: (v) => (v > 0 ? '+' : '') + v + '°', cost: '', tip: '게임이 정한 시야각에 더하거나 뺍니다. 넓을수록 주변이 많이 보이지만 중앙이 작아집니다.' },
    { id: 'bright', label: '밝기', kind: 'range', min: 0.6, max: 1.4, step: 0.05, def: 1, fmt: pct, cost: '', tip: '화면 전체의 노출.' },
    { id: 'fpsCap', label: '프레임 제한', kind: 'select', def: 0, cost: '', tip: '초당 프레임의 상한. 낮추면 열과 전력이 줄어듭니다. 모니터 주사율보다 높일 수는 없습니다.',
      list: [[0, '제한 없음'], [30, '30'], [45, '45'], [60, '60'], [75, '75'], [90, '90'], [120, '120'], [144, '144'], [165, '165'], [240, '240']] },
    { id: 'fpsOn', label: 'FPS 표시', kind: 'mirror', el: 'fpsOn', cost: '', tip: '화면 구석에 프레임 수를 보입니다.' },
  ] },
  { id: 'snd', name: '소리·조작', items: [
    { id: 'vol', label: '마스터 볼륨', kind: 'mirror', el: 'vol', cost: '', tip: '모든 소리의 크기.' },
    { id: 'music', label: '음악', kind: 'mirror', el: 'musicOn', cost: '', tip: '배경 음악.' },
    { id: 'sens', label: '시점 감도', kind: 'mirror', el: 'sens', cost: '', tip: '마우스와 터치로 시점을 돌리는 속도.' },
    { id: 'assist', label: '운전 보조', kind: 'toggle', def: true, cost: '', tip: '빠를 때 핸들을 타이어가 버티는 각도까지만 꺾습니다. 끄면 끝까지 꺾여 앞바퀴가 밀립니다.' },
  ] },
];
const ITEMS = TABS.flatMap((t) => t.items).filter((o) => o.kind !== 'mirror'), BYID = Object.fromEntries(ITEMS.map((o) => [o.id, o]));

export class Settings {
  // the saved choice (the preset and what the player changed over it); nothing is applied yet
  constructor(G) {
    this.G = G; this.preset = 'auto'; this.u = {}; this.autoTier = G.eng.qIndex; this.applied = {};
    try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); if (PRESETS.some((p) => p.id === s.preset)) this.preset = s.preset; for (const [k, v] of Object.entries(s.u || {})) if (BYID[k] && this.valid(BYID[k], v)) this.u[k] = v; } catch { /* ignore */ }
  }
  // is v one of the values the option can have (a saved file from another version may hold others)
  valid(o, v) { return o.kind === 'select' ? o.list.some(([x]) => x === v) : o.kind === 'toggle' ? typeof v === 'boolean' : typeof v === 'number' && v >= o.min && v <= o.max; }
  presetDef() { return PRESETS.find((p) => p.id === this.preset) || PRESETS[0]; }
  // the value of an option: the player's, else the preset's, else the option's own default (null: the quality tier's)
  val(id) { const o = BYID[id]; if (id in this.u) return this.u[id]; const pv = this.presetDef().v; return id in pv ? pv[id] : o.def; }
  // keep the choice in the browser
  save() { try { localStorage.setItem(KEY, JSON.stringify({ preset: this.preset, u: this.u })); } catch { /* ignore */ } }
  // the player changes one option
  set(id, v) { if (!BYID[id]) return; if (v === this.presetDef().v[id] || (v === BYID[id].def && !(id in this.presetDef().v))) delete this.u[id]; else this.u[id] = v; this.save(); this.apply(); this.refresh?.(); }
  // the player picks a preset: its values replace every choice of their own
  setPreset(id) { if (!PRESETS.some((p) => p.id === id)) return; this.backToAuto = id === 'auto'; this.preset = id; this.u = {}; this.save(); this.apply(); this.refresh?.(); }
  // back to the automatic preset with nothing of their own
  reset() { this.setPreset('auto'); }
  // the ground visibility the view distance and the fog give (m, where 5 % of a distant thing still shows through the fog), for the window's readout
  visibility() { const q = this.G.eng.q, d = 0.0085 * (q.fogK || 1) * this.val('fog') / this.val('view'); return d > 1e-5 ? 1.73 / d : Infinity; }
  // everything the settings decide goes to the engine and the game (the heavy rebuilds only when what they depend on changed)
  apply() {
    const G = this.G, eng = G.eng, ov = eng.ov, v = (id) => this.val(id), t = this.presetDef().tier ?? (this.backToAuto ? this.autoTier : eng.qIndex); this.backToAuto = false;   // 'auto' keeps the tier the game is at now (it may have lowered it), unless the player just came back to it
    const before = { res: ov.res, shadow: ov.shadow, ao: ov.ao, aa: ov.aa, post: ov.post };
    ov.res = v('res'); ov.shadow = v('shadow'); ov.shadowDist = v('shadowDist'); ov.shadowEvery = v('shadowEvery'); ov.ao = v('ao'); ov.aa = v('aa'); ov.post = v('post');
    ov.bloom = v('bloom'); ov.aber = v('aber'); ov.vig = v('vig'); ov.grain = v('grain'); ov.speedBlur = v('speedBlur'); ov.fog = v('fog'); ov.exposure = v('bright');
    setViewDistance(v('view')); FXQ.k = v('particles'); PHYS.assist = v('assist');   // the driving aid (EV-11)
    G.opt = { dynRes: v('dynRes'), fov: v('fov'), shake: v('shake'), traffic: v('traffic'), npc: v('npc'), parked: v('parked'), rain: v('rain'), fpsCap: v('fpsCap') };
    if (t !== eng.qIndex) eng.setQuality(t);   // the tier first: it re-applies the targets with the values above
    else if (Object.keys(before).some((k) => before[k] !== ov[k])) eng.applyTargets();
    else eng.applyOv();
    // the parts of the world that follow a setting
    if (G.rain) { const n = G.rain.geometry.attributes.aEnd.count; G.rain.geometry.setDrawRange(0, Math.round(n * v('rain') / 2) * 2); }
    if (G.forest) G.forest.f = (globalThis.__DETAIL === 'high' ? 1 : 0.5) * v('trees');
    const det = v('detail'); G.world?.setSimple?.(det === 'simple' ? true : det === 'full' ? false : !!eng.q.simple);
  }
  // the window: tabs on the left, the options on the right, what the pointer is on explained at the bottom; made once and put in the pause menu
  build() {
    const pc = el('pc'), host = pc && pc.parentNode; if (!host || el('sc')) return;
    const open = document.createElement('button'); open.type = 'button'; open.className = 'pbtn p'; open.id = 'gfxBtn'; open.textContent = '그래픽·화면 설정'; pc.insertBefore(open, el('resume'));
    const sc = document.createElement('div'); sc.id = 'sc'; sc.className = 'glass';
    sc.innerHTML = '<header><h2>그래픽·화면 설정</h2><label>프리셋 <select id="scPreset"></select></label></header><div id="scBody"><nav id="scTabs"></nav><div id="scList"></div></div>'
      + '<p id="scTip"></p><div class="krow"><button type="button" class="pbtn" id="scReset">기본값으로</button><button type="button" class="pbtn p" id="scBack">돌아가기</button></div>';
    host.appendChild(sc);
    const tabs = sc.querySelector('#scTabs'), list = sc.querySelector('#scList'), tip = sc.querySelector('#scTip'), presetSel = sc.querySelector('#scPreset'); let tab = TABS[0].id;
    presetSel.innerHTML = PRESETS.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('') + '<option value="custom" hidden>사용자 지정</option>';
    presetSel.onchange = () => this.setPreset(presetSel.value);
    const draw = () => {
      tabs.innerHTML = TABS.map((t) => `<button type="button" class="${t.id === tab ? 'on' : ''}" data-t="${t.id}">${esc(t.name)}</button>`).join('');
      const T = TABS.find((t) => t.id === tab); list.innerHTML = '';
      for (const o of T.items) {
        const row = document.createElement('div'); row.className = 'srow'; row.dataset.id = o.id;
        const cur = o.kind === 'mirror' ? null : this.val(o.id), cost = o.cost ? `<span class="scost c${o.cost === '높음' ? 3 : o.cost === '중간' ? 2 : 1}">FPS 영향 ${o.cost}</span>` : '<span class="scost"></span>';
        let ctl = '', txt = '';
        if (o.kind === 'select') { ctl = `<select>${o.list.map(([x, name], i) => `<option value="${i}"${x === cur ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select>`; }
        else if (o.kind === 'range') { ctl = `<input type="range" min="${o.min}" max="${o.max}" step="${o.step}" value="${cur}">`; txt = o.fmt(cur); }
        else if (o.kind === 'toggle') ctl = `<input type="checkbox"${cur ? ' checked' : ''}>`;
        else { const src = el(o.el); ctl = src.type === 'checkbox' ? `<input type="checkbox"${src.checked ? ' checked' : ''}>` : `<input type="range" min="${src.min}" max="${src.max}" step="${src.step}" value="${src.value}">`; }
        let extra = ''; if (o.id === 'view') extra = `<small id="scVis">맑은 날 지상 시야 약 ${this.visText()}</small>`;
        row.innerHTML = `<label>${esc(o.label)}${extra}</label><div class="sctl">${ctl}</div><span class="sval">${esc(txt)}</span>${cost}`;
        const input = row.querySelector('select, input');
        const done = () => { if (o.id === 'view') { const s = sc.querySelector('#scVis'); if (s) s.textContent = '맑은 날 지상 시야 약 ' + this.visText(); } };
        if (o.kind === 'select') input.onchange = () => { this.set(o.id, o.list[+input.value][0]); done(); };
        else if (o.kind === 'range') input.oninput = () => { const x = +input.value; row.querySelector('.sval').textContent = o.fmt(x); this.set(o.id, x); done(); };
        else if (o.kind === 'toggle') input.onchange = () => this.set(o.id, input.checked);
        else { const src = el(o.el); input.oninput = input.onchange = () => { if (src.type === 'checkbox') src.checked = input.checked; else src.value = input.value; src.dispatchEvent(new Event(src.type === 'checkbox' ? 'change' : 'input', { bubbles: true })); }; }
        for (const ev of ['pointerenter', 'focusin']) row.addEventListener(ev, () => { tip.textContent = o.tip; });
        list.appendChild(row);
      }
      tip.textContent = '항목에 올려 보세요. 설명이 여기에 나옵니다. 바꾼 값은 바로 적용되고 저장됩니다.';
      presetSel.value = Object.keys(this.u).length ? 'custom' : this.preset;
    };
    this.refresh = () => { if (sc.classList.contains('on')) draw(); };
    tabs.onclick = (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; draw(); } };
    const show = (on) => { sc.classList.toggle('on', on); pc.style.display = on ? 'none' : ''; if (on) draw(); };
    open.onclick = () => show(true); sc.querySelector('#scBack').onclick = () => show(false); sc.querySelector('#scReset').onclick = () => this.reset();
    this.show = show;
  }
  // the readout of the view distance row
  visText() { const m = this.visibility(); return m === Infinity ? '끝없이 멀리' : m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 10) * 10 + ' m'; }
}
