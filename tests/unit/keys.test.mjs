// Key bindings (src/keys.js, UX-03, ADR-0033): the GTA V defaults hold, no key does two things, a rebinding swaps instead of duplicating,
// browser keys cannot be taken, the choice survives a reload, and no game code reads a letter key behind the bindings' back.
import fs from 'node:fs';
import { ACTIONS, RESERVED, KeyBinds, codeName } from '../../src/keys.js';

const bad = [];
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

// defaults: every action has a key, none reserved, no key shared; the layout is GTA V's where the browser allows
const k = new KeyBinds(mem());
for (const [id, , , c] of ACTIONS) { if (!c.length) bad.push(['no default key', id]); for (const x of c) if (RESERVED.has(x)) bad.push(['reserved default', id, x]); }
if (k.conflicts().length) bad.push(['default conflicts', JSON.stringify(k.conflicts())]);
const gta = { moveF: 'KeyW', sprint: 'ShiftLeft', jump: 'Space', use: 'KeyF', horn: 'KeyE', reload: 'KeyR', cam: 'KeyV', map: 'KeyM', phone: 'ArrowUp', inv: 'Tab', lights: 'KeyH', crouch: 'KeyC', nade: 'KeyG' };
for (const id in gta) if (k.codes(id)[0] !== gta[id]) bad.push(['default', id, k.codes(id)[0], 'want', gta[id]]);

// rebinding to a key in use swaps the two actions' keys
const moved = k.set('use', 0, 'KeyE');
if (k.codes('use')[0] !== 'KeyE' || k.codes('horn')[0] !== 'KeyF' || moved.join() !== 'horn') bad.push(['swap', k.codes('use'), k.codes('horn'), moved]);
if (k.conflicts().length) bad.push(['conflict after swap']);
// a second key, then the same key again in the other slot moves it there instead of doubling it
k.set('use', 1, 'KeyX'); if (k.codes('use').join() !== 'KeyE,KeyX') bad.push(['second slot', k.codes('use')]);
k.set('use', 0, 'KeyX'); if (k.codes('use').join() !== 'KeyX') bad.push(['same key twice', k.codes('use')]);
// reserved keys and Escape are refused
for (const c of ['Escape', 'F5', 'ControlLeft', 'F12']) { const before = k.codes('jump').join(); k.set('jump', 0, c); if (k.codes('jump').join() !== before) bad.push(['took reserved', c]); }
// the last key of an action cannot be cleared; a second one can
k.clear('jump', 0); if (!k.codes('jump').length) bad.push(['cleared the only key']);
k.clear('map', 1); if (k.codes('map').join() !== 'KeyM') bad.push(['clear second', k.codes('map')]);
// held / is / labels
const down = new Set(['KeyX']);
if (!k.held(down, 'use') || k.held(down, 'jump') || !k.is('KeyX', 'use')) bad.push(['held/is']);
if (k.label('jump') !== 'Space' || k.verbLabel('F') !== 'X' || k.verbLabel('G') !== 'F') bad.push(['labels', k.label('jump'), k.verbLabel('F'), k.verbLabel('G')]);
if (codeName('Digit3') !== '3' || codeName('ShiftLeft') !== 'Shift' || codeName('Numpad4') !== 'Num 4' || codeName('ArrowUp') !== '↑') bad.push(['codeName']);

// persistence: a new instance reads the choice back; a broken or hand-edited store falls back safely
const st = mem(), a = new KeyBinds(st); a.set('cam', 0, 'KeyL');
const b = new KeyBinds(st); if (b.codes('cam')[0] !== 'KeyL') bad.push(['not persisted', b.codes('cam')]);
b.reset(); if (new KeyBinds(st).codes('cam')[0] !== 'KeyV') bad.push(['reset not persisted']);
st.setItem('neon_keys_v1', '{not json'); if (new KeyBinds(st).codes('use')[0] !== 'KeyF') bad.push(['broken store']);
st.setItem('neon_keys_v1', JSON.stringify({ jump: ['Escape', 'KeyK'], use: 'KeyF' })); { const c = new KeyBinds(st); if (c.codes('jump').join() !== 'KeyK' || c.codes('use')[0] !== 'KeyF') bad.push(['store filter', c.codes('jump'), c.codes('use')]); }
let threw = false; try { const n = new KeyBinds({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } }); n.set('jump', 0, 'KeyK'); } catch { threw = true; }
if (threw) bad.push(['storage errors must not throw']);

// game code reads keys only through the bindings (fixed keys: Escape, Enter, F9, the gesture menu's digits)
const strays = [];
for (const f of fs.readdirSync('src').filter((f) => f.endsWith('.js') && f !== 'keys.js')) {
  const s = fs.readFileSync('src/' + f, 'utf8'), m = s.match(/'(Key[A-Z]|Digit\d|Space|ShiftLeft|ShiftRight|Tab|F1)'/g);
  if (m) strays.push(f + ': ' + [...new Set(m)].join(' '));
}
if (strays.length) bad.push(['hard-coded keys', strays.join(' | ')]);

console.log('RESULT ' + JSON.stringify({ test: 'keys', pass: bad.length === 0, metrics: { actions: ACTIONS.length }, note: bad.map((x) => x.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
