(function () {
  var now = new Date(), y = now.getFullYear(), m = now.getMonth(), dim = new Date(y, m + 1, 0).getDate(), first = new Date(y, m, 1).getDay(), today = now.getDate();
  var key = 'habit:' + y + '-' + (m + 1), st = { name: '운동 30분', days: [] };
  try { var s = JSON.parse(localStorage.getItem(key)); if (s && s.days) st = s; } catch (e) {}
  var nameEl = document.getElementById('hname'), cal = document.getElementById('cal'), res = document.getElementById('res'), reset = document.getElementById('reset');
  document.getElementById('month').textContent = y + '년 ' + (m + 1) + '월'; nameEl.value = st.name;
  function save() { try { localStorage.setItem(key, JSON.stringify(st)); } catch (e) {} }
  function draw() {
    cal.textContent = '';
    '일월화수목금토'.split('').forEach(function (d) { var e = document.createElement('div'); e.className = 'dow'; e.textContent = d; cal.appendChild(e); });
    for (var i = 0; i < first; i++) cal.appendChild(document.createElement('span'));
    for (var d = 1; d <= dim; d++) (function (d) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = d;
      var on = st.days.indexOf(d) > -1; b.className = (on ? 'on ' : '') + (d === today ? 'today' : '');
      b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', (m + 1) + '월 ' + d + '일 ' + (st.name || '습관')); b.disabled = d > today;
      b.addEventListener('click', function () { var k = st.days.indexOf(d); if (k > -1) st.days.splice(k, 1); else st.days.push(d); save(); draw(); });
      cal.appendChild(b);
    })(d);
    var n = st.days.length, cur = today, streak = 0; if (st.days.indexOf(cur) < 0) cur--;
    while (cur > 0 && st.days.indexOf(cur) > -1) { streak++; cur--; }
    var nm = (st.name || '습관').replace(/[&<>"]/g, '');
    res.innerHTML = '<b>' + nm + ' ' + n + '일 달성</b><br>지금 ' + streak + '일 연속 · 오늘까지 달성률 <b>' + Math.round(n / today * 100) + '%</b>';
  }
  nameEl.addEventListener('input', function () { st.name = nameEl.value.slice(0, 20); save(); draw(); });
  var armed = false;
  reset.addEventListener('click', function () {
    if (!armed) { armed = true; reset.textContent = '한 번 더 누르면 지워져요'; return; }
    st.days = []; save(); armed = false; reset.textContent = '이번 달 기록 지우기'; draw();
  });
  draw();
})();
