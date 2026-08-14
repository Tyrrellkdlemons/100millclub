/* /api/term?root=CL — the futures curve, built from real contract months.
   Yahoo quotes individual expiries (CLZ26.NYM, GCJ27.CMX …), so the curve
   is assembled by generating the next few listed months for a root,
   asking for each, and keeping what resolves. From two or more points:
   contango vs backwardation and the annualised roll yield — the cost (or
   pay) of holding the front and rolling it. */

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; 100MillClub/1.0)' };

const MONTH_CODE = ['F','G','H','J','K','M','N','Q','U','V','X','Z'];

const ROOTS = {
  CL: { exch: 'NYM', months: MONTH_CODE,                       name: 'WTI Crude' },
  NG: { exch: 'NYM', months: MONTH_CODE,                       name: 'Natural Gas' },
  GC: { exch: 'CMX', months: ['G','J','M','Q','V','Z'],        name: 'Gold' },
  SI: { exch: 'CMX', months: ['F','H','K','N','U','Z'],        name: 'Silver' },
  HG: { exch: 'CMX', months: ['F','H','K','N','U','Z'],        name: 'Copper' },
  ZC: { exch: 'CBT', months: ['H','K','N','U','Z'],            name: 'Corn' },
  ZW: { exch: 'CBT', months: ['H','K','N','U','Z'],            name: 'Wheat' },
  ZS: { exch: 'CBT', months: ['F','H','K','N','Q','U','X'],    name: 'Soybeans' }
};

async function priceOf(symbol) {
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' +
      encodeURIComponent(symbol) + '?interval=1d&range=5d', { headers: UA });
    if (!r.ok) return null;
    const meta = (await r.json())?.chart?.result?.[0]?.meta;
    const p = meta?.regularMarketPrice;
    return isFinite(p) && p > 0 ? p : null;
  } catch { return null; }
}

export default async (req) => {
  const url = new URL(req.url);
  const root = (url.searchParams.get('root') || '').toUpperCase();
  const cfg = ROOTS[root];
  if (!cfg) return Response.json({ ok: false, error: 'unknown root' }, { status: 400 });

  // candidate contracts: the next listed months, starting next calendar month
  const now = new Date();
  const candidates = [];
  for (let i = 1; i <= 14 && candidates.length < 5; i++) {
    const dt = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const code = MONTH_CODE[dt.getMonth()];
    if (!cfg.months.includes(code)) continue;
    candidates.push({
      symbol: root + code + String(dt.getFullYear() % 100).padStart(2, '0') + '.' + cfg.exch,
      label: code + String(dt.getFullYear() % 100).padStart(2, '0'),
      monthsOut: i
    });
  }

  try {
    const priced = (await Promise.all(candidates.map(async c => {
      const p = await priceOf(c.symbol);
      return p ? { ...c, price: p } : null;
    }))).filter(Boolean);

    if (priced.length < 2) {
      return Response.json(
        { ok: false, root, name: cfg.name, error: 'not enough contracts resolved' },
        { headers: { 'Cache-Control': 'public, max-age=600, s-maxage=900',
                     'Access-Control-Allow-Origin': '*' } }
      );
    }

    const front = priced[0], next = priced[1];
    const gapMonths = Math.max(1, next.monthsOut - front.monthsOut);
    const spreadPct = ((next.price - front.price) / front.price) * 100;
    // annualised: what the front→next slope implies over a year
    const annualised = (Math.pow(next.price / front.price, 12 / gapMonths) - 1) * 100;

    return Response.json(
      {
        ok: true, root, name: cfg.name,
        curve: priced.map(p => ({ contract: p.label, price: p.price, monthsOut: p.monthsOut })),
        state: spreadPct > 0.05 ? 'contango' : spreadPct < -0.05 ? 'backwardation' : 'flat',
        spreadPct: Math.round(spreadPct * 100) / 100,
        annualisedPct: Math.round(annualised * 10) / 10,
        source: 'Yahoo-quoted exchange contracts'
      },
      { headers: { 'Cache-Control': 'public, max-age=600, s-maxage=900, stale-while-revalidate=3600',
                   'Access-Control-Allow-Origin': '*' } }
    );
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 200 });
  }
};

export const config = { path: '/api/term' };
