/* /api/history?symbol=AAPL&interval=1h&range=1mo
   Candle history for the signals engine and anything else that needs real
   bars for non-crypto markets (crypto klines come straight from Binance in
   the browser). Yahoo v8 chart data, trimmed to the essentials, CDN-cached. */

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; 100MillClub/1.0)' };

const OK_INTERVAL = new Set(['1m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '1wk']);
const OK_RANGE = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y']);

export default async (req) => {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get('symbol') || '').trim();
  const interval = url.searchParams.get('interval') || '1h';
  const range = url.searchParams.get('range') || '1mo';

  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 });
  if (!OK_INTERVAL.has(interval) || !OK_RANGE.has(range)) {
    return Response.json({ error: 'bad interval or range' }, { status: 400 });
  }

  const upstream = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) +
    `?interval=${interval}&range=${range}&includePrePost=false`;

  try {
    const r = await fetch(upstream, { headers: UA });
    if (!r.ok) return Response.json({ error: 'upstream ' + r.status }, { status: 502 });
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const ts = res?.timestamp || [];
    const q = res?.indicators?.quote?.[0] || {};

    const bars = [];
    for (let i = 0; i < ts.length; i++) {
      const c = q.close?.[i];
      if (c == null) continue;   // Yahoo pads sessions with nulls
      bars.push({
        time: ts[i],
        open: q.open?.[i] ?? c,
        high: q.high?.[i] ?? c,
        low: q.low?.[i] ?? c,
        close: c,
        volume: q.volume?.[i] ?? 0
      });
    }

    return Response.json(
      { symbol, interval, range, bars, source: 'Yahoo Finance (proxied)' },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=300',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
};

export const config = { path: '/api/history' };
