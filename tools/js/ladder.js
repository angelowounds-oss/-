(function () {
  var namesEl = document.getElementById('names'), prizesEl = document.getElementById('prizes'), cv = document.getElementById('lad'),
    btns = document.getElementById('who'), res = document.getElementById('res'), newBtn = document.getElementById('newlad'), allBtn = document.getElementById('showall');
  var ctx = cv.getContext('2d'), ROWS = 12;
  var COLORS = ['#e8590c', '#1c7ed6', '#d6336c', '#2f9e44', '#7048e8', '#f08c00', '#0b7285', '#c92a2a'];
  var names = [], prizes = [], rungs = [], shown = {}, order = [];
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lines(el, max) { return el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, max); }
  function build() {
    names = lines(namesEl, 8); var p = lines(prizesEl, 8), n = names.length;
    prizes = []; for (var i = 0; i < n; i++) prizes.push(p[i] || '통과');
    rungs = []; shown = {}; order = [];
    for (var r = 0; r < ROWS; r++) { var row = []; for (var c = 0; c < n - 1; c++) row.push(!(c > 0 && row[c - 1]) && Math.random() < 0.45); rungs.push(row); }
    btns.textContent = '';
    names.forEach(function (nm, c) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = nm;
      b.addEventListener('click', function () { reveal(c); }); btns.appendChild(b);
    });
    res.textContent = ''; render();
  }
  function ink() { return getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#141414'; }
  function geo() {
    var n = names.length, W = Math.max(300, n * 90), H = 420, pad = 50, top = 60, bot = 60;
    return { n: n, W: W, H: H, x: function (c) { return n === 1 ? W / 2 : pad + c * (W - 2 * pad) / (n - 1); }, y: function (r) { return top + (r + 1) * (H - top - bot) / (ROWS + 1); }, top: top, bot: H - bot };
  }
  function path(c) {
    var g = geo(), pts = [[g.x(c), g.top]], col = c;
    for (var r = 0; r < ROWS; r++) {
      var y = g.y(r);
      if (col < g.n - 1 && rungs[r][col]) { pts.push([g.x(col), y]); col++; pts.push([g.x(col), y]); }
      else if (col > 0 && rungs[r][col - 1]) { pts.push([g.x(col), y]); col--; pts.push([g.x(col), y]); }
    }
    pts.push([g.x(col), g.bot]); return { pts: pts, end: col };
  }
  function render() {
    var n = names.length; if (n < 2) { ctx.clearRect(0, 0, cv.width, cv.height); res.textContent = '이름을 2명 이상 입력해 주세요'; return; }
    var g = geo(); cv.width = g.W; cv.height = g.H; cv.style.maxWidth = g.W + 'px';
    ctx.clearRect(0, 0, g.W, g.H); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var INK = ink(); ctx.strokeStyle = INK; ctx.lineWidth = 5;
    for (var c = 0; c < n; c++) { ctx.beginPath(); ctx.moveTo(g.x(c), g.top); ctx.lineTo(g.x(c), g.bot); ctx.stroke(); }
    for (var r = 0; r < ROWS; r++) for (var k = 0; k < n - 1; k++) if (rungs[r][k]) { ctx.beginPath(); ctx.moveTo(g.x(k), g.y(r)); ctx.lineTo(g.x(k + 1), g.y(r)); ctx.stroke(); }
    Object.keys(shown).forEach(function (key) {
      var c2 = +key, p = path(c2); ctx.strokeStyle = COLORS[c2 % COLORS.length]; ctx.lineWidth = 8; ctx.beginPath();
      p.pts.forEach(function (pt, i) { if (i) ctx.lineTo(pt[0], pt[1]); else ctx.moveTo(pt[0], pt[1]); }); ctx.stroke();
    });
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.font = '700 17px "Noto Sans KR", sans-serif';
    for (var c3 = 0; c3 < n; c3++) {
      ctx.fillText(names[c3].length > 6 ? names[c3].slice(0, 5) + '…' : names[c3], g.x(c3), g.top - 22);
      var out = Object.keys(shown).filter(function (key) { return path(+key).end === c3; });
      var label = out.length ? prizes[c3] : '?'; ctx.fillText(label.length > 6 ? label.slice(0, 5) + '…' : label, g.x(c3), g.bot + 32);
    }
  }
  function reveal(c) {
    if (names.length < 2 || shown[c]) return; shown[c] = true; order.push(c); render();
    res.innerHTML = order.map(function (i) { return esc(names[i]) + ' → <b>' + esc(prizes[path(i).end]) + '</b>'; }).join('<br>');
  }
  newBtn.addEventListener('click', build);
  allBtn.addEventListener('click', function () { for (var c = 0; c < names.length; c++) reveal(c); });
  namesEl.addEventListener('input', build); prizesEl.addEventListener('input', build);
  try { new MutationObserver(function () { render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) {}
  if (window.matchMedia) { var mq = matchMedia('(prefers-color-scheme: dark)'); (mq.addEventListener ? mq.addEventListener('change', render) : null); }
  build();
})();
