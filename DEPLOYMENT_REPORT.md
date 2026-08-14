# Deployment report — the all-markets upgrade

*What shipped, how it deploys, what needs the owner, and how to test every
piece. Companion to `PHASE_0_INSPECTION.md` (what existed before).*

---

## Wave 2 — commodities intelligence, My Desk, hardened signals

### New serverless routes (all keyless, primary sources)

| Route | Source | Cadence | Notes |
| --- | --- | --- | --- |
| `/api/cot` | CFTC Public Reporting (Socrata) | weekly | Managed Money net, weekly change, % of open interest for 8 commodity markets |
| `/api/macro` | FRED `fredgraph.csv` (no key) | daily | 10-yr, fed funds, broad dollar, 10-yr inflation expectation + sparklines; adds EIA weekly crude stocks when `EIA_API_KEY` is set |
| `/api/term?root=` | Yahoo-quoted exchange contract months | ~15 min | Builds the real curve per root, returns contango/backwardation + annualised roll |

Ag-belt weather comes from **open-meteo**, fetched by the browser directly
(their API allows cross-origin; no key, no proxy needed).

### Signals hardening (per the transfer package)

- **Confirmed bars only** — the forming candle is dropped before any desk
  votes, so a signal cannot change its mind when the bar closes.
- **Stale-data veto** — bars older than 3 intervals veto the signal;
  session markets additionally get a 66-hour allowance so a Monday open is
  not falsely "stale".
- **Disagreement veto** — TrendCatcher and Momentum pointing hard opposite
  (both ≥0.55 confidence) is a coin flip, not a signal: forced neutral.
- **Veto log** — the board shows what was refused and why (TraderAgent's
  diagnostics-over-confidence manner).
- **State language** — ACTIVE ≥70%, WATCH ≥50%, MEASURING below, VETOED.
- **Roll countdown** — quarterly micros show days to third-Friday expiry and
  flag roll week.

### My Desk (new dock tab, `D`, `?open=desk`)

Equity/today/open/buying-power hero with the guard pill; seven stat tiles
(win rate, profit factor, expectancy in R, avg win/loss, max drawdown,
trades, streaks); full-width equity curve with the starting-cash line;
open book with live **R now** per position; working orders; journal with a
notes column (synced); per-market results; browser-local position
calculator; flatten-all; and the **risk guard** — daily loss limit that
refuses new entries once hit while always allowing closes.

Trade engine additions: `sl/tp/riskUsd/r` recorded at close, `Trade.stats()`,
`Trade.guard()/guardBlock()`, `Trade.flattenAll()`.

### New instruments

NATGAS, COPPER, CORN, WHEAT, SOYBEANS (124 total). These have no anonymous
TradingView feed, so they chart on the simulated engine while price, history
and signals stay real through the proxy — the app says so in a toast.

### Tests

`npm test` → **29/29 passing**. Covers confirmed bars, both vetoes (incl. the
weekend allowance), roll dates, R/profit-factor maths, the risk guard, search
ranking, WASDE scheduling.

### Wave 2 verification

- Functions live: COT returned 8 markets (Gold +131k net, +35.2% of OI),
  macro 4 tiles (10-yr 4.68%), CL curve **backwardation** at −14.3%/yr.
- Desk: trade round-trip on live BTC → R recorded, journal note saved,
  guard toggled, stats recomputed.
- Commodities board: 8 COT + 4 curve + 4 macro + 3 weather cards; hidden in
  Stocks mode, shown in Futures/All as designed.
- Zero horizontal scroll at 320/768/1280 on every new surface; journal filter
  keeps focus while typing; zero console errors.

### Note on `package.json`

Added purely so `npm test` works. There are **no dependencies** and
`netlify.toml` still sets an empty build command — verify after deploy that
Netlify has not started running an unwanted build step.

---

## What was upgraded

1. **Market modes drive the whole terminal.** The All markets / Futures /
   Stocks / Crypto / Forex / Indices tabs now steer the watchlist universe,
   the loaded chart (flagship per mode), the ticker tape line-up, the
   screener market, the heatmap species (stock sectors / crypto caps / forex
   cross-grid) and the signals board. The mode is remembered and synced.
2. **The whole board prices real, with no keys.**
   - Crypto: Binance REST for the board + one combined **WebSocket** stream
     (real-time ticks), Coinbase fallback.
   - Forex: every pair and cross derived from ECB reference rates.
   - Stocks / indices / micro futures / metals: `/api/quote`, a Netlify
     Function proxying Yahoo Finance server-side (browsers are CORS-blocked
     from it directly). Pooled upstream fetches + CDN caching.
   - Verified in QA: **118/118 instruments live**, sources labelled per row.
3. **TradingView-style search** (`/` or Ctrl+K): fuzzy local matching, class
   tabs and prefixes, favourites, recents, `?` syntax help — plus the live
   long tail via `/api/search` (Yahoo) and CoinGecko direct. Long-tail picks
   are **registered permanently** as first-class instruments (chart, quotes,
   demo trading, alerts), with Binance-pair validation for crypto so one
   unlisted coin can never poison the batch quote call.
4. **The signals desk** (new dock tab): TrendCatcher, Momentum, Mean
   reversion and Volume desks vote on real bars (Binance klines / `/api/history`),
   with confidence, per-desk plain-English reasoning, ATR-derived levels,
   personalised ranking from actual viewing habits, a per-mode pro-resources
   shelf, a Bot-lab bridge into the backtester, and an optional AI read.
5. **AI, honestly layered:** `/api/ai-signal` uses the server's
   `OPENROUTER_API_KEY` when set; otherwise falls back to the visitor's own
   key (the existing AI desk), otherwise explains itself. Keys never reach
   the client.
6. **PWA completed:** service worker (network-first — deploys can never be
   served stale; offline shell as parachute), app-manifest shortcuts
   (`?open=signals`, `?open=trade`), installable.
7. **Polish:** mode-switch crossfade, skeleton loaders, sheen/press
   micro-interactions, reduced-motion respect, and navbar overflow fixes at
   320px AND 1280px (both measured to zero horizontal scroll).
8. **Docs:** `.env.example`, `supabase/migrations/0001_user_state.sql`,
   README refresh, this report.

## How deployment works

- Push to `main` → Netlify builds project `100millclub` automatically.
  Publish dir `.` (no build command); functions auto-bundle from
  `netlify/functions/` (declared in `netlify.toml`).
- Each function declares its own route (`/api/quote`, `/api/history`,
  `/api/search`, `/api/ai-signal`, `/api/config`); function routes are
  matched before the SPA catch-all redirect.
- Cache headers unchanged for HTML/CSS/JS (`must-revalidate` — the
  no-content-hash rule) and the service worker is network-first for the same
  reason.

## Environment variables (all optional — the site runs fully keyless)

| Var | Effect when set |
| --- | --- |
| `OPENROUTER_API_KEY` | Site-funded AI reads on signal cards for every visitor |
| `OPENROUTER_MODEL` | Override the default free model |

Set in Netlify → Site configuration → Environment variables, then redeploy.
Everything else (Finnhub/Twelve Data/Marketaux/YouTube/personal OpenRouter)
is bring-your-own-key **in the UI**, stored only in that visitor's browser.

## Database

No schema change required — cloud sync still uses the one RLS-fenced
`user_state` JSONB row per user on Supabase project `waugpjyrkkkavrnqmmyk`.
The sync payload gained five keys (market mode, recents, favourites, view
counts, search-added instruments). `supabase/migrations/0001_user_state.sql`
now documents (and can recreate) the schema.

## QA performed (local dev server mounting the real function modules)

- All five functions return real data (AAPL, ^GSPC, MES=F, EURUSD=X, GC=F;
  162 real hourly bars; TSLA search classified; config + AI fallbacks).
- 118/118 instruments live: 30+ streaming via Binance WS, 22 ECB-derived
  forex, 65 via the Yahoo proxy (after adding an upstream fetch pool + retry
  — 50-parallel bursts had Yahoo dropping a third).
- Mode toggle: crypto → 31/31 crypto rows + BTC flagship; forex → 22 rows +
  EURUSD; tabs, tape, screener, heatmap remount.
- Search: fuzzy "micro sp" → MES; "palantir" → local PLTR + remote long
  tail; RIVN picked from Yahoo, registered, **survived reload**, then priced
  live ($15.82).
- Signals: 6/6 cards computed on real bars (BTC 56% short on Binance bars,
  MES 38% long on Yahoo bars), reasoning + ATR levels render, resources
  shelf renders.
- Demo trade round-trip on live BTC: quick-buy filled with auto SL/TP,
  close → history row, equity moved, persisted across reload.
- Service worker registered; zero console errors throughout.
- Layout: **zero horizontal scroll at 320, 768 and 1280** (two real
  overflows found and fixed: phone navbar ballast, desktop mode-tab width).

## Known limits (stated in the UI too)

- Forex prices are ECB reference-rate derived (daily fix, crosses computed) —
  honest reference pricing; the TradingView chart shows real intraday.
- Search-added instruments without an anonymous TradingView feed chart on
  the simulated engine (labelled), while their *price* stays real via proxy.
- Yahoo history has no native 4h interval — the 4h signal timeframe uses 1h
  bars over 3 months for non-crypto.
- The AI read is off until a key exists somewhere (site env or visitor key) —
  by design, with the fallback chain explained in-place.

## How to use the demo account (10-second version)

Right panel → **Trade**. Quick BUY / Quick SELL place a risk-sized practice
trade with stop and target attached; the full ticket does market/limit/
stop/stop-limit with position sizing by dollar risk. Everything is fake
money, fills pay realistic slippage and commission, and the Coach grades the
results. Signing in (cloud button) carries it all across devices.
