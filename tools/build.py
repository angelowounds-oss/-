#!/usr/bin/env python3
"""Generates site/*.html (new tools, index, about/terms, sitemap) and refreshes header/footer on existing pages.
Run from repo root: python3 tools/build.py"""
import json, re, glob, os

SITE = "https://YOUR-DOMAIN.example"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site")
AD = '<div class="ad"><!-- AdSense 승인 후 여기에 광고 코드 삽입 --></div>'

CATS = [
    ("fin", "금융·투자"), ("pay", "세금·급여"), ("biz", "부업·사업"), ("life", "부동산·생활"),
    ("date", "날짜·시간"), ("health", "건강·운동"), ("tool", "도구·변환"),
]

# slug, title, category, one-line description  (existing hand-written pages first)
REG = [
    ("loan", "대출 이자 계산기", "fin", "상환 방식별 월 납입액·총 이자 비교"),
    ("vat", "부가세 계산기", "pay", "공급가액·부가세 10% 계산"),
    ("wage", "시급 계산기", "pay", "주휴수당 포함 월급 환산"),
    ("freelance", "프리랜서 3.3% 계산기", "pay", "세전·실수령액 역산"),
    ("rider", "배달 라이더 순수익 계산기", "biz", "유류비·고정비 반영 월 순수익"),
    ("margin", "판매 마진 계산기", "biz", "수수료 반영 목표 판매가"),
    ("pyeong", "평수 계산기", "life", "평 ↔ ㎡ 즉시 변환"),
    ("age", "만 나이 계산기", "date", "생년월일로 만 나이·띠·다음 생일"),
    ("dday", "D-day 계산기", "date", "날짜 차이와 기념일 날짜"),
    ("bmi", "BMI 계산기", "health", "체질량지수와 비만도"),
    ("char-count", "글자수 세기", "tool", "공백 포함/제외, 바이트 수 실시간 계산"),
    ("percent", "퍼센트 계산기", "tool", "비율·증감률·할인율 계산"),
    ("unit", "단위 변환기", "tool", "길이·무게·넓이·온도"),
]
POPULAR = ["age", "char-count", "loan", "wage", "pyeong", "bmi", "freelance", "percent"]

# ---------- input helpers ----------
def N(i, label, default, step="any"): return dict(id=i, label=label, t="number", d=default, step=step)
def S(i, label, opts): return dict(id=i, label=label, t="select", opts=opts)
def DT(i, label, default="today"): return dict(id=i, label=label, t="date", d=default)
def TM(i, label, default): return dict(id=i, label=label, t="time", d=default)
def TA(i, label, default): return dict(id=i, label=label, t="textarea", d=default)

TOOLS = []
def tool(slug, title, cat, line, desc, inputs, js, body, faq, button=None):
    TOOLS.append(dict(slug=slug, title=title, cat=cat, line=line, desc=desc, inputs=inputs, js=js, body=body, faq=faq, button=button))
    REG.append((slug, title, cat, line))

# ================= 금융·투자 =================
tool("deposit", "예적금 이자 계산기", "fin", "예금·적금 세후 이자", "정기예금과 정기적금의 단리 이자를 세전·세후로 계산합니다. 이자소득세 15.4%를 반영합니다.",
 [S("kind", "종류", [("dep", "정기예금 (목돈 예치)"), ("sav", "정기적금 (매월 납입)")]),
  N("p", "금액 (예금: 예치금 / 적금: 월 납입액, 원)", 10000000), N("rate", "연 이율 (%)", 3.5, "0.01"), N("n", "기간 (개월)", 12),
  S("tax", "세금", [("15.4", "일반과세 15.4%"), ("9.5", "세금우대 9.5%"), ("0", "비과세")])],
 r'''const r=v.rate/100,n=v.n;let principal,interest;
if(v.kind==='dep'){principal=v.p;interest=principal*r*n/12}else{principal=v.p*n;interest=v.p*r/12*n*(n+1)/2}
const tax=Math.floor(interest*v.tax/100);
return '세전 이자 '+W(interest)+'<br>이자소득세 '+W(tax)+'<br><b>세후 이자 '+W(interest-tax)+'</b><br><small>원금 '+W(principal)+' → 만기 수령 '+W(principal+interest-tax)+'</small>';''',
 "<h2>계산 방식</h2><p>예금은 예치금 × 연 이율 × 기간(월) ÷ 12로, 적금은 매월 납입액이 남은 개월 수만큼 이자를 받는 단리로 계산합니다. 은행 상품마다 이자 계산 일수와 우대금리가 달라 실제 지급액과 차이가 날 수 있는 참고용 값입니다.</p>",
 [("적금 이자가 예금보다 적은 이유는?", "적금은 매월 돈을 나눠 넣어 평균 예치 기간이 짧기 때문입니다. 같은 금리라도 이자는 예금의 절반 수준입니다."), ("세금우대는 누구나 받나요?", "조건이 있는 상품만 해당합니다. 가입한 상품의 약관을 확인하세요.")])

tool("compound", "복리 계산기", "fin", "월 적립 복리 수익", "초기 투자금과 매월 적립액을 복리로 굴렸을 때 만기 금액을 계산합니다.",
 [N("p", "초기 투자금 (원)", 10000000), N("m", "매월 적립액 (원)", 500000), N("rate", "연 수익률 (%)", 6, "0.01"), N("y", "투자 기간 (년)", 10)],
 r'''const i=v.rate/1200,n=v.y*12;
const fv=i===0?v.p+v.m*n:v.p*Math.pow(1+i,n)+v.m*(Math.pow(1+i,n)-1)/i;const inv=v.p+v.m*n;
return '<b>만기 금액 '+W(fv)+'</b><br>총 원금 '+W(inv)+'<br>수익 '+W(fv-inv)+' ('+N2((fv/inv-1)*100,1)+'%)';''',
 "<h2>복리란?</h2><p>이자에 다시 이자가 붙는 방식입니다. 이 계산기는 연 수익률을 12로 나눠 매월 복리로 적용하고, 적립은 매월 말에 한다고 가정합니다. 실제 투자 수익은 매년 달라지며 원금 손실이 날 수 있습니다.</p>",
 [("72의 법칙은 무엇인가요?", "72를 연 수익률로 나누면 원금이 두 배가 되는 대략의 햇수입니다. 연 6%면 약 12년입니다."), ("세금은 반영되나요?", "아니요. 세전 기준입니다.")])

tool("cagr", "수익률·CAGR 계산기", "fin", "연평균 복리 수익률", "시작 금액과 현재 금액, 기간으로 총 수익률과 연평균 수익률(CAGR)을 계산합니다.",
 [N("a", "시작 금액 (원)", 10000000), N("b", "현재 금액 (원)", 15000000), N("y", "기간 (년)", 5)],
 r'''if(!(v.a>0&&v.y>0&&v.b>0))return '';const c=(Math.pow(v.b/v.a,1/v.y)-1)*100;
return '총 수익률 '+N2((v.b/v.a-1)*100,2)+'%<br><b>연평균 수익률(CAGR) '+N2(c,2)+'%</b><br>손익 '+W(v.b-v.a);''',
 "<h2>CAGR 공식</h2><p>(현재 금액 ÷ 시작 금액)^(1÷기간) - 1 입니다. 해마다 같은 비율로 올랐다고 가정한 평균이라 중간 변동은 보여주지 않습니다.</p>",
 [("총 수익률과 CAGR의 차이는?", "총 수익률은 전체 기간의 합계이고 CAGR은 연 단위로 환산한 값이라 기간이 다른 투자끼리 비교할 때 씁니다."), ("마이너스 수익도 계산되나요?", "네. 현재 금액이 시작 금액보다 작으면 음수로 표시됩니다.")])

tool("avgprice", "평균단가 계산기", "fin", "물타기 후 평균 매수가", "두 번에 걸쳐 매수했을 때 평균 매수 단가와 총 투자금을 계산합니다.",
 [N("p1", "1차 매수 단가 (원)", 70000), N("q1", "1차 수량", 10), N("p2", "2차 매수 단가 (원)", 55000), N("q2", "2차 수량", 20), N("now", "현재가 (원, 선택)", 60000)],
 r'''const q=v.q1+v.q2;if(!(q>0))return '';const tot=v.p1*v.q1+v.p2*v.q2,avg=tot/q;
let h='<b>평균 단가 '+W(avg)+'</b><br>총 수량 '+q+'주 · 총 투자금 '+W(tot);
if(v.now>0)h+='<br>현재가 기준 손익 '+W((v.now-avg)*q)+' ('+N2((v.now/avg-1)*100,2)+'%)';return h;''',
 "<h2>평균단가란?</h2><p>총 매수금액을 총 수량으로 나눈 값입니다. 가격이 내려갔을 때 추가 매수하면 평균단가가 낮아져 본전 가격이 내려갑니다. 수수료는 포함하지 않습니다.</p>",
 [("물타기가 항상 좋은가요?", "평균단가는 낮아지지만 투자금이 늘어 손실 위험도 커집니다. 추가 매수 전에 종목의 가치를 다시 판단하세요."), ("세 번 이상 매수했다면?", "총 매수금액 합계를 총 수량 합계로 나누면 같은 방식으로 구할 수 있습니다.")])

tool("stock", "주식 수익률 계산기", "fin", "수수료·세금 반영 실현손익", "매수가, 매도가, 수량, 수수료와 거래세를 넣어 실제 손익과 수익률을 계산합니다.",
 [N("b", "매수가 (원)", 50000), N("s", "매도가 (원)", 56000), N("q", "수량", 100), N("fee", "매매 수수료율 (%, 매수·매도 각각)", 0.015, "0.001"), N("tx", "매도 시 거래세율 (%)", 0.18, "0.01")],
 r'''const buy=v.b*v.q,sell=v.s*v.q,fees=(buy+sell)*v.fee/100,tax=sell*v.tx/100,pl=sell-buy-fees-tax;
return '<b>실현 손익 '+W(pl)+'</b> ('+N2(pl/buy*100,2)+'%)<br>수수료 '+W(fees)+' · 거래세 '+W(tax)+'<br><small>매수금액 '+W(buy)+' · 매도금액 '+W(sell)+'</small>';''',
 "<h2>세율 입력 안내</h2><p>증권사 수수료와 증권거래세율은 시장과 시기에 따라 달라지고 자주 조정됩니다. 기본값은 예시이므로 이용 중인 증권사와 현재 세율을 확인해 직접 수정하세요. 양도소득세와 배당소득세는 포함하지 않습니다.</p>",
 [("매도 때만 세금이 붙나요?", "국내 주식의 증권거래세는 매도 때 부과됩니다."), ("해외 주식에도 쓸 수 있나요?", "수수료와 세금 체계가 달라 정확하지 않습니다. 환율과 양도소득세는 별도로 계산해야 합니다.")])

tool("savegoal", "목표금액 저축기간 계산기", "fin", "목표 달성까지 걸리는 기간", "목표 금액을 모으기까지 매월 얼마를 저축해야 하고 몇 개월이 걸리는지 계산합니다.",
 [N("t", "목표 금액 (원)", 100000000), N("c", "현재 모은 금액 (원)", 10000000), N("m", "매월 저축액 (원)", 1000000), N("rate", "연 수익률 (%)", 3, "0.01")],
 r'''const i=v.rate/1200;let n;if(!(v.m>0))return '';
if(i===0)n=(v.t-v.c)/v.m;else n=Math.log((v.t*i+v.m)/(v.c*i+v.m))/Math.log(1+i);
if(!isFinite(n)||n<0)return '이미 목표를 달성했거나 입력값을 확인해 주세요.';n=Math.ceil(n);
return '<b>약 '+n+'개월 ('+Math.floor(n/12)+'년 '+(n%12)+'개월)</b><br>총 납입 '+W(v.m*n+v.c);''',
 "<h2>사용 팁</h2><p>수익률을 0%로 두면 이자 없이 순수 저축만으로 걸리는 기간을 볼 수 있습니다. 월 저축액을 바꿔 가며 기간이 얼마나 줄어드는지 비교해 보세요.</p>",
 [("수익률을 몇 %로 넣어야 하나요?", "예적금이면 상품 금리를 쓰세요. 투자 상품은 장기 평균을 보수적으로 넣는 편이 안전합니다."), ("세금은 반영되나요?", "아니요. 세전 기준입니다.")])

tool("inflation", "물가상승 가치 계산기", "fin", "미래 돈의 실질 가치", "물가상승률을 반영해 현재 금액의 미래 가치와 미래 금액의 현재 구매력을 계산합니다.",
 [N("a", "금액 (원)", 10000000), N("r", "연 물가상승률 (%)", 2.5, "0.1"), N("y", "기간 (년)", 10)],
 r'''const f=Math.pow(1+v.r/100,v.y);
return '지금의 '+W(v.a)+' 수준의 생활비는 '+v.y+'년 뒤 <b>'+W(v.a*f)+'</b> 필요<br>'+v.y+'년 뒤 '+W(v.a)+'의 지금 가치는 <b>'+W(v.a/f)+'</b>';''',
 "<h2>왜 중요한가요?</h2><p>물가가 오르면 같은 금액으로 살 수 있는 물건이 줄어듭니다. 예금 금리가 물가상승률보다 낮으면 실질 가치는 줄어듭니다.</p>",
 [("물가상승률은 얼마로 넣나요?", "통계청 소비자물가지수의 최근 평균을 참고하세요. 장기 가정은 2~3%를 쓰는 경우가 많습니다."), ("연금 계획에 쓸 수 있나요?", "은퇴 후 필요한 생활비를 가늠하는 데 참고할 수 있습니다.")])

# ================= 세금·급여 =================
tool("salary", "연봉 환산 계산기", "pay", "연봉·월급·시급 세전 환산", "연봉을 월급, 주급, 일급, 시급으로 세전 기준으로 환산합니다. 월 소정근로시간은 직접 조정할 수 있습니다.",
 [N("a", "연봉 (원, 세전)", 36000000), N("h", "월 소정근로시간 (주 40시간 기준 209)", 209)],
 r'''const m=v.a/12;
return '월급 <b>'+W(m)+'</b><br>주급 '+W(v.a/52)+' · 일급(월급÷30) '+W(m/30)+'<br>시급 <b>'+W(m/v.h)+'</b>';''',
 "<h2>실수령액과 다른 이유</h2><p>이 계산기는 세전 금액만 나눈 값입니다. 실제 통장에 들어오는 금액은 국민연금, 건강보험, 장기요양보험, 고용보험, 소득세, 지방소득세가 빠진 값이라 더 적습니다.</p>",
 [("월 209시간은 무엇인가요?", "주 40시간 근무에 주휴 8시간을 더해 월 평균 주 수를 곱한 값(약 209시간)입니다."), ("퇴직금은 연봉에 포함되나요?", "계약에 따라 다릅니다. 연봉에 포함하는 방식은 퇴직금 별도 지급과 구분해 확인하세요.")])

tool("severance", "퇴직금 계산기", "pay", "평균임금 기준 퇴직금", "입사일, 퇴사일, 최근 3개월 임금으로 법정 퇴직금을 계산합니다.",
 [DT("j", "입사일", "2022-03-01"), DT("l", "퇴사일", "today"), N("w", "퇴직 전 3개월 임금 총액 (원, 상여·연차수당 포함)", 9000000), N("d", "그 3개월의 총 일수 (보통 89~92)", 92)],
 r'''const jd=P(v.j),ld=P(v.l);const days=DAYS(jd,ld)+1;if(!(days>0&&v.d>0))return '입사일과 퇴사일을 확인해 주세요.';
const daily=v.w/v.d,sev=daily*30*days/365;
let h='재직 '+days+'일 · 1일 평균임금 '+W(daily)+'<br><b>퇴직금 '+W(sev)+'</b>';
if(days<365)h+='<br><small>재직 1년 미만이면 법정 퇴직금 대상이 아닙니다.</small>';return h;''',
 "<h2>계산식</h2><p>퇴직금 = 1일 평균임금 × 30일 × (재직일수 ÷ 365)입니다. 1일 평균임금은 퇴직 전 3개월 동안 받은 임금 총액을 그 기간의 총 일수로 나눠 구합니다. 연간 상여금과 연차수당 중 퇴직 전 3개월에 해당하는 몫도 임금 총액에 더해야 합니다. 이 계산기는 참고용이며 실제 지급액은 사업장 규정과 고용노동부 판단에 따릅니다.</p>",
 [("퇴직금은 몇 년 일해야 받나요?", "계속근로기간 1년 이상, 주 15시간 이상 근무한 근로자가 대상입니다."), ("퇴직소득세는 반영되나요?", "아니요. 세전 금액이며 퇴직소득세는 별도로 부과됩니다.")])

tool("annualleave", "연차 계산기", "pay", "입사일 기준 연차 일수", "입사일과 기준일로 발생한 연차 일수를 계산합니다. 1년 미만은 월 1일, 1년 이상은 15일에서 2년마다 1일씩 늘어납니다.",
 [DT("j", "입사일", "2023-04-10"), DT("b", "기준일", "today")],
 r'''const j=P(v.j),b=P(v.b);if(b<j)return '기준일이 입사일보다 빠릅니다.';
let months=(b.getFullYear()-j.getFullYear())*12+b.getMonth()-j.getMonth()-(b.getDate()<j.getDate()?1:0);const yrs=Math.floor(months/12);
let leave;if(yrs<1)leave=Math.min(11,months);else leave=Math.min(25,15+Math.floor((yrs-1)/2));
return '근속 '+yrs+'년 '+(months%12)+'개월<br><b>발생 연차 '+leave+'일</b>'+(yrs<1?'<br><small>1년 미만은 개근한 달마다 1일씩 발생합니다.</small>':'');''',
 "<h2>연차 발생 기준</h2><p>근로기준법상 5인 이상 사업장에서 1년간 80% 이상 출근하면 15일이 발생하고, 3년차부터 2년마다 1일이 추가되어 최대 25일입니다. 1년 미만 근로자는 개근한 매월 1일씩 발생합니다. 회계연도 기준으로 운영하는 회사는 값이 달라질 수 있습니다.</p>",
 [("5인 미만 사업장은요?", "연차 규정이 적용되지 않습니다."), ("쓰지 못한 연차는 어떻게 되나요?", "사용 기한이 지난 미사용 연차는 연차수당으로 보상받을 수 있는 경우가 많습니다. 회사 규정을 확인하세요.")])

# ================= 부업·사업 =================
tool("breakeven", "손익분기점 계산기", "biz", "몇 개 팔아야 본전인지", "고정비, 판매가, 개당 변동비로 손익분기점 판매 수량과 매출을 계산합니다.",
 [N("f", "월 고정비 (원, 임대료·인건비 등)", 3000000), N("p", "판매 단가 (원)", 8000), N("c", "개당 변동비 (원, 재료비 등)", 3000)],
 r'''const mg=v.p-v.c;if(!(mg>0))return '판매가가 변동비보다 커야 합니다.';const q=Math.ceil(v.f/mg);
return '개당 공헌이익 '+W(mg)+'<br><b>손익분기점 '+q.toLocaleString('ko-KR')+'개</b><br>필요 매출 '+W(q*v.p)+'<br><small>하루 '+Math.ceil(q/30)+'개 (30일 기준)</small>';''',
 "<h2>손익분기점이란?</h2><p>매출이 모든 비용과 같아져 이익도 손실도 없는 지점입니다. 이 수량을 넘어 팔아야 이익이 납니다. 고정비는 판매량과 상관없이 나가는 비용, 변동비는 팔 때마다 드는 비용입니다.</p>",
 [("가격을 올리면 어떻게 되나요?", "개당 공헌이익이 늘어 손익분기점 수량이 줄어듭니다."), ("내 인건비도 고정비에 넣나요?", "넣는 것이 정확합니다. 빼면 실제보다 손익분기점이 낮게 나옵니다.")])

# ================= 부동산·생활 =================
tool("jeonse", "전월세 전환 계산기", "life", "전세↔월세 환산", "전세금을 월세로, 월세를 전세금으로 전환합니다. 전월세 전환율은 직접 입력합니다.",
 [S("mode", "방향", [("fwd", "전세 → 월세"), ("rev", "월세 → 전세")]), N("j", "전세금 (원, 전세→월세일 때)", 300000000), N("dep", "보증금 (원)", 50000000), N("mo", "월세 (원, 월세→전세일 때)", 800000), N("rate", "전월세 전환율 (%)", 5, "0.01")],
 r'''const r=v.rate/100;if(!(r>0))return '';
if(v.mode==='fwd'){const m=(v.j-v.dep)*r/12;return '보증금 '+W(v.dep)+' 기준 <b>월세 '+W(m)+'</b>'}
return '보증금 '+W(v.dep)+' + 월세 '+W(v.mo)+' = <b>전세금 '+W(v.dep+v.mo*12/r)+'</b>';''',
 "<h2>전환율이란?</h2><p>전세금 일부를 월세로 바꿀 때 적용하는 연 이율입니다. 주택임대차보호법상 상한이 정해져 있고 시기와 지역에 따라 달라질 수 있으니 계약 시점의 법정 상한을 확인해 입력하세요.</p>",
 [("전환율은 어디서 확인하나요?", "한국은행 기준금리와 법무부 고시 등을 참고합니다. 계약 시점의 값을 확인하세요."), ("월세 vs 전세 무엇이 유리한가요?", "전환율이 대출 이자율보다 높으면 전세가 유리한 경우가 많습니다. 대출 이자 계산기와 같이 비교해 보세요.")])

tool("fuel", "연비·주유비 계산기", "life", "주행거리별 주유비", "주행거리, 연비, 기름값으로 필요한 연료량과 주유비, km당 비용을 계산합니다.",
 [N("d", "주행거리 (km)", 500), N("e", "연비 (km/L)", 12), N("p", "리터당 가격 (원)", 1700)],
 r'''if(!(v.e>0))return '';const l=v.d/v.e,c=l*v.p;
return '필요 연료 '+N2(l,1)+'L<br><b>주유비 '+W(c)+'</b><br>km당 '+W(c/v.d)+'<br><small>편도 기준이면 왕복은 2배입니다.</small>';''',
 "<h2>연비 확인 방법</h2><p>계기판 평균 연비 또는 가득 주유 후 주행한 거리를 주유량으로 나누면 실제 연비를 알 수 있습니다. 고속도로와 시내 연비는 다르니 상황에 맞게 입력하세요.</p>",
 [("전기차에도 쓸 수 있나요?", "km/kWh 연비와 kWh당 전기요금을 입력하면 같은 방식으로 쓸 수 있습니다."), ("통행료는 포함되나요?", "아니요.")])

tool("splitbill", "더치페이 계산기", "life", "N분의 1 정산", "총 금액을 인원수로 나눠 1인당 금액을 계산합니다. 100원 단위 올림도 보여줍니다.",
 [N("t", "총 금액 (원)", 187000), N("n", "인원수", 6), N("tip", "추가 팁·서비스료 (%)", 0, "0.1")],
 r'''if(!(v.n>0))return '';const tot=v.t*(1+v.tip/100),per=tot/v.n,up=Math.ceil(per/100)*100;
return '<b>1인당 '+W(per)+'</b><br>100원 단위 올림 '+W(up)+' (총 '+W(up*v.n)+')';''',
 "<h2>활용 팁</h2><p>올림 금액으로 걷으면 남는 몇 백 원은 총무가 가져갈 수 있으니 정산 방식을 미리 정하세요. 술을 마신 사람과 안 마신 사람처럼 차등이 필요하면 항목별로 나눠 각각 계산하세요.</p>",
 [("나누어떨어지지 않으면?", "원 단위로 반올림해 표시하고 100원 단위 올림 금액도 함께 보여줍니다."), ("차등 정산은 어떻게 하나요?", "공통 금액과 개인 금액을 따로 계산해 합산하세요.")])

tool("discount", "중복 할인 계산기", "life", "할인율·쿠폰 중복 적용", "두 번의 퍼센트 할인과 정액 쿠폰이 겹칠 때 최종 가격과 실제 총 할인율을 계산합니다.",
 [N("p", "정가 (원)", 50000), N("d1", "1차 할인율 (%)", 20, "0.1"), N("d2", "2차 할인율 (%)", 10, "0.1"), N("c", "정액 쿠폰 (원)", 3000)],
 r'''const f=Math.max(0,v.p*(1-v.d1/100)*(1-v.d2/100)-v.c);
return '<b>최종 가격 '+W(f)+'</b><br>총 할인 '+W(v.p-f)+' (실제 할인율 '+N2((1-f/v.p)*100,1)+'%)<br><small>20% + 10%는 30%가 아니라 28% 할인입니다.</small>';''',
 "<h2>중복 할인 계산 순서</h2><p>할인율은 합산이 아니라 곱해집니다. 20%와 10%가 연속 적용되면 0.8 × 0.9 = 0.72로 28% 할인입니다. 정액 쿠폰이 할인 후 가격에 적용되는지 정가에 적용되는지는 쇼핑몰마다 다르니 약관을 확인하세요.</p>",
 [("쿠폰을 먼저 적용하면 어떻게 되나요?", "정액 쿠폰을 먼저 빼고 퍼센트 할인을 하면 최종 금액이 달라질 수 있습니다. 이 계산기는 퍼센트 할인 후 쿠폰을 적용합니다."), ("적립금은 할인인가요?", "별도 사용 조건이 있으니 쇼핑몰 안내를 확인하세요.")])

tool("unitprice", "단가 비교 계산기", "life", "용량 대비 가격 비교", "두 상품의 가격과 용량으로 100g(또는 기준 단위)당 가격을 비교해 더 저렴한 쪽을 알려줍니다.",
 [N("pa", "상품 A 가격 (원)", 12900), N("qa", "상품 A 용량 (g, ml, 개 등)", 450), N("pb", "상품 B 가격 (원)", 9800), N("qb", "상품 B 용량", 300), N("u", "기준 단위 (예: 100)", 100)],
 r'''if(!(v.qa>0&&v.qb>0&&v.u>0))return '';const a=v.pa/v.qa*v.u,b=v.pb/v.qb*v.u;const cheap=a<b?'A':a>b?'B':'동일';
return 'A '+v.u+'당 '+W(a)+' · B '+v.u+'당 '+W(b)+'<br><b>'+(cheap==='동일'?'단가가 같습니다':cheap+'가 '+N2(Math.abs(a-b)/Math.max(a,b)*100,1)+'% 저렴')+'</b>';''',
 "<h2>왜 단가를 비교하나요?</h2><p>대용량이 항상 싼 것은 아닙니다. 가격을 용량으로 나눈 단가로 비교하면 포장 크기에 속지 않습니다. 단위는 g, ml, 개 등 두 상품이 같은 단위이기만 하면 됩니다.</p>",
 [("단위가 다르면요?", "먼저 같은 단위로 환산하세요. 예: kg은 1000을 곱해 g으로."), ("1+1 행사는 어떻게 비교하나요?", "용량에 2배를 곱해 입력하세요.")])

# ================= 날짜·시간 =================
tool("bizdays", "영업일 계산기", "date", "주말 제외 근무일 수", "두 날짜 사이의 영업일(평일) 수를 계산합니다. 공휴일은 포함되지 않으므로 필요하면 직접 빼 주세요.",
 [DT("a", "시작일", "today"), DT("b", "종료일", "+30")],
 r'''let a=P(v.a),b=P(v.b);if(b<a)return '종료일이 시작일보다 빠릅니다.';let biz=0,total=0;
for(let d=new Date(a);d<=b&&total<40000;d.setDate(d.getDate()+1)){total++;const w=d.getDay();if(w!==0&&w!==6)biz++}
return '<b>영업일 '+biz+'일</b><br>전체 '+total+'일 · 주말 '+(total-biz)+'일 (시작·종료일 포함)';''',
 "<h2>공휴일 처리</h2><p>법정 공휴일과 대체공휴일은 해마다 달라 자동으로 빼지 않습니다. 구간 안에 공휴일이 있다면 위 영업일에서 그 수만큼 직접 빼 주세요.</p>",
 [("시작일도 세나요?", "네. 시작일과 종료일을 모두 포함해 셉니다."), ("근무일수와 같은가요?", "주 5일 근무 기준 근무일수와 같습니다.")])

tool("dateadd", "날짜 더하기 빼기 계산기", "date", "N일·N개월 후 날짜", "기준 날짜에 일, 주, 월, 년을 더하거나 빼서 결과 날짜와 요일을 알려줍니다.",
 [DT("b", "기준일", "today"), S("dir", "방향", [("1", "이후 (더하기)"), ("-1", "이전 (빼기)")]), N("n", "기간", 100, "1"), S("u", "단위", [("d", "일"), ("w", "주"), ("m", "개월"), ("y", "년")])],
 r'''const d=P(v.b),n=v.n*(+v.dir);let r;
if(v.u==='d')r=new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
else if(v.u==='w')r=new Date(d.getFullYear(),d.getMonth(),d.getDate()+n*7);
else{const mm=v.u==='m'?n:n*12;r=new Date(d.getFullYear(),d.getMonth()+mm,1);const last=new Date(r.getFullYear(),r.getMonth()+1,0).getDate();r.setDate(Math.min(d.getDate(),last))}
return '<b>'+FD(r)+' ('+DOW(r)+'요일)</b><br><small>'+FD(d)+'에서 '+(v.dir==='1'?'':'-')+v.n+{d:'일',w:'주',m:'개월',y:'년'}[v.u]+'</small>';''',
 "<h2>월 단위 계산 규칙</h2><p>31일에 1개월을 더했는데 다음 달이 30일까지뿐이면 그 달의 마지막 날로 맞춥니다. 예를 들어 1월 31일의 한 달 뒤는 2월 28일(윤년은 29일)입니다.</p>",
 [("100일 후는 언제인가요?", "기준일을 오늘로 두고 100 일을 입력하면 됩니다."), ("오늘을 1일로 세려면?", "결과에서 하루를 빼서 보세요.")])

tool("weekday", "요일 계산기", "date", "날짜의 요일·연중 일수", "날짜를 입력하면 요일, 연중 몇 번째 날인지, 윤년 여부를 알려줍니다.",
 [DT("d", "날짜", "today")],
 r'''const d=P(v.d),y=d.getFullYear(),start=new Date(y,0,1);const doy=DAYS(start,d)+1;const leap=(y%4===0&&y%100!==0)||y%400===0;
return '<b>'+FD(d)+' '+DOW(d)+'요일</b><br>'+y+'년 '+doy+'번째 날 (남은 날 '+((leap?366:365)-doy)+'일)<br>'+y+'년은 '+(leap?'윤년':'평년')+'입니다.';''',
 "<h2>활용</h2><p>생일이 무슨 요일인지, 약속 날짜가 평일인지 확인할 때 쓸 수 있습니다.</p>",
 [("윤년은 어떻게 정하나요?", "4로 나누어떨어지고 100으로 나누어떨어지지 않거나, 400으로 나누어떨어지는 해입니다."), ("음력도 되나요?", "아니요, 양력만 지원합니다.")])

tool("military", "전역일 계산기", "date", "입대일 기준 전역일", "입대일과 군별로 전역 예정일, 복무 진행률, 남은 일수를 계산합니다.",
 [DT("s", "입대일", "2025-03-04"), S("t", "복무 구분", [("18", "육군·해병대 (18개월)"), ("20", "해군 (20개월)"), ("21", "공군·사회복무요원 (21개월)")])],
 r'''const s=P(v.s),m=+v.t;let e=new Date(s.getFullYear(),s.getMonth()+m,s.getDate());
if(e.getDate()!==s.getDate())e=new Date(s.getFullYear(),s.getMonth()+m+1,0);else e=new Date(e.getFullYear(),e.getMonth(),e.getDate()-1);
const today=P(TODAY),tot=DAYS(s,e)+1,done=Math.min(tot,Math.max(0,DAYS(s,today)+1)),left=Math.max(0,DAYS(today,e));
return '<b>전역일 '+FD(e)+' ('+DOW(e)+'요일)</b><br>복무 '+tot+'일 중 '+done+'일 경과 · 남은 일수 '+left+'일<br>진행률 '+N2(done/tot*100,1)+'%';''',
 "<h2>복무기간 기준</h2><p>현재 복무기간은 육군·해병대 18개월, 해군 20개월, 공군 21개월입니다. 사회복무요원 등 대체복무 기간은 제도 변경이 있을 수 있으니 병무청 안내를 확인하세요. 계산은 입대일부터 복무기간 후 하루 전까지로 했으며 휴가·영외 일정은 반영하지 않습니다.</p>",
 [("정확한 전역일은 어떻게 확인하나요?", "병무청 또는 소속 부대의 공식 전역 예정일을 따르세요. 이 계산기는 참고용입니다."), ("전역 전 휴가는 반영되나요?", "아니요.")])

tool("timediff", "근무시간 계산기", "date", "출퇴근 시간 차이", "출근 시각과 퇴근 시각, 휴게시간으로 실근무시간을 계산합니다. 자정을 넘기는 야간 근무도 계산합니다.",
 [TM("a", "출근", "09:00"), TM("b", "퇴근", "18:00"), N("br", "휴게시간 (분)", 60)],
 r'''const f=s=>{const [h,m]=s.split(':').map(Number);return h*60+m};if(!v.a||!v.b)return '';let mins=f(v.b)-f(v.a);if(mins<=0)mins+=1440;mins-=v.br;if(mins<0)return '휴게시간이 근무시간보다 깁니다.';
return '<b>실근무 '+Math.floor(mins/60)+'시간 '+(mins%60)+'분</b><br>소수 표기 '+N2(mins/60,2)+'시간';''',
 "<h2>활용 팁</h2><p>소수 표기 시간에 시급을 곱하면 일당을 구할 수 있습니다. 근로기준법상 4시간 근무에 30분 이상, 8시간 근무에 1시간 이상 휴게시간이 필요합니다.</p>",
 [("야간 근무는 어떻게 계산하나요?", "퇴근 시각이 출근 시각보다 이르면 다음 날 퇴근으로 보고 계산합니다."), ("연장·야간 수당은 반영되나요?", "아니요, 순수 근무시간만 계산합니다.")])

tool("zodiac", "별자리·띠 계산기", "date", "생일로 별자리와 띠", "생일로 서양 별자리와 띠를 알려줍니다. 띠는 양력 연도 기준이며 음력 설 이전 출생은 전년 띠일 수 있습니다.",
 [DT("d", "생일", "1995-05-20")],
 r'''const d=P(v.d),m=d.getMonth()+1,day=d.getDate();const z=[['염소자리',1,19],['물병자리',2,18],['물고기자리',3,20],['양자리',4,19],['황소자리',5,20],['쌍둥이자리',6,21],['게자리',7,22],['사자자리',8,22],['처녀자리',9,22],['천칭자리',10,22],['전갈자리',11,21],['사수자리',12,21],['염소자리',12,31]];
let s='염소자리';for(const [n,mm,dd] of z){if(m<mm||(m===mm&&day<=dd)){s=n;break}}
const animals=['원숭이','닭','개','돼지','쥐','소','호랑이','토끼','용','뱀','말','양'];
return '<b>'+s+' · '+animals[d.getFullYear()%12]+'띠</b><br><small>음력 설 이전 출생은 앞선 해의 띠일 수 있습니다.</small>';''',
 "<h2>안내</h2><p>별자리는 양력 생일의 날짜 구간으로 구분합니다. 오락용 정보이며 과학적 근거는 없습니다.</p>",
 [("띠가 연도와 다르게 나오는 경우는?", "띠는 음력 설을 기준으로 바뀌기 때문에 1~2월 출생이면 양력 연도의 띠와 다를 수 있습니다."), ("별자리 경계일 출생은?", "해에 따라 하루 정도 차이가 날 수 있습니다.")])

tool("duedate", "출산예정일 계산기", "date", "마지막 생리일 기준", "마지막 생리 시작일로 출산예정일과 현재 임신 주수를 계산합니다.",
 [DT("l", "마지막 생리 시작일", "-70")],
 r'''const l=P(v.l),due=new Date(l.getFullYear(),l.getMonth(),l.getDate()+280),t=P(TODAY),dd=DAYS(l,t);
let h='<b>출산예정일 '+FD(due)+' ('+DOW(due)+'요일)</b>';if(dd>=0&&dd<=300)h+='<br>현재 '+Math.floor(dd/7)+'주 '+(dd%7)+'일';
return h+'<br><small>예정일까지 '+Math.max(0,DAYS(t,due))+'일</small>';''',
 "<h2>계산 방식</h2><p>마지막 생리 시작일에 280일(40주)을 더하는 네겔레 방식입니다. 생리 주기가 28일이 아니거나 불규칙하면 초음파 검사로 정한 예정일과 다를 수 있습니다. 의학적 진단이 아니므로 산부인과 상담이 우선입니다.</p>",
 [("예정일에 정확히 낳나요?", "예정일에 출산하는 경우는 드물고 보통 전후 2주 안에 이루어집니다."), ("주수는 어떻게 세나요?", "마지막 생리 시작일을 0주 0일로 봅니다.")])

# ================= 건강·운동 =================
tool("bmr", "기초대사량 계산기", "health", "BMR·하루 권장 칼로리", "성별, 나이, 키, 몸무게로 기초대사량과 활동량별 하루 소비 칼로리를 계산합니다(Mifflin-St Jeor 공식).",
 [S("sex", "성별", [("m", "남성"), ("f", "여성")]), N("age", "나이", 30, "1"), N("h", "키 (cm)", 172), N("w", "몸무게 (kg)", 68),
  S("act", "활동량", [("1.2", "거의 앉아서 생활"), ("1.375", "가벼운 운동 주 1~3회"), ("1.55", "보통 운동 주 3~5회"), ("1.725", "강한 운동 주 6~7회"), ("1.9", "매우 활동적")])],
 r'''const b=10*v.w+6.25*v.h-5*v.age+(v.sex==='m'?5:-161),t=b*(+v.act);
return '<b>기초대사량 '+W0(b)+' kcal</b><br>하루 소비 '+W0(t)+' kcal<br><small>감량 목표 약 '+W0(t-500)+' kcal · 근육 증가 목표 약 '+W0(t+300)+' kcal</small>';''',
 "<h2>기초대사량이란?</h2><p>가만히 있어도 생명 유지에 쓰이는 하루 최소 에너지입니다. 여기에 활동 계수를 곱하면 하루 총 소비 칼로리의 추정치가 됩니다. 개인차가 크고 의학적 처방이 아닙니다.</p>",
 [("하루 500kcal를 줄이면 얼마나 빠지나요?", "대략 일주일에 0.5kg 정도라고 알려져 있지만 개인차가 큽니다."), ("계수는 어떻게 고르나요?", "한 주 평균 운동 빈도로 고르되 헷갈리면 낮은 쪽을 선택하세요.")])

tool("idealweight", "적정체중 계산기", "health", "키 기준 표준체중 범위", "키로 BMI 정상 범위의 체중과 표준체중을 계산합니다.",
 [N("h", "키 (cm)", 170), N("w", "현재 몸무게 (kg, 선택)", 70)],
 r'''const m=v.h/100;const lo=18.5*m*m,hi=22.9*m*m,std=22*m*m;
let h='<b>표준체중 '+N2(std,1)+'kg</b><br>정상 범위 '+N2(lo,1)+' ~ '+N2(hi,1)+'kg';
if(v.w>0){const d=v.w-std;h+='<br>현재 체중은 표준체중보다 '+N2(Math.abs(d),1)+'kg '+(d>0?'많습니다':'적습니다')}return h;''',
 "<h2>계산 기준</h2><p>표준체중은 BMI 22를 기준으로, 정상 범위는 대한비만학회 기준 BMI 18.5 이상 23 미만으로 계산했습니다. 근육량과 체형에 따라 건강 체중은 다를 수 있습니다.</p>",
 [("키가 큰 사람도 같은 공식인가요?", "키의 제곱에 비례하는 방식이라 키가 클수록 체중 기준도 높아집니다."), ("체지방률은 안 보나요?", "이 도구는 키와 체중만 사용합니다.")])

tool("calories", "운동 칼로리 소모 계산기", "health", "운동 종류별 소모량", "운동 종류, 체중, 시간으로 소모 칼로리를 MET 기준으로 계산합니다.",
 [S("met", "운동 종류", [("3.5", "걷기 (보통 속도)"), ("5", "빠르게 걷기"), ("7", "조깅"), ("9.8", "달리기 (시속 10km)"), ("6.8", "자전거 (보통)"), ("6", "수영 (가볍게)"), ("6.5", "등산"), ("5.5", "에어로빅·댄스")]), N("w", "체중 (kg)", 68), N("m", "운동 시간 (분)", 40)],
 r'''const k=(+v.met)*v.w*(v.m/60)*1.05;return '<b>소모 칼로리 약 '+W0(k)+' kcal</b><br><small>밥 한 공기(약 300kcal) '+N2(k/300,1)+'공기 분량</small>';''',
 "<h2>MET이란?</h2><p>운동 강도를 안정 시 에너지 소모량의 배수로 나타낸 값입니다. 소모 칼로리 = MET × 체중(kg) × 시간 × 1.05로 근사합니다. 실제 소모량은 개인과 운동 강도에 따라 달라집니다.</p>",
 [("정확한가요?", "대략적인 추정치입니다. 심박수 기반 기기와 차이가 날 수 있습니다."), ("운동 후 추가 소모는요?", "포함하지 않았습니다.")])

tool("sleep", "수면 사이클 계산기", "health", "기상시간 기준 취침시간", "기상 시각에서 90분 수면 주기를 거꾸로 계산해 권장 취침 시각을 알려줍니다.",
 [TM("w", "일어날 시각", "07:00"), N("f", "잠드는 데 걸리는 시간 (분)", 15)],
 r'''if(!v.w)return '';const [h,m]=v.w.split(':').map(Number),wake=h*60+m;
const fmt=x=>{x=((x%1440)+1440)%1440;return String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0')};
return [6,5,4].map(c=>'<b>'+fmt(wake-c*90-v.f)+'</b> 취침 → '+c+'주기 ('+(c*1.5)+'시간)').join('<br>');''',
 "<h2>수면 주기</h2><p>사람의 수면은 약 90분 주기로 얕은 잠과 깊은 잠을 반복한다고 알려져 있습니다. 주기가 끝나는 시점에 일어나면 덜 피곤하다는 가설에 따른 참고용 계산입니다. 성인에게는 보통 7~9시간 수면이 권장됩니다.</p>",
 [("몇 주기를 자야 하나요?", "성인은 5주기(7.5시간) 전후가 많이 권장되지만 개인차가 큽니다."), ("낮잠은요?", "20~30분 이내가 알려진 가이드입니다.")])

tool("pace", "러닝 페이스 계산기", "health", "km당 페이스와 속도", "달린 거리와 걸린 시간으로 km당 페이스, 평균 속도, 예상 기록을 계산합니다.",
 [N("d", "거리 (km)", 5, "0.01"), N("hh", "시간", 0, "1"), N("mm", "분", 28, "1"), N("ss", "초", 30, "1")],
 r'''const t=v.hh*3600+v.mm*60+v.ss;if(!(v.d>0&&t>0))return '';const p=t/v.d,pm=Math.floor(p/60),ps=Math.round(p%60);const ft=x=>{const h=Math.floor(x/3600),m=Math.floor(x%3600/60),s=Math.round(x%60);return (h?h+'시간 ':'')+m+'분 '+s+'초'};
return '<b>페이스 '+pm+"'"+String(ps).padStart(2,'0')+'" /km</b><br>평균 속도 '+N2(v.d/(t/3600),2)+' km/h<br>이 페이스로 10km '+ft(p*10)+' · 하프 '+ft(p*21.0975)+' · 풀 '+ft(p*42.195);''',
 "<h2>페이스란?</h2><p>1km를 달리는 데 걸리는 시간입니다. 같은 페이스로 더 먼 거리를 달리면 실제 기록은 체력 때문에 늘어나는 경우가 많으니 예상 기록은 참고만 하세요.</p>",
 [("러닝 초보 페이스는?", "대화가 가능한 속도, 보통 7~8분/km 안팎에서 시작하는 경우가 많습니다."), ("트레드밀도 되나요?", "네. 표시 거리와 시간을 넣으면 됩니다.")])

# ================= 도구·변환 =================
tool("average", "평균 계산기", "tool", "합계·평균·중앙값", "여러 숫자의 합계, 평균, 중앙값, 최댓값, 최솟값을 한 번에 계산합니다.",
 [TA("nums", "숫자 (공백, 쉼표, 줄바꿈으로 구분)", "85 92 78 90 66")],
 r'''const a=v.nums.split(/[\s,]+/).filter(Boolean).map(Number).filter(x=>!isNaN(x));if(!a.length)return '숫자를 입력하세요.';
const s=a.reduce((x,y)=>x+y,0),sorted=[...a].sort((x,y)=>x-y),mid=sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
return '개수 '+a.length+' · 합계 '+N2(s,4)+'<br><b>평균 '+N2(s/a.length,4)+'</b><br>중앙값 '+N2(mid,4)+' · 최대 '+sorted[sorted.length-1]+' · 최소 '+sorted[0];''',
 "<h2>평균과 중앙값</h2><p>평균은 값의 합을 개수로 나눈 것이고, 중앙값은 크기 순으로 놓았을 때 가운데 값입니다. 극단적인 값이 섞여 있으면 중앙값이 더 대표적일 수 있습니다.</p>",
 [("숫자가 아닌 글자가 섞이면요?", "숫자가 아닌 값은 무시하고 계산합니다."), ("가중평균은 되나요?", "이 도구는 단순 평균만 지원합니다. 학점은 학점 계산기를 쓰세요.")])

tool("gpa", "학점 계산기", "tool", "평균평점 4.5 / 4.3", "과목별 학점과 성적을 입력하면 평균평점(GPA)을 4.5 또는 4.3 만점으로 계산합니다.",
 [S("scale", "만점 기준", [("45", "4.5 만점"), ("43", "4.3 만점")]), TA("rows", "한 줄에 하나: '학점 성적' (예: 3 A+)", "3 A+\n3 B0\n2 A0\n3 C+\n1 B+")],
 r'''const t45={'A+':4.5,'A':4,'A0':4,'B+':3.5,'B':3,'B0':3,'C+':2.5,'C':2,'C0':2,'D+':1.5,'D':1,'D0':1,'F':0};
const t43={'A+':4.3,'A':4,'A0':4,'A-':3.7,'B+':3.3,'B':3,'B0':3,'B-':2.7,'C+':2.3,'C':2,'C0':2,'C-':1.7,'D+':1.3,'D':1,'D0':1,'D-':0.7,'F':0};
const T=v.scale==='45'?t45:t43;let cr=0,pt=0,earned=0,bad=0;
v.rows.split('\n').forEach(l=>{const p=l.trim().split(/\s+/);if(p.length<2)return;const c=parseFloat(p[0]),g=T[p[1].toUpperCase()];if(isNaN(c)||g===undefined){bad++;return}cr+=c;pt+=c*g;if(g>0)earned+=c});
if(!cr)return '입력 형식을 확인해 주세요. 예: 3 A+';
return '<b>평균평점 '+N2(pt/cr,2)+' / '+(v.scale==='45'?'4.5':'4.3')+'</b><br>이수 학점 '+cr+' · 취득 학점 '+earned+(bad?'<br><small>인식하지 못한 줄 '+bad+'개</small>':'');''',
 "<h2>환산 기준</h2><p>4.5 만점은 A+ 4.5, A0 4.0, B+ 3.5처럼 올라가고, 4.3 만점은 A+ 4.3, A0 4.0, A- 3.7처럼 세분됩니다. 학교마다 기준이 다를 수 있어 학칙을 확인하세요. F는 평균평점에 포함되고 취득 학점에서는 제외됩니다.</p>",
 [("P/NP 과목은요?", "평균평점에 포함하지 않으므로 입력하지 마세요."), ("재수강은 어떻게 계산하나요?", "학교 규정에 따라 다릅니다. 최종 성적만 입력하세요.")])

tool("ratio", "화면 비율 계산기", "tool", "가로세로 비율·크기 환산", "이미지나 영상의 가로세로 비율을 유지하며 새 크기를 계산하고 기약 비율(16:9 등)을 알려줍니다.",
 [N("w", "원본 가로 (px)", 1920, "1"), N("h", "원본 세로 (px)", 1080, "1"), N("nw", "새 가로 (px)", 1280, "1")],
 r'''if(!(v.w>0&&v.h>0))return '';const g=(a,b)=>b?g(b,a%b):a,k=g(v.w,v.h);
return '비율 <b>'+(v.w/k)+':'+(v.h/k)+'</b><br>새 크기 <b>'+v.nw+' × '+Math.round(v.nw*v.h/v.w)+'</b> px';''',
 "<h2>비율 유지가 중요한 이유</h2><p>가로세로 비율을 지키지 않고 크기를 바꾸면 이미지가 늘어나거나 찌그러집니다. 영상은 16:9, 인스타그램 세로 영상은 9:16, 정사각형은 1:1이 많이 쓰입니다.</p>",
 [("세로 기준으로 바꾸려면?", "가로와 세로 값을 서로 바꿔 입력하고 결과를 뒤집어 읽으세요."), ("소수점은 어떻게 처리되나요?", "반올림합니다.")])

tool("lotto", "로또 번호 생성기", "tool", "무작위 6개 번호", "1~45 사이의 무작위 번호 6개를 5세트 뽑아줍니다. 재미로만 이용하세요.",
 [],
 r'''let h='';for(let s=0;s<5;s++){const set=new Set();while(set.size<6)set.add(1+Math.floor(Math.random()*45));h+='<div>'+[...set].sort((a,b)=>a-b).map(n=>String(n).padStart(2,'0')).join(' · ')+'</div>'}return h+'<small>당첨 확률은 어떤 번호든 같습니다(약 814만 분의 1).</small>';''',
 "<h2>안내</h2><p>이 도구는 순수한 난수로 번호를 만듭니다. 어떤 조합이든 당첨 확률은 같으며, 로또는 과도하게 구매하지 않도록 주의하세요.</p>",
 [("번호가 저장되나요?", "아니요. 다시 뽑으면 이전 번호는 사라집니다."), ("보너스 번호는요?", "당첨 후 별도로 추첨되므로 생성하지 않습니다.")],
 button="번호 뽑기")

# ---------- rendering ----------
HELPERS = r'''const W=n=>Math.round(n).toLocaleString('ko-KR')+'원';
const W0=n=>Math.round(n).toLocaleString('ko-KR');
const N2=(n,d)=>(+n.toFixed(d)).toLocaleString('ko-KR');
const P=s=>{const a=s.split('-').map(Number);return new Date(a[0],a[1]-1,a[2])};
const DAYS=(a,b)=>Math.round((b-a)/864e5);
const FD=d=>d.getFullYear()+'.'+(d.getMonth()+1)+'.'+d.getDate();
const DOW=d=>'일월화수목금토'[d.getDay()];
const pad=n=>String(n).padStart(2,'0');
const _t=new Date();const TODAY=_t.getFullYear()+'-'+pad(_t.getMonth()+1)+'-'+pad(_t.getDate());'''

def nav():
    items = "".join(f'<a href="index.html#c-{k}">{n}</a>' for k, n in CATS)
    return f'<header><a href="index.html" class="brand">간편계산기</a><nav>{items}</nav></header>'

FOOT = ('<footer><a href="about.html">소개</a> · <a href="terms.html">이용약관</a> · <a href="privacy.html">개인정보처리방침</a>'
        '<br>입력한 내용은 서버로 전송되지 않고 브라우저에서만 처리됩니다. 계산 결과는 참고용이며 법적·재무적 효력이 없습니다.</footer>')

def related(slug, cat):
    r = [(s, t) for s, t, c, _ in REG if c == cat and s != slug][:4]
    if not r: return ""
    return '<h2>관련 계산기</h2><div class="tools">' + "".join(f'<a href="{s}.html">{t}</a>' for s, t in r) + "</div>"

def render_input(i):
    if i["t"] == "number":
        return f'<label for="{i["id"]}">{i["label"]}</label><input type="number" id="{i["id"]}" value="{i["d"]}" step="{i["step"]}">'
    if i["t"] == "select":
        o = "".join(f'<option value="{v}">{l}</option>' for v, l in i["opts"])
        return f'<label for="{i["id"]}">{i["label"]}</label><select id="{i["id"]}">{o}</select>'
    if i["t"] == "date":
        d = i["d"]
        if d == "today": a = ' data-off="0"'; val = ""
        elif d.startswith("+") or d.startswith("-") and d[1:].isdigit(): a = f' data-off="{int(d)}"'; val = ""
        else: a = ""; val = d
        return f'<label for="{i["id"]}">{i["label"]}</label><input type="date" id="{i["id"]}" value="{val}"{a}>'
    if i["t"] == "time":
        return f'<label for="{i["id"]}">{i["label"]}</label><input type="time" id="{i["id"]}" value="{i["d"]}">'
    if i["t"] == "textarea":
        return f'<label for="{i["id"]}">{i["label"]}</label><textarea id="{i["id"]}" style="min-height:130px">{i["d"]}</textarea>'

def faq_html(faq):
    return '<div class="faq-block"><h2>자주 묻는 질문</h2>' + "".join(f"<h3>{q}</h3><p>{a}</p>" for q, a in faq) + "</div>"

def faq_ld(faq):
    return json.dumps({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}, ensure_ascii=False)

def shell(fn, title, desc, h1, main, script=""):
    return f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><meta name="description" content="{desc}">
<link rel="canonical" href="{SITE}/{fn}">
<link rel="stylesheet" href="style.css"></head><body>
{nav()}
<main><h1>{h1}</h1>
{AD}
{main}
{AD}
</main>
{FOOT}
{script}</body></html>'''

def write(fn, s):
    with open(os.path.join(OUT, fn), "w", encoding="utf-8") as f: f.write(s)

def render_tool(t):
    ids = [i["id"] for i in t["inputs"]]
    inputs = "".join(render_input(i) for i in t["inputs"])
    btn = f'<button onclick="run()">{t["button"]}</button>' if t["button"] else ""
    main = (f'<div class="card">{inputs}{btn}<div class="result" id="r"></div></div>'
            f'{t["body"]}{faq_html(t["faq"])}{related(t["slug"], t["cat"])}')
    script = f'''<script>{HELPERS}
const IDS={json.dumps(ids)};
function compute(v){{{t["js"]}}}
function run(){{const v={{}};IDS.forEach(i=>{{const e=document.getElementById(i);v[i]=e.type==='number'?(e.value===''?NaN:+e.value):e.value}});
let h='';try{{h=compute(v)||''}}catch(x){{h=''}}document.getElementById('r').innerHTML=h}}
document.querySelectorAll('[data-off]').forEach(e=>{{const d=new Date();d.setDate(d.getDate()+(+e.dataset.off));e.value=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}});
IDS.forEach(i=>{{const e=document.getElementById(i);e.addEventListener('input',run);e.addEventListener('change',run)}});run();</script>
<script type="application/ld+json">{faq_ld(t["faq"])}</script>'''
    write(t["slug"] + ".html", shell(t["slug"] + ".html", t["title"] + " - " + t["line"], t["desc"], t["title"], main, script))

def render_index():
    by = {k: [] for k, _ in CATS}
    for s, t, c, d in REG: by[c].append((s, t, d))
    meta = {s: (t, d) for s, t, c, d in REG}
    pop = "".join(f'<a href="{s}.html">{meta[s][0]}<span>{meta[s][1]}</span></a>' for s in POPULAR if s in meta)
    secs = ""
    for k, name in CATS:
        if not by[k]: continue
        secs += f'<h2 id="c-{k}">{name} <small>{len(by[k])}</small></h2><div class="tools">' + "".join(
            f'<a href="{s}.html" data-q="{t} {d}">{t}<span>{d}</span></a>' for s, t, d in by[k]) + "</div>"
    n = len(REG)
    main = (f'<p class="lead">가입 없이 바로 쓰는 생활 계산기 {n}종. 입력한 값은 내 브라우저 안에서만 계산됩니다.</p>'
            f'<input type="search" id="q" placeholder="계산기 검색 (예: 퇴직금, 평수, 적금)" aria-label="계산기 검색">'
            f'<div id="empty" hidden>검색 결과가 없습니다.</div>'
            f'<div id="pop"><h2>지금 인기</h2><div class="tools">{pop}</div></div><div id="all">{secs}</div>')
    script = '''<script>const q=document.getElementById('q');q.addEventListener('input',()=>{const s=q.value.trim().toLowerCase();let any=false;
document.getElementById('pop').hidden=!!s;document.querySelectorAll('#all .tools a').forEach(a=>{const ok=!s||a.dataset.q.toLowerCase().includes(s);a.hidden=!ok;if(ok)any=true});
document.querySelectorAll('#all h2').forEach(h=>{const l=h.nextElementSibling;h.hidden=[...l.children].every(c=>c.hidden)});document.getElementById('empty').hidden=any||!s});</script>'''
    write("index.html", shell("index.html", "간편계산기 - 생활 계산기 모음", f"글자수 세기, 만 나이, 퇴직금, 대출 이자, 평수 변환 등 생활 계산기 {n}종을 가입 없이 무료로.", "간편계산기", main, script))

def static_pages():
    write("about.html", shell("about.html", "소개 - 간편계산기", "간편계산기 서비스 소개", "소개",
        '<div class="card"><p>간편계산기는 일상에서 자주 필요한 계산을 가입 없이 바로 할 수 있도록 만든 무료 계산기 모음입니다. 모든 계산은 이용자의 브라우저에서 처리되며 입력값을 서버에 저장하지 않습니다.</p>'
        '<p>계산 결과는 참고용입니다. 세금, 급여, 퇴직금, 대출 등 금액이 큰 사안은 반드시 관련 기관이나 전문가에게 확인하세요. 법령과 요율은 바뀔 수 있으며, 잘못된 계산을 발견하면 알려주시면 고치겠습니다.</p></div>'))
    write("terms.html", shell("terms.html", "이용약관 - 간편계산기", "간편계산기 이용약관", "이용약관",
        '<div class="card"><h2 style="margin-top:0">서비스 이용</h2><p>이 사이트의 계산기는 누구나 무료로 이용할 수 있습니다.</p>'
        '<h2>면책</h2><p>제공되는 계산 결과는 일반적인 정보 제공이 목적이며, 정확성이나 특정 목적에의 적합성을 보증하지 않습니다. 계산 결과를 근거로 한 판단과 그 결과에 대한 책임은 이용자에게 있습니다.</p>'
        '<h2>광고</h2><p>사이트 운영을 위해 광고가 게재될 수 있습니다.</p></div>'))

def refresh_existing():
    new = {t["slug"] + ".html" for t in TOOLS} | {"index.html", "about.html", "terms.html"}
    for fn in glob.glob(os.path.join(OUT, "*.html")):
        b = os.path.basename(fn)
        if b in new: continue
        s = open(fn, encoding="utf-8").read()
        s = re.sub(r"<header>.*?</header>", nav(), s, count=1, flags=re.S)
        s = re.sub(r"<footer>.*?</footer>", FOOT, s, count=1, flags=re.S)
        if "</main>" in s and "관련 계산기" not in s:
            slug = b[:-5]; cat = next((c for s2, _, c, _ in REG if s2 == slug), None)
            if cat: s = s.replace("</main>", related(slug, cat) + "\n</main>", 1)
        open(fn, "w", encoding="utf-8").write(s)

def sitemap():
    pages = ["", "about.html", "terms.html", "privacy.html"] + [s + ".html" for s, *_ in REG]
    body = "".join(f"<url><loc>{SITE}/{p}</loc></url>" for p in pages)
    write("sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>')

def css():
    p = os.path.join(OUT, "style.css")
    s = open(p, encoding="utf-8").read()
    if "/*b2*/" in s: return
    s += '''/*b2*/
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 18px}
.brand{font-size:18px}
nav{display:flex;flex-wrap:wrap;gap:4px 12px}nav a{margin:0}
.lead{color:var(--muted);margin-top:0}
input[type=search]{margin:8px 0 4px}
.tools{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
.tools a{margin:0}.tools a[hidden]{display:none}
h2 small{font-weight:400;color:var(--muted);font-size:14px}
select,input[type=date],input[type=time]{width:100%}
@media(max-width:480px){.tools{grid-template-columns:1fr}}
'''
    open(p, "w", encoding="utf-8").write(s)

if __name__ == "__main__":
    for t in TOOLS: render_tool(t)
    render_index(); static_pages(); refresh_existing(); css(); sitemap()
    print(len(REG), "tools in registry,", len(TOOLS), "generated")
