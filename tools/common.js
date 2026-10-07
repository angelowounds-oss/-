(function () {
  var doc = document, root = doc.documentElement;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var isHome = !!$('.hero');
  var file = (location.pathname.split('/').pop() || 'index.html');

  /* accent color */
  try { var ac = localStorage.getItem('accent'); if (ac) root.style.setProperty('--lime', ac); } catch (e) {}
  doc.querySelectorAll('.theme button').forEach(function (b) {
    b.style.background = b.dataset.c;
    b.addEventListener('click', function () {
      root.style.setProperty('--lime', b.dataset.c);
      try { localStorage.setItem('accent', b.dataset.c); } catch (e) {}
    });
  });

  /* light / dark / auto */
  var MODES = ['auto', 'dark', 'light'], LABEL = { auto: '자동', dark: '다크', light: '라이트' };
  var mode = 'auto';
  try { mode = localStorage.getItem('mode') || 'auto'; } catch (e) {}
  function applyMode(m) { if (m === 'dark' || m === 'light') root.setAttribute('data-theme', m); else root.removeAttribute('data-theme'); }
  applyMode(mode);
  var mb = $('.modebtn');
  if (mb) {
    mb.textContent = '화면 ' + LABEL[mode];
    mb.addEventListener('click', function () {
      mode = MODES[(MODES.indexOf(mode) + 1) % 3];
      applyMode(mode);
      try { localStorage.setItem('mode', mode); } catch (e) {}
      mb.textContent = '화면 ' + LABEL[mode];
    });
  }

  var title = doc.title.split(' - ')[0];

  /* favorites + recent */
  var favs = LS.get('favs', []), recent = LS.get('recent', []);
  function inFav(s) { return favs.some(function (f) { return f.s === s; }); }
  var h1 = $('main h1');
  var isTool = !isHome && h1 && $('main .card') && !/^(about|terms|privacy)\.html$/.test(file);
  if (isTool) {
    recent = recent.filter(function (r) { return r.s !== file; });
    recent.unshift({ s: file, t: title });
    LS.set('recent', recent.slice(0, 8));
    var fb = doc.createElement('button');
    fb.type = 'button'; fb.className = 'favbtn';
    var paint = function () { var on = inFav(file); fb.textContent = on ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기'; fb.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    paint();
    fb.addEventListener('click', function () {
      if (inFav(file)) favs = favs.filter(function (f) { return f.s !== file; });
      else favs.unshift({ s: file, t: title });
      LS.set('favs', favs); paint();
    });
    h1.insertAdjacentElement('afterend', fb);
  }
  if (isHome) {
    var list = $('#minelist'), box = $('#mine');
    if (list && box) {
      var seen = {}, items = [];
      favs.forEach(function (f) { if (!seen[f.s]) { seen[f.s] = 1; items.push({ s: f.s, t: '★ ' + f.t }); } });
      recent.forEach(function (r) { if (!seen[r.s] && items.length < 10) { seen[r.s] = 1; items.push(r); } });
      if (items.length) {
        items.forEach(function (it) { var a = doc.createElement('a'); a.className = 'pill'; a.href = it.s; a.textContent = it.t; list.appendChild(a); });
        box.hidden = false;
      }
    }
  }

  /* quick feedback */
  var fbBox = $('.fb');
  if (fbBox) {
    var fkey = 'fb:' + fbBox.dataset.slug, msg = $('.fbt', fbBox), done = LS.get(fkey, null);
    var thank = function (v) { msg.textContent = v === 'up' ? '고마워요! 더 잘 만들게요.' : '알려줘서 고마워요. 고칠 점을 찾아볼게요.'; fbBox.classList.add('voted'); };
    if (done) thank(done);
    fbBox.querySelectorAll('button[data-v]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (LS.get(fkey, null)) return;
        var v = b.dataset.v; LS.set(fkey, v); thank(v);
        try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: 'feedback/' + v + '/' + fbBox.dataset.slug, title: title, event: true }); } catch (e) {}
      });
    });
  }

  /* share text + image card */
  var out = doc.getElementById('out'), r = $('.result') || out;
  function bodyText() {
    return out ? out.innerText.trim()
      : Array.prototype.map.call(doc.querySelectorAll('.result'), function (e) { return e.innerText.trim(); }).filter(Boolean).join('\n');
  }
  function copy(t, btn, label) {
    var done = function () { btn.textContent = '복사됨'; setTimeout(function () { btn.textContent = label; }, 1800); };
    var fallback = function () { var a = doc.createElement('textarea'); a.value = t; doc.body.appendChild(a); a.select(); try { doc.execCommand('copy'); done(); } catch (e) {} a.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
  }

  function wrap(ctx, text, maxW) {
    var words = text.split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW) { cur = t; return; }
      if (cur) { lines.push(cur); cur = ''; }
      if (ctx.measureText(w).width <= maxW) { cur = w; return; }
      var piece = '';
      for (var i = 0; i < w.length; i++) {
        if (ctx.measureText(piece + w[i]).width > maxW && piece) { lines.push(piece); piece = w[i]; } else piece += w[i];
      }
      cur = piece;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function rr(ctx, x, y, w, h, rad) {
    ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath();
  }
  function drawCard(ttl, lines) {
    var W = 1080, cx = 70, cw = W - 160, px = cx + 56, tw = cw - 112, cy = 130;
    var lime = getComputedStyle(root).getPropertyValue('--lime').trim() || '#c8f542';
    var tmp = doc.createElement('canvas').getContext('2d');
    var ops = [], py = cy + 170;
    tmp.font = '64px "Jua", "Noto Sans KR", sans-serif';
    wrap(tmp, ttl, tw).slice(0, 2).forEach(function (l) { ops.push({ t: l, f: '64px "Jua", "Noto Sans KR", sans-serif', y: py, c: '#141414' }); py += 80; });
    py += 28;
    lines.slice(0, 9).forEach(function (ln, idx) {
      var big = idx === 0, f = (big ? '700 60px' : '400 42px') + ' "Noto Sans KR", sans-serif';
      tmp.font = f;
      wrap(tmp, ln, tw).slice(0, big ? 3 : 2).forEach(function (w) {
        ops.push({ t: w, f: f, y: py, c: big ? '#141414' : '#3a3656', hl: big ? tmp.measureText(w).width : 0 });
        py += big ? 80 : 58;
      });
      py += big ? 22 : 8;
    });
    var ch = Math.max(520, py - cy + 40), H = cy + ch + 70 + 96 + 90;
    var c = doc.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d');
    x.fillStyle = '#f6f4ff'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#ddd7ff'; x.lineWidth = 2;
    for (var yy = 36; yy < H; yy += 72) { x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); }
    x.fillStyle = '#141414'; rr(x, cx + 20, cy + 20, cw, ch, 44); x.fill();
    x.fillStyle = '#ffffff'; rr(x, cx, cy, cw, ch, 44); x.fill();
    x.lineWidth = 8; x.strokeStyle = '#141414'; rr(x, cx, cy, cw, ch, 44); x.stroke();
    x.textBaseline = 'alphabetic';
    x.fillStyle = '#5b3df5'; x.font = '700 40px "Gaegu", "Noto Sans KR", sans-serif'; x.fillText('오늘의 계산', px, cy + 84);
    ops.forEach(function (o) {
      if (o.hl) { x.fillStyle = lime; x.fillRect(px - 10, o.y - 56, o.hl + 20, 74); }
      x.fillStyle = o.c; x.font = o.f; x.fillText(o.t, px, o.y);
    });
    var fy = cy + ch + 70;
    x.fillStyle = lime; rr(x, 70, fy, 360, 96, 24); x.fill();
    x.lineWidth = 6; x.strokeStyle = '#141414'; rr(x, 70, fy, 360, 96, 24); x.stroke();
    x.fillStyle = '#141414'; x.font = '48px "Jua", "Noto Sans KR", sans-serif'; x.fillText('간편계산기', 106, fy + 66);
    x.fillStyle = '#5a5675'; x.font = '400 34px "Noto Sans KR", sans-serif'; x.textAlign = 'right';
    x.fillText('나도 계산해보기', W - 80, fy + 62); x.textAlign = 'left';
    return c.toDataURL('image/png');
  }
  function showCard(url) {
    var ov = doc.createElement('div'); ov.className = 'overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', '이미지 카드');
    var box = doc.createElement('div'); box.className = 'ovbox';
    var img = doc.createElement('img'); img.src = url; img.alt = title + ' 결과 이미지 카드';
    var tip = doc.createElement('p'); tip.textContent = '이미지를 길게 눌러(또는 우클릭) 저장하세요';
    var row = doc.createElement('div'); row.className = 'actions';
    var dl = doc.createElement('a'); dl.className = 'btnlink'; dl.href = url; dl.download = '간편계산기-' + file.replace('.html', '') + '.png'; dl.textContent = '다운로드';
    var cl = doc.createElement('button'); cl.type = 'button'; cl.textContent = '닫기';
    row.appendChild(dl); row.appendChild(cl); box.appendChild(img); box.appendChild(tip); box.appendChild(row); ov.appendChild(box); doc.body.appendChild(ov);
    var close = function () { ov.remove(); };
    cl.addEventListener('click', close); ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  }

  if (r && !isHome) {
    var host = out || r.closest('.card') || r;
    var row = doc.createElement('div'); row.className = 'actions';
    if (!r.querySelector('button')) {
      var sb = doc.createElement('button'); sb.type = 'button'; sb.className = 'sharebtn'; sb.textContent = '결과 복사해서 공유';
      sb.addEventListener('click', function () { copy(title + '\n' + bodyText() + '\n' + location.href, sb, '결과 복사해서 공유'); });
      row.appendChild(sb);
    }
    var ib = doc.createElement('button'); ib.type = 'button'; ib.className = 'imgbtn'; ib.textContent = '이미지 카드 만들기';
    ib.addEventListener('click', function () {
      var lines = bodyText().split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s && !/^결과 복사/.test(s) && !/^이미지 카드/.test(s); });
      var go = function () { showCard(drawCard(title, lines)); };
      if (doc.fonts && doc.fonts.load) Promise.all([doc.fonts.load('64px Jua'), doc.fonts.load('700 40px "Noto Sans KR"')]).then(go, go); else go();
    });
    row.appendChild(ib);
    host.insertAdjacentElement('afterend', row);
    if (typeof IDS !== 'undefined') {
      var note = doc.createElement('p'); note.className = 'sharenote';
      note.textContent = '공유 링크에는 입력한 숫자가 함께 담겨요. 연봉처럼 민감한 값은 공유할 때 주의하세요.';
      row.insertAdjacentElement('afterend', note);
    }
  }
})();
