import { el, clamp } from './util.js';

export class Input {
  constructor() {
    this.keys = new Set();
    this.mx = 0; this.my = 0;           // accumulated look delta
    this.move = { x: 0, y: 0 };         // touch / pad analog
    this.fire = false; this.aim = false; this.sprint = false; this.hand = false;
    this.edges = { jump: 0, use: 0, reload: 0, swap: 0, cam: 0, lights: 0, pause: 0, w1: 0, w2: 0, horn: 0, verb3: 0, inv: 0, drop: 0, crouch: 0, grab: 0, phone: 0, sit: 0, nade: 0, w3: 0, w4: 0, w5: 0, w6: 0 };
    this.wheel = 0;
    this.touch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
    this.sens = 1;
    this.locked = false;
    this.touchBtn = { gas: false, brake: false };
    this.padActive = false;
    this.bind();
  }
  edge(n) { const v = this.edges[n]; this.edges[n] = 0; return v > 0; }
  bind() {
    const keyMap = { Space: 'jump', KeyF: 'use', KeyE: 'use', KeyR: 'reload', KeyQ: 'swap', KeyC: 'cam', KeyL: 'lights', Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', Digit4: 'w4', Digit5: 'w5', Digit6: 'w6', KeyH: 'horn', KeyG: 'horn', KeyT: 'verb3', KeyI: 'inv', Tab: 'inv', KeyX: 'drop', KeyZ: 'crouch', KeyV: 'grab', KeyM: 'phone', KeyN: 'sit', KeyB: 'nade' };
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const n = keyMap[e.code]; if (n) this.edges[n]++;
      if (e.code === 'Escape' || e.code === 'KeyP') this.edges.pause++;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.fire = this.aim = false; });
    const game = el('game');
    addEventListener('mousedown', (e) => {
      if (this.touch || !this.locked) return;
      if (e.button === 0) this.fire = true; if (e.button === 2) this.aim = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.fire = false; if (e.button === 2) this.aim = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => { if (this.locked) { this.mx += e.movementX; this.my += e.movementY; } });
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === game.querySelector('canvas');
      this.onLockChange?.(this.locked);
    });
    this.bindTouch();
  }
  lock() {
    if (this.touch) { this.locked = true; return; }
    const c = el('game').querySelector('canvas');
    try { const p = c.requestPointerLock?.(); p?.catch?.(() => {}); } catch (e) { /* ignore */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  bindTouch() {
    const stick = el('stick'), nub = stick.firstElementChild;
    let mid = null, mox = 0, moy = 0, lid = null, lx = 0, ly = 0;
    const mz = el('moveZone'), lz = el('lookZone');
    mz.addEventListener('pointerdown', (e) => { mid = e.pointerId; mz.setPointerCapture(mid); mox = e.clientX; moy = e.clientY; stick.style.left = mox + 'px'; stick.style.top = moy + 'px'; stick.classList.add('on'); nub.style.transform = ''; });
    mz.addEventListener('pointermove', (e) => {
      if (e.pointerId !== mid) return;
      let dx = e.clientX - mox, dy = e.clientY - moy; const d = Math.hypot(dx, dy), r = 55;
      if (d > r) { dx = dx / d * r; dy = dy / d * r; }
      nub.style.transform = `translate(${dx}px,${dy}px)`;
      this.move.x = dx / r; this.move.y = -dy / r;
      this.sprint = d > r * 1.15 || this.sprintBtn;
    });
    const endMove = (e) => { if (e.pointerId !== mid) return; mid = null; this.move.x = this.move.y = 0; stick.classList.remove('on'); this.sprint = !!this.sprintBtn; };
    mz.addEventListener('pointerup', endMove); mz.addEventListener('pointercancel', endMove);
    lz.addEventListener('pointerdown', (e) => { lid = e.pointerId; lz.setPointerCapture(lid); lx = e.clientX; ly = e.clientY; });
    lz.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; this.mx += (e.clientX - lx) * 1.25; this.my += (e.clientY - ly) * 1.25; lx = e.clientX; ly = e.clientY; });
    const endLook = (e) => { if (e.pointerId === lid) lid = null; };
    lz.addEventListener('pointerup', endLook); lz.addEventListener('pointercancel', endLook);
    const hold = (id, on, off) => { const b = el(id); b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('dn'); on(); }); const up = () => { b.classList.remove('dn'); off?.(); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up); };
    hold('bFire', () => (this.fire = true), () => (this.fire = false));
    hold('bAim', () => (this.aim = !this.aim));
    hold('bJump', () => this.edges.jump++);
    hold('bReload', () => this.edges.reload++);
    hold('bSwap', () => this.edges.swap++);
    hold('bSprint', () => { this.sprintBtn = !this.sprintBtn; this.sprint = this.sprintBtn; });
    hold('bUse', () => this.edges.use++);
    hold('bExit', () => this.edges.use++);
    hold('bGas', () => (this.touchBtn.gas = true), () => (this.touchBtn.gas = false));
    hold('bBrake', () => (this.touchBtn.brake = true), () => (this.touchBtn.brake = false));
    hold('bHand', () => (this.hand = true), () => (this.hand = false));
    hold('bCam', () => this.edges.cam++);
    hold('bG', () => this.edges.horn++); hold('bT', () => this.edges.verb3++); hold('bInv', () => this.edges.inv++); hold('bCrouch', () => this.edges.crouch++); hold('bPhone', () => this.edges.phone++); hold('bNade', () => this.edges.nade++);
    hold('bPause', () => this.edges.pause++);
    if (this.touch) document.body.classList.add('touch');
  }
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find((x) => x && x.connected);
    this.pad = null;
    if (!p) { this.padActive = false; return; }
    const dz = (v) => (Math.abs(v) < 0.14 ? 0 : v);
    this.pad = { lx: dz(p.axes[0]), ly: dz(p.axes[1]), rx: dz(p.axes[2]), ry: dz(p.axes[3]), b: p.buttons.map((b) => b.pressed), lt: p.buttons[6]?.value || 0, rt: p.buttons[7]?.value || 0 };
    const prev = this._prevPad || [];
    const press = (i) => this.pad.b[i] && !prev[i];
    if (press(0)) this.edges.jump++; if (press(2)) this.edges.reload++; if (press(3)) this.edges.use++; if (press(1)) this.edges.cam++;
    if (press(5)) this.edges.swap++; if (press(9)) this.edges.pause++; if (press(4)) this.edges.horn++;
    this._prevPad = this.pad.b.slice();
    this.padActive = true;
  }
  // Frame snapshot
  read(dt) {
    this.pollPad();
    const k = this.keys;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let my = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let lookX = this.mx, lookY = this.my; this.mx = this.my = 0;
    let fire = this.fire, aim = this.aim, sprint = this.sprint || k.has('ShiftLeft') || k.has('ShiftRight'), hand = this.hand || k.has('Space');
    let gas = my > 0 ? my : 0, brake = my < 0 ? -my : 0;
    if (this.touch) { mx = mx || this.move.x; my = my || this.move.y; }
    if (this.touchBtn.gas) gas = 1; if (this.touchBtn.brake) brake = 1;
    if (this.touch && this.move.x) mx = this.move.x;
    if (this.pad) {
      const p = this.pad;
      if (p.lx || p.ly) { mx = p.lx; my = -p.ly; }
      lookX += p.rx * 900 * dt; lookY += p.ry * 700 * dt;
      fire = fire || p.rt > 0.3; aim = aim || p.lt > 0.3; sprint = sprint || p.b[10];
      if (p.rt > 0.05) gas = Math.max(gas, p.rt); if (p.lt > 0.05) brake = Math.max(brake, p.lt);
      hand = hand || p.b[2];
    }
    const wheel = this.wheel; this.wheel = 0;
    return { mx: clamp(mx, -1, 1), my: clamp(my, -1, 1), lookX: lookX * this.sens, lookY: lookY * this.sens, fire, aim, sprint, hand, gas, brake, steer: clamp(mx, -1, 1), wheel };
  }
}
