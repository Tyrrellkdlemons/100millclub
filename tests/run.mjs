/* ==========================================================================
   tests/run.mjs — acceptance tests for the pure logic
   Run with:  node tests/run.mjs
   No framework, no build: the browser modules are loaded into a shimmed
   window and the rules are hammered directly — vetoes, confirmed bars,
   contract rolls, R-multiples, the risk guard, search ranking.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- browser shims ------------------------------------------------------ */
globalThis.window = globalThis;
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  get length() { return Object.keys(store).length; },
  key: (i) => Object.keys(store)[i] ?? null
};
globalThis.document = { getElementById: () => null, querySelectorAll: () => [] };
globalThis.location = { protocol: 'https:', origin: 'https://test', href: 'https://test/' };

function load(file) {
  (0, eval)(readFileSync(join(ROOT, 'js', file), 'utf8'));
}
['utils.js', 'data.js', 'markets.js', 'indicators.js', 'signals.js', 'trade.js', 'commod.js']
  .forEach(load);

const MC = globalThis.MC;

/* ---- micro-assert ------------------------------------------------------- */
let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name + (detail !== undefined ? '  → got: ' + JSON.stringify(detail) : '')); }
}
function section(t) { console.log('\n' + t); }

/* ========================================================================
   1 · Confirmed-bar enforcement
   ======================================================================== */
section('Confirmed bars');
{
  const now = 1_700_000_000_000;               // fixed clock
  const tf = 3600;
  const bars = [
    { time: now / 1000 - 7200, close: 1 },     // closed
    { time: now / 1000 - 3600, close: 2 },     // closed exactly
    { time: now / 1000 - 600, close: 3 }       // forming (started 10m ago)
  ];
  const out = MC.signals.confirmedBars(bars, tf, now);
  ok(out.length === 2, 'forming last bar is dropped', out.length);
  ok(out[out.length - 1].close === 2, 'newest survivor is the confirmed close');
  const allClosed = MC.signals.confirmedBars(bars.slice(0, 2), tf, now);
  ok(allClosed.length === 2, 'fully-closed series is untouched');
}

/* ========================================================================
   2 · Stale-data and disagreement vetoes
   ======================================================================== */
section('Vetoes');
{
  const agree = { trend: { dir: 1, conf: 0.7 }, momo: { dir: 1, conf: 0.6 } };
  const fight = { trend: { dir: 1, conf: 0.6 }, momo: { dir: -1, conf: 0.6 } };
  const mild = { trend: { dir: 1, conf: 0.5 }, momo: { dir: -1, conf: 0.6 } };

  ok(MC.signals.applyVetoes(agree, 60, 3600, 'crypto').length === 0, 'fresh + agreeing → no veto');
  const stale = MC.signals.applyVetoes(agree, 4 * 3600, 3600, 'crypto');
  ok(stale.some(v => v.type === 'stale'), 'crypto bar 4h old on 1h tf → stale veto');
  ok(MC.signals.applyVetoes(agree, 50 * 3600, 3600, 'stocks').length === 0,
     'stocks over a weekend (50h) is NOT stale — session gap allowed');
  ok(MC.signals.applyVetoes(agree, 70 * 3600, 3600, 'stocks').some(v => v.type === 'stale'),
     'stocks at 70h IS stale');
  ok(MC.signals.applyVetoes(fight, 60, 3600, 'crypto').some(v => v.type === 'disagreement'),
     'hard trend-vs-momentum fight → disagreement veto');
  ok(!MC.signals.applyVetoes(mild, 60, 3600, 'crypto').some(v => v.type === 'disagreement'),
     'mild disagreement (conf below 0.55) passes');
}

/* ========================================================================
   3 · Contract roll countdown (quarterly micros, 3rd Friday)
   ======================================================================== */
section('Contract rolls');
{
  const fromAug = MC.signals.rollInfo('MES', Date.UTC(2026, 7, 14));
  ok(fromAug && fromAug.date === '2026-09-18', 'from 2026-08-14 the next expiry is Sep 18 2026', fromAug);
  ok(fromAug && fromAug.soon === false, 'a month out is not roll week');
  const fromSep = MC.signals.rollInfo('MES', Date.UTC(2026, 8, 14));
  ok(fromSep && fromSep.days === 4 && fromSep.soon === true, '4 days out IS roll week', fromSep);
  ok(MC.signals.rollInfo('AAPL') === null, 'stocks have no roll');
  ok(MC.signals.rollInfo('GOLD') === null, 'commodities show the curve instead');
}

/* ========================================================================
   4 · R-multiples, stats and the ledger maths
   ======================================================================== */
section('Trade stats');
{
  const day = Date.now();
  localStorage.setItem('mc_trade_history', JSON.stringify([
    { sym: 'MES', side: 'buy', qty: 1, entry: 100, exit: 120, pnl: 100, r: 2,    closedAt: day },
    { sym: 'MES', side: 'buy', qty: 1, entry: 100, exit: 95,  pnl: -50, r: -1,   closedAt: day },
    { sym: 'BTC', side: 'sell', qty: 1, entry: 100, exit: 90, pnl: 50,  r: null, closedAt: day }
  ]));
  const s = MC.trade.stats();
  ok(s.trades === 3, 'three trades counted');
  ok(s.winRate === 66.7, 'win rate 66.7%', s.winRate);
  ok(s.profitFactor === 3, 'profit factor = gross wins / gross losses = 3', s.profitFactor);
  ok(s.expectancyR === 0.5, 'expectancy averages only R-graded trades → +0.5R', s.expectancyR);
  ok(s.rCoverage === 67, 'R coverage reported honestly', s.rCoverage);
  ok(s.perSymbol[0].sym === 'MES' && s.perSymbol[0].pnl === 50, 'per-symbol rollup ranks by net P/L');
}

/* ========================================================================
   4b · Journal note keys must be unique per trade
   Regression: flattenAll closes every position inside one loop, so several
   rows land on the same millisecond. Notes were keyed by closedAt, so one
   note silently appeared on every trade closed in that batch.
   ======================================================================== */
section('Journal note keys');
{
  localStorage.setItem('mc_trade_history', '[]');
  localStorage.setItem('mc_positions', '[]');
  localStorage.setItem('mc_acct_cfg', JSON.stringify({ start: 100000 }));
  MC.MAP.MES.p = 100;

  // three positions, closed together the way flattenAll does it
  MC.State.positions = ['a', 'b', 'c'].map((t, i) => ({
    id: 'P' + i, sym: 'MES', side: 'buy', qty: 1, entry: 90, sl: 80, tp: 120, at: new Date()
  }));
  MC.ui = { toast: function () {} };          // headless
  MC.trade.renderPositions = function () {};
  MC.trade.renderAccount = function () {};
  MC.trade.flattenAll();

  const hist = MC.trade.history();
  ok(hist.length === 3, 'three rows written by flatten-all', hist.length);
  const stamps = new Set(hist.map(t => t.closedAt));
  const ids = new Set(hist.map(t => t.id));
  ok(ids.size === 3, 'every row has a DISTINCT id', [...ids]);
  ok(hist.every(t => t.id), 'no row is missing an id');
  // the collision the ids exist to survive:
  if (stamps.size < 3) ok(true, 'closedAt did collide (' + stamps.size + ' stamps) — ids are what save the journal');
  else ok(true, 'closedAt happened not to collide this run; ids still guarantee it');
}

/* ========================================================================
   5 · The risk guard
   ======================================================================== */
section('Risk guard');
{
  localStorage.setItem('mc_acct_cfg', JSON.stringify({ start: 50000 }));
  const today = Date.now();
  localStorage.setItem('mc_trade_history', JSON.stringify([
    { sym: 'MES', side: 'buy', qty: 1, entry: 100, exit: 50, pnl: -150, closedAt: today }
  ]));
  MC.State.positions = [];
  localStorage.setItem('mc_pending_orders', '[]');

  localStorage.setItem('mc_risk_guard', JSON.stringify({ on: true, limit: 100 }));
  ok(typeof MC.trade.guardBlock() === 'string', 'day at -150 against a $100 limit → blocked');
  localStorage.setItem('mc_risk_guard', JSON.stringify({ on: true, limit: 200 }));
  ok(MC.trade.guardBlock() === null, 'same day against a $200 limit → clear');
  localStorage.setItem('mc_risk_guard', JSON.stringify({ on: false, limit: 100 }));
  ok(MC.trade.guardBlock() === null, 'guard off → never blocks');
}

/* ========================================================================
   6 · Search ranking + WASDE scheduling
   ======================================================================== */
section('Search + calendar');
{
  ok(MC.markets.fuzzyScore('mes', 'MES', 'Micro E-mini S&P 500') === 1000, 'exact symbol outranks all');
  ok(MC.markets.fuzzyScore('me', 'MES', 'Micro E-mini S&P 500') >
     MC.markets.fuzzyScore('me', 'HOME', 'Home Depot'), 'prefix beats substring');
  ok(MC.markets.fuzzyScore('micro sp', 'MES', 'Micro E-mini S&P 500') > 0, 'scattered name match lands');
  ok(MC.markets.fuzzyScore('zzz', 'MES', 'Micro E-mini S&P 500') === 0, 'noise scores zero');

  ok(MC.commod.nextWasde(Date.UTC(2026, 7, 5)) === 'Aug 12', 'early Aug → this month’s WASDE', MC.commod.nextWasde(Date.UTC(2026, 7, 5)));
  ok(MC.commod.nextWasde(Date.UTC(2026, 7, 20)) === 'Sep 12', 'late Aug → next month’s WASDE', MC.commod.nextWasde(Date.UTC(2026, 7, 20)));
}

/* ---- verdict ------------------------------------------------------------ */
console.log('\n' + '─'.repeat(46));
console.log(pass + ' passed · ' + fail + ' failed');
process.exit(fail ? 1 : 0);
