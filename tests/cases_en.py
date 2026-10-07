"""Reference cases for the English calculators (site/en). Expected values are computed here from the plain formulas,
not copied from page output. Output: tests/cases_en.json (consumed by tests/qa.js with CASES=cases_en.json).
Frozen 'today' = 2026-10-07 (UTC)."""
import json, math, datetime as dt

TODAY = dt.date(2026, 10, 7)
cases = []
def case(slug, inputs, *expect, click=None, name=None):
    cases.append(dict(slug=slug, inputs=inputs, expect=list(expect), click=click, name=name or slug))

def M(x):
    s = f"{abs(x):,.2f}"
    return ("-" if x < 0 and float(s.replace(",", "")) != 0 else "") + "$" + s

def n2(x, d):
    s = f"{x:,.{d}f}"
    return s.rstrip("0").rstrip(".") if "." in s else s

def half_up(x): return int(math.floor(x + 0.5))
def I0(x): return f"{half_up(x):,}"
def fd(d): return d.strftime("%a, %b ") + str(d.day) + d.strftime(", %Y")

# ---- finance ----
P, r, n = 250000, 0.065 / 12, 360
pmt = P * r / (1 - (1 + r) ** -n)
case("loan", {"a": "250000", "r": "6.5", "y": "30", "x": "0"}, "Monthly payment " + M(pmt), "Total interest " + M(pmt * n - P), "Total paid " + M(pmt * n),
     "First payment: " + M(P * r) + " interest + " + M(pmt - P * r) + " principal")
b, m, ti = P, 0, 0.0
while b > 0.005 and m < 1200:
    it = b * r; ti += it; pr = min(pmt + 200 - it, b); b -= pr; m += 1
case("loan", {"a": "250000", "r": "6.5", "y": "30", "x": "200"}, f"debt-free in {m // 12} yr {m % 12} mo", "pay " + M(ti) + " interest", "saves " + M(pmt * n - P - ti), name="loan-extra")
case("loan", {"a": "12000", "r": "0", "y": "2", "x": "0"}, "Monthly payment $500.00", "Total interest $0.00", name="loan-0rate")
def fv(p, c, rate, years, f):
    i = (1 + rate / f) ** (f / 12) - 1; k = years * 12; g = (1 + i) ** k
    return p * g + (c * k if i == 0 else c * (g - 1) / i)
case("compound", {"p": "10000", "m": "200", "r": "7", "y": "20", "f": "12"}, "Future value " + M(fv(10000, 200, .07, 20, 12)), "Total contributed " + M(58000), "Interest earned " + M(fv(10000, 200, .07, 20, 12) - 58000))
case("compound", {"p": "10000", "m": "0", "r": "7", "y": "10", "f": "1"}, "Future value " + M(10000 * 1.07 ** 10), name="compound-annual")
case("compound", {"p": "5000", "m": "100", "r": "0", "y": "5", "f": "12"}, "Future value $11,000.00", name="compound-0rate")
case("cagr", {"a": "10000", "b": "15000", "y": "5"}, "Total return 50%", "CAGR " + n2(((1.5) ** .2 - 1) * 100, 2) + "% per year", "Gain / loss $5,000.00")
case("cagr", {"a": "20000", "b": "10000", "y": "3"}, "Total return -50%", "CAGR " + n2((0.5 ** (1 / 3) - 1) * 100, 2) + "%", "-$10,000.00", name="cagr-loss")
avg = (100 * 10 + 80 * 20) / 30
case("avgprice", {"p1": "100", "q1": "10", "p2": "80", "q2": "20", "p3": "0", "q3": "0", "now": "90"}, "Average cost " + M(avg), "Total invested " + M(2600), M((90 - avg) * 30) + " (" + n2((90 / avg - 1) * 100, 2) + "%)")
t, c, mo, rt = 20000, 1000, 400, 0.03 / 12
nn = math.ceil(math.log((t * rt + mo) / (c * rt + mo)) / math.log(1 + rt))
case("savegoal", {"t": "20000", "c": "1000", "m": "400", "r": "3"}, f"About {nn} months ({nn // 12} yr {nn % 12} mo)", "Total deposited " + M(mo * nn + c))
case("savegoal", {"t": "1000", "c": "2000", "m": "100", "r": "3"}, "already reached", name="savegoal-done")
case("inflation", {"a": "1000", "r": "3", "y": "10"}, "will cost " + M(1000 * 1.03 ** 10), "buys today " if False else "what " + M(1000 / 1.03 ** 10) + " buys today")
case("dividend", {"p": "50", "d": "2", "q": "100", "tax": "15"}, "Dividend yield 4%", "Yearly dividends $200.00", "$170.00 after tax", "About $14.17 per month")
case("apy", {"r": "4.5", "n": "12"}, "APY " + n2(((1 + .045 / 12) ** 12 - 1) * 100, 4) + "%")
case("apy", {"r": "5", "n": "0"}, "APY " + n2((math.e ** .05 - 1) * 100, 4) + "%", name="apy-continuous")
bal, yrs = 50000, 0
while bal < 1000000: bal = bal * 1.05 + 15000; yrs += 1
case("fire", {"s": "40000", "w": "4", "c": "50000", "m": "15000", "r": "5"}, "Target savings $1,000,000.00", f"about {yrs} years")
case("fire", {"s": "40000", "w": "4", "c": "2000000", "m": "0", "r": "5"}, "already there", name="fire-done")

# ---- salary & work ----
case("salary", {"a": "25", "per": "h", "hpw": "40", "dpw": "5", "wpy": "52"}, "Hourly $25.00", "Daily $200.00", "Weekly $1,000.00", "Biweekly $2,000.00", "Monthly $4,333.33", "Yearly $52,000.00")
case("salary", {"a": "6000", "per": "m", "hpw": "40", "dpw": "5", "wpy": "52"}, "Yearly $72,000.00", "Hourly " + M(72000 / 2080), name="salary-monthly")
real = (1.04 / 1.03 - 1) * 100
case("raise", {"c": "50000", "p": "4", "i": "3"}, "New salary $52,000.00", "$2,000.00 more per year", "$166.67 per month", "raise is " + n2(real, 2) + "%")
case("raise", {"c": "50000", "p": "2", "i": "5"}, "lose purchasing power", name="raise-negative-real")
case("overtime", {"r": "20", "h": "40", "o": "6", "om": "1.5", "d": "0", "dm": "2"}, "Total pay $980.00", "Regular $800.00", "Overtime $180.00", "Overtime rate $30.00 per hour")
case("overtime", {"r": "20", "h": "40", "o": "6", "om": "1.5", "d": "2", "dm": "2"}, "Total pay $1,060.00", "Double time $80.00", name="overtime-double")
case("tip", {"b": "85", "t": "18", "n": "2", "rd": "no"}, "Tip $15.30", "Total $100.30", "Each person pays $50.15")
case("tip", {"b": "85", "t": "18", "n": "2", "rd": "up"}, "Tip $17.00", "Total $102.00", "Each person pays $51.00", name="tip-roundup")
case("salestax", {"a": "100", "r": "20", "m": "add"}, "Tax $20.00", "Total $120.00")
case("salestax", {"a": "120", "r": "20", "m": "rem"}, "Tax $20.00", "Net price $100.00", name="salestax-remove")
case("discount", {"p": "100", "d1": "20", "d2": "10", "c": "0"}, "Final price $72.00", "You save $28.00 (28% off", "After the first discount: $80.00")
case("discount", {"p": "100", "d1": "50", "d2": "0", "c": "60"}, "Final price $0.00", name="discount-floor")

# ---- business ----
case("margin", {"c": "40", "m": "p", "p": "100", "t": "30"}, "Margin 60%", "Markup 150%", "Profit per unit $60.00")
case("margin", {"c": "40", "m": "t", "p": "100", "t": "30"}, "Selling price " + M(40 / 0.7), "Markup " + n2((1 / 0.7 - 1) * 100, 2) + "%", name="margin-target")
case("margin", {"c": "40", "m": "t", "p": "100", "t": "100"}, "below 100%", name="margin-100")
case("breakeven", {"f": "3000", "p": "25", "c": "10", "t": "0"}, "Break-even: 200 units", "Revenue needed $5,000.00", "Contribution per unit $15.00 (60%)")
case("breakeven", {"f": "3000", "p": "25", "c": "10", "t": "1500"}, "Units for target profit: 300 units", name="breakeven-target")
case("breakeven", {"f": "3000", "p": "10", "c": "12", "t": "0"}, "must be higher", name="breakeven-neg")
case("roas", {"s": "1000", "r": "4000", "m": "40"}, "ROAS 4x", "break-even ROAS 2.5x", "Profit after ad spend $600.00", "Ad ROI 60%")
case("roas", {"s": "1000", "r": "2000", "m": "40"}, "You lose money", name="roas-loss")

# ---- life ----
case("fuel", {"u": "us", "d": "300", "e": "30", "p": "3.5"}, "Fuel needed 10 US gal", "Fuel cost $35.00", "$0.12 per mile")
case("fuel", {"u": "met", "d": "500", "e": "7", "p": "1.8"}, "Fuel needed 35 L", "Fuel cost $63.00", "$0.13 per km", name="fuel-metric")
case("unitprice", {"p1": "3.99", "q1": "500", "p2": "6.49", "q2": "1000", "p3": "0", "q3": "0"}, "Item A: $0.80 per 100 units", "Item B: $0.65 per 100 units (best value)", "Best value is " + n2((0.00798 / 0.00649 - 1) * 100, 1) + "% cheaper")
case("petage", {"k": "dog", "a": "5", "s": "5"}, "About 39 human years", "DNA-methylation formula: " + n2(16 * math.log(5) + 31, 1) + " human years")
case("petage", {"k": "cat", "a": "5", "s": "5"}, "About 36 human years", name="petage-cat")

# ---- date & time ----
b = dt.date(1995, 6, 15)
days = (TODAY - b).days
case("age", {"b": "1995-06-15", "t": "2026-10-07"}, "31 years, 3 months, 22 days", f"{days:,} days lived", "Next birthday: " + fd(dt.date(2027, 6, 15)) + f" (in {(dt.date(2027, 6, 15) - TODAY).days} days)")
case("age", {"b": "2000-10-07", "t": "2026-10-07"}, "26 years, 0 months, 0 days", "today!", name="age-on-birthday")
case("age", {"b": "2000-02-29", "t": "2026-03-01"}, "26 years, 0 months, 1 day", name="age-leap")
case("age", {"b": "2030-01-01", "t": "2026-10-07"}, "must be after", name="age-future")
case("datediff", {"a": "2026-01-01", "b": "2026-10-07", "i": "0"}, "279 days", "39 weeks 6 days", "0 years, 9 months, 6 days")
case("datediff", {"a": "2026-01-01", "b": "2026-10-07", "i": "1"}, "280 days", name="datediff-inclusive")
case("datediff", {"a": "2026-01-31", "b": "2026-03-01", "i": "0"}, "29 days", "0 years, 1 month, 1 day", name="datediff-monthend")
case("datediff", {"a": "2026-10-07", "b": "2026-01-01", "i": "0"}, "must be after", name="datediff-reverse")
case("dateadd", {"b": "2026-10-07", "dir": "1", "n": "90", "u": "d"}, fd(TODAY + dt.timedelta(days=90)))
case("dateadd", {"b": "2026-01-31", "dir": "1", "n": "1", "u": "m"}, fd(dt.date(2026, 2, 28)), name="dateadd-monthend")
case("dateadd", {"b": "2026-10-07", "dir": "-1", "n": "2", "u": "w"}, fd(dt.date(2026, 9, 23)), name="dateadd-sub")
case("dateadd", {"b": "2024-02-29", "dir": "1", "n": "1", "u": "y"}, fd(dt.date(2025, 2, 28)), name="dateadd-leap")
def bd(a, b):
    c = 0; d = a
    while d <= b:
        if d.weekday() < 5: c += 1
        d += dt.timedelta(days=1)
    return c
a1, b1 = dt.date(2026, 10, 7), dt.date(2026, 11, 6)
case("bizdays", {"a": "2026-10-07", "b": "2026-11-06", "h": "0"}, f"{bd(a1, b1)} business days", "31 calendar days")
case("bizdays", {"a": "2026-10-07", "b": "2026-11-06", "h": "2"}, f"{bd(a1, b1) - 2} business days", name="bizdays-holidays")
case("weeknum", {"d": "2026-10-07"}, "Week 41 of 2026", "Wednesday", "Day 280 of the year", "85 days left", "Q4")
case("weeknum", {"d": "2027-01-01"}, "Week 53 of 2026", "Friday", name="weeknum-year-boundary")
case("weeknum", {"d": "2024-12-30"}, "Week 1 of 2025", name="weeknum-w1-next-year")
case("timezone", {"d": "2026-10-07", "t": "09:00", "from": "UTC", "to": "America/New_York"}, "Wednesday, October 7, 2026", "5:00 AM EDT")
case("timezone", {"d": "2026-01-15", "t": "09:00", "from": "Europe/London", "to": "Asia/Tokyo"}, "Thursday, January 15, 2026", "6:00 PM GMT+9", name="timezone-winter")
case("timezone", {"d": "2026-07-01", "t": "09:00", "from": "Europe/London", "to": "Asia/Tokyo"}, "5:00 PM GMT+9", name="timezone-summer")
case("timezone", {"d": "2026-03-08", "t": "03:30", "from": "America/New_York", "to": "UTC"}, "7:30 AM UTC", name="timezone-dst-start")
case("timediff", {"a": "09:00", "b": "17:30", "k": "30"}, "8 h 0 min", "8 hours")
case("timediff", {"a": "22:00", "b": "06:00", "k": "0"}, "8 h 0 min", name="timediff-overnight")
case("timediff", {"a": "09:00", "b": "09:10", "k": "30"}, "break is longer", name="timediff-break")
case("timesum", {"l": "1:30\n2:45\n0:50"}, "5:05:00", "5.08 hours")
case("timesum", {"l": "0:45\n0:45\nabc"}, "1:30:00", "1 line(s) ignored", name="timesum-bad")

# ---- health ----
case("bmi", {"u": "m", "h": "170", "hi": "0", "w": "68"}, "BMI 23.5", "Healthy weight", "53.5 kg to 72 kg")
w_i = 154 * 0.45359237; h_i = (5 * 12 + 7) * 0.0254
case("bmi", {"u": "i", "h": "5", "hi": "7", "w": "154"}, "BMI " + n2(w_i / h_i ** 2, 1), "Healthy weight", name="bmi-imperial")
case("bmi", {"u": "m", "h": "175", "hi": "0", "w": "110"}, "BMI 35.9", "Obesity class II", name="bmi-obese2")
case("bmi", {"u": "m", "h": "175", "hi": "0", "w": "50"}, "BMI 16.3", "Underweight", name="bmi-under")
bm = 10 * 72 + 6.25 * 175 - 5 * 30 + 5
case("bmr", {"sex": "m", "a": "30", "u": "m", "h": "175", "w": "72", "act": "1.375"}, f"BMR {I0(bm)} kcal/day", f"Maintenance (TDEE) {I0(bm * 1.375)} kcal/day", f"~{I0(bm * 1.375 - 500)} kcal")
case("bmr", {"sex": "f", "a": "30", "u": "m", "h": "165", "w": "60", "act": "1.2"}, f"BMR {I0(10 * 60 + 6.25 * 165 - 150 - 161)} kcal/day", name="bmr-female")
o = 175 / 2.54 - 60
case("idealweight", {"sex": "m", "u": "m", "h": "175"}, "Devine: " + n2(50 + 2.3 * o, 1) + " kg", "Robinson: " + n2(52 + 1.9 * o, 1) + " kg", "Miller: " + n2(56.2 + 1.41 * o, 1) + " kg", "Hamwi: " + n2(48 + 2.7 * o, 1) + " kg")
case("idealweight", {"sex": "f", "u": "i", "h": "40"}, "at least 58 in", name="idealweight-short")
L = math.log10
bf = 495 / (1.0324 - 0.19077 * L(85 - 38) + 0.15456 * L(178)) - 450
case("bodyfat", {"sex": "m", "u": "m", "h": "178", "w": "85", "n": "38", "p": "95"}, "Body fat about " + n2(bf, 1) + "%")
bff = 495 / (1.29579 - 0.35004 * L(80 + 98 - 33) + 0.221 * L(165)) - 450
case("bodyfat", {"sex": "f", "u": "m", "h": "165", "w": "80", "n": "33", "p": "98"}, "Body fat about " + n2(bff, 1) + "%", name="bodyfat-female")
case("bodyfat", {"sex": "m", "u": "m", "h": "178", "w": "30", "n": "38", "p": "0"}, "Waist must be larger", name="bodyfat-bad")
case("water", {"u": "m", "w": "60", "a": "30"}, "About 1.8 L (" + n2(1800 / 29.5735, 0) + " fl oz) to 2.1 L", "350 ml")
case("protein", {"u": "m", "w": "70", "g": "1.6:2.2"}, "112 – 154 g per day")
case("protein", {"u": "i", "w": "154", "g": "0.8:1.0"}, f"{half_up(154 * 0.45359237 * 0.8)} – {half_up(154 * 0.45359237)} g", name="protein-lb")
zones = [(.5, .6), (.6, .7), (.7, .8), (.8, .9)]
f = lambda p: half_up(60 + (185 - 60) * p)
case("heartrate", {"a": "35", "r": "60"}, "max heart rate 185 bpm", f"Fat burn: {f(.6)} – {f(.7)} bpm", f"Hard: {f(.8)} – {f(.9)} bpm")
case("heartrate", {"a": "35", "r": "0"}, f"Aerobic: {half_up(185 * .7)} – {half_up(185 * .8)} bpm", name="heartrate-norest")
case("onerm", {"w": "100", "r": "5"}, "1RM about 116.7", "112.5 (Brzycki)", "90%: 105")
case("pace", {"d": "5", "hh": "0", "mm": "28", "ss": "30"}, "Pace 5:42 /km", "9:10 /mile", "10.53 km/h", "10 km 57:00", "half marathon 2:00:15", "marathon 4:00:31")

# ---- math & converters ----
case("percent", {"m": "of", "x": "20", "y": "150"}, "30")
case("percent", {"m": "is", "x": "30", "y": "150"}, "20%")
case("percent", {"m": "chg", "x": "80", "y": "100"}, "+25%", "increase", name="percent-change")
case("percent", {"m": "chg", "x": "100", "y": "75"}, "-25%", "decrease", name="percent-decrease")
case("percent", {"m": "inc", "x": "200", "y": "15"}, "230", name="percent-inc")
case("percent", {"m": "dec", "x": "200", "y": "15"}, "170", name="percent-dec")
case("unit", {"x": "1", "f": "km", "t": "mi"}, "1 km = 0.6213711922 mi")
case("unit", {"x": "100", "f": "c", "t": "f"}, "100 \u00b0C = 212 \u00b0F", name="unit-temp")
case("unit", {"x": "-40", "f": "f", "t": "c"}, "-40 \u00b0F = -40 \u00b0C", name="unit-temp-neg")
case("unit", {"x": "1", "f": "lb", "t": "kg"}, "0.45359237 kg", name="unit-lb")
case("unit", {"x": "1", "f": "km", "t": "kg"}, "same type", name="unit-mismatch")
case("unit", {"x": "1", "f": "ac", "t": "m2"}, "4046.856422 m\u00b2", name="unit-acre")
case("unit", {"x": "1", "f": "gal", "t": "l"}, "3.785411784 L", name="unit-gal")
case("unit", {"x": "abc", "f": "km", "t": "mi"}, "Enter a number", name="unit-nan")
case("average", {"l": "12, 15, 15, 20, 28"}, "Mean 18", "Median 15", "Mode 15", "Sum 90", "Range 16", "5.6214 (population)", "6.2849 (sample)")
case("average", {"l": "1 2 3 4"}, "Median 2.5", "Mode none", name="average-even")
case("average", {"l": "1, x"}, "Enter numbers", name="average-bad")
case("gcdlcm", {"l": "12, 18, 30"}, "GCD (greatest common divisor) 6", "LCM (least common multiple) 180")
case("primes", {"n": "360"}, "360 = 2", "Divisors: 1, 2, 3, 4, 5, 6, 8, 9, 10, 12")
case("primes", {"n": "97"}, "97 is prime", name="primes-prime")
case("base", {"x": "255", "f": "10"}, "Binary 11111111", "Octal 377", "Hex FF")
case("base", {"x": "ff", "f": "16"}, "Decimal 255", name="base-hex")
case("base", {"x": "102", "f": "2"}, "not a valid base-2", name="base-bad")
case("roman", {"x": "2026"}, "MMXXVI")
case("roman", {"x": "MCMXCIV"}, "1994", name="roman-back")
case("roman", {"x": "IIII"}, "not a standard", name="roman-bad")
case("ratio", {"w": "1920", "h": "1080", "nw": "1280"}, "Aspect ratio 16:9", "height is 720")
case("textcase", {"t": "hello World foo", "m": "ca"}, "helloWorldFoo", name="textcase-camel")
case("textcase", {"t": "hello World foo", "m": "sn"}, "hello_world_foo", name="textcase-snake")
case("textcase", {"t": "hello World. second one", "m": "se"}, "Hello world. Second one", name="textcase-sentence")
case("textcase", {"t": "hello World", "m": "ti"}, "Hello World", name="textcase-title")
case("textcase", {"t": "<b>x</b>", "m": "up"}, "<B>X</B>", name="textcase-escape")
case("datasize", {"x": "1", "f": "1e9"}, "1,000,000,000 bytes", "1 GB", "0.931323 GiB")
case("datasize", {"x": "1", "f": "1073741824"}, "1,073,741,824 bytes", "1.073742 GB", name="datasize-gib")

if __name__ == "__main__":
    json.dump(cases, open("tests/cases_en.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(cases), "cases")
