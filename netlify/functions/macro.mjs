/* /api/macro — the macro drivers commodities trade off.
   FRED's fredgraph.csv download needs no key (the JSON API does — this
   route is the honest keyless one), and the St. Louis Fed is the primary
   source for every series here. EIA weekly crude stocks joins the payload
   only when the owner has set EIA_API_KEY. */

const SERIES = [
  { id: 'DGS10',    label: '10-year Treasury',      unit: '%' },
  { id: 'DFF',      label: 'Fed funds rate',        unit: '%' },
  { id: 'DTWEXBGS', label: 'Dollar index (broad)',  unit: '' },
  { id: 'T10YIE',   label: '10-yr inflation expectation', unit: '%' }
];

async function fred(id) {
  const r = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 100MillClub/1.0)' }
  });
  if (!r.ok) return null;
  const text = await r.text();
  const points = [];
  for (const line of text.trim().split('\n').slice(1)) {
    const comma = line.indexOf(',');
    const date = line.slice(0, comma);
    const v = parseFloat(line.slice(comma + 1));
    if (isFinite(v)) points.push({ d: date, v });
  }
  if (!points.length) return null;
  const tail = points.slice(-40);
  const latest = tail[tail.length - 1];
  const prev = tail[tail.length - 2] || latest;
  return { latest: latest.v, latestDate: latest.d, prev: prev.v,
           change: Math.round((latest.v - prev.v) * 1000) / 1000,
           series: tail.map(p => p.v) };
}

async function eiaCrudeStocks() {
  const key = process.env.EIA_API_KEY;
  if (!key) return null;
  try {
    const url = 'https://api.eia.gov/v2/petroleum/stoc/wstk/data/?api_key=' + encodeURIComponent(key) +
      '&frequency=weekly&data[0]=value&facets[series][]=WCESTUS1' +
      '&sort[0][column]=period&sort[0][direction]=desc&length=8';
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const rows = j?.response?.data || [];
    if (rows.length < 2) return null;
    const latest = parseFloat(rows[0].value), prev = parseFloat(rows[1].value);
    if (!isFinite(latest)) return null;
    return {
      id: 'EIA_CRUDE', label: 'US crude stocks', unit: 'M bbl',
      latest: Math.round(latest / 1000 * 10) / 10,
      latestDate: rows[0].period,
      change: isFinite(prev) ? Math.round((latest - prev) / 1000 * 10) / 10 : null,
      series: rows.slice().reverse().map(x => parseFloat(x.value) / 1000).filter(isFinite)
    };
  } catch { return null; }
}

export default async () => {
  try {
    const [fredRows, eia] = await Promise.all([
      Promise.all(SERIES.map(async s => {
        const d = await fred(s.id);
        return d ? { id: s.id, label: s.label, unit: s.unit, ...d } : null;
      })),
      eiaCrudeStocks()
    ]);

    const tiles = fredRows.filter(Boolean);
    if (eia) tiles.push(eia);

    return Response.json(
      { ok: tiles.length > 0, tiles,
        source: 'FRED (St. Louis Fed)' + (eia ? ' + EIA' : ''),
        eiaConfigured: !!process.env.EIA_API_KEY },
      { headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=21600',
                   'Access-Control-Allow-Origin': '*' } }
    );
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 200 });
  }
};

export const config = { path: '/api/macro' };
