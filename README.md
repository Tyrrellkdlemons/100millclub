# 100MillClub — City of Grind

**Live: https://100millclub.netlify.app**

A trading terminal that pairs **real live TradingView market data** with a fully
simulated practice environment: watchlists, order entry, position tracking and a
working strategy backtester — plus a creator vlog row with social sharing.

Pure HTML, CSS and vanilla JavaScript. No framework, no build step, no backend.

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

---

## Features

| Area | Detail |
| --- | --- |
| **Watchlist** | 30 instruments across Stocks, Crypto, Forex and Indices. Grouped, searchable by symbol *or* name, filtered by the market tabs. |
| **Indices** | S&P 500, NASDAQ 100, Dow Jones, Russell 2000, FTSE 100, DAX 40, CAC 40, Nikkei 225, Hang Seng, Euro Stoxx 50, VIX. |
| **Chart** | 7 timeframes (1m → 1w), candle / line / mountain styles, volume, settings modal. |
| **Indicators** | SMA 20, EMA 50, Bollinger Bands, RSI 14 in a time-synced sub-pane. |
| **Drawing tools** | Trend line (click two points) and horizontal price level (click once). |
| **Trade ticket** | Buy/Sell, market or limit, quantity, stop loss, take profit, one-tap ±1/2/5% risk presets at 2:1 reward-to-risk, live order summary. Positions track P/L in real time and stops/targets fire automatically. |
| **Backtester** | SMA crossover, RSI, MACD and Bollinger strategies with per-trade fees. Reports total return, win rate, trade count, Sharpe, max drawdown, final equity, an equity curve against buy & hold, and a trade log. |
| **Vlogs** | Collapsible video row, share to YouTube, TikTok, Instagram, X, Telegram and WhatsApp, plus a copy-link share sheet. |
| **Branding** | 100MillClub crest as inline SVG — click it to upload your own logo, saved to `localStorage`. |
| **Resilience** | If the Lightweight Charts CDN is unreachable, a built-in canvas renderer takes over. If TradingView is unreachable, the tape falls back to a simulated marquee and the panels say so plainly. |

Keyboard: <kbd>/</kbd> search · <kbd>B</kbd> buy · <kbd>S</kbd> sell ·
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
