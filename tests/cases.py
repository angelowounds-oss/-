"""Reference cases for the calculators: expected values are computed here from the plain formula definitions,
not copied from the page code. Output: tests/cases.json (consumed by tests/qa.js). Frozen 'today' = 2026-10-07."""
import json, math, datetime as dt

TODAY = dt.date(2026, 10, 7)

def half_up(x):
    return int(math.floor(x + 0.5))

def W(x):
    return f"{half_up(x):,}원"

def N(x, d=2):
    s = f"{x:.{d + 3}f}"
    v = round(float(s) + 1e-12, d)
    t = f"{v:,.{min(d, 3)}f}"
    return t.rstrip("0").rstrip(".") if "." in t else t

cases = []
def case(slug, inputs, *expect, click=None, name=None):
    cases.append(dict(slug=slug, inputs=inputs, expect=list(expect), click=click, name=name or slug))

# ---- hand-written pages ----
case("loan", {"P": "100000000", "R": "4.5", "N": "360"}, W(506684.69), "82,406,712원", "652,778원", "278,819원", "67,687,500원", "375,000원", "135,000,000원", click="button")
case("loan", {"P": "12000000", "R": "0", "N": "24"}, "500,000원", click="button", name="loan-0rate")
case("vat", {"x": "110000", "m": "in"}, "공급가액 100,000원", "부가세 10,000원")
case("vat", {"x": "100000", "m": "ex"}, "합계 110,000원", "부가세 10,000원", name="vat-ex")
case("wage", {"h": "10320", "d": "8", "n": "5"}, "주급 495,360원", "주휴수당 82,560원", "월급(세전) 2,152,457원")
case("wage", {"h": "10320", "d": "5", "n": "3"}, "주급 185,760원", "주휴수당 30,960원", "월급(세전) 807,171원", name="wage-15h")
case("wage", {"h": "10320", "d": "3", "n": "4"}, "주급 123,840원", "주휴수당 0원", name="wage-under15")
case("freelance", {"m": "fwd", "x": "1000000"}, "실수령액 967,000원", "소득세 30,000원", "지방소득세 3,000원")
case("freelance", {"m": "rev", "x": "967000"}, "약 1,000,000원", name="freelance-rev")
case("dday", {"d1": "2026-10-07", "d2": "2026-12-25"}, "D-79", "79일 (11주 2일)", click="button")
case("dday", {"d1": "2026-10-07", "d2": "2026-10-07"}, "D-Day", click="button", name="dday-zero")
case("dday", {"d1": "2026-10-07", "d2": "2026-09-30"}, "D+7", click="button", name="dday-past")
case("age", {"bd": "2000-05-20", "bs": "2026-10-07"}, "만 26세", "용띠", click="button")
case("age", {"bd": "2000-12-25", "bs": "2026-10-07"}, "만 25세", "연 나이 26세", click="button", name="age-before-bday")
case("age", {"bd": "2000-10-07", "bs": "2026-10-07"}, "만 26세", "다음 생일까지 0일", click="button", name="age-on-bday")
case("bmi", {"h": "170", "w": "65"}, "BMI 22.5", "정상", click="button")
case("bmi", {"h": "175", "w": "80"}, "BMI 26.1", "1단계 비만", click="button", name="bmi-obese")
case("pyeong", {"p": "32"}, "105.79", name="pyeong-p")
case("percent", {"a1": "200", "b1": "15", "a3": "100", "b3": "120"}, "30", "+20%")

# ---- finance ----
def pmt(p, r, n): return p * (r / 1200) / (1 - (1 + r / 1200) ** -n)
case("deposit", {"kind": "dep", "p": "10000000", "rate": "3.5", "n": "12", "tax": "15.4"}, "세전 이자 350,000원", "이자소득세 53,900원", "세후 이자 296,100원")
case("deposit", {"kind": "sav", "p": "1000000", "rate": "3.5", "n": "12", "tax": "15.4"}, "세전 이자 227,500원", "세후 이자 192,465원", "만기 수령 12,192,465원", name="deposit-sav")
case("deposit", {"kind": "dep", "p": "10000000", "rate": "3.5", "n": "12", "tax": "0"}, "세후 이자 350,000원", name="deposit-taxfree")
fv = 10e6 * 1.005 ** 120 + 500000 * (1.005 ** 120 - 1) / .005
case("compound", {"p": "10000000", "m": "500000", "rate": "6", "y": "10"}, W(fv), "총 원금 70,000,000원")
case("compound", {"p": "1000000", "m": "100000", "rate": "0", "y": "2"}, "만기 금액 3,400,000원", name="compound-0rate")
case("cagr", {"a": "10000000", "b": "15000000", "y": "5"}, "총 수익률 50%", f"{N(((1.5)**(1/5)-1)*100)}%", "5,000,000원")
case("avgprice", {"p1": "70000", "q1": "10", "p2": "55000", "q2": "20", "now": "60000"}, "평균 단가 60,000원", "총 수량 30주", "총 투자금 1,800,000원")
case("avgprice", {"p1": "100000", "q1": "3", "p2": "80000", "q2": "7", "now": "90000"}, "평균 단가 86,000원", "40,000원", name="avgprice-2")
case("stock", {"b": "50000", "s": "56000", "q": "100", "fee": "0.015", "tx": "0.15"}, "590,010원", "수수료 1,590원", "거래세 8,400원")
case("savegoal", {"t": "100000000", "c": "10000000", "m": "1000000", "rate": "3"}, "약 80개월", "6년 8개월")
case("savegoal", {"t": "100000000", "c": "10000000", "m": "1000000", "rate": "0"}, "약 90개월", "7년 6개월", name="savegoal-0rate")
case("inflation", {"a": "10000000", "r": "2.5", "y": "10"}, W(10e6 * 1.025 ** 10), W(10e6 / 1.025 ** 10))
case("apy", {"r": "4", "n": "12"}, f"{N(((1 + .04 / 12) ** 12 - 1) * 100, 3)}%")
case("dividend", {"p": "70000", "d": "2500", "q": "100", "tax": "15.4"}, "배당수익률 3.57%", "250,000원", "211,500원")
case("exchange", {"dir": "f2k", "a": "100", "rate": "1400", "fee": "1.5"}, "137,900원")
case("exchange", {"dir": "k2f", "a": "1400000", "rate": "1400", "fee": "1.5"}, "985", name="exchange-k2f")
n = -math.log(1 - 30e6 * (.05 / 12) / 700000) / math.log(1 + .05 / 12)
case("payoff", {"b": "30000000", "r": "5", "m": "700000"}, f"약 {math.ceil(n)}개월", W(700000 * n - 30e6))
case("payoff", {"b": "30000000", "r": "12", "m": "200000"}, "갚을 수 없습니다", name="payoff-never")
case("prepay", {"amt": "50000000", "rate": "1.2", "rem": "900", "tot": "1095"}, W(50e6 * .012 * 900 / 1095))
case("fire", {"s": "36000000", "w": "4", "c": "50000000", "m": "1500000", "r": "5"}, "900,000,000원", "22년 7개월")
case("fire", {"s": "36000000", "w": "4", "c": "950000000", "m": "0", "r": "5"}, "이미 달성", name="fire-done")
case("recover", {"l": "30"}, "42.9%")
case("recover", {"l": "50"}, "100%", name="recover-50")
case("studentloan", {"p": "10000000", "r": "1.7", "g": "12", "n": "120"}, W(pmt(10e6, 1.7, 120)), "거치 중 월 이자 14,167원")
case("youthsave", {"m": "700000", "n": "36", "r": "5", "s": "0", "t": "15.4"}, W(700000 * 36 + 700000 * .05 / 12 * 36 * 37 / 2 * (1 - .154)))
case("youthsave", {"m": "100000", "n": "12", "r": "0", "s": "10000", "t": "0"}, "만기 수령 약 1,320,000원", name="youthsave-subsidy")
case("latestart", {"m": "500000", "r": "6", "a": "25", "b": "35", "t": "60"}, W(500000 * (1.005 ** 420 - 1) / .005), W(500000 * (1.005 ** 300 - 1) / .005))
case("nospend", {"d": "15000", "n": "30", "r": "5", "y": "10"}, "450,000원", W(450000 * (1 + .05 / 12) ** 0 * ((1 + .05 / 12) ** 120 - 1) / (.05 / 12)))
case("ltv", {"p": "700000000", "l": "350000000", "i": "60000000", "d": "18000000"}, "LTV 50%", "DSR 30%")

# ---- pay ----
case("salary", {"a": "36000000", "h": "209"}, "월급 3,000,000원", "주급 692,308원", "일급(월급÷30) 100,000원", "시급 14,354원")
d = 9e6 / 92
case("severance", {"j": "2022-03-01", "l": "2025-02-28", "w": "9000000", "d": "92"}, "재직 1096일", "1일 평균임금 97,826원", W(d * 30 * 1096 / 365))
case("severance", {"j": "2024-06-01", "l": "2025-03-31", "w": "7500000", "d": "90"}, "재직 304일", "대상이 아닙니다", name="severance-under1y")
for j, b, exp, nm in [("2023-04-10", "2026-10-07", "발생 연차 16일", "al-3y"), ("2025-10-07", "2026-10-07", "발생 연차 15일", "al-exact1y"), ("2025-10-08", "2026-10-07", "발생 연차 11일", "al-11m"),
                       ("2000-01-01", "2026-10-07", "발생 연차 25일", "al-cap"), ("2026-10-07", "2026-10-07", "발생 연차 0일", "al-day0"), ("2026-10-08", "2026-10-07", "기준일이 입사일보다", "al-future")]:
    case("annualleave", {"j": j, "b": b}, exp, name=nm)
case("overtime", {"h": "12000", "ot": "10", "nt": "5", "h1": "8", "h2": "2"}, "연장 180,000원", "야간 가산 30,000원", "휴일 192,000원", "합계 402,000원")
case("minwage", {"h": "10320", "w": "40"}, "월 환산 208.6시간", "월급 2,152,457원")
case("minwage", {"h": "10320", "w": "10"}, W(10 * 10320 * 365 / 7 / 12), name="minwage-10h")
case("dismissal", {"h": "11000", "d": "0", "hd": "8"}, "2,640,000원", "30일분")
case("dismissal", {"h": "11000", "d": "30", "hd": "8"}, "0원", name="dismissal-notified")
for k, rate in [("3.3", .033), ("8.8", .088), ("15.4", .154)]:
    inc = int(round(1e6 * rate / 1.1 / 10)) * 10
    loc = int(inc * .1 / 10) * 10
    case("withholding", {"k": k, "a": "1000000"}, f"소득세 {inc:,}원", f"지방소득세 {loc:,}원", W(1e6 - inc - loc), name=f"withholding-{k}")
case("raise", {"m": "a", "o": "40000000", "n": "44000000", "p": "5"}, "인상률 10%", "월 333,333원")
case("raise", {"m": "b", "o": "40000000", "n": "0", "p": "5"}, "새 연봉 42,000,000원", name="raise-b")

# ---- business / life ----
case("breakeven", {"f": "3000000", "p": "8000", "c": "3000"}, "600개", "4,800,000원")
case("breakeven", {"f": "3000000", "p": "3000", "c": "3500"}, "변동비보다 커야", name="breakeven-loss")
case("roas", {"c": "500000", "r": "1800000", "k": "1200", "o": "45", "m": "35"}, "ROAS 360%", "손익분기 286%", "130,000원")
case("costrate", {"p": "6500", "c": "1800", "t": "30"}, "원가율 27.7%", "6,000원")
case("freerate", {"t": "4000000", "h": "160", "b": "60", "e": "20"}, "필요 매출 5,000,000원", "청구 시급 52,083원")
case("ytrev", {"v": "100000", "rpm": "1500", "n": "8"}, "월 예상 수익 150,000원", "1,800,000원", "18,750원")
case("jeonse", {"mode": "fwd", "j": "300000000", "dep": "50000000", "mo": "800000", "rate": "5"}, "월세 1,041,667원")
case("jeonse", {"mode": "rev", "j": "300000000", "dep": "50000000", "mo": "800000", "rate": "5"}, "전세금 242,000,000원", name="jeonse-rev")
case("fuel", {"d": "500", "e": "12", "p": "1700"}, "필요 연료 41.7L", "주유비 70,833원", "km당 142원")
case("splitbill", {"t": "187000", "n": "6", "tip": "0"}, "1인당 31,167원", "31,200원", "총 187,200원")
case("splitbill", {"t": "187000", "n": "6", "tip": "10"}, "1인당 34,283원", "34,300원", name="splitbill-tip")
case("discount", {"p": "50000", "d1": "20", "d2": "10", "c": "3000"}, "최종 가격 33,000원", "총 할인 17,000원", "실제 할인율 34%")
case("discount", {"p": "10000", "d1": "0", "d2": "0", "c": "20000"}, "최종 가격 0원", name="discount-over")
case("unitprice", {"pa": "12900", "qa": "450", "pb": "9800", "qb": "300", "u": "100"}, "A 100당 2,867원", "B 100당 3,267원", "A가 12.2% 저렴")
case("roommate", {"t": "120000", "p": "민수 30\n지영 30\n서준 12"}, "민수 50,000원", "서준 20,000원")
case("cookvsdeliver", {"d": "16000", "f": "3500", "c": "5000", "w": "4", "m": "45", "h": "10320"}, "한 끼에 14,500원", "252,010원", "134,521원")
case("giftbudget", {"a": "6", "ap": "50000", "b": "2", "bp": "50000", "c": "3", "cp": "30000"}, "올해 경조사 예산 490,000원", "40,833원", "총 11건")
case("tripsplit", {"t": "민수 120000\n지영 80000\n서준 45000\n민수 30000", "x": "하은"}, "총 275,000원", "4명", "1인 68,750원", "하은 → 민수 68,750원", "서준 → 민수 12,500원", "서준 → 지영 11,250원")
case("tripbudget", {"t": "2000000", "f": "600000", "h": "500000", "d": "5", "r": "9.5"}, "하루 180,000원", "약 18,947", "162,000원")
case("tripbudget", {"t": "1000000", "f": "800000", "h": "500000", "d": "5", "r": "0"}, "총 예산을 넘었어요", name="tripbudget-over")
case("reading", {"t": "360", "c": "80", "p": "20"}, "남은 280쪽", "14일 뒤 완독", "진행률 22%")
case("realhourly", {"pay": "2800000", "days": "5", "work": "8", "lunch": "60", "com": "50", "prep": "40", "ot": "10"}, "진짜 시급 10,928원", "월급÷근무시간으로 보면 16,110원", "하루 11.3시간")
case("freetime", {"wake": "07:00", "sleep": "00:00", "in": "09:00", "out": "18:00", "com": "50", "must": "150"}, "하루 3시간 50분")
case("freetime", {"wake": "07:00", "sleep": "01:30", "in": "22:00", "out": "06:00", "com": "30", "must": "100"}, "하루 7시간 50분", name="freetime-night")
case("rentratio", {"i": "3000000", "r": "700000", "m": "100000"}, "소득의 26.7%", "일반적인 수준")
case("caffeine", {"c": "2", "e": "0", "k": "1", "t": "1"}, "약 365mg", "한도까지 약 35mg")
case("alcohol", {"ml": "360", "abv": "16.9", "n": "1"}, "순수 알코올 약 48.7g", "341kcal")
case("petage", {"k": "dog", "a": "5"}, "약 57세")
case("petage", {"k": "cat", "a": "5"}, "약 36세", name="petage-cat")
case("petage", {"k": "dog", "a": "0.5"}, "1살 이상만", name="petage-puppy")
case("daybudget", {"left": "600000", "pay": "2026-10-19", "today": "0"}, "월급까지 12일", "하루 50,000원", "일주일 350,000원")
case("daybudget", {"left": "600000", "pay": "2026-10-07", "today": "0"}, "이후여야", name="daybudget-today")

# ---- dates ----
case("bizdays", {"a": "2026-10-05", "b": "2026-10-16"}, "영업일 10일", "전체 12일", "주말 2일")
case("bizdays", {"a": "2026-10-16", "b": "2026-10-05"}, "종료일이 시작일보다", name="bizdays-reversed")
case("dateadd", {"b": "2026-01-31", "dir": "1", "n": "1", "u": "m"}, "2026.2.28 (토요일)")
case("dateadd", {"b": "2024-02-29", "dir": "1", "n": "1", "u": "y"}, "2025.2.28 (금요일)", name="dateadd-leap")
case("dateadd", {"b": "2026-10-07", "dir": "1", "n": "100", "u": "d"}, "2027.1.15 (금요일)", name="dateadd-100d")
case("dateadd", {"b": "2026-03-31", "dir": "-1", "n": "1", "u": "m"}, "2026.2.28 (토요일)", name="dateadd-sub-month")
case("dateadd", {"b": "2026-10-07", "dir": "1", "n": "2", "u": "w"}, "2026.10.21 (수요일)", name="dateadd-weeks")
def ymd(a, b):
    y = b.year - a.year; m = b.month - a.month; d = b.day - a.day
    if d < 0:
        m -= 1
        import calendar
        # days from (a + m months, clamped) to b
    return None
def months_diff(a, b):
    import calendar
    m = (b.year - a.year) * 12 + b.month - a.month
    def add(a, k):
        t = a.year * 12 + a.month - 1 + k
        y, mo = divmod(t, 12); mo += 1
        d = min(a.day, calendar.monthrange(y, mo)[1]); return dt.date(y, mo, d)
    while add(a, m) > b: m -= 1
    return m // 12, m % 12, (b - add(a, m)).days
for a, b in [("2020-03-01", "2026-10-07"), ("2024-01-31", "2024-03-01"), ("2023-05-31", "2023-06-30"), ("2024-02-29", "2025-02-28"), ("2026-10-07", "2026-10-07"), ("2025-12-31", "2026-01-01")]:
    A = dt.date.fromisoformat(a); B = dt.date.fromisoformat(b); y, m, d = months_diff(A, B)
    case("datediff", {"a": a, "b": b}, f"{y}년 {m}개월 {d}일", f"총 {(B - A).days:,}일", name=f"datediff-{a}-{b}")
case("weekday", {"d": "2026-10-07"}, "2026.10.7 수요일", "280번째 날", "평년")
case("weekday", {"d": "2024-02-29"}, "2024.2.29 목요일", "60번째 날", "윤년", name="weekday-leap")
case("weekday", {"d": "1900-02-28"}, "수요일", "평년", name="weekday-1900")
for d, exp in [("2026-01-01", "2026년 1주차"), ("2027-01-01", "2026년 53주차"), ("2024-12-30", "2025년 1주차"), ("2021-01-03", "2020년 53주차"), ("2026-12-28", "2026년 53주차")]:
    case("weeknum", {"d": d}, exp, name=f"weeknum-{d}")
case("military", {"s": "2025-03-04", "t": "18"}, "전역일 2026.9.3 (목요일)", "복무 549일")
case("military", {"s": "2025-08-31", "t": "18"}, "전역일 2027.2.28", name="military-month-end")
case("military", {"s": "2024-02-29", "t": "18"}, "전역일 2025.8.28", name="military-leap")
case("military", {"s": "2025-12-15", "t": "21"}, "전역일 2027.9.14", name="military-21")
case("timediff", {"a": "09:00", "b": "18:00", "br": "60"}, "실근무 8시간 0분", "소수 표기 8시간")
case("timediff", {"a": "22:00", "b": "06:00", "br": "30"}, "실근무 7시간 30분", "7.5시간", name="timediff-night")
case("timediff", {"a": "09:00", "b": "09:30", "br": "60"}, "휴게시간이 근무시간보다 깁니다", name="timediff-negative")
for d, exp in [("2000-03-20", "물고기자리"), ("2000-03-21", "양자리"), ("1995-01-19", "염소자리"), ("1995-01-20", "물병자리"), ("1995-12-21", "사수자리"), ("1995-12-22", "염소자리"), ("2000-02-29", "물고기자리")]:
    case("zodiac", {"d": d}, exp, name=f"zodiac-{d}")
case("zodiac", {"d": "2000-05-20"}, "용띠", name="zodiac-dragon")
case("zodiac", {"d": "2008-05-20"}, "쥐띠", name="zodiac-rat")
case("duedate", {"l": "2026-07-01"}, "출산예정일 2027.4.7 (수요일)", "현재 14주 0일")
case("birthday", {"b": "2000-05-20"}, "D-225", "2027.5.20 (목요일)", "만 27세")
case("birthday", {"b": "2000-10-07"}, "오늘이 생일")
case("secconv", {"m": "a", "s": "3725", "h": "0", "mi": "0", "se": "0"}, "1시간 2분 5초", "01:02:05")
case("secconv", {"m": "b", "s": "0", "h": "1", "mi": "2", "se": "5"}, "3,725초", name="secconv-b")
case("timesum", {"t": "1:30\n0:45\n2:15\n0:50"}, "합계 5시간 20분", "5.33시간")
for fromz, tz, exp in [("Asia/Seoul", "America/New_York", "10월 6일 화요일 오후 8:00"), ("Asia/Seoul", "America/Los_Angeles", "10월 6일 화요일 오후 5:00"), ("Asia/Seoul", "UTC", "10월 7일 수요일 오전 12:00"), ("UTC", "Asia/Seoul", "10월 7일 수요일 오후 6:00")]:
    case("timezone", {"d": "2026-10-07", "t": "09:00" if fromz == "Asia/Seoul" else "09:00", "from": fromz, "to": tz}, exp, name=f"tz-{fromz}-{tz}")
case("timezone", {"d": "2026-01-15", "t": "09:00", "from": "Asia/Seoul", "to": "America/Los_Angeles"}, "1월 14일 수요일 오후 4:00", name="tz-winter-la")

# ---- health ----
case("bmr", {"sex": "m", "age": "30", "h": "172", "w": "68", "act": "1.2"}, "기초대사량 1,610 kcal", "하루 소비 1,932 kcal")
case("bmr", {"sex": "f", "age": "30", "h": "160", "w": "52", "act": "1.375"}, "기초대사량 1,209", "1,662", name="bmr-f")
case("idealweight", {"h": "170", "w": "70"}, "표준체중 63.6kg", "53.5 ~ 66.2kg", "6.4kg 많습니다")
case("calories", {"met": "7", "w": "68", "m": "40"}, "약 333 kcal")
case("sleep", {"w": "07:00", "f": "15"}, "21:45 취침", "23:15 취침", "00:45 취침")
case("sleep", {"w": "00:10", "f": "15"}, "14:55 취침", "16:25 취침", "17:55 취침", name="sleep-wrap")
case("pace", {"d": "5", "hh": "0", "mm": "28", "ss": "30"}, "5'42\"", "10.53 km/h", "10km 57분 0초")
case("bodyfat", {"sex": "m", "h": "175", "w": "82", "n": "38", "p": "95"}, "14.5%")
case("bodyfat", {"sex": "m", "h": "175", "w": "30", "n": "38", "p": "95"}, "허리둘레가 목둘레보다", name="bodyfat-invalid")
case("protein", {"w": "70", "g": "1.6:2.2"}, "하루 112 ~ 154g")
case("heartrate", {"a": "30", "r": "60"}, "최대 심박수 약 190bpm", "125 ~ 138bpm")
case("onerm", {"w": "60", "r": "8"}, "추정 1RM 약 76kg", "68.4kg")
case("heightpred", {"s": "m", "f": "175", "m": "162"}, "예상 키 약 175cm")
case("heightpred", {"s": "f", "f": "175", "m": "162"}, "예상 키 약 162cm", name="heightpred-f")
case("dietplan", {"c": "75", "t": "68", "w": "0.5"}, "약 14주", "약 550kcal")
case("dietplan", {"c": "60", "t": "70", "w": "0.5"}, "낮게 입력", name="dietplan-wrong")
case("water", {"w": "65", "a": "30"}, "운동 30분 추가 약 350ml")

# ---- tools ----
case("average", {"nums": "85 92 78 90 66"}, "합계 411", "평균 82.2", "중앙값 85", "최대 92", "최소 66")
case("average", {"nums": "1,2,3,4"}, "평균 2.5", "중앙값 2.5", name="average-even")
case("gpa", {"scale": "45", "rows": "3 A+\n3 B0\n2 A0\n3 C+\n1 B+"}, "평균평점 3.46 / 4.5", "이수 학점 12")
case("gpa", {"scale": "43", "rows": "3 A+\n3 A-\n3 B0"}, "평균평점 3.67 / 4.3", name="gpa-43")
case("gpa", {"scale": "45", "rows": "3 A+\n3 F"}, "평균평점 2.25", "취득 학점 3", name="gpa-F")
case("ratio", {"w": "1920", "h": "1080", "nw": "1280"}, "16:9", "1280 × 720")
case("ratio", {"w": "1000", "h": "750", "nw": "800"}, "4:3", "800 × 600", name="ratio-43")
case("base", {"n": "255", "b": "10"}, "11111111", "377", "FF")
case("base", {"n": "ff", "b": "16"}, "10진수 255", name="base-hex")
case("base", {"n": "102", "b": "2"}, "맞지 않는 숫자", name="base-invalid")
case("roman", {"n": "2026"}, "MMXXVI")
case("roman", {"n": "MCMXCIV"}, "1994", name="roman-rev")
case("roman", {"n": "3999"}, "MMMCMXCIX", name="roman-max")
case("roman", {"n": "4000"}, "1~3999", name="roman-over")
case("roman", {"n": "IIII"}, "올바른 로마 숫자가 아닙니다", name="roman-bad")
case("primes", {"n": "360"}, "360 = 2", "합성수입니다")
case("primes", {"n": "97"}, "소수입니다", name="primes-97")
case("primes", {"n": "1"}, "2 이상", name="primes-1")
case("gcdlcm", {"a": "24", "b": "36", "c": "0"}, "최대공약수 12", "최소공배수 72")
case("gcdlcm", {"a": "12", "b": "18", "c": "30"}, "최대공약수 6", "최소공배수 180", name="gcdlcm-3")
case("proportion", {"a": "3", "b": "5", "c": "12"}, "3 : 5 = 12 : 20")
case("koreanmoney", {"n": "1234567"}, "백이십삼만사천오백육십칠원", "일금 일백이십삼만사천오백육십칠원정")
case("koreanmoney", {"n": "100"}, "백원", "일금 일백원정", name="koreanmoney-100")
case("koreanmoney", {"n": "10000"}, "일만원", name="koreanmoney-10000")
case("koreanmoney", {"n": "100000000"}, "일억원", name="koreanmoney-1e8")
case("sms", {"t": "안녕하세요"}, "10바이트", "단문(SMS)")
case("sms", {"t": "가" * 46}, "92바이트", "장문(LMS)", name="sms-lms")
case("colorconv", {"c": "#ff8a1f"}, "HEX #FF8A1F", "RGB 255, 138, 31", "HSL 29, 100%, 56%")
case("colorconv", {"c": "255,138,31"}, "HEX #FF8A1F", name="colorconv-rgb")
case("colorconv", {"c": "#f80"}, "RGB 255, 136, 0", name="colorconv-short")
case("colorconv", {"c": "#000"}, "HSL 0, 0%, 0%", name="colorconv-black")
case("colorconv", {"c": "256,0,0"}, "0~255", name="colorconv-over")
case("datasize", {"n": "1", "u": "3", "b": "1024"}, "1,073,741,824 B", "1,024 MB")
case("datasize", {"n": "1", "u": "3", "b": "1000"}, "1,000,000,000 B", name="datasize-1000")
case("dltime", {"s": "10", "u": "1024", "sp": "500"}, "약 2분 44초", "62.5MB/s")
case("textcase", {"t": "hello World"}, "HELLO WORLD", "hello world", "Hello World")

if __name__ == "__main__":
    json.dump(cases, open("tests/cases.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(cases), "cases")
