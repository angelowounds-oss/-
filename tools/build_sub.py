#!/usr/bin/env python3
"""Subscription-cost site (separate from the Korean calculator site). Writes sites/subscription/.
Run from repo root: python3 tools/build_sub.py  (SITE_URL env, default https://YOUR-DOMAIN.example/subscription)"""
import os, shutil, html

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "..", "sites", "subscription")
SITE = os.environ.get("SUB_SITE_URL", "https://YOUR-DOMAIN.example/subscription").rstrip("/")
BRAND = "구독료 계산기"
CONTACT = os.environ.get("CONTACT_EMAIL", "").strip()

NAV = ('<header><a href="index.html" class="logo">' + BRAND + '</a><nav>'
       '<a href="index.html">구독 합계</a><a href="annual-cost.html">연간 비용·인상</a>'
       '<a href="annual-vs-monthly.html">연간 vs 월간</a><a href="shared-split.html">나눠 내기</a>'
       '<a href="about.html">소개</a></nav></header>')
FOOT = ('<footer><span class="note">계산은 입력한 금액을 기준으로 한 참고용이에요. 실제 요금은 서비스 화면에서 확인하세요. 입력값은 서버로 보내지 않아요.</span>'
        '<span class="fl"><a href="about.html">소개</a><a href="privacy.html">개인정보처리방침</a><a href="terms.html">이용약관</a></span></footer>')
FONT = "https://fonts.googleapis.com/css2?family=Jua&family=Noto+Sans+KR:wght@400;500;700&display=swap"

def faq_block(items):
    return '<div class="faq-block"><h2>자주 묻는 질문</h2>' + "".join(f"<h3>{q}</h3><p>{a}</p>" for q, a in items) + "</div>"

def faq_ld(items):
    import json
    return json.dumps({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in items]}, ensure_ascii=False)

def related(slugs):
    names = {"index.html": "구독 합계", "annual-cost.html": "연간 비용·인상", "annual-vs-monthly.html": "연간 vs 월간", "shared-split.html": "나눠 내기"}
    return '<h2>관련 계산기</h2><div class="tools">' + "".join(f'<a href="{s}">{names[s]}</a>' for s in slugs) + "</div>"

def page(fn, title, desc, h1, body, script, faq, rel):
    html_ = f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><meta name="description" content="{desc}">
<link rel="canonical" href="{SITE}/{'' if fn == 'index.html' else fn}">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONT}"><link rel="stylesheet" href="style.css"></head>
<body>{NAV}
<main><h1>{h1}</h1>
<div class="ad"><!-- ad slot --></div>
{body}
{faq_block(faq)}
{related(rel)}
<div class="ad"><!-- ad slot --></div>
</main>{FOOT}
<script>{script}</script>
<script type="application/ld+json">{faq_ld(faq)}</script>
<script src="common.js"></script>
</body></html>'''
    open(os.path.join(OUT, fn), "w", encoding="utf-8").write(html_)

HELP_NUM = r'''var W=function(n){return Math.round(n).toLocaleString('ko-KR')+'원'};
var X=function(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var F={'월':1,'연':1/12,'주':52/12};
var num=function(id){var v=document.getElementById(id).value;return v===''?NaN:+v};'''

# ---------- index: subscription list ----------
index_body = '''
<div class="card">
  <p class="lead">구독 서비스를 한 줄씩 입력하세요. 금액과 결제 주기만 있으면 됩니다.</p>
  <datalist id="presets"><option>넷플릭스</option><option>유튜브 프리미엄</option><option>쿠팡 와우</option><option>멜론</option><option>지니뮤직</option><option>네이버 플러스</option><option>디즈니 플러스</option><option>티빙</option><option>웨이브</option><option>왓챠</option><option>Spotify</option><option>ChatGPT</option><option>iCloud 저장공간</option><option>Google One</option><option>헬스장</option><option>배달 멤버십</option></datalist>
  <div id="rows" class="subrows" aria-label="구독 목록"></div>
  <div class="actions"><button type="button" id="add" class="ghost">+ 구독 추가</button></div>
  <div class="result" id="res" aria-live="polite"></div>
</div>
<h2>이렇게 써요</h2>
<p>가진 구독을 하나씩 넣으면 월 합계와 연 합계가 바로 나와요. 체크를 해제하면 "쓰지 않는 구독"으로 따로 묶여서, 해지했을 때 1년에 얼마를 아끼는지 보여줘요. 금액은 그 서비스의 실제 결제 금액을 입력하세요. 가격은 계속 바뀌니 기본 목록에는 넣지 않았어요.</p>
<h2>계산 방식</h2>
<p>주 단위는 1년을 52주, 월 단위는 12개월로 보고 월 환산액으로 바꿔 더해요. 연 결제 상품은 1년치 금액을 12로 나눠 월 환산해요. 입력한 내용은 이 브라우저에만 저장되고, 다음에 열면 그대로 보여요.</p>
'''
index_script = HELP_NUM + r'''
(function(){
var box=document.getElementById('rows'),res=document.getElementById('res');
function add(d){var r=document.createElement('div');r.className='subrow';
r.innerHTML='<input type="text" class="nm" list="presets" placeholder="서비스 이름" aria-label="서비스 이름" value="'+X(d.n||'')+'">'+
'<input type="number" class="pr" min="0" placeholder="금액 (원)" aria-label="금액" value="'+(d.p!=null?X(d.p):'')+'">'+
'<select class="cy" aria-label="결제 주기"><option>월</option><option>연</option><option>주</option></select>'+
'<label class="chk"><input type="checkbox" class="us"'+(d.u===false?'':' checked')+'> 쓰고 있어요</label>'+
'<button type="button" class="rm ghost" aria-label="이 구독 삭제">삭제</button>';
r.querySelector('.cy').value=d.c||'월';box.appendChild(r);}
function save(){var a=[];box.querySelectorAll('.subrow').forEach(function(r){a.push({n:r.querySelector('.nm').value,p:r.querySelector('.pr').value,c:r.querySelector('.cy').value,u:r.querySelector('.us').checked})});
try{localStorage.setItem('subs',JSON.stringify(a))}catch(e){}}
function calc(){var m=0,u=0,n=0,big=null;
box.querySelectorAll('.subrow').forEach(function(r){var p=+r.querySelector('.pr').value,mm=p*F[r.querySelector('.cy').value];
if(!(p>0))return;n++;m+=mm;if(!r.querySelector('.us').checked)u+=mm;
if(!big||mm>big.m)big={n:r.querySelector('.nm').value,m:mm};});
save();
if(!n){res.innerHTML='<small>금액을 입력하면 합계가 나와요</small>';return}
var h='<b>월 '+W(m)+' · 연 '+W(m*12)+'</b><br>'+n+'개 구독 · 쓰지 않는 구독 연 '+W(u*12)+'<br>가장 큰 구독: '+X(big.n||'이름 없음')+' (월 '+W(big.m)+')';
if(u>0)h+='<br><small>쓰지 않는 구독을 해지하면 1년에 '+W(u*12)+'를 아낄 수 있어요.</small>';
res.innerHTML=h;}
var saved=null;try{saved=JSON.parse(localStorage.getItem('subs'))}catch(e){}
if(Array.isArray(saved)&&saved.length){saved.forEach(add)}else{add({});add({});add({})}
calc();
box.addEventListener('input',calc);box.addEventListener('change',calc);
box.addEventListener('click',function(e){if(e.target.classList.contains('rm')){e.target.closest('.subrow').remove();calc();}});
document.getElementById('add').addEventListener('click',function(){add({});calc();});
})();'''

# ---------- annual cost with price increases ----------
annual_body = '''
<div class="card">
  <label for="p">월 결제 금액 (원, 또는 연 결제라면 1년 금액)</label><input type="number" id="p" min="0" value="10900" aria-label="결제 금액">
  <label for="c">결제 주기</label><select id="c" aria-label="결제 주기"><option>월</option><option>연</option><option>주</option></select>
  <label for="h">해마다 오르는 비율 (%)</label><input type="number" id="h" min="0" step="0.1" value="0" aria-label="연간 인상률">
  <label for="y">기간 (년)</label><input type="number" id="y" min="1" max="30" value="3" aria-label="기간">
  <div class="result" id="res" aria-live="polite"></div>
</div>
<h2>이렇게 써요</h2>
<p>구독 하나가 1년, 3년, 5년 동안 얼마를 가져가는지 봐요. 인상률을 넣으면 해마다 올라간 요금을 계산해서, 처음 금액을 그대로 쓸 때와 얼마나 차이가 나는지 보여줘요. 기준 금액이 연 결제라면 주기를 "연"으로 고르세요.</p>
<h2>인상 계산 방식</h2>
<p>첫해는 처음 금액의 12개월치입니다. 둘째 해부터는 직전 해 요금에 인상률을 곱한 금액으로 12개월을 내는 것으로 봐요. 이렇게 복리처럼 쌓이기 때문에 인상률이 같아도 기간이 길수록 차이가 커져요. 실제 인상 시기와 폭은 서비스마다 달라요.</p>
<h2>예시</h2>
<p>월 10,000원짜리 구독이 해마다 5%씩 오르면, 3년 동안 내는 금액은 인상 없이 낼 때보다 약 18,300원 많아요. 기간을 5년으로 늘리면 차이는 약 6만 3천 원 가까이 돼요.</p>
'''
annual_script = HELP_NUM + r'''
(function(){
function calc(){var p=num('p'),c=document.getElementById('c').value,h=num('h')/100,y=num('y'),res=document.getElementById('res');
if(!(p>0)||!(y>=1)||isNaN(h)||h<0){res.innerHTML='<small>금액과 기간(1년 이상)을 입력해 주세요</small>';return}
var mm=p*F[c],yr=Math.min(Math.floor(y),30),flat=mm*12*yr,hike=0,cur=mm*12;
for(var k=0;k<yr;k++){hike+=cur;cur*=(1+h);}
var extra=hike-flat;
var h2='<b>1년차 '+W(mm*12)+' (월 '+W(mm)+')</b><br>'+yr+'년 동안 총 '+W(hike);
if(h>0)h2+='<br>인상 없이 냈을 때보다 <b>'+W(extra)+'</b> 더 내요';
else h2+='<br><small>인상률을 넣으면 해마다 오른 요금을 계산해요</small>';
res.innerHTML=h2;}
['p','c','h','y'].forEach(function(id){var el=document.getElementById(id);el.addEventListener('input',calc);el.addEventListener('change',calc)});
calc();})();'''

# ---------- annual vs monthly ----------
avm_body = '''
<div class="card">
  <label for="m">월 결제 금액 (원)</label><input type="number" id="m" min="0" value="10900" aria-label="월 결제 금액">
  <label for="a">연 결제 금액 (원, 1년치 한 번에)</label><input type="number" id="a" min="0" value="99000" aria-label="연 결제 금액">
  <div class="result" id="res" aria-live="polite"></div>
</div>
<h2>이렇게 써요</h2>
<p>같은 서비스를 월로 낼 때와 연으로 한 번에 낼 때를 비교해요. 연 결제가 얼마나 싼지, 그리고 몇 달 이상 쓸 거라면 연 결제가 이득인지 알려줘요.</p>
<h2>계산 방식</h2>
<p>월 결제 12번의 합계와 연 결제 금액의 차이를 절약액으로 보고, 연 결제 금액을 월 금액으로 나눈 값을 "본전 개월 수"로 보여줘요. 본전 개월 수보다 오래 쓸 생각이면 연 결제가 유리하고, 그 전에 해지할 가능성이 있다면 월 결제가 안전해요.</p>
<h2>주의할 점</h2>
<p>연 결제는 중간에 해지하면 환불이 안 되거나 일부만 돌려받는 경우가 많아요. 약관의 환불 조건을 먼저 확인하세요. 또 같은 서비스라도 연 결제 할인 조건은 시기에 따라 달라질 수 있어요.</p>
'''
avm_script = HELP_NUM + r'''
(function(){
function calc(){var m=num('m'),a=num('a'),res=document.getElementById('res');
if(!(m>0)||!(a>0)){res.innerHTML='<small>월 금액과 연 금액을 모두 입력해 주세요</small>';return}
var yr=m*12,save=yr-a,pct=save/yr*100,be=a/m;
var h='<b>연 결제 '+(save>=0?'절약 ':'손해 ')+W(Math.abs(save))+'</b> ('+(Math.abs(pct)).toFixed(1)+'%)<br>월 결제 1년 '+W(yr)+' · 연 결제 '+W(a);
h+='<br>'+(save>0?'연 결제 본전: <b>'+be.toFixed(1)+'개월</b> 이상 쓰면 이득이에요':'이 조건에서는 연 결제가 오히려 비싸요');
res.innerHTML=h;}
['m','a'].forEach(function(id){var el=document.getElementById(id);el.addEventListener('input',calc);el.addEventListener('change',calc)});
calc();})();'''

# ---------- shared split ----------
shared_body = '''
<div class="card">
  <label for="t">구독 한 달 요금 (원)</label><input type="number" id="t" min="0" value="17000" aria-label="월 요금">
  <label for="n">같이 나눌 사람 수 (본인 포함)</label><input type="number" id="n" min="1" max="50" value="4" aria-label="인원수">
  <div class="result" id="res" aria-live="polite"></div>
</div>
<h2>이렇게 써요</h2>
<p>가족이나 친구가 한 계정을 같이 쓸 때 한 사람이 매달 얼마씩 내면 되는지 계산해요. 사람 수를 바꿔 보면 몇 명이 나눌 때 부담이 얼마나 줄어드는지 바로 보여요.</p>
<h2>계산 방식</h2>
<p>월 요금을 인원수로 나눈 금액을 한 사람이 내는 월 금액으로 보고, 여기에 12를 곱해 1년 금액도 보여줘요. 원 단위는 반올림해요.</p>
<h2>나눠 쓸 때 확인할 점</h2>
<p>많은 서비스는 계정 공유 범위를 정해 두고 있어요. 다른 집에 사는 사람과 나누면 약관 위반이 될 수 있으니 서비스의 공유 조건을 먼저 확인하세요. 또 나눠 내는 사람이 해지하면 나머지 사람의 몫도 사라지니, 정산 방법을 미리 정해 두는 편이 좋아요.</p>
'''
shared_script = HELP_NUM + r'''
(function(){
function calc(){var t=num('t'),n=Math.floor(num('n')),res=document.getElementById('res');
if(!(t>0)||!(n>=1)){res.innerHTML='<small>월 요금과 인원수를 입력해 주세요</small>';return}
var per=t/n;
res.innerHTML='<b>한 사람 월 '+W(per)+'</b><br>1년 '+W(per*12)+' · 나누지 않으면 월 '+W(t)+'<br><small>'+n+'명이 나누면 한 사람당 월 '+W(t-per)+'을 아껴요</small>';}
['t','n'].forEach(function(id){var el=document.getElementById(id);el.addEventListener('input',calc);el.addEventListener('change',calc)});
calc();})();'''

ABOUT = ('<div class="card"><p>' + BRAND + '은 구독 서비스 비용을 한눈에 보려고 만든 무료 계산기예요. 가입이 필요 없고, 계산은 모두 이용자의 브라우저에서 이뤄져요.</p>'
         '<p>서비스 가격은 자주 바뀌므로 기본 목록에 가격을 넣지 않았어요. 실제 결제 금액은 각 서비스의 결제 화면에서 확인해 직접 입력하세요.</p>'
         + (f'<h2>문의</h2><p>오류 제보와 제안은 <b>{CONTACT}</b>로 보내 주세요.</p>' if CONTACT else '') + '</div>')
PRIV = ('<div class="card"><h2 style="margin-top:0">수집하는 정보</h2><p>회원가입이 없고, 입력한 금액과 구독 이름은 서버로 보내지 않아요.</p>'
        '<h2>브라우저에 저장되는 정보</h2><p>구독 목록은 이용자의 브라우저 저장소에만 저장되며, 브라우저 데이터를 지우면 함께 사라져요.</p>'
        '<h2>광고와 통계</h2><p>광고를 게재할 경우 광고 사업자가 쿠키를 사용할 수 있어요. 광고 설정은 Google 광고 설정에서 바꿀 수 있어요.</p>'
        + (f'<h2>문의</h2><p>개인정보 관련 문의는 <b>{CONTACT}</b>로 보내 주세요.</p>' if CONTACT else '') + '</div>')
TERMS = ('<div class="card"><h2 style="margin-top:0">이용 조건</h2><p>계산기는 누구나 무료로 쓸 수 있어요.</p>'
         '<h2>면책</h2><p>계산 결과는 입력값을 바탕으로 한 참고 정보이며, 실제 요금이나 환불 조건을 보장하지 않아요. 계산 결과로 생긴 판단과 책임은 이용자에게 있어요.</p></div>')

def build():
    if os.path.exists(OUT): shutil.rmtree(OUT)
    os.makedirs(OUT)
    with open(os.path.join(OUT, "style.css"), "w", encoding="utf-8") as f:
        f.write(open(os.path.join(ROOT, "style.css"), encoding="utf-8").read() + "\n" + open(os.path.join(ROOT, "sub", "subscription.css"), encoding="utf-8").read())
    shutil.copy(os.path.join(ROOT, "common.js"), os.path.join(OUT, "common.js"))
    shutil.copy(os.path.join(ROOT, "..", "site", "favicon.svg"), os.path.join(OUT, "favicon.svg"))
    page("index.html", BRAND + " - 구독료 한눈에 보기", "넷플릭스, 유튜브 프리미엄 같은 구독을 입력하면 월·연 합계와 쓰지 않는 구독의 연간 비용을 계산합니다.",
         "구독료 합계", index_body, index_script,
         [("구독료를 얼마나 입력해야 하나요?", "실제로 결제하는 금액을 그대로 넣으세요. 결제 주기가 연간이면 주기를 '연'으로 고르세요."),
          ("입력한 내용은 어디에 저장되나요?", "이 브라우저에만 저장돼요. 서버로 보내지 않아요."),
          ("쓰지 않는 구독은 어떻게 표시되나요?", "체크를 해제한 구독은 '쓰지 않는 구독' 합계에 따로 들어가서, 해지했을 때 1년에 아낄 금액을 보여줘요.")],
         ["annual-cost.html", "annual-vs-monthly.html", "shared-split.html"])
    page("annual-cost.html", "구독 연간 비용·가격 인상 계산기", "구독료가 해마다 오를 때 1년, 3년, 5년 동안 총 얼마를 내는지 계산합니다.",
         "구독 연간 비용·인상 계산", annual_body, annual_script,
         [("인상률은 어떻게 정하나요?", "서비스 공지나 과거 인상 이력을 참고해 직접 넣으세요. 실제 인상은 시기와 폭이 다를 수 있어요."),
          ("연 결제 금액도 넣을 수 있나요?", "네. 주기를 '연'으로 고르고 1년 금액을 넣으면 1년치 기준으로 계산해요.")],
         ["index.html", "annual-vs-monthly.html", "shared-split.html"])
    page("annual-vs-monthly.html", "구독 연간 결제 vs 월 결제 비교", "같은 서비스를 월로 낼 때와 연으로 한 번에 낼 때 중 어느 쪽이 얼마나 싼지 비교합니다.",
         "연간 결제 vs 월 결제", avm_body, avm_script,
         [("연 결제가 항상 싼가요?", "보통 할인이 있지만, 중간에 해지하면 손해일 수 있어요. 본전 개월 수를 확인하세요."),
          ("환불은 되나요?", "서비스마다 다르니 결제 전에 환불 조건을 꼭 확인하세요.")],
         ["index.html", "annual-cost.html", "shared-split.html"])
    page("shared-split.html", "구독료 나눠 내기 계산기", "가족이나 친구와 구독을 나눠 낼 때 한 사람이 매달 얼마씩 내는지 계산합니다.",
         "구독료 나눠 내기", shared_body, shared_script,
         [("몇 명까지 나눌 수 있나요?", "서비스의 공유 조건에 따라 달라요. 허용 인원과 거주 조건을 먼저 확인하세요."),
          ("나눠 내는 사람이 빠지면요?", "정산 방법을 미리 정해 두세요. 한 명이 빠지면 나머지가 더 내야 할 수 있어요.")],
         ["index.html", "annual-cost.html", "annual-vs-monthly.html"])
    for fn, t, h, body in [("about.html", "소개 - " + BRAND, "구독료 계산기 소개", ABOUT), ("privacy.html", "개인정보처리방침 - " + BRAND, "개인정보처리방침", PRIV), ("terms.html", "이용약관 - " + BRAND, "이용약관", TERMS)]:
        open(os.path.join(OUT, fn), "w", encoding="utf-8").write(f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{t}</title><meta name="description" content="{h}"><link rel="stylesheet" href="{FONT}"><link rel="stylesheet" href="style.css"></head><body>{NAV}<main><h1>{h}</h1>{body}</main>{FOOT}<script src="common.js"></script></body></html>''')
    pages = ["", "annual-cost.html", "annual-vs-monthly.html", "shared-split.html", "about.html", "privacy.html", "terms.html"]
    body = "".join(f"<url><loc>{SITE}/{p}</loc></url>" for p in pages)
    open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8").write(f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>')
    open(os.path.join(OUT, "robots.txt"), "w", encoding="utf-8").write(f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")
    print("subscription site written to", os.path.normpath(OUT), "pages:", len(pages))

if __name__ == "__main__":
    build()
