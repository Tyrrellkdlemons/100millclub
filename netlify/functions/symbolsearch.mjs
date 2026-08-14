/* /api/search?q=tesla
   The long tail behind the search modal. Yahoo's autocomplete covers stocks,
   ETFs, indices, futures and forex worldwide; the browser adds crypto from
   CoinGecko itself (that API allows cross-origin calls, Yahoo's does not).
   No key, CDN-cached. */

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; 100MillClub/1.0)' };

/** Yahoo quoteType → our market bucket + TradingView prefix guess. */
function classify(r) {
  const t = (r.quoteType || '').toUpperCase();
  const exch = r.exchange || '';
  if (t === 'CRYPTOCURRENCY') return { m: 'crypto', tv: null };
  if (t === 'CURRENCY') return { m: 'forex', tv: 'FX:' + (r.symbol || '').replace('=X', '') };
  if (t === 'FUTURE') return { m: 'futures', tv: null };
  if (t === 'INDEX') return { m: 'indices', tv: null };
  // stocks and ETFs: map the venues TradingView charts anonymously
  const tvExch = { NMS: 'NASDAQ', NGM: 'NASDAQ', NCM: 'NASDAQ', NYQ: 'NYSE', PCX: 'AMEX', ASE: 'AMEX' }[exch];
  return { m: 'stocks', tv: tvExch ? tvExch + ':' + r.symbol : null };
}

export default async (req) => {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
  if (!q) return Response.json({ results: [] });

  const upstream = 'https://query1.finance.yahoo.com/v1/finance/search?q=' +
    encodeURIComponent(q) +
    '&quotesCount=14&newsCount=0&listsCount=0&enableFuzzyQuery=false';

  try {
    const r = await fetch(upstream, { headers: UA });
    if (!r.ok) return Response.json({ results: [], error: 'upstream ' + r.status }, { status: 200 });
    const j = await r.json();

    const results = (j?.quotes || [])
      .filter(x => x.symbol && (x.shortname || x.longname))
      .map(x => {
        const c = classify(x);
        return {
          symbol: x.symbol,
          name: x.shortname || x.longname,
          exch: x.exchDisp || x.exchange || '',
          type: x.quoteTypeDisp || x.quoteType || '',
          market: c.m,
          tv: c.tv,
          yh: x.symbol
        };
      });

    return Response.json(
      { results, source: 'Yahoo Finance (proxied)' },
      {
        headers: {
          'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  } catch (e) {
    return Response.json({ results: [], error: String(e?.message || e) }, { status: 200 });
  }
};

export const config = { path: '/api/search' };
