/* /api/quote?symbols=AAPL,^GSPC,MES=F,EURUSD=X
   Real quotes for the things a browser cannot fetch itself: Yahoo Finance
   blocks cross-origin calls, so this function does the asking server-side.
   No key involved. Responses are CDN-cached for 30s so every visitor shares
   one upstream hit. Crypto never comes through here — Binance serves the
   browser directly. */

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; 100MillClub/1.0)' };
const MAX_SYMBOLS = 60;

async function one(symbol, attempt = 0) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) + '?interval=1d&range=5d';
  try {
    const r = await fetch(url, { headers: UA });
    if (r.status === 429 && attempt === 0) {
      // Yahoo throttles bursts — one polite retry rescues the stragglers
      await new Promise(res => setTimeout(res, 400));
      return one(symbol, 1);
    }
    if (!r.ok) return null;
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const meta = res?.meta;
    if (!meta || !isFinite(meta.regularMarketPrice)) return null;
    const prev = isFinite(meta.chartPreviousClose) ? meta.chartPreviousClose
               : isFinite(meta.previousClose) ? meta.previousClose : null;
    return {
      symbol,
      price: meta.regularMarketPrice,
      prevClose: prev,
      changePct: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : null,
      currency: meta.currency || 'USD',
      exchange: meta.exchangeName || '',
      marketState: meta.marketState || '',
      at: Date.now()
    };
  } catch {
    return null;
  }
}

export default async (req) => {
  const url = new URL(req.url);
  const raw = (url.searchParams.get('symbols') || '').trim();
  if (!raw) {
    return Response.json({ error: 'symbols required' }, { status: 400 });
  }
  const symbols = [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))]
    .slice(0, MAX_SYMBOLS);

  // a pool, not a stampede — 50 parallel hits made Yahoo drop a third of them
  const POOL = 10;
  const rows = [];
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(POOL, symbols.length) }, async () => {
    while (idx < symbols.length) {
      const mine = symbols[idx++];
      const row = await one(mine);
      if (row) rows.push(row);
    }
  }));

  return Response.json(
    { quotes: rows, source: 'Yahoo Finance (proxied)', at: Date.now() },
    {
      headers: {
        'Cache-Control': 'public, max-age=15, s-maxage=30, stale-while-revalidate=60',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
};

export const config = { path: '/api/quote' };
