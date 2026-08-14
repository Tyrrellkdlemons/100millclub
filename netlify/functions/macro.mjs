/* /api/macro — the macro drivers commodities trade off.

   Source history, because it matters: this first shipped reading FRED's
   fredgraph.csv. It worked locally and returned 502 in production (full
   history for DFF starts in 1954 — megabytes on a cold function), then
   kept failing even windowed, because FRED is slow and flaky from a
   datacenter. So the primary source is now the SAME Yahoo path the quote
   proxy already uses, which is proven to answer from Netlify's servers:
   market-priced yields and the dollar index, live rather than a day late.

   FRED stays as an optional enrichment for the one series that has no
   market ticker (10-year inflation expectations) on a short leash — if it
   answers, the tile appears; if not, the strip is one tile shorter and the
   diagnostics say why. Nothing here needs a key. EIA joins when one is set.  */

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; 100MillClub/1.0)' };

/* Market tickers → the macro reading each one is. `scale` converts a quote
   into the number a trader would recognise. */
const TICKERS = [
  { yh: '^TNX',      label: '10-year Treasury',   unit: '%' },
  { yh: '^IRX',      label: '13-week T-bill',     unit: '%' },
  { yh: 'DX-Y.NYB',  label: 'Dollar index',       unit: ''  },
  { yh: '^VIX',      label: 'Volatility (VIX)',   unit: ''  }
];

async function withTimeout(url, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { headers: UA, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** One Yahoo series → latest, change and a short sparkline. */
async function marketSeries(t) {
  try {
    const r = await withTimeout(
      'https://query1.finance.yahoo.com/v8/finance/chart/' +
      encodeURIComponent(t.yh) + '?interval=1d&range=3mo', 6000);
    if (!r.ok) return { err: t.label + ': HTTP ' + r.status };
    const res = (await r.json())?.chart?.result?.[0];
    const closes = (res?.indicators?.quote?.[0]?.close || []).filter(v => v != null && isFinite(v));
    const meta = res?.meta;
    const latest = isFinite(meta?.regularMarketPrice) ? meta.regularMarketPrice : closes[closes.length - 1];
    if (!isFinite(latest)) return { err: t.label + ': no price' };
    // The PREVIOUS DAY's close — not meta.chartPreviousClose, which on a
    // 3-month range is the close before the range STARTED. Using it labelled
    // a three-month move as a daily one (10-year read +0.198 instead of
    // -0.042). The last daily bar before today is the honest comparison.
    const prev = closes.length >= 2 ? closes[closes.length - 2] : meta?.chartPreviousClose;
    return {
      tile: {
        id: t.yh,
        label: t.label,
        unit: t.unit,
        latest: Math.round(latest * 1000) / 1000,
        latestDate: new Date((meta?.regularMarketTime || Date.now() / 1000) * 1000).toISOString().slice(0, 10),
        change: isFinite(prev) ? Math.round((latest - prev) * 1000) / 1000 : null,
        series: closes.slice(-40)
      }
    };
  } catch (e) {
    return { err: t.label + ': ' + (e?.name === 'AbortError' ? 'timed out' : String(e?.message || e)) };
  }
}

/**
 * 10-year inflation expectations — the one reading with no market ticker.
 * The keyless fredgraph.csv route is measured to time out consistently from
 * Netlify's datacenter (it works fine from a laptop), and waiting on it cost
 * every caller ~3.5s for a tile that never arrived. So this now runs ONLY
 * when FRED_API_KEY is set, where the JSON API is fast and reliable. Without
 * a key the strip is four tiles and says so — no silent gap, no dead wait.
 */
async function inflationExpectation() {
  const key = process.env.FRED_API_KEY;
  if (!key) return {};
  const start = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  try {
    const r = await withTimeout(
      'https://api.stlouisfed.org/fred/series/observations?series_id=T10YIE' +
      '&api_key=' + encodeURIComponent(key) + '&file_type=json&observation_start=' + start, 4000);
    if (!r.ok) return { err: 'FRED T10YIE: HTTP ' + r.status };
    const obs = (await r.json())?.observations || [];
    const points = obs
      .map(o => ({ d: o.date, v: parseFloat(o.value) }))
      .filter(p => isFinite(p.v));
    if (!points.length) return { err: 'FRED T10YIE: empty' };
    const latest = points[points.length - 1];
    const prev = points[points.length - 2] || latest;
    return {
      tile: {
        id: 'T10YIE', label: '10-yr inflation expectation', unit: '%',
        latest: latest.v, latestDate: latest.d,
        change: Math.round((latest.v - prev.v) * 1000) / 1000,
        series: points.slice(-40).map(p => p.v)
      }
    };
  } catch (e) {
    return { err: 'FRED T10YIE: ' + (e?.name === 'AbortError' ? 'timed out' : String(e?.message || e)) };
  }
}

async function eiaCrudeStocks() {
  const key = process.env.EIA_API_KEY;
  if (!key) return {};
  try {
    const r = await withTimeout(
      'https://api.eia.gov/v2/petroleum/stoc/wstk/data/?api_key=' + encodeURIComponent(key) +
      '&frequency=weekly&data[0]=value&facets[series][]=WCESTUS1' +
      '&sort[0][column]=period&sort[0][direction]=desc&length=8', 5000);
    if (!r.ok) return { err: 'EIA: HTTP ' + r.status };
    const rows = (await r.json())?.response?.data || [];
    if (rows.length < 2) return { err: 'EIA: thin response' };
    const latest = parseFloat(rows[0].value), prev = parseFloat(rows[1].value);
    if (!isFinite(latest)) return { err: 'EIA: bad value' };
    return {
      tile: {
        id: 'EIA_CRUDE', label: 'US crude stocks', unit: 'M bbl',
        latest: Math.round(latest / 1000 * 10) / 10,
        latestDate: rows[0].period,
        change: isFinite(prev) ? Math.round((latest - prev) / 1000 * 10) / 10 : null,
        series: rows.slice().reverse().map(x => parseFloat(x.value) / 1000).filter(isFinite)
      }
    };
  } catch (e) {
    return { err: 'EIA: ' + (e?.name === 'AbortError' ? 'timed out' : String(e?.message || e)) };
  }
}

export default async () => {
  const results = await Promise.all([
    ...TICKERS.map(marketSeries),
    inflationExpectation(),
    eiaCrudeStocks()
  ]);

  const tiles = results.map(r => r.tile).filter(Boolean);
  // never swallow a failure silently — a strip that is quietly short is a lie
  const diagnostics = results.map(r => r.err).filter(Boolean);

  const sources = ['Yahoo-quoted market rates'];
  if (tiles.some(t => t.id === 'T10YIE')) sources.push('FRED');
  if (tiles.some(t => t.id === 'EIA_CRUDE')) sources.push('EIA');

  return Response.json(
    {
      ok: tiles.length > 0,
      tiles,
      source: sources.join(' + '),
      diagnostics,
      eiaConfigured: !!process.env.EIA_API_KEY,
      fredConfigured: !!process.env.FRED_API_KEY
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
};

export const config = { path: '/api/macro' };
