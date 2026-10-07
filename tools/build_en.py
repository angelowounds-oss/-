"""English edition of the site -> site/en/. Called from build.py (run(B) with the build module)."""
import os, re, html, glob
import tools_en

EN_STR = dict(lang="en", locale="en_US", brand="Simple Calc", prefix="/en", related="Related calculators", faq="Frequently asked questions",
              blank="Please fill in every field.", neg="Please enter 0 or a positive number.",
              bad="Please check your input. Some calculations cannot run with zero values.",
              fbq="Was this calculator helpful?", fb_up="Helpful", fb_down="Not helpful", fb_link="Send feedback")

EN_CATS = [("fin", "Finance & Investing"), ("pay", "Salary & Work"), ("biz", "Business"), ("life", "Everyday Life"),
           ("date", "Date & Time"), ("health", "Health & Fitness"), ("tool", "Math & Converters"), ("play", "Random & Fun")]

HELPERS_EN = r'''const X=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CUR=(()=>{try{const c=localStorage.getItem('cur');return c===null?'$':c}catch(e){return '$'}})();
const W=n=>{n=Math.round(n*100)/100+0;return (n<0?'-':'')+CUR+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})};
const I0=n=>(Math.round(n)+0).toLocaleString('en-US');
const N2=(n,d)=>((+n.toFixed(d))+0).toLocaleString('en-US',{maximumFractionDigits:d});
const P=s=>{const a=s.split('-').map(Number);return new Date(a[0],a[1]-1,a[2])};
const DAYS=(a,b)=>Math.round((b-a)/864e5);
const FD=d=>d.toLocaleDateString('en-US',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
const DOW=d=>['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
const pad=n=>String(n).padStart(2,'0');
const _t=new Date();const TODAY=_t.getFullYear()+'-'+pad(_t.getMonth()+1)+'-'+pad(_t.getDate());'''

L_EN = ("window.__L={screen:'Theme: ',mode:{auto:'auto',dark:'dark',light:'light'},fav:'☆ Save',unfav:'★ Saved',"
        "up:'Thanks! Glad it helped.',down:'Thanks for letting us know. We will look into it.',copied:'Copied',kicker:'Calculation',brand:'Simple Calc',"
        "cta:'Try it yourself',cardLabel:'Image card',cardAlt:' result image card',cardTip:'Long-press (or right-click) the image to save it',"
        "download:'Download',close:'Close',share:'Copy result to share',mkCard:'Create image card',ns:':en',"
        "shareNote:'The share link includes the numbers you entered. Be careful with sensitive values.'};")


def nav_en():
    return ('<header><a href="index.html" class="logo">Simple Calc</a><nav><a href="index.html#popular">Popular</a><a href="index.html#all">All calculators</a>'
            '<a href="about.html">About</a><a href="../" lang="ko" hreflang="ko">한국어</a></nav></header>')


FOOT_EN = ('<footer><span class="note">Results are estimates for information only. Double-check anything important. What you type never leaves your browser.</span>'
           '<span class="theme" role="group" aria-label="Pick an accent colour">Accent <button type="button" data-c="#c8f542" aria-label="Lime"></button><button type="button" data-c="#ffe14d" aria-label="Yellow"></button>'
           '<button type="button" data-c="#7ee0ff" aria-label="Sky blue"></button><button type="button" data-c="#ff9ec7" aria-label="Pink"></button></span>'
           '<label class="cur">Currency <select id="cur" aria-label="Currency symbol"><option value="$">$</option><option value="€">€</option><option value="£">£</option>'
           '<option value="¥">¥</option><option value="₹">₹</option><option value="₩">₩</option><option value="">none</option></select></label>'
           '<button type="button" class="modebtn">Theme: auto</button>'
           '<span class="fl"><a href="about.html">About</a><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a></span></footer>')

POPULAR = [("compound", "$", "Compound Interest", "See your money grow", "#c8f542", "-1deg"),
           ("loan", "%", "Loan Payment", "Monthly payment and interest", "#7ee0ff", "1.2deg"),
           ("bmi", "BMI", "BMI Calculator", "Metric or imperial", "#ffe14d", "-.8deg"),
           ("percent", "%", "Percentage", "Percent of, change, discount", "#ff9ec7", "1deg"),
           ("unit", "ft", "Unit Converter", "Length, weight, temperature", "#cdb8ff", "-1.4deg"),
           ("age", "Age", "Age Calculator", "Exact age and next birthday", "#b9f27a", "1.2deg"),
           ("salary", "$/h", "Salary Converter", "Hourly to yearly pay", "#ffc9a8", "-1deg"),
           ("tip", "Tip", "Tip and Split", "Share a bill fairly", "#9db8ff", "1.1deg"),
           ("savegoal", "Goal", "Savings Goal", "How long to reach it", "#ffe14d", "-1.2deg"),
           ("datediff", "Days", "Days Between Dates", "Years, months, days", "#7ee0ff", "1.3deg")]

SEARCH_JS = '''<script>(function(){const q=document.getElementById('q');
function apply(){const s=q.value.trim().toLowerCase();let any=false;
document.querySelectorAll('#all .pill').forEach(a=>{const ok=!s||(a.dataset.q||'').toLowerCase().includes(s);a.hidden=!ok;if(ok)any=true});
document.querySelectorAll('.grp').forEach(g=>{g.hidden=[...g.querySelectorAll('.pill')].every(r=>r.hidden);if(s)g.open=true});
document.getElementById('empty').hidden=any;document.getElementById('popular').hidden=!!s;document.getElementById('mine').hidden=!!s||!document.getElementById('minelist').children.length}
q.addEventListener('input',apply);
if(window.matchMedia&&matchMedia('(max-width:640px)').matches)document.querySelectorAll('.grp').forEach((g,i)=>{if(i>1)g.open=false});
document.addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement!==q){e.preventDefault();q.focus()}})})();</script>'''


def slugs():
    """Slugs of the English tools (used for hreflang pairing before the Korean build runs)."""
    class Fake:
        def __init__(self): self.s = []
        def tool(self, slug, *a, **k): self.s.append(slug)
        N = S = DT = TM = TX = TA = staticmethod(lambda *a, **k: None)
    f = Fake()
    tools_en.define(f)
    return f.s


def render_index(B):
    by = {k: [] for k, _ in B.CATS}
    for s, ti, c, d in B.REG: by[c].append((s, ti, d))
    n = len(B.REG)
    pop = "".join(f'<a href="{s}.html" class="press" style="--bg:{bg};--t:{tl}"><span class="gl">{g}</span><b>{nm}</b><span>{d}</span></a>' for s, g, nm, d, bg, tl in POPULAR)
    groups = ""
    for k, nm in B.CATS:
        if not by[k]: continue
        groups += (f'<details class="grp" style="--bg:var(--f-{k})" open><summary><h3>{nm}</h3><span>{len(by[k])}</span></summary><div class="pills">'
                   + "".join(f'<a class="pill" href="{s}.html" data-q="{ti} {d}">{ti}</a>' for s, ti, d in by[k]) + "</div></details>")
    main = (f'<section class="hero"><div class="hero-l"><div class="note-hand tilt">No sign-up. Free. {n} calculators ✎</div>'
            '<h2>Quick answers, <mark>no fuss</mark></h2>'
            '<p>Money, health, dates and everyday maths. Everything is calculated in your browser, so what you type stays with you.</p>'
            '<form class="sform" onsubmit="return false"><input type="search" id="q" placeholder="Try: loan, BMI, percentage…" aria-label="Search calculators" autocomplete="off">'
            '<button type="submit">Search</button></form></div></section>'
            '<section id="mine" hidden><div class="sec-h"><h2>My calculators</h2><span class="note-hand">Saved and recently used</span></div><div class="pills" id="minelist" style="padding:0"></div></section>'
            '<section id="popular"><div class="sec-h"><h2>Popular calculators</h2><span class="note-hand">Most used first</span></div>'
            f'<div class="stu">{pop}</div></section>'
            '<section id="all"><div class="sec-h"><h2>All calculators</h2><span class="note-hand">Browse by topic</span></div>'
            '<div id="empty" hidden>No calculators found. Try another word.</div>'
            f'<div class="groups">{groups}</div></section>')
    B.write("index.html", B.shell("index.html", "Simple Calc - Free Online Calculators",
            f"{n} free online calculators for loans, savings, BMI, percentages, dates, unit conversion and more. No sign-up, and your data stays in your browser.",
            "Simple Calc", main, SEARCH_JS, hero=True))


def static_pages(B):
    contact = B.CONTACT
    B.write("about.html", B.shell("about.html", "About - Simple Calc", "About Simple Calc", "About",
        '<div class="card"><p>Simple Calc is a free collection of everyday calculators that work instantly with no account. Every calculation runs in your browser and the numbers you type are not stored or sent to a server.</p>'
        '<p>Results are estimates for information only and are not financial, medical, tax or legal advice. For important decisions, check with a qualified professional. Rates, laws and guidelines change, so if you spot an error please tell us and we will fix it.</p>'
        '<h2>How we keep calculators accurate</h2><p>Each calculator states its formula and assumptions on the page. Values that differ by country or change over time, such as tax rates, inflation or withdrawal rates, are inputs that you set yourself rather than hidden constants.</p>'
        + (f'<h2>Contact</h2><p>Send bug reports and suggestions to <b>{contact}</b>.</p>' if contact else '') + '</div>'))
    ad = ('<h2>Advertising</h2><p>This site shows ads served by Google AdSense. Google and its partners may use cookies to show ads based on your visits to this and other sites. Where the law requires it (for example in the EEA, UK and Switzerland), personalised ads are shown only with your consent. You can manage ad personalisation in <a href="https://adssettings.google.com">Google Ad Settings</a>.</p>'
          if B.ADSENSE else
          '<h2>Advertising</h2><p>The site may show third-party ads, such as Google AdSense, to cover running costs. If so, the ad provider may use cookies. Where the law requires it, personalised ads are shown only with your consent. You can manage ad personalisation in <a href="https://adssettings.google.com">Google Ad Settings</a>.</p>')
    priv = ('<div class="card"><h2 style="margin-top:0">What we collect</h2><p>There are no accounts. The numbers you type into a calculator are processed in your browser and are not sent to or stored on our servers.</p>'
            '<h2>Stored in your browser</h2><p>Your saved calculators, recent calculators, accent colour, theme, currency symbol and any habit or checklist entries are kept in your browser&rsquo;s local storage. They stay on your device, and clearing your browser data removes them.</p>'
            '<h2>Share links</h2><p>A calculator address can include the numbers you entered. If you share a link, the recipient can see those numbers, so be careful with sensitive values.</p>'
            + ad
            + ('<h2>Analytics</h2><p>We use GoatCounter, a privacy-friendly service that does not use cookies, to count page views and clicks on the &ldquo;Helpful&rdquo; and &ldquo;Not helpful&rdquo; buttons. It does not collect personal information.</p>' if B.GOATCOUNTER else '')
            + (f'<h2>Contact</h2><p>For privacy questions write to <b>{contact}</b>.</p>' if contact else '')
            + '<p class="reviewed">Effective: October 2026</p></div>')
    B.write("privacy.html", B.shell("privacy.html", "Privacy Policy - Simple Calc", "Privacy policy of Simple Calc", "Privacy Policy", priv))
    B.write("terms.html", B.shell("terms.html", "Terms of Use - Simple Calc", "Terms of use of Simple Calc", "Terms of Use",
        '<div class="card"><h2 style="margin-top:0">Using the site</h2><p>The calculators are free for everyone to use.</p>'
        '<h2>Disclaimer</h2><p>Results are provided for general information and are not guaranteed to be accurate, complete or suitable for any particular purpose. They are not financial, medical, tax or legal advice. You are responsible for any decision you make based on them.</p>'
        '<h2>Advertising</h2><p>Ads may be shown to support the site.</p></div>'))


def run(B, ko_slugs, alt_slugs):
    keys = ["REG", "TOOLS", "CATS", "OUT", "STR", "HELPERS", "nav", "FOOT", "GUIDES", "COMMON_JS", "AD", "faq_ld"]
    saved = {k: getattr(B, k) for k in keys}
    out = os.path.join(B.OUT, "en")
    os.makedirs(out, exist_ok=True)
    for f in glob.glob(os.path.join(out, "*")): os.remove(f)
    try:
        B.REG, B.TOOLS, B.CATS = [], [], EN_CATS
        B.OUT = out
        B.STR = dict(EN_STR)
        B.HELPERS = HELPERS_EN
        B.nav, B.FOOT = nav_en, FOOT_EN
        B.GUIDES = {}
        B.COMMON_JS = "\n" + L_EN + "\n" + saved["COMMON_JS"]
        B.AD = '<div class="ad"><!-- ad slot --></div>'
        B.faq_ld = lambda faq: __import__("json").dumps({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": html.unescape(q), "acceptedAnswer": {"@type": "Answer", "text": html.unescape(re.sub(r"<[^>]+>", "", a))}} for q, a in faq]}, ensure_ascii=False)
        tools_en.define(B)
        for t in B.TOOLS:
            t["title"] = t["title"].replace("&", "&amp;")
        B.REG[:] = [(s, ti.replace("&", "&amp;"), c, d) for s, ti, c, d in B.REG]
        for t in B.TOOLS: B.render_tool(t)
        B.EN_PAGES = ["en/"] + ["en/" + t["slug"] + ".html" for t in B.TOOLS] + ["en/about.html", "en/terms.html", "en/privacy.html"]
        render_index(B)
        static_pages(B)
        B.inject_common()
        for fn in glob.glob(os.path.join(out, "*.html")):
            s = open(fn, encoding="utf-8").read()
            for a in ("style.css", "favicon.svg", "apple-touch-icon.png"):
                s = s.replace(f'href="{a}"', f'href="../{a}"')
            open(fn, "w", encoding="utf-8").write(s)
        src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "og-en.png")
        if os.path.exists(src):
            import shutil
            shutil.copy(src, os.path.join(out, "og.png"))
        n = len(B.TOOLS)
    finally:
        for k, v in saved.items(): setattr(B, k, v)
    return n
