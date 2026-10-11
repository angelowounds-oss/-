// Loading screen ("Purge Day" design, markup + CSS in template.html). The stage is a fixed 1280x720 (720x1280 in portrait) scaled to fit the
// window; the percentage, T- countdown, status line and the 40-segment bar follow the real loading progress reported by Game.init.
// The numbers ease toward the last report and creep slowly ahead of it, so the screen never looks stuck between the few real steps, but
// they only reach 100 when the game is really ready.
const SEGS = 40, CREEP_MAX = 0.07, CREEP_RATE = 0.012;
const PROMPT = '아무 키나 누르거나 화면을 터치하세요';

export function initLoading() {
  const $ = (id) => document.getElementById(id);
  const title = $('title'), stage = $('pd'), bar = $('loadBar'), txt = $('loadTxt'), pct = $('pdP'), pct2 = $('pdP2'), cd = $('pdCd');
  for (let i = 0; i < SEGS; i++) bar.appendChild(document.createElement('div'));
  const segs = bar.children;
  // scale the stage to the window (contain); read the stage size from CSS so the portrait stage works too
  const fit = () => { const w = stage.offsetWidth || 1280, h = stage.offsetHeight || 720; title.style.setProperty('--pds', Math.min(innerWidth / w, innerHeight / h).toFixed(4)); };
  fit(); addEventListener('resize', fit);
  let target = 0, shown = 0, ready = false, since = performance.now(), last = performance.now(), raf = 0, text = txt.textContent, lit = -1, shownP = -1;
  const paint = () => {
    const p = Math.round(shown * 100);
    if (p !== shownP) {
      shownP = p; pct.textContent = p; pct2.textContent = p; bar.setAttribute('aria-valuenow', String(p));
      cd.textContent = '00:' + String(Math.round((100 - p) * 0.6)).padStart(2, '0');
      const n = Math.floor(p * SEGS / 100);
      if (n !== lit) { for (let i = 0; i < SEGS; i++) segs[i].className = i < n ? 'on' : ''; lit = n; }
    }
    const want = ready && p >= 100 ? PROMPT : text;
    if (txt.textContent !== want) txt.textContent = want;
  };
  const frame = (now) => {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    const creep = Math.min(CREEP_MAX, ((now - since) / 1000) * CREEP_RATE);
    const goal = ready ? 1 : Math.min(0.97, target + creep);
    shown += (goal - shown) * (1 - Math.exp(-dt * (ready ? 6 : 3)));
    if (ready && shown > 0.994) shown = 1;
    paint();
    raf = shown < 1 ? requestAnimationFrame(frame) : 0;
  };
  raf = requestAnimationFrame(frame);
  return {
    // a real progress report from Game.init: fraction 0..1 and what it is doing
    set(p, t) { target = Math.max(target, Math.min(1, p)); since = performance.now(); if (t) text = t; paint(); },
    // everything is loaded: run the bar up to 100 and show the start prompt
    ready() { ready = true; if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } },
  };
}
