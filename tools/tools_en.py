"""English tool definitions (language-neutral calculators only). Loaded by build_en.py."""


def define(B):
    tool, N, S, DT, TM, TX, TA = B.tool, B.N, B.S, B.DT, B.TM, B.TX, B.TA

    # ================= FINANCE =================
    tool("loan", "Loan & Mortgage Payment Calculator", "fin", "monthly payment and total interest",
         "Calculate the monthly payment, total interest and payoff time for a fixed-rate loan or mortgage, with an optional extra monthly payment.",
         [N("a", "Loan amount", 250000), N("r", "Annual interest rate (%)", 6.5, "0.01"), N("y", "Loan term (years)", 30), N("x", "Extra payment per month (optional)", 0)],
         r'''const P0=v.a,r=v.r/1200,n=Math.round(v.y*12);if(!(P0>0&&n>0))return '';
const pmt=r===0?P0/n:P0*r/(1-Math.pow(1+r,-n));
let o='<b>Monthly payment '+W(pmt)+'</b><br>Total interest '+W(pmt*n-P0)+' · Total paid '+W(pmt*n)+'<br><small>First payment: '+W(P0*r)+' interest + '+W(pmt-P0*r)+' principal</small>';
if(v.x>0){let b=P0,m=0,ti=0;const pay=pmt+v.x;while(b>0.005&&m<1200){const it=b*r;ti+=it;let pr=pay-it;if(pr>b)pr=b;b-=pr;m++}
o+='<br><small>With '+W(v.x)+' extra each month you are debt-free in '+Math.floor(m/12)+' yr '+(m%12)+' mo and pay '+W(ti)+' interest (saves '+W(pmt*n-P0-ti)+').</small>'}
return o;''',
         "<h2>How it works</h2><p>This calculator uses the standard amortisation formula: payment = P × r ÷ (1 − (1 + r)<sup>−n</sup>), where P is the amount borrowed, r is the monthly rate (annual rate ÷ 12) and n is the number of monthly payments. Early payments are mostly interest; over time more of each payment goes to principal. The result excludes taxes, insurance, fees and any rate changes, so your lender&rsquo;s figure may differ.</p>",
         [("Why is so much of my early payment interest?", "Interest is charged on the remaining balance. At the start the balance is largest, so interest is largest. As the balance falls, a bigger share of the same payment reduces principal."),
          ("How much does an extra payment help?", "Extra money goes straight to principal, which cuts future interest. Try 50 or 100 per month in the box above to see the years and interest you save."),
          ("Does it work for car loans and personal loans?", "Yes, for any loan with fixed monthly payments and a fixed rate. Variable-rate loans will change over time.")])

    tool("compound", "Compound Interest Calculator", "fin", "with monthly contributions",
         "See how an initial amount and regular monthly contributions grow with compound interest over time.",
         [N("p", "Starting amount", 10000), N("m", "Monthly contribution", 200), N("r", "Annual return (%)", 7, "0.01"), N("y", "Years", 20),
          S("f", "Compounding", [("12", "Monthly"), ("1", "Annually"), ("4", "Quarterly"), ("365", "Daily")])],
         r'''const f=+v.f,i=Math.pow(1+v.r/100/f,f/12)-1,n=Math.round(v.y*12);if(!(n>0))return '';
const g=Math.pow(1+i,n),fv=v.p*g+(i===0?v.m*n:v.m*(g-1)/i),inv=v.p+v.m*n;
return '<b>Future value '+W(fv)+'</b><br>Total contributed '+W(inv)+'<br>Interest earned '+W(fv-inv)+(inv>0?' ('+N2((fv/inv-1)*100,1)+'% on top of what you put in)':'');''',
         "<h2>The math</h2><p>Each month your balance earns the periodic rate and then your contribution is added at the end of the month. With contributions, the future value is P × (1 + i)<sup>n</sup> + C × ((1 + i)<sup>n</sup> − 1) ÷ i, where i is the effective monthly rate and n the number of months. Real returns vary year to year and can be negative, so treat the result as an illustration rather than a forecast. Taxes and fees are not included.</p>",
         [("What is the rule of 72?", "Divide 72 by the annual return in percent to estimate how many years it takes to double your money. At 6% that is about 12 years."),
          ("Does the compounding frequency matter?", "A little. More frequent compounding gives a slightly higher result, but the return rate and the time invested matter far more."),
          ("Are contributions made at the start or end of the month?", "At the end. Contributing at the start of each month would give a marginally higher result.")])

    tool("cagr", "ROI & CAGR Calculator", "fin", "total return and annualised growth",
         "Work out your total return and the compound annual growth rate (CAGR) from a start value, an end value and a time period.",
         [N("a", "Starting value", 10000), N("b", "Ending value", 15000), N("y", "Years", 5)],
         r'''if(!(v.a>0&&v.y>0&&v.b>0))return '';const c=(Math.pow(v.b/v.a,1/v.y)-1)*100;
return 'Total return '+N2((v.b/v.a-1)*100,2)+'%<br><b>CAGR '+N2(c,2)+'% per year</b><br>Gain / loss '+W(v.b-v.a);''',
         "<h2>Formula</h2><p>CAGR = (ending value ÷ starting value)<sup>1 ÷ years</sup> − 1. It is the single constant yearly rate that would take you from the starting to the ending value, which makes investments held for different lengths of time comparable. It hides the ups and downs along the way.</p>",
         [("What is the difference between ROI and CAGR?", "Total return (ROI) is the overall percentage change. CAGR converts it to a yearly rate so a 50% gain over 2 years can be compared with a 50% gain over 10."),
          ("Can CAGR be negative?", "Yes. If the ending value is below the start, the CAGR is negative. Enter positive values for start and end.")])

    tool("avgprice", "Average Cost Calculator", "fin", "average purchase price after buying more",
         "Find your average cost per share or unit across up to three purchases, and your profit or loss at the current price.",
         [N("p1", "Purchase 1: price", 100), N("q1", "Purchase 1: quantity", 10), N("p2", "Purchase 2: price", 80), N("q2", "Purchase 2: quantity", 20),
          N("p3", "Purchase 3: price (optional)", 0), N("q3", "Purchase 3: quantity (optional)", 0), N("now", "Current price (optional)", 90)],
         r'''const q=v.q1+v.q2+v.q3;if(!(q>0))return '';const tot=v.p1*v.q1+v.p2*v.q2+v.p3*v.q3,avg=tot/q;
let h='<b>Average cost '+W(avg)+'</b><br>Total quantity '+N2(q,4)+' · Total invested '+W(tot);
if(v.now>0)h+='<br>At the current price: '+W((v.now-avg)*q)+' ('+N2((v.now/avg-1)*100,2)+'%)';return h;''',
         "<h2>What is average cost?</h2><p>Average cost is the total money spent divided by the total quantity bought. Buying more when the price drops lowers your average cost and the price you need to break even, but it also increases the amount you have at risk. Fees are not included.</p>",
         [("Is averaging down a good idea?", "It lowers your average cost but increases your exposure. Only add to a position if you would still choose to buy it at the new price."),
          ("Can I use fractional quantities?", "Yes. Enter decimals for fractional shares or coins.")])

    tool("savegoal", "Savings Goal Calculator", "fin", "how long to reach your target",
         "Find out how many months it takes to reach a savings goal with regular monthly deposits and interest.",
         [N("t", "Savings goal", 20000), N("c", "Already saved", 1000), N("m", "Monthly deposit", 400), N("r", "Annual interest rate (%)", 3, "0.01")],
         r'''const i=v.r/1200;if(!(v.m>0))return '';if(v.c>=v.t)return 'You have already reached your goal.';let n;
if(i===0)n=(v.t-v.c)/v.m;else n=Math.log((v.t*i+v.m)/(v.c*i+v.m))/Math.log(1+i);
if(!isFinite(n)||n<0)return 'Please check your numbers.';n=Math.ceil(n);
return '<b>About '+n+' months ('+Math.floor(n/12)+' yr '+(n%12)+' mo)</b><br>Total deposited '+W(v.m*n+v.c)+' (including what you have saved)';''',
         "<h2>How it works</h2><p>Deposits are made at the end of each month and interest compounds monthly. Set the interest rate to 0% to see how long it takes with deposits alone. Try increasing the monthly deposit to see how much faster you get there.</p>",
         [("What interest rate should I use?", "Use the rate your savings account pays. For investments, use a cautious long-run estimate rather than a best case."),
          ("Are taxes included?", "No, the result is before tax.")])

    tool("inflation", "Inflation Calculator", "fin", "future cost and today's value of money",
         "See how inflation changes the cost of living and the purchasing power of your money over time.",
         [N("a", "Amount", 1000), N("r", "Average yearly inflation (%)", 3, "0.1"), N("y", "Years", 10)],
         r'''const f=Math.pow(1+v.r/100,v.y);
return 'Something that costs '+W(v.a)+' today will cost <b>'+W(v.a*f)+'</b> in '+v.y+' years.<br>'+W(v.a)+' in '+v.y+' years will buy what <b>'+W(v.a/f)+'</b> buys today.';''',
         "<h2>Why it matters</h2><p>When prices rise, each unit of money buys less. If your savings earn less than inflation, their real value falls. Long-run inflation targets in many countries are around 2%, but actual rates vary by country and year, so enter a rate that fits your situation.</p>",
         [("What inflation rate should I use?", "Check your country&rsquo;s recent consumer price index. For long-term planning many people use 2&ndash;3%."),
          ("Does it work for any currency?", "Yes. Pick your currency symbol in the footer; the maths is the same.")])

    tool("dividend", "Dividend Yield Calculator", "fin", "yield and yearly dividend income",
         "Calculate dividend yield and the dividend income you can expect from a number of shares, before and after tax.",
         [N("p", "Share price", 50), N("d", "Annual dividend per share", 2), N("q", "Number of shares", 100), N("tax", "Tax on dividends (%)", 15, "0.1")],
         r'''if(!(v.p>0))return '';const g=v.d*v.q,t=g*v.tax/100;
return '<b>Dividend yield '+N2(v.d/v.p*100,2)+'%</b><br>Yearly dividends '+W(g)+' &rarr; '+W(g-t)+' after tax<br><small>About '+W((g-t)/12)+' per month after tax</small>';''',
         "<h2>Yield formula</h2><p>Dividend yield = annual dividend per share ÷ share price. A very high yield can signal that the market expects the dividend to be cut, so it is worth checking whether the company can afford it. Dividend tax rules differ by country; enter the rate that applies to you.</p>",
         [("Are dividends guaranteed?", "No. Companies can reduce or stop paying dividends at any time."),
          ("Is this financial advice?", "No. It is a calculator for illustration only.")])

    tool("apy", "APR to APY Calculator", "fin", "effective annual yield",
         "Convert a nominal annual rate (APR) to the effective annual yield (APY) for different compounding frequencies.",
         [N("r", "Nominal annual rate APR (%)", 4.5, "0.001"),
          S("n", "Compounding", [("12", "Monthly"), ("1", "Annually"), ("2", "Semi-annually"), ("4", "Quarterly"), ("365", "Daily"), ("0", "Continuously")])],
         r'''const n=+v.n,r=v.r/100;const apy=(n===0?Math.exp(r)-1:Math.pow(1+r/n,n)-1)*100;
return '<b>APY '+N2(apy,4)+'%</b><br><small>'+N2(apy-v.r,4)+' percentage points above the stated rate</small>';''',
         "<h2>Formula</h2><p>APY = (1 + APR ÷ n)<sup>n</sup> − 1, where n is the number of compounding periods per year. With continuous compounding the formula is e<sup>APR</sup> − 1. APY lets you compare accounts that compound differently on equal terms.</p>",
         [("Is APY or APR higher?", "For the same stated rate, APY is equal to or higher than APR because it includes the effect of compounding."),
          ("Which should I compare when saving?", "Compare APY. When borrowing, compare the APR and read what fees it includes.")])

    tool("fire", "FIRE Number Calculator", "fin", "savings needed to retire early",
         "Estimate the savings you need to retire on the safe-withdrawal-rate rule, and how many years it takes at your current saving pace.",
         [N("s", "Yearly spending in retirement", 40000), N("w", "Safe withdrawal rate (%)", 4, "0.1"), N("c", "Current savings", 50000), N("m", "Saved per year", 15000), N("r", "Expected yearly return (%)", 5, "0.1")],
         r'''if(!(v.w>0))return '';const t=v.s/(v.w/100);if(v.c>=t)return 'Target <b>'+W(t)+'</b> &mdash; you are already there.';
let b=v.c,y=0;while(b<t&&y<100){b=b*(1+v.r/100)+v.m;y++}
return 'Target savings <b>'+W(t)+'</b><br>'+(y>=100?'<b>More than 100 years</b> at this saving pace.':'Reached in about <b>'+y+' years</b>');''',
         "<h2>The 4% rule</h2><p>The target is yearly spending ÷ withdrawal rate. A 4% rate is the same as saving 25 times your annual spending. The 4% figure comes from US historical studies of 30-year retirements; early retirees often use a lower rate to be safer. Returns, inflation and taxes will differ in reality, so use this as a rough planning tool.</p>",
         [("Is 4% safe?", "It worked in many historical US scenarios over 30 years but is not a guarantee, and a longer retirement may call for a lower rate such as 3&ndash;3.5%."),
          ("Does this include inflation?", "The return you enter is treated as a real (after-inflation) return if you also enter spending in today&rsquo;s money.")])

    # ================= SALARY & WORK =================
    tool("salary", "Salary Converter", "pay", "hourly, weekly, monthly and yearly pay",
         "Convert between hourly, daily, weekly, biweekly, monthly and annual pay, using your own working hours.",
         [N("a", "Amount", 25, "0.01"), S("per", "This amount is", [("h", "Hourly"), ("d", "Daily"), ("w", "Weekly"), ("b", "Biweekly"), ("m", "Monthly"), ("y", "Yearly")]),
          N("hpw", "Hours per week", 40, "0.5"), N("dpw", "Days per week", 5, "0.5"), N("wpy", "Paid weeks per year", 52)],
         r'''if(!(v.hpw>0&&v.dpw>0&&v.wpy>0))return '';let an;
if(v.per==='h')an=v.a*v.hpw*v.wpy;else if(v.per==='d')an=v.a*v.dpw*v.wpy;else if(v.per==='w')an=v.a*v.wpy;else if(v.per==='b')an=v.a*v.wpy/2;else if(v.per==='m')an=v.a*12;else an=v.a;
const h=an/(v.hpw*v.wpy);
return 'Hourly <b>'+W(h)+'</b><br>Daily '+W(h*v.hpw/v.dpw)+'<br>Weekly '+W(an/v.wpy)+'<br>Biweekly '+W(an/v.wpy*2)+'<br>Monthly '+W(an/12)+'<br>Yearly <b>'+W(an)+'</b><br><small>Before tax. Based on '+v.hpw+' h/week, '+v.dpw+' days/week, '+v.wpy+' paid weeks.</small>';''',
         "<h2>How the conversion works</h2><p>Everything is converted to a yearly amount first (hourly × hours per week × paid weeks, and so on) and then divided back into each period. Change the hours and paid weeks to match your contract; for example, use 50 paid weeks if you take two weeks of unpaid leave. These are gross (before-tax) amounts.</p>",
         [("How many working hours are in a year?", "A common estimate is 2,080 hours (40 hours × 52 weeks). It is lower once you subtract unpaid holidays and leave."),
          ("Does this show take-home pay?", "No. Taxes and deductions depend on your country, so this shows gross pay only.")])

    tool("raise", "Pay Raise Calculator", "pay", "new salary and real raise after inflation",
         "Calculate your new salary after a raise and see what the raise is worth after inflation.",
         [N("c", "Current salary (yearly)", 50000), N("p", "Raise (%)", 4, "0.1"), N("i", "Inflation (%)", 3, "0.1")],
         r'''const ns=v.c*(1+v.p/100),real=((1+v.p/100)/(1+v.i/100)-1)*100;
return 'New salary <b>'+W(ns)+'</b> ('+W(ns-v.c)+' more per year, '+W((ns-v.c)/12)+' per month)<br>After inflation your raise is <b>'+N2(real,2)+'%</b>'+(real<0?' &mdash; you lose purchasing power':'');''',
         "<h2>Real vs nominal raise</h2><p>A raise smaller than inflation means your pay buys less than before. The real raise is (1 + raise) ÷ (1 + inflation) − 1. Enter your own country&rsquo;s recent inflation rate for an accurate picture.</p>",
         [("Is the new salary before tax?", "Yes. The calculator works on the gross figure you enter."),
          ("How can I ask for a raise?", "Gather evidence of your impact and market pay for your role. The calculator can show how much you would need just to keep up with inflation.")])

    tool("overtime", "Overtime Pay Calculator", "pay", "time-and-a-half and double time",
         "Calculate total pay including overtime at time-and-a-half, double time or any multiplier you choose.",
         [N("r", "Hourly rate", 20, "0.01"), N("h", "Regular hours", 40, "0.25"), N("o", "Overtime hours", 6, "0.25"), N("om", "Overtime multiplier", 1.5, "0.05"), N("d", "Double-time hours", 0, "0.25"), N("dm", "Double-time multiplier", 2, "0.05")],
         r'''const reg=v.r*v.h,ot=v.r*v.om*v.o,dt=v.r*v.dm*v.d;
return '<b>Total pay '+W(reg+ot+dt)+'</b><br>Regular '+W(reg)+' · Overtime '+W(ot)+(v.d>0?' · Double time '+W(dt):'')+'<br><small>Overtime rate '+W(v.r*v.om)+' per hour</small>';''',
         "<h2>Check your local rules</h2><p>Overtime rules differ by country, state and contract: the number of hours before overtime starts, the multiplier, and who is exempt. Use the multiplier fields to match your own rules. Results are before tax.</p>",
         [("What is time-and-a-half?", "Overtime paid at 1.5 times your normal hourly rate."),
          ("Is salaried work eligible for overtime?", "It depends on local law and your contract. Some salaried roles are exempt.")])

    tool("tip", "Tip & Bill Split Calculator", "pay", "tip amount and share per person",
         "Work out the tip, the total bill and what each person pays when splitting a bill.",
         [N("b", "Bill amount", 85, "0.01"), N("t", "Tip (%)", 18, "0.5"), N("n", "People", 2), S("rd", "Rounding", [("no", "Exact amounts"), ("up", "Round each share up to whole currency units")])],
         r'''if(!(v.n>=1))return '';let tot=v.b*(1+v.t/100),per=tot/v.n;
if(v.rd==='up'){per=Math.ceil(per-1e-9);tot=per*v.n}
return 'Tip '+W(tot-v.b)+'<br>Total <b>'+W(tot)+'</b><br>Each person pays <b>'+W(per)+'</b>';''',
         "<h2>Tipping customs</h2><p>Tipping norms vary a lot by country. In the US 15&ndash;20% is typical in restaurants; in many other countries service is included or tipping is small. Enter whatever percentage fits where you are.</p>",
         [("Is the tip calculated before or after tax?", "This calculator applies the tip to the amount you enter. Enter the pre-tax bill if you tip on that."),
          ("How do I split unevenly?", "Calculate each person&rsquo;s own items with a tip, or use the Percentage Calculator.")])

    tool("salestax", "Sales Tax & VAT Calculator", "pay", "add or remove tax",
         "Add sales tax or VAT to a price, or work out the tax and net price from a tax-inclusive total.",
         [N("a", "Amount", 100, "0.01"), N("r", "Tax rate (%)", 20, "0.01"), S("m", "Mode", [("add", "Add tax to a net price"), ("rem", "Remove tax from a gross price")])],
         r'''if(v.m==='add'){const t=v.a*v.r/100;return 'Net price '+W(v.a)+'<br>Tax '+W(t)+'<br><b>Total '+W(v.a+t)+'</b>'}
const net=v.a/(1+v.r/100);return 'Gross price '+W(v.a)+'<br>Tax '+W(v.a-net)+'<br><b>Net price '+W(net)+'</b>';''',
         "<h2>Formulas</h2><p>Adding tax: total = net × (1 + rate). Removing tax: net = total ÷ (1 + rate). Note that removing tax is not the same as subtracting the rate from the total: for a 20% rate you divide by 1.2, not take 20% off. Enter the rate that applies in your country or state.</p>",
         [("Why is removing tax different from taking the percentage off?", "Because the tax was calculated on the net price, not on the total. Divide by 1 plus the rate to get back to the net price."),
          ("Which rate should I use?", "Use the current rate for your country or state; it differs by location and sometimes by type of goods.")])

    tool("discount", "Discount & Sale Price Calculator", "pay", "percent off, stacked discounts and coupons",
         "Find the final price after a percentage discount, a second discount and a fixed coupon, and see how much you really save.",
         [N("p", "Original price", 100, "0.01"), N("d1", "First discount (%)", 20, "0.1"), N("d2", "Extra discount (%)", 10, "0.1"), N("c", "Coupon (fixed amount)", 0, "0.01")],
         r'''const a=v.p*(1-v.d1/100),b=a*(1-v.d2/100),f=Math.max(0,b-v.c);
return '<b>Final price '+W(f)+'</b><br>You save '+W(v.p-f)+' ('+N2((1-f/v.p)*100,1)+'% off the original)<br><small>After the first discount: '+W(a)+'</small>';''',
         "<h2>Stacked discounts</h2><p>Two discounts are applied one after the other, not added together: 20% off then 10% off is a 28% total discount, not 30%. The fixed coupon is subtracted last.</p>",
         [("Why is 20% + 10% not 30%?", "The second discount applies to the already-reduced price, so it is worth less."),
          ("How do I find the original price?", "Use the Percentage Calculator: divide the sale price by (1 − discount).")])

    # ================= BUSINESS =================
    tool("margin", "Profit Margin & Markup Calculator", "biz", "margin, markup and selling price",
         "Calculate gross margin and markup from cost and price, or find the selling price you need for a target margin.",
         [N("c", "Cost", 40, "0.01"), S("m", "I know", [("p", "The selling price"), ("t", "The margin I want")]), N("p", "Selling price", 100, "0.01"), N("t", "Target margin (%)", 30, "0.1")],
         r'''if(v.m==='p'){if(!(v.p>0))return '';const pr=v.p-v.c;return '<b>Margin '+N2(pr/v.p*100,2)+'%</b> · Markup '+N2(v.c>0?pr/v.c*100:0,2)+'%<br>Profit per unit '+W(pr)}
if(v.t>=100)return 'Margin must be below 100%.';const pr=v.c/(1-v.t/100);return 'Selling price <b>'+W(pr)+'</b><br>Profit per unit '+W(pr-v.c)+' · Markup '+N2(v.c>0?(pr/v.c-1)*100:0,2)+'%';''',
         "<h2>Margin vs markup</h2><p>Margin is profit as a share of the selling price: (price − cost) ÷ price. Markup is profit as a share of cost: (price − cost) ÷ cost. A 50% markup is only a 33% margin. Mixing them up is a common pricing mistake.</p>",
         [("What is a good profit margin?", "It depends heavily on the industry. Software can have very high margins, while retail and food are often in single or low double digits."),
          ("Does this include fees and taxes?", "No. Add platform fees, shipping and taxes to your cost for a true margin.")])

    tool("breakeven", "Break-Even Calculator", "biz", "units you must sell to cover costs",
         "Find how many units you need to sell, and the revenue required, to break even or reach a profit target.",
         [N("f", "Fixed costs per period", 3000), N("p", "Selling price per unit", 25, "0.01"), N("c", "Variable cost per unit", 10, "0.01"), N("t", "Target profit (optional)", 0)],
         r'''const mg=v.p-v.c;if(!(mg>0))return 'The price must be higher than the variable cost.';const q=Math.ceil((v.f+v.t)/mg);
return 'Contribution per unit '+W(mg)+' ('+N2(mg/v.p*100,1)+'%)<br><b>'+(v.t>0?'Units for target profit: ':'Break-even: ')+q.toLocaleString('en-US')+' units</b><br>Revenue needed '+W(q*v.p);''',
         "<h2>Contribution margin</h2><p>Each unit contributes price − variable cost towards covering fixed costs. Break-even units = (fixed costs + target profit) ÷ contribution per unit, rounded up. Fixed costs stay the same however much you sell (rent, salaries); variable costs rise with each sale (materials, packaging, fees).</p>",
         [("What if my price changes?", "A higher price raises the contribution per unit and lowers the break-even quantity, but may reduce demand."),
          ("Should my own pay be a fixed cost?", "Yes, include it for a realistic break-even.")])

    tool("roas", "ROAS & Ad Profit Calculator", "biz", "return on ad spend",
         "Calculate return on ad spend, ad ROI and your break-even ROAS from your ad budget, revenue and product margin.",
         [N("s", "Ad spend", 1000), N("r", "Revenue from ads", 4000), N("m", "Product margin (%)", 40, "0.1")],
         r'''if(!(v.s>0&&v.m>0))return '';const p=v.r*v.m/100-v.s;
return '<b>ROAS '+N2(v.r/v.s,2)+'x</b> (break-even ROAS '+N2(100/v.m,2)+'x)<br>Profit after ad spend '+W(p)+' · Ad ROI '+N2(p/v.s*100,1)+'%'+(v.r/v.s<100/v.m?'<br><small>You lose money at this ROAS.</small>':'');''',
         "<h2>Reading ROAS</h2><p>ROAS = revenue ÷ ad spend. Whether a ROAS is good depends on your margin: break-even ROAS = 1 ÷ margin. With a 40% margin you need at least 2.5x just to cover the ads. Returns, shipping and other costs would raise this threshold.</p>",
         [("What is a good ROAS?", "Anything above your break-even ROAS is profitable. A common benchmark is 4x, but it depends on your margin."),
          ("ROAS vs ROI?", "ROAS ignores your product cost. ROI here is the profit after ad spend divided by the ad spend.")])

    # ================= EVERYDAY LIFE =================
    tool("fuel", "Fuel Cost & Mileage Calculator", "life", "trip fuel and cost",
         "Estimate the fuel needed and the cost of a trip using miles per gallon or litres per 100 km.",
         [S("u", "Units", [("us", "Miles, US mpg, price per US gallon"), ("uk", "Miles, UK mpg, price per UK gallon"), ("met", "Kilometres, L/100 km, price per litre")]),
          N("d", "Trip distance", 300), N("e", "Fuel economy (mpg or L/100 km)", 30, "0.1"), N("p", "Fuel price per gallon / litre", 3.5, "0.001")],
         r'''if(!(v.e>0))return '';let q,unit,du;
if(v.u==='met'){q=v.d*v.e/100;unit='L';du='km'}else{q=v.d/v.e;unit=v.u==='us'?'US gal':'UK gal';du='mile'}
const c=q*v.p;return 'Fuel needed '+N2(q,2)+' '+unit+'<br><b>Fuel cost '+W(c)+'</b><br>'+W(c/v.d)+' per '+du+'<br><small>One way. Double it for a round trip.</small>';''',
         "<h2>Fuel economy units</h2><p>Miles per gallon (mpg) says how far you go per unit of fuel, so higher is better. Litres per 100 km says how much fuel you use per distance, so lower is better. A US gallon is about 3.785 litres and a UK gallon about 4.546 litres, so UK mpg figures look bigger for the same car. For electric cars, enter your kWh-based figures with the matching price.</p>",
         [("How do I find my real fuel economy?", "Fill the tank, reset the trip meter, drive normally, then refill and divide distance by fuel added."),
          ("Are tolls included?", "No, only fuel.")])

    tool("unitprice", "Unit Price Comparison", "life", "which size is the better deal",
         "Compare the price per unit of up to three products to find the best value.",
         [N("p1", "Item A: price", 3.99, "0.01"), N("q1", "Item A: quantity or size", 500), N("p2", "Item B: price", 6.49, "0.01"), N("q2", "Item B: quantity or size", 1000), N("p3", "Item C: price (optional)", 0, "0.01"), N("q3", "Item C: quantity or size (optional)", 0)],
         r'''const it=[['A',v.p1,v.q1],['B',v.p2,v.q2],['C',v.p3,v.q3]].filter(x=>x[1]>0&&x[2]>0).map(x=>({n:x[0],u:x[1]/x[2]}));if(it.length<2)return 'Enter at least two items.';
const best=it.reduce((a,b)=>b.u<a.u?b:a);
return it.map(x=>'Item '+x.n+': '+W(x.u*100)+' per 100 units'+(x===best?' <b>(best value)</b>':'')).join('<br>')+'<br><small>Best value is '+N2((Math.max.apply(null,it.map(x=>x.u))/best.u-1)*100,1)+'% cheaper per unit than the most expensive.</small>';''',
         "<h2>Compare like for like</h2><p>Use the same unit for every item (for example grams, millilitres or sheets). The calculator divides price by quantity and shows the cost per 100 units so small numbers are easy to read. The cheapest per unit is not always the best deal if you will not use it all before it expires.</p>",
         [("What if the units differ?", "Convert them first, for example kilograms to grams, so the quantities are in the same unit."),
          ("Is bigger always cheaper?", "Not always. Compare the unit price rather than assuming.")])

    tool("petage", "Pet Age in Human Years", "life", "dog and cat age converter",
         "Estimate your dog or cat&rsquo;s age in human years using common formulas.",
         [S("k", "Pet", [("dog", "Dog"), ("cat", "Cat")]), N("a", "Pet age (years)", 5, "0.1"), S("s", "Dog size (rule of thumb)", [("4", "Small"), ("5", "Medium"), ("6", "Large")])],
         r'''if(!(v.a>0))return '';
if(v.k==='cat'){const h=v.a<=1?v.a*15:v.a<=2?15+(v.a-1)*9:24+(v.a-2)*4;return '<b>About '+N2(h,1)+' human years</b><br><small>Rule of thumb: 15 for year one, 9 for year two, then 4 per year.</small>'}
const per=+v.s;const h=v.a<=1?v.a*15:v.a<=2?15+(v.a-1)*9:24+(v.a-2)*per;
let o='<b>About '+N2(h,1)+' human years</b> (rule of thumb)';if(v.a>=0.5)o+='<br>DNA-methylation formula: '+N2(16*Math.log(v.a)+31,1)+' human years';return o;''',
         "<h2>These are only estimates</h2><p>The old &ldquo;multiply by 7&rdquo; rule is inaccurate. The rule of thumb used here gives 15 human years for the first year and 9 for the second, then a size-dependent number per year for dogs (4, 5 or 6) and 4 for cats. The second figure uses a 2020 formula from DNA-methylation research in Labrador retrievers: human age = 16 × ln(dog age) + 31. Individual animals and breeds age differently.</p>",
         [("Do big dogs age faster?", "Generally large breeds have shorter lifespans, which is why the per-year figure is higher for them."),
          ("Does this replace a vet&rsquo;s advice?", "No. Ask your vet about your pet&rsquo;s health and life stage.")])

    # ================= DATE & TIME =================
    tool("age", "Age Calculator", "date", "exact age and next birthday",
         "Find your exact age in years, months and days, the days you have lived, and how long until your next birthday.",
         [DT("b", "Date of birth", "1995-06-15"), DT("t", "Age at date", "today")],
         r'''const b=P(v.b),t=P(v.t);if(t<b)return 'The date must be after the birth date.';
const addM=(d,k)=>{const q=d.getFullYear()*12+d.getMonth()+k,yy=Math.floor(q/12),mo=q%12,last=new Date(yy,mo+1,0).getDate();return new Date(yy,mo,Math.min(d.getDate(),last))};
let mm=(t.getFullYear()-b.getFullYear())*12+t.getMonth()-b.getMonth();while(mm>0&&addM(b,mm)>t)mm--;
const y=Math.floor(mm/12),m=mm%12,d=DAYS(addM(b,mm),t),pl=(n,w)=>n+' '+w+(n===1?'':'s');
let nb=new Date(t.getFullYear(),b.getMonth(),b.getDate());if(nb<t)nb=new Date(t.getFullYear()+1,b.getMonth(),b.getDate());
const dl=DAYS(t,nb),days=DAYS(b,t);
return '<b>'+pl(y,'year')+', '+pl(m,'month')+', '+pl(d,'day')+'</b><br>'+days.toLocaleString('en-US')+' days lived ('+N2(days/7,1)+' weeks)<br>Next birthday: '+FD(nb)+(dl===0?' &mdash; today!':' (in '+dl+' days)');''',
         "<h2>How age is counted</h2><p>The calculator counts whole years and months from the date of birth, then the remaining days. For people born on 29 February, the birthday in non-leap years is shown as 1 March. Change the &ldquo;Age at date&rdquo; to find your age on any other day, past or future.</p>",
         [("Why might my age differ from another calculator?", "Some count months slightly differently when the birth day does not exist in a month (for example the 31st). The difference is at most a day or two."),
          ("Is my data stored?", "No. Everything is calculated in your browser.")])

    tool("datediff", "Days Between Dates Calculator", "date", "years, months, days and weeks between two dates",
         "Count the days, weeks, months and years between any two dates, with an option to include the end date.",
         [DT("a", "Start date", "2026-01-01"), DT("b", "End date", "today"), S("i", "Count end date?", [("0", "No"), ("1", "Yes (+1 day)")])],
         r'''const a=P(v.a),b=P(v.b);if(b<a)return 'The end date must be after the start date.';
const addM=(d,k)=>{const q=d.getFullYear()*12+d.getMonth()+k,yy=Math.floor(q/12),mo=q%12,last=new Date(yy,mo+1,0).getDate();return new Date(yy,mo,Math.min(d.getDate(),last))};
let mm=(b.getFullYear()-a.getFullYear())*12+b.getMonth()-a.getMonth();while(mm>0&&addM(a,mm)>b)mm--;
const y=Math.floor(mm/12),m=mm%12,d=DAYS(addM(a,mm),b),pl=(n,w)=>n+' '+w+(n===1?'':'s');const t=DAYS(a,b)+(+v.i);
return '<b>'+t.toLocaleString('en-US')+' days</b> ('+Math.floor(t/7)+' weeks '+(t%7)+' days)<br>'+pl(y,'year')+', '+pl(m,'month')+', '+pl(d,'day')+'<br><small>'+FD(a)+' &rarr; '+FD(b)+'</small>';''',
         "<h2>Counting days</h2><p>The total is the number of calendar days from the start date to the end date. Choose &ldquo;Yes&rdquo; to count both the first and last day, which is how many contracts and holiday allowances count. To count only working days, use the Business Days Calculator.</p>",
         [("Does it account for leap years?", "Yes. It counts real calendar days."),
          ("How do I count down to an event?", "Set the start date to today and the end date to the event.")])

    tool("dateadd", "Add or Subtract Time from a Date", "date", "date calculator",
         "Add or subtract days, weeks, months or years from a date to find the resulting date and weekday.",
         [DT("b", "Start date", "today"), S("dir", "Operation", [("1", "Add"), ("-1", "Subtract")]), N("n", "Amount", 90), S("u", "Unit", [("d", "Days"), ("w", "Weeks"), ("m", "Months"), ("y", "Years")])],
         r'''const d=P(v.b),n=v.n*(+v.dir);let r;
if(v.u==='d')r=new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
else if(v.u==='w')r=new Date(d.getFullYear(),d.getMonth(),d.getDate()+n*7);
else{const mm=v.u==='m'?n:n*12;r=new Date(d.getFullYear(),d.getMonth()+mm,1);const last=new Date(r.getFullYear(),r.getMonth()+1,0).getDate();r.setDate(Math.min(d.getDate(),last))}
return '<b>'+FD(r)+'</b><br><small>'+FD(d)+' '+(v.dir==='1'?'+':'&minus;')+' '+v.n+' '+{d:'days',w:'weeks',m:'months',y:'years'}[v.u]+'</small>';''',
         "<h2>Month arithmetic</h2><p>When you add months or years and the target month is shorter than the start day (for example 31 January + 1 month), the result is the last day of that month (28 or 29 February). Adding days and weeks is exact.</p>",
         [("How do I find a date 90 days from now?", "Leave the start date as today, choose Add, enter 90 and select Days."),
          ("Are weekends and holidays skipped?", "No. Use the Business Days Calculator for working days.")])

    tool("bizdays", "Business Days Calculator", "date", "working days between two dates",
         "Count the weekdays (Monday to Friday) between two dates, with an option to subtract public holidays.",
         [DT("a", "Start date", "today"), DT("b", "End date", "+30"), N("h", "Public holidays to subtract", 0)],
         r'''const a=P(v.a),b=P(v.b);if(b<a)return 'The end date must be after the start date.';let biz=0,total=0;
for(let d=new Date(a);d<=b&&total<40000;d.setDate(d.getDate()+1)){total++;const w=d.getDay();if(w!==0&&w!==6)biz++}
const net=Math.max(0,biz-v.h);return '<b>'+net+' business days</b><br>'+total+' calendar days · '+(total-biz)+' weekend days'+(v.h>0?' · '+v.h+' holidays removed':'')+'<br><small>Start and end dates are included.</small>';''',
         "<h2>What counts as a business day?</h2><p>Monday to Friday, counting both the start and end dates. Public holidays differ by country and region, so enter how many fall inside your range to subtract them. Some countries and industries use different working weeks.</p>",
         [("Does it know my country&rsquo;s holidays?", "No. Count the holidays in your range and enter the number."),
          ("Are the start and end dates counted?", "Yes, both are included when they fall on weekdays.")])

    tool("weeknum", "Week Number Calculator", "date", "ISO week number, day of year and quarter",
         "Find the ISO week number, day of the year, quarter and weekday for any date.",
         [DT("d", "Date", "today")],
         r'''const p=P(v.d),d=new Date(Date.UTC(p.getFullYear(),p.getMonth(),p.getDate())),dn=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-dn);
const ys=Date.UTC(d.getUTCFullYear(),0,1),wk=Math.ceil(((d-ys)/864e5+1)/7);const doy=DAYS(new Date(p.getFullYear(),0,1),p)+1;const left=DAYS(p,new Date(p.getFullYear(),11,31));
return '<b>Week '+wk+' of '+d.getUTCFullYear()+'</b> ('+DOW(p)+')<br>Day '+doy+' of the year · '+left+' days left<br>Quarter Q'+(Math.floor(p.getMonth()/3)+1);''',
         "<h2>ISO 8601 weeks</h2><p>ISO weeks start on Monday, and week 1 is the week containing the first Thursday of the year. This means the first days of January can belong to week 52 or 53 of the previous year, and the last days of December to week 1 of the next. Some countries (for example the US) number weeks differently.</p>",
         [("Why does 1 January sometimes show week 52 or 53?", "Because ISO week 1 is the week with the year&rsquo;s first Thursday."),
          ("Does it work for any year?", "Yes.")])

    tool("timezone", "Time Zone Converter", "date", "convert a time between cities",
         "Convert a date and time from one time zone to another, including daylight saving time.",
         [DT("d", "Date", "today"), TM("t", "Time", "09:00"),
          S("from", "From", [(z, n) for z, n in B_ZONES]), S("to", "To", [(z, n) for z, n in B_ZONES[1:] + B_ZONES[:1]])],
         r'''if(!v.d||!v.t)return '';const off=(tz,ms)=>{const f=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const p={};f.formatToParts(new Date(ms)).forEach(x=>{if(x.type!=='literal')p[x.type]=+x.value});return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-ms};
const a=v.d.split('-').map(Number),t=v.t.split(':').map(Number),g=Date.UTC(a[0],a[1]-1,a[2],t[0],t[1]);let inst=g-off(v.from,g);inst=g-off(v.from,inst);
return '<b>'+new Intl.DateTimeFormat('en-US',{timeZone:v.to,weekday:'long',year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(inst))+'</b>';''',
         "<h2>Daylight saving</h2><p>Conversions use your browser&rsquo;s built-in time zone database, so daylight saving time is applied for the date you choose. Countries change their rules occasionally; for important meetings double-check with a calendar app.</p>",
         [("Is my city missing?", "Pick a city in the same time zone. Most zones are represented in the list."),
          ("Does it handle daylight saving time?", "Yes, for the date you select.")])

    tool("timediff", "Hours Between Times Calculator", "date", "work hours with breaks",
         "Calculate the hours and minutes between a start and end time, subtracting a break, including shifts that go past midnight.",
         [TM("a", "Start time", "09:00"), TM("b", "End time", "17:30"), N("k", "Break (minutes)", 30)],
         r'''if(!v.a||!v.b)return '';const f=s=>{const x=s.split(':').map(Number);return x[0]*60+x[1]};let m=f(v.b)-f(v.a);if(m<0)m+=1440;m-=v.k;if(m<0)return 'The break is longer than the shift.';
return '<b>'+Math.floor(m/60)+' h '+(m%60)+' min</b> ('+N2(m/60,2)+' hours)<br><small>If the end time is earlier than the start, it is counted as the next day.</small>';''',
         "<h2>Timesheet maths</h2><p>Hours worked = end time − start time − break. The decimal figure (for example 8.25 hours) is useful for payroll and invoices: multiply it by your hourly rate. Minutes are converted by dividing by 60.</p>",
         [("How do I calculate an overnight shift?", "Enter the start (for example 22:00) and an earlier end time (06:00). The calculator treats it as the next day."),
          ("Can I add several days?", "Use the Time Sum Calculator to total multiple shifts.")])

    tool("timesum", "Time Sum Calculator", "date", "add hours and minutes",
         "Add up a list of durations written as hours:minutes (or h:mm:ss) and get the total in hours and minutes.",
         [TA("l", "One duration per line (h:mm or h:mm:ss)", "1:30\n2:45\n0:50")],
         r'''const lines=v.l.split('\n').map(s=>s.trim()).filter(Boolean);let t=0,bad=0;
lines.forEach(s=>{const p=s.split(':').map(Number);if(p.some(isNaN)||p.length>3||p.some(x=>x<0)){bad++;return}t+=(p[0]||0)*3600+(p[1]||0)*60+(p[2]||0)});
if(!lines.length)return '';const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;
return '<b>'+h+':'+pad(m)+':'+pad(s)+'</b> ('+N2(t/3600,2)+' hours)'+(bad?'<br><small>'+bad+' line(s) ignored.</small>':'');''',
         "<h2>How to use it</h2><p>Type one duration per line, such as 1:30 for one hour thirty minutes. Seconds are optional. The total rolls minutes into hours automatically, so 0:45 + 0:45 is 1:30.</p>",
         [("Can I enter minutes only?", "Write them as 0:25 for 25 minutes."),
          ("Is there a limit?", "No practical limit on the number of lines.")])

    # ================= HEALTH & FITNESS =================
    tool("bmi", "BMI Calculator", "health", "body mass index for adults",
         "Calculate your body mass index (BMI) in metric or imperial units and see the WHO category and healthy weight range for your height.",
         [S("u", "Units", [("m", "Metric (cm, kg)"), ("i", "Imperial (feet + inches, lb)")]), N("h", "Height: cm (metric) or feet (imperial)", 170, "0.1"), N("hi", "Extra inches (imperial only)", 0, "0.1"), N("w", "Weight: kg (metric) or lb (imperial)", 68, "0.1")],
         r'''let h=v.u==='m'?v.h/100:(v.h*12+v.hi)*0.0254,w=v.u==='m'?v.w:v.w*0.45359237;if(!(h>0&&w>0))return '';
const b=w/(h*h);const cat=b<18.5?'Underweight':b<25?'Healthy weight':b<30?'Overweight':b<35?'Obesity class I':b<40?'Obesity class II':'Obesity class III';
const lo=18.5*h*h,hi=24.9*h*h,f=x=>v.u==='m'?N2(x,1)+' kg':N2(x/0.45359237,1)+' lb';
return '<b>BMI '+N2(b,1)+'</b> &mdash; '+cat+'<br>Healthy range for your height: '+f(lo)+' to '+f(hi)+'<br><small>BMI does not distinguish muscle from fat and is not a diagnosis.</small>';''',
         "<h2>BMI categories (WHO, adults)</h2><div class=\"tbl\"><table><tr><th>BMI</th><th>Category</th></tr><tr><td>below 18.5</td><td>Underweight</td></tr><tr><td>18.5 &ndash; 24.9</td><td>Healthy weight</td></tr><tr><td>25 &ndash; 29.9</td><td>Overweight</td></tr><tr><td>30 &ndash; 34.9</td><td>Obesity class I</td></tr><tr><td>35 &ndash; 39.9</td><td>Obesity class II</td></tr><tr><td>40 and above</td><td>Obesity class III</td></tr></table></div><p>BMI = weight (kg) ÷ height (m)². It is a screening tool for adults aged 20 and over. It can be misleading for athletes, older adults, pregnant women and children (who use age-specific growth charts). Some health bodies use lower cut-offs for people of Asian descent. Talk to a doctor about your health.</p>",
         [("Is BMI accurate?", "It is a rough screening measure. It ignores body composition, so muscular people can have a high BMI without excess fat."),
          ("What is a healthy BMI?", "For most adults 18.5 to 24.9, but your doctor can advise what is right for you.")])

    tool("bmr", "Calorie & BMR Calculator", "health", "daily calories to maintain, lose or gain weight",
         "Estimate your basal metabolic rate and daily calorie needs with the Mifflin-St Jeor equation.",
         [S("sex", "Sex", [("m", "Male"), ("f", "Female")]), N("a", "Age (years)", 30), S("u", "Units", [("m", "Metric (cm, kg)"), ("i", "Imperial (inches, lb)")]), N("h", "Height (cm or inches)", 175, "0.1"), N("w", "Weight (kg or lb)", 72, "0.1"),
          S("act", "Activity level", [("1.2", "Sedentary (little exercise)"), ("1.375", "Light (1&ndash;3 days/week)"), ("1.55", "Moderate (3&ndash;5 days/week)"), ("1.725", "Very active (6&ndash;7 days/week)"), ("1.9", "Extra active (physical job + training)")])],
         r'''const h=v.u==='m'?v.h:v.h*2.54,w=v.u==='m'?v.w:v.w*0.45359237;if(!(h>0&&w>0))return '';
const b=10*w+6.25*h-5*v.a+(v.sex==='m'?5:-161),t=b*(+v.act);
return '<b>BMR '+I0(b)+' kcal/day</b><br>Maintenance (TDEE) '+I0(t)+' kcal/day<br><small>Lose about 0.5 kg (1 lb) a week: ~'+I0(t-500)+' kcal · Gain: ~'+I0(t+300)+' kcal</small>';''',
         "<h2>The equation</h2><p>Mifflin-St Jeor: BMR = 10 × weight (kg) + 6.25 × height (cm) − 5 × age + 5 (men) or − 161 (women). Multiplying by an activity factor gives your total daily energy expenditure (TDEE). These are estimates; individual metabolism varies by around 10&ndash;15%. Do not eat below the minimum recommended by your doctor.</p>",
         [("What is BMR?", "The energy your body uses at complete rest to keep you alive: breathing, circulation and cell repair."),
          ("How many calories for weight loss?", "A deficit of about 500 kcal a day is a commonly used starting point for roughly 0.5 kg (1 lb) a week. Ask a professional for personal advice.")])

    tool("idealweight", "Ideal Weight Calculator", "health", "weight range for your height",
         "Estimate an ideal body weight range from your height using several well-known formulas and the healthy BMI range.",
         [S("sex", "Sex", [("m", "Male"), ("f", "Female")]), S("u", "Units", [("m", "Metric (cm)"), ("i", "Imperial (inches)")]), N("h", "Height (cm or inches)", 175, "0.1")],
         r'''const inch=v.u==='m'?v.h/2.54:v.h;if(inch<58)return 'These formulas are designed for adults at least 58 in (147 cm) tall.';const o=inch-60,m=v.sex==='m';
const r=[['Devine',(m?50:45.5)+2.3*o],['Robinson',(m?52:49)+(m?1.9:1.7)*o],['Miller',(m?56.2:53.1)+(m?1.41:1.36)*o],['Hamwi',(m?48:45.5)+(m?2.7:2.2)*o]];
const f=x=>v.u==='m'?N2(x,1)+' kg':N2(x/0.45359237,1)+' lb';const hm=inch*0.0254;
return r.map(x=>x[0]+': <b>'+f(x[1])+'</b>').join('<br>')+'<br><small>Healthy BMI range (18.5&ndash;24.9): '+f(18.5*hm*hm)+' to '+f(24.9*hm*hm)+'</small>';''',
         "<h2>About the formulas</h2><p>Devine, Robinson, Miller and Hamwi are formulas developed for drug dosing and clinical use; they differ by a few kilograms. None accounts for frame size, muscle mass, age or ethnicity, so treat them as a rough guide rather than a target. The BMI range is often a more useful reference.</p>",
         [("Which formula is best?", "None is best. They are different estimates of a healthy weight for your height."),
          ("Does it work for children?", "No. Children&rsquo;s healthy weights are assessed using growth charts.")])

    tool("bodyfat", "Body Fat Calculator (US Navy)", "health", "estimate body fat from tape measurements",
         "Estimate your body fat percentage from height, neck, waist and (for women) hip measurements using the US Navy method.",
         [S("sex", "Sex", [("m", "Male"), ("f", "Female")]), S("u", "Units", [("m", "Centimetres"), ("i", "Inches")]), N("h", "Height", 178, "0.1"), N("w", "Waist (at navel)", 85, "0.1"), N("n", "Neck", 38, "0.1"), N("p", "Hip (women only)", 95, "0.1")],
         r'''const k=v.u==='m'?1:2.54,h=v.h*k,w=v.w*k,n=v.n*k,p=v.p*k,L=Math.log10;let bf;
if(v.sex==='m'){if(w<=n)return 'Waist must be larger than neck.';bf=495/(1.0324-0.19077*L(w-n)+0.15456*L(h))-450}
else{if(w+p<=n)return 'Please check your measurements.';bf=495/(1.29579-0.35004*L(w+p-n)+0.221*L(h))-450}
if(!isFinite(bf)||bf<2||bf>60)return 'The result is out of range. Please check your measurements.';
return '<b>Body fat about '+N2(bf,1)+'%</b><br><small>Tape-measure estimates can be off by several percentage points compared with DEXA or other lab methods.</small>';''',
         "<h2>How to measure</h2><p>Measure neck just below the larynx, waist at the navel (men) or narrowest point (women), and hip at the widest point, with a flexible tape that is snug but not tight. The US Navy formula uses log<sub>10</sub> of these measurements and your height. It is a convenient estimate, not a medical measurement.</p>",
         [("How accurate is it?", "It is typically within a few percentage points for average builds but can be further off for very lean, very muscular or very overweight people."),
          ("What is a healthy body fat percentage?", "It varies by age and sex. Your doctor or a qualified professional can advise what is healthy for you.")])

    tool("water", "Daily Water Intake Calculator", "health", "how much water to drink",
         "Estimate a daily water intake from your weight and exercise time.",
         [S("u", "Units", [("m", "kg"), ("i", "lb")]), N("w", "Body weight", 70, "0.1"), N("a", "Exercise today (minutes)", 30)],
         r'''const w=v.u==='m'?v.w:v.w*0.45359237;const lo=w*30,hi=w*35,ex=v.a/30*350;
const f=ml=>N2(ml/1000,1)+' L ('+N2(ml/29.5735,0)+' fl oz)';
return '<b>About '+f(lo)+' to '+f(hi)+'</b><br>Add about '+Math.round(ex)+' ml ('+N2(ex/29.5735,0)+' fl oz) for '+v.a+' minutes of exercise<br><small>Includes water from food and other drinks.</small>';''',
         "<h2>A rough guide</h2><p>A common rule of thumb is 30&ndash;35 ml of fluid per kilogram of body weight per day, plus extra for exercise and heat. Needs vary with climate, health and pregnancy or breastfeeding. Drink to thirst and check with a doctor if you have a medical condition affecting fluid intake.</p>",
         [("Do I need to drink only water?", "No. Tea, coffee, milk and the water in food all count."),
          ("Can you drink too much?", "Yes, though it is rare. Drinking very large amounts in a short time can be dangerous.")])

    tool("protein", "Protein Intake Calculator", "health", "daily protein by goal",
         "Estimate daily protein needs in grams from your weight and goal.",
         [S("u", "Units", [("m", "kg"), ("i", "lb")]), N("w", "Body weight", 70, "0.1"), S("g", "Goal", [("0.8:1.0", "General health"), ("1.2:1.6", "Regular exercise"), ("1.6:2.2", "Building muscle"), ("1.6:2.0", "Fat loss while keeping muscle")])],
         r'''const w=v.u==='m'?v.w:v.w*0.45359237,p=v.g.split(':').map(Number);
return '<b>'+Math.round(w*p[0])+' &ndash; '+Math.round(w*p[1])+' g per day</b><br><small>Roughly '+p[0]+'&ndash;'+p[1]+' g per kg of body weight. 100 g of chicken breast has about 31 g of protein; one egg about 6 g.</small>';''',
         "<h2>Where the ranges come from</h2><p>The general recommended dietary allowance is about 0.8 g per kg of body weight. Sports nutrition guidance for people who train regularly or want to build muscle commonly suggests roughly 1.2&ndash;2.2 g per kg. People with kidney disease or other conditions should follow their doctor&rsquo;s advice.</p>",
         [("Is more protein always better?", "Benefits level off at higher intakes, and total calories and training matter as much."),
          ("Can vegetarians reach these numbers?", "Yes, with foods such as legumes, tofu, dairy, eggs and soy or pea protein.")])

    tool("heartrate", "Target Heart Rate Calculator", "health", "heart rate training zones",
         "Estimate your maximum heart rate and training zones from your age, optionally using your resting heart rate.",
         [N("a", "Age", 35), N("r", "Resting heart rate (optional, 0 to skip)", 60)],
         r'''const mx=220-v.a;if(mx<=0)return '';const z=[['Warm-up / recovery',0.5,0.6],['Fat burn',0.6,0.7],['Aerobic',0.7,0.8],['Hard',0.8,0.9]];
const f=p=>Math.round(v.r>0?v.r+(mx-v.r)*p:mx*p);
return '<b>Estimated max heart rate '+mx+' bpm</b><br>'+z.map(x=>x[0]+': '+f(x[1])+' &ndash; '+f(x[2])+' bpm').join('<br>')+(v.r>0?'<br><small>Zones use the Karvonen (heart-rate reserve) method.</small>':'');''',
         "<h2>Estimates only</h2><p>Maximum heart rate is estimated as 220 − age, which can be off by 10 bpm or more for individuals. With a resting heart rate the zones use the Karvonen method: target = resting + (max − resting) × intensity. If you have a heart condition or take medication that affects your heart rate, ask your doctor before training by heart rate.</p>",
         [("How do I measure resting heart rate?", "Count your pulse for 60 seconds right after waking, before getting out of bed."),
          ("Is 220 − age accurate?", "It is an average. A fitness test or a recent hard effort gives a better personal maximum.")])

    tool("onerm", "One-Rep Max Calculator", "health", "estimate your 1RM from reps",
         "Estimate your one-rep max (1RM) from the weight and number of reps you can lift, and get training percentages.",
         [N("w", "Weight lifted", 100, "0.5"), N("r", "Reps completed (1-12 works best)", 5)],
         r'''if(!(v.r>=1))return '';const ep=v.w*(1+v.r/30),br=v.r<37?v.w*36/(37-v.r):NaN;
return '<b>Estimated 1RM about '+N2(ep,1)+'</b> (Epley) / '+N2(br,1)+' (Brzycki)<br>'+[90,80,70,60].map(p=>p+'%: '+N2(ep*p/100,1)).join(' · ');''',
         "<h2>Formulas</h2><p>Epley: 1RM = weight × (1 + reps ÷ 30). Brzycki: 1RM = weight × 36 ÷ (37 − reps). Estimates are most accurate for sets of about 2&ndash;10 reps and less reliable for high reps. Test a true one-rep max only with a spotter and good warm-up.</p>",
         [("Which formula should I trust?", "They agree closely for low reps. Use either as a rough planning number."),
          ("How do I use the percentages?", "Training programmes often prescribe work as a percentage of 1RM, for example 5 reps at 80%.")])

    tool("pace", "Running Pace Calculator", "health", "pace, speed and race times",
         "Calculate your running pace per kilometre and per mile from distance and time, with predicted times for common race distances.",
         [N("d", "Distance (km)", 5, "0.01"), N("hh", "Hours", 0), N("mm", "Minutes", 28), N("ss", "Seconds", 30)],
         r'''const t=v.hh*3600+v.mm*60+v.ss;if(!(v.d>0&&t>0))return '';const p=t/v.d,fm=x=>Math.floor(x/60)+':'+pad(Math.round(x%60)===60?0:Math.round(x%60));
const ft=x=>{x=Math.round(x);const h=Math.floor(x/3600),m=Math.floor(x%3600/60),s=x%60;return (h?h+':'+pad(m):m)+':'+pad(s)};
return '<b>Pace '+fm(p)+' /km</b> &middot; '+fm(p*1.609344)+' /mile<br>Speed '+N2(v.d/(t/3600),2)+' km/h ('+N2(v.d/(t/3600)/1.609344,2)+' mph)<br>At this pace: 10 km '+ft(p*10)+' &middot; half marathon '+ft(p*21.0975)+' &middot; marathon '+ft(p*42.195)+'<br><small>Predictions assume you hold the pace; longer races are usually slower.</small>';''',
         "<h2>Pace maths</h2><p>Pace is time divided by distance. A mile is 1.609344 km, so a 5:00/km pace is about 8:03/mile. Race predictions simply multiply your pace by the race distance, which is optimistic for longer events since most runners slow down.</p>",
         [("How do I convert pace between km and miles?", "Multiply a per-km pace by 1.609 for a per-mile pace."),
          ("What is a good 5K time?", "It depends on age and experience; beginners often finish in 30&ndash;40 minutes.")])

    # ================= MATH & CONVERTERS =================
    tool("percent", "Percentage Calculator", "tool", "percent of, percent change and more",
         "Calculate what percent one number is of another, a percentage of a number, and percentage increase or decrease.",
         [S("m", "Question", [("of", "What is X% of Y?"), ("is", "X is what % of Y?"), ("chg", "% change from X to Y"), ("inc", "Increase X by Y%"), ("dec", "Decrease X by Y%")]),
          N("x", "X", 20, "any"), N("y", "Y", 150, "any")],
         r'''const x=v.x,y=v.y;
if(v.m==='of')return '<b>'+N2(x/100*y,4)+'</b><br><small>'+x+'% of '+y+'</small>';
if(v.m==='is'){if(y===0)return '';return '<b>'+N2(x/y*100,4)+'%</b><br><small>'+x+' is this share of '+y+'</small>'}
if(v.m==='chg'){if(x===0)return '';const c=(y-x)/x*100;return '<b>'+(c>=0?'+':'')+N2(c,4)+'%</b> '+(c>=0?'increase':'decrease')+'<br><small>From '+x+' to '+y+'</small>'}
if(v.m==='inc')return '<b>'+N2(x*(1+y/100),4)+'</b><br><small>'+x+' + '+y+'%</small>';
return '<b>'+N2(x*(1-y/100),4)+'</b><br><small>'+x+' &minus; '+y+'%</small>';''',
         "<h2>Formulas</h2><ul><li>X% of Y = X ÷ 100 × Y</li><li>X is what % of Y = X ÷ Y × 100</li><li>Percent change = (new − old) ÷ old × 100</li><li>Increase by Y% = X × (1 + Y ÷ 100)</li></ul><p>A 50% increase followed by a 50% decrease does not return you to the start: 100 → 150 → 75.</p>",
         [("How do I calculate a percentage discount?", "Choose &ldquo;Decrease X by Y%&rdquo;: enter the price as X and the discount as Y."),
          ("What is a percentage point?", "The difference between two percentages: going from 10% to 12% is 2 percentage points but a 20% increase.")])

    tool("unit", "Unit Converter", "tool", "length, weight, area, volume, temperature, speed",
         "Convert between metric and imperial units of length, weight, area, volume, temperature and speed.",
         [TX("x", "Value", "1"), S("f", "From", B_UNITS_FROM), S("t", "To", B_UNITS_TO)],
         r'''const U={mm:['L',0.001],cm:['L',0.01],m:['L',1],km:['L',1000],in:['L',0.0254],ft:['L',0.3048],yd:['L',0.9144],mi:['L',1609.344],nmi:['L',1852],
mg:['M',1e-6],g:['M',0.001],kg:['M',1],t:['M',1000],oz:['M',0.028349523125],lb:['M',0.45359237],st:['M',6.35029318],
cm2:['A',1e-4],m2:['A',1],ha:['A',1e4],km2:['A',1e6],in2:['A',6.4516e-4],ft2:['A',0.09290304],yd2:['A',0.83612736],ac:['A',4046.8564224],mi2:['A',2589988.110336],
ml:['V',0.001],l:['V',1],m3:['V',1000],tsp:['V',0.00492892159375],tbsp:['V',0.01478676478125],floz:['V',0.0295735295625],cup:['V',0.2365882365],pt:['V',0.473176473],qt:['V',0.946352946],gal:['V',3.785411784],
ms:['S',1],kmh:['S',1/3.6],mph:['S',0.44704],kn:['S',1852/3600],fts:['S',0.3048],
c:['T',0],f:['T',0],k:['T',0]};
const x=parseFloat(String(v.x).replace(',','.'));if(!isFinite(x))return 'Enter a number.';const a=U[v.f],b=U[v.t];if(!a||!b||a[0]!==b[0])return 'Choose two units of the same type (for example km and miles).';
let r;if(a[0]==='T'){const k=v.f==='c'?x+273.15:v.f==='f'?(x-32)*5/9+273.15:x;if(k<0)return 'That is below absolute zero.';r=v.t==='c'?k-273.15:v.t==='f'?(k-273.15)*9/5+32:k}else r=x*a[1]/b[1];
const s=Math.abs(r)>=1e9||(Math.abs(r)<1e-6&&r!==0)?r.toExponential(6):String(+r.toPrecision(10));
const SY={c:'\u00b0C',f:'\u00b0F',k:'K',l:'L',ms:'m/s',kmh:'km/h',fts:'ft/s',cm2:'cm\u00b2',m2:'m\u00b2',km2:'km\u00b2',in2:'in\u00b2',ft2:'ft\u00b2',yd2:'yd\u00b2',mi2:'mi\u00b2',m3:'m\u00b3',floz:'fl oz'},sy=u=>SY[u]||u;
return '<b>'+x+' '+sy(v.f)+' = '+s+' '+sy(v.t)+'</b>';''',
         "<h2>Conversion factors</h2><p>Conversions go through a base unit (metre, kilogram, square metre, litre, metre per second) using exact international definitions: 1 inch = 25.4 mm, 1 lb = 0.45359237 kg, 1 mile = 1,609.344 m. Gallons, pints, quarts, cups and fluid ounces are US customary. Temperatures are converted through kelvin.</p>",
         [("Why do I get an error when I mix types?", "You can only convert between units of the same kind, such as length to length. Pick both units from the same group."),
          ("Are UK and US gallons the same?", "No. A US gallon is about 3.785 L and a UK (imperial) gallon about 4.546 L. This converter uses the US gallon.")])

    tool("average", "Average Calculator", "tool", "mean, median, mode and range",
         "Enter a list of numbers to get the mean, median, mode, sum, range and standard deviation.",
         [TA("l", "Numbers (separated by commas, spaces or new lines)", "12, 15, 15, 20, 28")],
         r'''const xs=v.l.split(/[\s,;]+/).filter(Boolean).map(Number);if(!xs.length||xs.some(isNaN))return 'Enter numbers separated by commas, spaces or new lines.';
const n=xs.length,s=xs.reduce((a,b)=>a+b,0),m=s/n,so=xs.slice().sort((a,b)=>a-b),med=n%2?so[(n-1)/2]:(so[n/2-1]+so[n/2])/2;
const c={};xs.forEach(x=>c[x]=(c[x]||0)+1);const mc=Math.max.apply(null,Object.values(c)),mode=mc>1?Object.keys(c).filter(k=>c[k]===mc).join(', '):'none';
const sd=Math.sqrt(xs.reduce((a,x)=>a+(x-m)*(x-m),0)/n),sds=n>1?Math.sqrt(xs.reduce((a,x)=>a+(x-m)*(x-m),0)/(n-1)):0;
return '<b>Mean '+N2(m,4)+'</b> · Median '+N2(med,4)+' · Mode '+mode+'<br>Count '+n+' · Sum '+N2(s,4)+' · Range '+N2(so[n-1]-so[0],4)+'<br>Std. deviation '+N2(sd,4)+' (population) / '+N2(sds,4)+' (sample)';''',
         "<h2>Definitions</h2><p>Mean is the sum divided by the count. Median is the middle value of the sorted list (or the average of the two middle values). Mode is the most frequent value. Range is the largest minus the smallest. The sample standard deviation divides by n − 1 and is used when your numbers are a sample of a larger group.</p>",
         [("Mean or median?", "The median is less affected by extreme values, so it is better for incomes or house prices."),
          ("Can I paste from a spreadsheet?", "Yes. A pasted column works because line breaks are accepted as separators.")])

    tool("gcdlcm", "GCD & LCM Calculator", "tool", "greatest common divisor and least common multiple",
         "Find the greatest common divisor (GCF) and least common multiple of two or more whole numbers.",
         [TX("l", "Numbers (separated by commas or spaces)", "12, 18, 30")],
         r'''const xs=v.l.split(/[\s,;]+/).filter(Boolean).map(Number);if(xs.length<2||xs.some(x=>!Number.isInteger(x)||x<1||x>1e9))return 'Enter two or more whole numbers between 1 and 1,000,000,000.';
const g=(a,b)=>b?g(b,a%b):a;const G=xs.reduce(g),L=xs.reduce((x,y)=>x/g(x,y)*y);
return 'GCD (greatest common divisor) <b>'+G+'</b><br>LCM (least common multiple) <b>'+L.toLocaleString('en-US')+'</b>'+(L>9e15?'<br><small>The LCM is too large to be exact.</small>':'');''',
         "<h2>Methods</h2><p>The GCD uses the Euclidean algorithm. The LCM of two numbers is a × b ÷ GCD(a, b); for more numbers it is applied repeatedly. The GCD is also called the greatest common factor (GCF) or highest common factor (HCF). It is handy for simplifying fractions.</p>",
         [("How do I simplify a fraction?", "Divide the top and bottom by their GCD."),
          ("What is the LCM used for?", "Adding fractions with different denominators and finding when repeating cycles line up.")])

    tool("primes", "Prime Factorization Calculator", "tool", "prime check and factors",
         "Find the prime factors of a number, check whether it is prime and list its divisors.",
         [N("n", "Whole number", 360, "1")],
         r'''let n=Math.floor(v.n);if(!(n>=2)||n>1e12)return 'Enter a whole number from 2 to 1,000,000,000,000.';const o=n,f={};
for(let p=2;p*p<=n;p++){while(n%p===0){f[p]=(f[p]||0)+1;n/=p}}if(n>1)f[n]=(f[n]||0)+1;
const ks=Object.keys(f),isP=ks.length===1&&f[ks[0]]===1;const d=[];for(let i=1;i*i<=o&&d.length<200;i++)if(o%i===0){d.push(i);if(i*i!==o)d.push(o/i)}d.sort((a,b)=>a-b);
return '<b>'+(isP?o.toLocaleString('en-US')+' is prime':o.toLocaleString('en-US')+' = '+ks.map(k=>k+(f[k]>1?'<sup>'+f[k]+'</sup>':'')).join(' &times; '))+'</b>'+(isP?'':'<br>Divisors: '+d.join(', '));''',
         "<h2>Prime factorisation</h2><p>Every whole number greater than 1 is either prime or can be written as a product of primes in exactly one way (the fundamental theorem of arithmetic). The calculator tries dividing by each number up to the square root, which is fast for values up to about a trillion.</p>",
         [("Is 1 prime?", "No. A prime has exactly two divisors, and 1 has only one."),
          ("What is the largest number I can check?", "1,000,000,000,000 (10<sup>12</sup>).")])

    tool("base", "Number Base Converter", "tool", "binary, octal, decimal, hex",
         "Convert numbers between binary, octal, decimal and hexadecimal.",
         [TX("x", "Number", "255"), S("f", "From base", [("10", "Decimal (10)"), ("2", "Binary (2)"), ("8", "Octal (8)"), ("16", "Hexadecimal (16)")])],
         r'''const b=+v.f,s=String(v.x).trim().toLowerCase();if(!s)return '';const ok={2:/^[01]+$/,8:/^[0-7]+$/,10:/^[0-9]+$/,16:/^[0-9a-f]+$/}[b];if(!ok.test(s))return 'That is not a valid base-'+b+' number.';
if(s.length>15)return 'Please enter a shorter number.';const n=parseInt(s,b);if(!Number.isSafeInteger(n))return 'The number is too large.';
return 'Decimal <b>'+n.toLocaleString('en-US')+'</b><br>Binary <b>'+n.toString(2)+'</b><br>Octal <b>'+n.toString(8)+'</b><br>Hex <b>'+n.toString(16).toUpperCase()+'</b>';''',
         "<h2>Number bases</h2><p>Computers store numbers in binary (base 2). Octal (base 8) and hexadecimal (base 16) are compact ways to write binary: each hex digit equals four bits. Hex digits above 9 are the letters A to F.</p>",
         [("How do I convert binary to decimal by hand?", "Add the powers of two for each 1 bit, from the right: 1011 = 8 + 2 + 1 = 11."),
          ("Does it handle negative numbers or fractions?", "No, only non-negative whole numbers.")])

    tool("roman", "Roman Numeral Converter", "tool", "numbers to Roman numerals and back",
         "Convert numbers from 1 to 3,999 to Roman numerals, or Roman numerals to numbers.",
         [TX("x", "Number or Roman numeral", "2026")],
         r'''const s=String(v.x).trim().toUpperCase();if(!s)return '';const T=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
const toR=n=>{let r='';T.forEach(t=>{while(n>=t[0]){r+=t[1];n-=t[0]}});return r};
if(/^[0-9]+$/.test(s)){const n=+s;if(n<1||n>3999)return 'Enter a number from 1 to 3999.';return '<b>'+toR(n)+'</b>'}
if(!/^[MDCLXVI]+$/.test(s))return 'Enter a number or a valid Roman numeral.';const V={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};let n=0;for(let i=0;i<s.length;i++){const a=V[s[i]],b=V[s[i+1]]||0;n+=a<b?-a:a}
if(n<1||n>3999||toR(n)!==s)return 'That is not a standard Roman numeral.';return '<b>'+n+'</b>';''',
         "<h2>Rules</h2><p>The symbols are I = 1, V = 5, X = 10, L = 50, C = 100, D = 500 and M = 1000. A smaller symbol before a larger one is subtracted (IV = 4, IX = 9, XL = 40). Standard numerals never repeat a symbol more than three times in a row, which limits them to 3,999.</p>",
         [("Why only up to 3999?", "Standard Roman numerals have no symbol for 5,000 or above, so larger numbers need extra notation."),
          ("Is IIII valid?", "Some clocks use IIII, but the standard form is IV, and this converter only accepts standard numerals.")])

    tool("ratio", "Aspect Ratio Calculator", "tool", "resize and keep proportions",
         "Find the simplest aspect ratio of a width and height, or calculate the missing dimension when resizing.",
         [N("w", "Width", 1920, "1"), N("h", "Height", 1080, "1"), N("nw", "New width (optional)", 1280, "1")],
         r'''const w=Math.round(v.w),h=Math.round(v.h);if(!(w>0&&h>0))return '';const g=(a,b)=>b?g(b,a%b):a,d=g(w,h);
let o='<b>Aspect ratio '+(w/d)+':'+(h/d)+'</b> ('+N2(w/h,3)+':1)';if(v.nw>0)o+='<br>At width '+Math.round(v.nw)+' the height is <b>'+N2(v.nw*h/w,1)+'</b>';return o;''',
         "<h2>How it works</h2><p>The ratio is the width and height divided by their greatest common divisor, so 1920 × 1080 reduces to 16:9. To resize while keeping proportions, new height = new width × height ÷ width. Common ratios: 16:9 (video), 4:3 (older screens), 3:2 (photos), 1:1 (square), 9:16 (vertical video).</p>",
         [("What is the ratio of a 1080p screen?", "16:9."),
          ("How do I avoid stretching an image?", "Set one dimension and compute the other with the same ratio.")])

    tool("random", "Random Number Generator", "play", "pick random numbers in a range",
         "Generate one or more random whole numbers between a minimum and maximum, with or without repeats.",
         [N("a", "Minimum", 1, "1"), N("b", "Maximum", 100, "1"), N("n", "How many", 5, "1"), S("u", "Duplicates", [("no", "No repeats"), ("yes", "Allow repeats")])],
         r'''const a=Math.floor(v.a),b=Math.floor(v.b),n=Math.floor(v.n);if(!(b>=a)||!(n>=1)||n>1000)return 'Check the range and count (1 to 1000).';const size=b-a+1;
if(v.u==='no'&&n>size)return 'You asked for more numbers than the range contains.';
const rnd=m=>{const u=new Uint32Array(1),lim=Math.floor(4294967296/m)*m;let x;do{crypto.getRandomValues(u);x=u[0]}while(x>=lim);return x%m};
const out=[];if(v.u==='yes'){for(let i=0;i<n;i++)out.push(a+rnd(size))}else{const seen=new Set();while(out.length<n){const x=a+rnd(size);if(!seen.has(x)){seen.add(x);out.push(x)}}}
return '<b>'+out.join(', ')+'</b>';''',
         "<h2>How random is it?</h2><p>Numbers come from your browser&rsquo;s cryptographically secure random generator, with no modulo bias, so every value in the range is equally likely. Change any input or reload the page to draw again.</p>",
         [("Can I use it for a prize draw?", "It is fair, but for official draws follow your local rules and keep a record of the process."),
          ("Why did I get repeats?", "Choose &ldquo;No repeats&rdquo; to draw without replacement.")])

    tool("textcase", "Text Case Converter", "tool", "upper, lower, title and sentence case",
         "Convert text to uppercase, lowercase, title case, sentence case, camelCase, snake_case or kebab-case.",
         [TA("t", "Your text", "The quick brown fox jumps over the lazy dog"),
          S("m", "Convert to", [("up", "UPPERCASE"), ("lo", "lowercase"), ("ti", "Title Case"), ("se", "Sentence case"), ("ca", "camelCase"), ("sn", "snake_case"), ("ke", "kebab-case")])],
         r'''const t=v.t;if(!t.trim())return '';const w=t.toLowerCase().match(/[a-z0-9À-ɏ]+/g)||[];let r;
if(v.m==='up')r=t.toUpperCase();else if(v.m==='lo')r=t.toLowerCase();else if(v.m==='ti')r=t.toLowerCase().replace(/(^|[\s\-(\[“"])([a-zà-ɏ])/g,(m,a,b)=>a+b.toUpperCase());
else if(v.m==='se')r=t.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-zà-ɏ])/g,(m,a,b)=>a+b.toUpperCase());
else if(v.m==='ca')r=w.map((x,i)=>i?x[0].toUpperCase()+x.slice(1):x).join('');else if(v.m==='sn')r=w.join('_');else r=w.join('-');
return '<b>'+X(r)+'</b>';''',
         "<h2>Which case when?</h2><p>Title Case capitalises the first letter of each word, Sentence case only the first letter of each sentence. camelCase, snake_case and kebab-case are naming styles used in programming and URLs; they drop punctuation and join words. Title Case here capitalises every word and does not apply style-guide exceptions for small words like &ldquo;of&rdquo; or &ldquo;the&rdquo;.</p>",
         [("Does it keep accents?", "Yes for upper, lower, title and sentence case. The programming cases keep Latin letters with accents."),
          ("Is my text sent anywhere?", "No. It is converted in your browser.")])

    tool("datasize", "Data Storage Converter", "tool", "KB, MB, GB, TB",
         "Convert between bits, bytes, kilobytes, megabytes, gigabytes and terabytes, in decimal (1000) and binary (1024) units.",
         [N("x", "Value", 1, "any"), S("f", "From", [("1", "Byte (B)"), ("1e3", "Kilobyte (KB, 1000 B)"), ("1e6", "Megabyte (MB)"), ("1e9", "Gigabyte (GB)"), ("1e12", "Terabyte (TB)"), ("1024", "Kibibyte (KiB, 1024 B)"), ("1048576", "Mebibyte (MiB)"), ("1073741824", "Gibibyte (GiB)"), ("1099511627776", "Tebibyte (TiB)")])],
         r'''const b=v.x*(+v.f);const g=x=>{if(x===0)return '0';const a=Math.abs(x);if(a>=1e15||a<1e-6)return x.toExponential(4);return (+x.toPrecision(10)).toLocaleString('en-US',{maximumFractionDigits:6})};
return '<b>'+g(b)+' bytes</b><br>'+g(b/1e3)+' KB · '+g(b/1e6)+' MB · '+g(b/1e9)+' GB · '+g(b/1e12)+' TB<br>'+g(b/1024)+' KiB · '+g(b/1048576)+' MiB · '+g(b/1073741824)+' GiB · '+g(b/1099511627776)+' TiB<br>'+g(b*8)+' bits';''',
         "<h2>1000 or 1024?</h2><p>Storage makers use decimal units (1 GB = 1,000,000,000 bytes) while many operating systems use binary units (1 GiB = 1,073,741,824 bytes) and sometimes call them GB too. That is why a &ldquo;500 GB&rdquo; drive shows up as about 465 GiB on some computers.</p>",
         [("Why does my drive show less space than advertised?", "Because of the decimal/binary difference and some space used for formatting and system files."),
          ("What is a bit?", "The smallest unit of data. A byte is 8 bits. Network speeds are usually quoted in bits per second.")])

    # ================= RANDOM & FUN =================
    tool("pick", "Random Name Picker", "play", "pick a winner from a list",
         "Paste a list of names and pick one or more winners at random.",
         [TA("l", "Names (one per line)", "Alex\nBlair\nCasey\nDrew\nEmery"), N("n", "How many winners", 1, "1")],
         r'''const xs=v.l.split('\n').map(s=>s.trim()).filter(Boolean);const n=Math.floor(v.n);if(xs.length<2)return 'Add at least two names.';if(!(n>=1)||n>xs.length)return 'Choose between 1 and '+xs.length+' winners.';
const a=xs.slice(),u=new Uint32Array(1);for(let i=a.length-1;i>0;i--){const lim=Math.floor(4294967296/(i+1))*(i+1);let x;do{crypto.getRandomValues(u);x=u[0]}while(x>=lim);const j=x%(i+1);const t=a[i];a[i]=a[j];a[j]=t}
return '<b>'+a.slice(0,n).map(X).join(', ')+'</b><br><small>Change any input to draw again.</small>';''',
         "<h2>Fair draws</h2><p>Names are shuffled with an unbiased Fisher-Yates shuffle using your browser&rsquo;s secure random generator, so everyone has an equal chance. Duplicate names count as separate entries.</p>",
         [("Is it really random?", "Yes, it uses a cryptographically secure random source."),
          ("Can I draw again?", "Edit the number of winners or the list and a new draw is made.")])

    tool("teams", "Random Team Generator", "play", "split people into teams",
         "Split a list of names into balanced random teams.",
         [TA("l", "Names (one per line)", "Alex\nBlair\nCasey\nDrew\nEmery\nFinley\nGray"), N("n", "Number of teams", 2, "1")],
         r'''const xs=v.l.split('\n').map(s=>s.trim()).filter(Boolean),k=Math.floor(v.n);if(xs.length<2)return 'Add at least two names.';if(!(k>=2)||k>xs.length)return 'Choose between 2 and '+xs.length+' teams.';
const a=xs.slice(),u=new Uint32Array(1);for(let i=a.length-1;i>0;i--){const lim=Math.floor(4294967296/(i+1))*(i+1);let x;do{crypto.getRandomValues(u);x=u[0]}while(x>=lim);const j=x%(i+1);const t=a[i];a[i]=a[j];a[j]=t}
const T=Array.from({length:k},()=>[]);a.forEach((x,i)=>T[i%k].push(x));return T.map((t,i)=>'<b>Team '+(i+1)+'</b> ('+t.length+'): '+t.map(X).join(', ')).join('<br>');''',
         "<h2>How teams are made</h2><p>The list is shuffled and dealt out one by one, so team sizes differ by at most one person. Edit any input to reshuffle.</p>",
         [("Can I keep certain people together?", "Not automatically. Put them in as one entry, for example &ldquo;Sam + Jo&rdquo;."),
          ("Is there a limit?", "As many names as you can paste.")])

    tool("coinflip", "Coin Flip & Dice Roller", "play", "flip a coin or roll dice",
         "Flip a coin or roll one or more dice with any number of sides.",
         [S("m", "What to do", [("coin", "Flip a coin"), ("d6", "Roll six-sided dice"), ("d20", "Roll a twenty-sided die"), ("d100", "Roll a hundred-sided die")]), N("n", "How many (coins or dice)", 1, "1")],
         r'''const n=Math.floor(v.n);if(!(n>=1)||n>100)return 'Choose 1 to 100.';const s={coin:2,d6:6,d20:20,d100:100}[v.m];
const rnd=m=>{const u=new Uint32Array(1),lim=Math.floor(4294967296/m)*m;let x;do{crypto.getRandomValues(u);x=u[0]}while(x>=lim);return x%m};
const r=[];for(let i=0;i<n;i++)r.push(rnd(s)+1);
if(v.m==='coin'){const h=r.filter(x=>x===1).length;return '<b>'+r.map(x=>x===1?'Heads':'Tails').join(', ')+'</b>'+(n>1?'<br>'+h+' heads, '+(n-h)+' tails':'')}
return '<b>'+r.join(', ')+'</b>'+(n>1?'<br>Total '+r.reduce((a,b)=>a+b,0):'');''',
         "<h2>Fair by design</h2><p>Each flip or roll is generated independently with a secure random source and no modulo bias. Change any input to flip or roll again.</p>",
         [("Are the results independent?", "Yes. Past results do not affect the next ones."),
          ("Can I use it for games?", "Yes, for fun and for deciding who goes first.")])


B_ZONES = [("UTC", "UTC"), ("America/New_York", "New York"), ("America/Chicago", "Chicago"), ("America/Denver", "Denver"), ("America/Los_Angeles", "Los Angeles"),
           ("America/Mexico_City", "Mexico City"), ("America/Sao_Paulo", "São Paulo"), ("Europe/London", "London"), ("Europe/Paris", "Paris / Berlin"),
           ("Europe/Athens", "Athens"), ("Europe/Moscow", "Moscow"), ("Africa/Cairo", "Cairo"), ("Africa/Lagos", "Lagos"), ("Africa/Johannesburg", "Johannesburg"),
           ("Africa/Nairobi", "Nairobi"), ("Asia/Dubai", "Dubai"), ("Asia/Karachi", "Karachi"), ("Asia/Kolkata", "India (Kolkata)"), ("Asia/Dhaka", "Dhaka"),
           ("Asia/Bangkok", "Bangkok"), ("Asia/Singapore", "Singapore"), ("Asia/Hong_Kong", "Hong Kong"), ("Asia/Shanghai", "Beijing / Shanghai"),
           ("Asia/Tokyo", "Tokyo"), ("Asia/Seoul", "Seoul"), ("Australia/Sydney", "Sydney"), ("Pacific/Auckland", "Auckland")]

_U = [("Length", [("mm", "millimetre (mm)"), ("cm", "centimetre (cm)"), ("m", "metre (m)"), ("km", "kilometre (km)"), ("in", "inch (in)"), ("ft", "foot (ft)"), ("yd", "yard (yd)"), ("mi", "mile (mi)"), ("nmi", "nautical mile")]),
      ("Weight", [("mg", "milligram (mg)"), ("g", "gram (g)"), ("kg", "kilogram (kg)"), ("t", "tonne (t)"), ("oz", "ounce (oz)"), ("lb", "pound (lb)"), ("st", "stone (st)")]),
      ("Area", [("cm2", "square cm"), ("m2", "square metre"), ("ha", "hectare"), ("km2", "square km"), ("in2", "square inch"), ("ft2", "square foot"), ("yd2", "square yard"), ("ac", "acre"), ("mi2", "square mile")]),
      ("Volume", [("ml", "millilitre (ml)"), ("l", "litre (l)"), ("m3", "cubic metre"), ("tsp", "teaspoon (US)"), ("tbsp", "tablespoon (US)"), ("floz", "fluid ounce (US)"), ("cup", "cup (US)"), ("pt", "pint (US)"), ("qt", "quart (US)"), ("gal", "gallon (US)")]),
      ("Speed", [("ms", "metre/second"), ("kmh", "km/hour"), ("mph", "miles/hour"), ("kn", "knot"), ("fts", "foot/second")]),
      ("Temperature", [("c", "Celsius (°C)"), ("f", "Fahrenheit (°F)"), ("k", "Kelvin (K)")])]
B_UNITS = [(k, g + " · " + n) for g, us in _U for k, n in us]
def _rot(k):
    i = next(n for n, (a, _) in enumerate(B_UNITS) if a == k)
    return B_UNITS[i:] + B_UNITS[:i]
B_UNITS_FROM = _rot("km")
B_UNITS_TO = _rot("mi")
