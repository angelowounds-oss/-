(function () {
  var Q = [
    { q: '월급날 아침, 눈 뜨자마자 하는 행동은?', a: [['A', '통장부터 용도별로 나눠서 이체한다'], ['B', '일단 나를 위한 선물을 장바구니에 담는다'], ['C', '이번 달 최저가 이벤트부터 검색한다'], ['D', '자동결제 목록부터 훑어본다']] },
    { q: '친구가 "이거 인생템이야" 하면?', a: [['A', '리뷰를 더 보고 한 달 뒤에 결정한다'], ['B', '오 그럼 지금 산다'], ['C', '같은 걸 더 싸게 파는 데 있나 찾아본다'], ['D', '구독이나 멤버십으로도 있는지 본다']] },
    { q: '카페에서 주문할 때 나는?', a: [['A', '텀블러나 할인 쿠폰부터 챙긴다'], ['B', '오늘 기분에 맞는 메뉴를 고른다'], ['C', '기프티콘이나 쿠폰이 있는지 먼저 본다'], ['D', '스탬프를 채우려고 그 카페만 간다']] },
    { q: '세일 알림이 떴다!', a: [['A', '사려던 게 목록에 있을 때만 확인한다'], ['B', '기분 전환 겸 일단 구경한다'], ['C', '최저가 추적 앱부터 켠다'], ['D', '이번 달 구독 할인인지 확인한다']] },
    { q: '한 달 소비를 돌아보는 방식은?', a: [['A', '가계부 앱에 꼬박꼬박 기록한다'], ['B', '기분 좋았던 소비만 기억난다'], ['C', '카드 혜택을 비교하며 정리한다'], ['D', '결제 알림 문자를 쭉 훑어본다']] },
    { q: '여행 계획을 세울 때 가장 먼저 하는 건?', a: [['A', '예산표부터 만든다'], ['B', '가고 싶은 곳부터 정한다'], ['C', '항공권 최저가를 찾는다'], ['D', '패키지나 멤버십 혜택을 살펴본다']] },
    { q: '예상 못 한 돈이 생겼다면?', a: [['A', '적금이나 투자에 넣는다'], ['B', '나에게 플렉스한다'], ['C', '가성비 좋은 걸 하나 산다'], ['D', '보고 싶던 서비스나 굿즈를 새로 구한다']] },
    { q: '소비 후회가 제일 큰 순간은?', a: [['A', '계획에 없던 지출을 했을 때'], ['B', '기분 풀려고 산 걸 안 쓰게 될 때'], ['C', '더 싼 걸 나중에 발견했을 때'], ['D', '안 쓰는 구독이 계속 나가는 걸 알았을 때']] }
  ];
  var T = {
    A: { n: '계획형 저축러', d: '쓰기 전에 계획부터 세우는 타입이에요. 통장 쪼개기와 가계부가 익숙하고 큰돈을 모으는 힘이 있어요.', tip: '나를 위한 소비도 예산에 미리 넣어 두면 훨씬 오래 지킬 수 있어요.', l: [['compound.html', '복리 계산기'], ['savegoal.html', '목표금액 저축기간']] },
    B: { n: '필코노미 플렉서', d: '기분이 소비를 이끄는 타입이에요. 행복한 소비는 에너지가 되지만 후회도 빠르게 찾아와요.', tip: '월 "기분 예산"을 정해 두면 마음껏 쓰면서도 후회가 줄어요.', l: [['housing-clock.html', '내 집 마련 시계'], ['challenge.html', '무지출 기록장']] },
    C: { n: '가성비 탐험가', d: '비교하고 찾는 재미를 아는 타입이에요. 같은 돈으로 더 많이 얻는 데 진심이에요.', tip: '최저가를 찾는 시간도 비용이에요. 내 시급과 비교해 보면 어디서 멈출지 보여요.', l: [['unitprice.html', '단가 비교'], ['discount.html', '중복 할인']] },
    D: { n: '구독·수집러', d: '정기결제와 굿즈 모으기가 낙인 타입이에요. 좋아하는 게 분명하고 취향이 풍부해요.', tip: '분기마다 한 번씩 구독 목록을 점검하면 새는 돈을 막을 수 있어요.', l: [['daybudget.html', '월급 하루 생활비'], ['realhourly.html', '진짜 시급']] }
  };
  var box = document.getElementById('quiz'), res = document.getElementById('res'), links = document.getElementById('qlinks');
  var i = 0, score = { A: 0, B: 0, C: 0, D: 0 };
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function show() {
    box.textContent = ''; links.textContent = '';
    if (i >= Q.length) return done();
    var q = Q[i];
    var pr = document.createElement('p'); pr.className = 'note-hand'; pr.textContent = (i + 1) + ' / ' + Q.length; box.appendChild(pr);
    var h = document.createElement('h2'); h.style.margin = '0 0 14px'; h.textContent = q.q; box.appendChild(h);
    q.a.forEach(function (o) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'opt'; b.textContent = o[1];
      b.addEventListener('click', function () { score[o[0]]++; i++; show(); }); box.appendChild(b);
    });
  }
  function done() {
    var best = 'A'; ['A', 'B', 'C', 'D'].forEach(function (k) { if (score[k] > score[best]) best = k; });
    var t = T[best];
    res.innerHTML = '<b>' + esc(t.n) + '</b><br>' + esc(t.d) + '<br><small>' + esc(t.tip) + '</small>';
    var p = document.createElement('p'); p.textContent = '이 유형에게 추천하는 계산기'; p.className = 'note-hand'; links.appendChild(p);
    var wrap = document.createElement('div'); wrap.className = 'tools';
    t.l.forEach(function (x) { var a = document.createElement('a'); a.href = x[0]; a.textContent = x[1]; wrap.appendChild(a); }); links.appendChild(wrap);
    var again = document.createElement('button'); again.type = 'button'; again.className = 'ghost'; again.textContent = '다시 하기';
    again.addEventListener('click', function () { i = 0; score = { A: 0, B: 0, C: 0, D: 0 }; res.textContent = ''; show(); }); links.appendChild(again);
    box.textContent = ''; var d = document.createElement('p'); d.textContent = '결과가 나왔어요!'; d.className = 'note-hand'; box.appendChild(d);
  }
  show();
})();
