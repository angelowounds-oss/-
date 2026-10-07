(function () {
  var ta = document.getElementById('opts'), cv = document.getElementById('wheel'), btn = document.getElementById('spin'), res = document.getElementById('res');
  var ctx = cv.getContext('2d'), TAU = Math.PI * 2;
  var COLORS = ['#ffe14d', '#7ee0ff', '#ff9ec7', '#b9f27a', '#cdb8ff', '#ffb86b', '#7fe3c9', '#9db8ff'];
  var rot = 0, spinning = false;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function opts() { return ta.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 20); }
  function ink() { return getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#141414'; }
  function draw() {
    var o = opts(), n = o.length, R = cv.width / 2;
    ctx.clearRect(0, 0, cv.width, cv.height); ctx.save(); ctx.translate(R, R);
    if (n < 2) {
      ctx.fillStyle = '#e6e3f5'; ctx.beginPath(); ctx.arc(0, 0, R - 10, 0, TAU); ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = ink(); ctx.stroke(); ctx.restore(); return;
    }
    var seg = TAU / n;
    for (var i = 0; i < n; i++) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R - 10, rot + i * seg, rot + (i + 1) * seg); ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length]; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#141414'; ctx.stroke();
      ctx.save(); ctx.rotate(rot + (i + 0.5) * seg); ctx.fillStyle = '#141414';
      ctx.font = '700 ' + (n > 12 ? 17 : 22) + 'px "Noto Sans KR", sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      var t = o[i]; if (t.length > 9) t = t.slice(0, 8) + '…'; ctx.fillText(t, R - 32, 0); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.fillStyle = ink(); ctx.fill(); ctx.restore();
    ctx.fillStyle = ink(); ctx.beginPath(); ctx.moveTo(R - 18, 0); ctx.lineTo(R + 18, 0); ctx.lineTo(R, 44); ctx.closePath(); ctx.fill();
  }
  function spin() {
    if (spinning) return;
    var o = opts(), n = o.length;
    if (n < 2) { res.textContent = '메뉴를 2개 이상 입력해 주세요'; return; }
    var seg = TAU / n, w = Math.floor(Math.random() * n);
    var target = -Math.PI / 2 - (w + 0.5) * seg;
    var delta = (((target - rot) % TAU) + TAU) % TAU + TAU * (5 + Math.floor(Math.random() * 3));
    var start = rot, end = rot + delta, dur = reduce ? 200 : 4200, t0 = null;
    spinning = true; btn.disabled = true; res.textContent = '';
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      rot = start + (end - start) * e; draw();
      if (p < 1) requestAnimationFrame(step);
      else { rot = end % TAU; draw(); spinning = false; btn.disabled = false; res.innerHTML = '<b>' + esc(o[w]) + '</b> 당첨!'; }
    }
    requestAnimationFrame(step);
  }
  ta.addEventListener('input', function () { if (!spinning) { res.textContent = ''; draw(); } });
  btn.addEventListener('click', spin);
  try { new MutationObserver(function () { draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) {}
  draw();
})();
