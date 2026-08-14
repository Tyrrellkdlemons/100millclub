/* /api/cot — Commitments of Traders, straight from the primary source.
   CFTC's Public Reporting Environment (Socrata) — the disaggregated
   futures-only report, no key required. Weekly data (Tuesday positions,
   published Friday), so the CDN cache is generous. Managed Money is the
   "smart money speculator" cohort the pros actually watch. */

const DATASET = 'https://publicreporting.cftc.gov/resource/72hh-3qpy.json';

/* CFTC contract market codes → our board symbols. */
const MARKETS = {
  '088691': { sym: 'GOLD',    name: 'Gold (COMEX)' },
  '084691': { sym: 'SILVER',  name: 'Silver (COMEX)' },
  '067651': { sym: 'USOIL',   name: 'WTI Crude (NYMEX)' },
  '023651': { sym: 'NATGAS',  name: 'Natural Gas (NYMEX)' },
  '085692': { sym: 'COPPER',  name: 'Copper (COMEX)' },
  '002602': { sym: 'CORN',    name: 'Corn (CBOT)' },
  '001602': { sym: 'WHEAT',   name: 'Wheat SRW (CBOT)' },
  '005602': { sym: 'SOYBEANS',name: 'Soybeans (CBOT)' }
};

const num = (v) => {
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
};

export default async () => {
  const codes = Object.keys(MARKETS).map(c => `'${c}'`).join(',');
  const url = DATASET +
    `?$where=cftc_contract_market_code in(${codes})` +
    `&$order=report_date_as_yyyy_mm_dd DESC&$limit=48` +
    `&$select=cftc_contract_market_code,contract_market_name,market_and_exchange_names,` +
    `report_date_as_yyyy_mm_dd,open_interest_all,m_money_positions_long_all,m_money_positions_short_all`;

  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) return Response.json({ ok: false, error: 'CFTC answered ' + r.status }, { status: 200 });
    const rows = await r.json();

    // newest two reports per market → net position + weekly change
    const byCode = {};
    for (const row of rows) {
      const code = row.cftc_contract_market_code;
      if (!MARKETS[code]) continue;
      (byCode[code] = byCode[code] || []).push(row);
    }

    const out = [];
    for (const code of Object.keys(byCode)) {
      const [latest, prev] = byCode[code];
      const long = num(latest.m_money_positions_long_all);
      const short = num(latest.m_money_positions_short_all);
      if (long == null || short == null) continue;
      const net = long - short;
      const prevNet = prev
        ? (num(prev.m_money_positions_long_all) ?? 0) - (num(prev.m_money_positions_short_all) ?? 0)
        : null;
      const oi = num(latest.open_interest_all);
      out.push({
        sym: MARKETS[code].sym,
        name: MARKETS[code].name,
        reportDate: (latest.report_date_as_yyyy_mm_dd || '').slice(0, 10),
        mmLong: long,
        mmShort: short,
        mmNet: net,
        weeklyChange: prevNet == null ? null : net - prevNet,
        openInterest: oi,
        netPctOfOI: oi ? Math.round((net / oi) * 1000) / 10 : null
      });
    }

    return Response.json(
      { ok: true, markets: out, source: 'CFTC disaggregated COT (futures only)', cadence: 'weekly' },
      { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400',
                   'Access-Control-Allow-Origin': '*' } }
    );
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 200 });
  }
};

export const config = { path: '/api/cot' };
