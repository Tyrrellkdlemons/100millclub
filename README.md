# 100MillClub — City of Grind

**Live: https://100millclub.netlify.app**

An **all-markets trading hub**: one terminal that switches whole-site between
**All markets / Futures / Stocks / Crypto / Forex / Indices**, prices its
entire ~120-instrument board from real feeds (Binance WebSocket streaming,
ECB rates, and a keyless Yahoo proxy for stocks, indices, micro futures and
metals), hunts the live long tail of thousands more symbols through a
TradingView-style search, runs a four-desk **signals engine** with its
reasoning on display, and wraps it all around the original practice
environment: order entry, position tracking, alerts, backtesting, portfolio,
Coach and vlogs.

Pure HTML, CSS and vanilla JavaScript, plus a thin set of Netlify Functions
for the data proxies. No framework, no build step.

---

## Project structure

```
index.html              markup only
├── assets/logo.svg     100MillClub crest (favicon + brand mark)
├── css/
│   ├── base.css        design tokens, reset, utilities
│   ├── layout.css      ticker tape, navbar, app grid, responsive rules
│   └── components.css  watchlist, chart, dock, forms, modals, toasts
└── js/
    ├── utils.js        DOM helpers, formatters, seeded RNG
    ├── data.js         instruments, TradingView symbol map, shared state
    ├── indicators.js   SMA, EMA, RSI, MACD, Bollinger Bands
    ├── chart.js        mock OHLCV + Lightweight Charts / canvas backends
    ├── tradingview.js  real TradingView widget embeds
    ├── ui.js           toasts, tooltips, modals, drawers
    ├── watchlist.js    left sidebar + simulated price feed
    ├── trade.js        order ticket + position book
    ├── backtest.js     strategy tester
    ├── vlogs.js        video cards + social sharing
    └── app.js          orchestration, event wiring, boot
```

Scripts are plain `<script>` tags sharing a single `MC` namespace rather than ES
modules — so the site works over `file://` as well as over HTTP.

---

## Live data vs simulated

The chart toolbar has a **Live / Simulated** switch:

| Mode | What it is |
| --- | --- |
| **Live** | The real TradingView Advanced Chart — genuine market data, TradingView's own indicator and drawing toolbars. |
| **Simulated** | The built-in Lightweight Charts engine running seeded mock OHLCV. This is what powers the dashboard's own indicators, drawings and backtests, and it keeps working with no internet connection. |

Live TradingView panels also drive the **ticker tape** across the top and five of
the tabs in the bottom dock: **Technicals** (buy/sell rating gauge + instrument
profile), **News**, **Screener**, **Heatmap** and **Calendar**.

The **watchlist prices are simulated** so the dashboard is fully interactive
offline — the chart, tape and market panels are the real thing.

### Using your own TradingView subscription

The embedded widgets **always render anonymously**. They run in a sandboxed
third-party iframe that cannot read a tradingview.com session, so there is no
supported way to make them inherit a visitor's plan. That is a TradingView
platform rule, not a setting here.

What does respect a subscription is tradingview.com itself, so the blue
**TradingView** button in the chart toolbar (and in the dock header) deep-links
the exact symbol and timeframe on screen. A signed-in visitor lands on their own
plan: real-time entitled data, saved layouts, indicators and alerts.

The same limit is why index tickers are chosen carefully. Every embedded index
ticker was probed against TradingView's scanner for anonymous availability:

| Index | Embedded feed | Why |
| --- | --- | --- |
| Dow, Russell, FTSE, DAX, CAC, Nikkei, Hang Seng, Euro Stoxx, VIX | `TVC:*` | TradingView's own free index feeds — `update_mode: streaming` |
| S&P 500 | `AMEX:SPY` | no free S&P index feed exists; `SP:SPX`, `TVC:SPX` and every broker CFD mirror either 404 or demand an entitlement |
| NASDAQ 100 | `NASDAQ:QQQ` | same — `NASDAQ:NDX` is entitlement-gated |

Where an ETF proxy is used the chart header says so with a gold **via SPY ETF**
chip, and the TradingView button still points at the genuine index so
subscribers get the real feed.

---

## Features

| Area | Detail |
| --- | --- |
| **Market modes** | All markets / Futures / Stocks / Crypto / Forex / Indices — one switch steers the watchlist, chart, ticker tape, screener, heatmap and signals desk together. Remembered across visits. |
| **Real prices, keyless** | The whole board prices live: crypto streams over a Binance WebSocket, forex (every pair and cross) derives from ECB reference rates, and stocks, indices, micro futures and metals come through the site's own `/api/quote` Netlify Function proxying Yahoo Finance server-side. Every row is labelled by its source; anything unpriceable runs simulated and says so. |
| **The big search** | TradingView-style: fuzzy over the board, class tabs, favourites, recents, `?` syntax help, prefixes (`c:pepe`), and a live long-tail hunt across Yahoo (stocks, indices, futures, forex worldwide) + CoinGecko (every listed coin). Picking a long-tail result registers it permanently — it charts, quotes, demo-trades and takes alerts like a built-in. |
| **Signals desk** | Four desks — TrendCatcher (EMA posture + ADX), Momentum (RSI + MACD), Mean reversion (Bollinger position), Volume (OBV) — vote on **confirmed closes only**, with ACTIVE/WATCH/MEASURING state, per-desk reasoning in plain English, ATR-derived stop/target levels, personalised ranking, a per-mode pro-resources shelf, and an optional AI read. **Hard vetoes**: stale data or a hard trend-vs-momentum disagreement kills the signal outright, and the **veto log** shows what was refused and why. Education, never advice. |
| **Commodities intelligence** | In Futures and All-markets modes: **CFTC Commitments of Traders** positioning (Managed Money net, weekly change, % of open interest), the **futures curve** per commodity (contango/backwardation + annualised roll cost), **FRED macro drivers** (10-yr, fed funds, dollar index, inflation expectations; EIA crude stocks with a key), and 7-day **ag-belt weather** with heat/dry flags. Every card names its primary source and freshness; a Plain English panel decodes the jargon. |
| **My Desk** | Your own trading room (press <kbd>D</kbd>): equity/day/open P-L hero, research-grade stats (win rate, profit factor, **expectancy in R**, avg win-loss, max drawdown, streaks), full-width equity curve, open book and working orders as tables with live **R now**, a **journal with a notes column** that syncs, per-market results, a browser-local **position calculator**, **flatten-all**, and the **risk guard** — a daily loss limit run the way funded desks run one. |
| **Watchlist** | ~120 instruments across Futures, Stocks, Crypto, Forex and Indices — plus anything search adds. Grouped, drag-to-reorder, sparklines, live/sim source labels. |
| **Indices** | S&P 500, NASDAQ 100, Dow Jones, Russell 2000, FTSE 100, DAX 40, CAC 40, Nikkei 225, Hang Seng, Euro Stoxx 50, VIX. |
| **Chart** | 7 timeframes (1m → 1w), candle / line / mountain styles, volume, settings modal. |
| **Indicators** | A library of **35** — moving averages (SMA, EMA, WMA, HMA, DEMA, TEMA, VWMA, VWAP), bands (Bollinger, Keltner, Donchian, envelopes), trend (Supertrend, Parabolic SAR, Ichimoku, pivot points, ADX, Aroon), momentum (RSI, MACD, Stochastic, Stoch RSI, CCI, Williams %R, momentum, ROC, TRIX, Ultimate, Awesome), volume (OBV, MFI, CMF, Force Index) and volatility (ATR, standard deviation). Searchable, with live parameter editing and one stacked panel per oscillator, all time-synced to the chart. |
| **Build your own** | *Create an indicator* offers guided recipes or a formula box (`ema(close,12) - ema(close,26)`). Formulas are parsed by a hand-written recursive-descent parser — **never `eval` or `Function`** — so a saved formula can never become executable code. Custom indicators are saved locally and behave exactly like built-ins. |
| **Alerts** | Watch a price level, a daily move, RSI, or a moving-average cross. Alerts only fire on a genuine crossing, so one set on an already-true condition waits. Fires a toast, an optional chime and desktop notification, and can forward the signal to **Telegram, Discord or any webhook** — the copy-trade hook. |
| **Drawing tools** | Trend line (click two points) and horizontal price level (click once). |
| **Trade ticket** | Buy/Sell, market or limit, quantity, stop loss, take profit, one-tap ±1/2/5% risk presets at 2:1 reward-to-risk, live order summary. Positions track P/L in real time and stops/targets fire automatically. |
| **Backtester** | SMA crossover, RSI, MACD and Bollinger strategies with per-trade fees. Reports total return, win rate, trade count, Sharpe, max drawdown, final equity, an equity curve against buy & hold, and a trade log. |
| **Vlogs** | Collapsible video row, share to YouTube, TikTok, Instagram, X, Telegram and WhatsApp, plus a copy-link share sheet. |
| **Branding** | 100MillClub crest as inline SVG — click it to upload your own logo, saved to `localStorage`. |
| **Resilience** | If the Lightweight Charts CDN is unreachable, a built-in canvas renderer takes over. If TradingView is unreachable, the tape falls back to a simulated marquee and the panels say so plainly. |

## Tests

```bash
npm test
```

29 acceptance tests over the pure logic — confirmed-bar enforcement, the
stale-data and disagreement vetoes (including the weekend allowance for
session markets), quarterly contract-roll dates, R-multiple and profit-factor
maths, the risk guard, search ranking and WASDE scheduling. No framework: the
browser modules load into a shimmed `window` and the rules get hammered
directly.

---

Keyboard: <kbd>/</kbd> search · <kbd>B</kbd> buy · <kbd>S</kbd> sell · <kbd>D</kbd> my desk ·
<kbd>F</kbd> fullscreen · <kbd>V</kbd> vlogs · <kbd>?</kbd> help · <kbd>Esc</kbd> close

Responsive down to mobile: the right sidebar becomes a drawer under 1180px, the
watchlist joins it under 860px, and the navbar condenses as space runs out.

---

## Run it locally

Open `index.html` directly, or serve the folder (recommended — TradingView
widgets prefer a real origin):

```bash
npx serve .
```

---

## Deploy

The site is live at **https://100millclub.netlify.app**
(Netlify project `100millclub`, admin: https://app.netlify.com/projects/100millclub).

This folder is already linked to that project, so redeploying is one command:

```bash
netlify deploy --prod --dir .
```

`netlify.toml` supplies the publish root, the SPA redirect (so `/vlog/v1` share
links resolve) and the security headers — no build command needed.

### Optional: auto-deploy on every push

Right now deploys are manual via the CLI. To have every `git push` deploy itself,
connect the repo once in the Netlify UI:

**Project → Build & deploy → Link repository → GitHub → `Tyrrellkdlemons/100millclub`**

Approve the GitHub authorization popup, leave the build command empty and set the
publish directory to `.`.

### Alternative: GitHub Pages

Repo → **Settings → Pages → Source: Deploy from a branch → `main` / `root`**.

---

## Note

Order fills, positions, watchlist prices and backtest results are **simulated**.
No broker or exchange is connected, nothing leaves your browser, and none of this
is financial advice.
