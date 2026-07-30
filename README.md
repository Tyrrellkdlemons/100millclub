# 100MillClub — City of Grind

A single-file trading terminal: live-feel charts, watchlists, simulated order entry,
a real backtesting engine, and a creator vlog row with social sharing.

Everything is in [`index.html`](index.html). No build step, no backend, no install.
Open the file in a browser and it runs.

---

## What's inside

| Area | What it does |
| --- | --- |
| **Watchlist** | 30 markets across Stocks, Crypto, Forex and Indices. Grouped, searchable, filterable, with simulated streaming prices. |
| **Chart** | Lightweight Charts (TradingView) with candles / line / mountain styles, 7 timeframes (1m → 1w), volume, and a built-in canvas fallback renderer if the CDN is unreachable. |
| **Indicators** | SMA 20, EMA 50, Bollinger Bands, RSI 14 in a synced sub-panel, volume bars. |
| **Drawing tools** | Trend lines (click two points) and horizontal price levels (click once). |
| **Trade ticket** | Buy/Sell, market or limit, quantity, stop loss, take profit, live risk/reward summary, and open positions with live P/L plus automatic SL/TP exits. |
| **Backtester** | SMA crossover, RSI, MACD and Bollinger strategies over generated daily history. Returns total return, win rate, trade count, Sharpe, max drawdown, final equity, an equity curve vs buy & hold, and a full trade log. |
| **Vlogs** | Collapsible video row with share buttons for YouTube, TikTok, Instagram, X, Telegram and WhatsApp, plus a copy-link share sheet. |
| **Branding** | 100MillClub crest drawn as inline SVG. Click it to upload your own logo — saved to `localStorage`. |

Keyboard: <kbd>/</kbd> search · <kbd>B</kbd> buy · <kbd>S</kbd> sell · <kbd>F</kbd> fullscreen · <kbd>V</kbd> vlogs · <kbd>?</kbd> help · <kbd>Esc</kbd> close

---

## Run it locally

Just double-click `index.html`, or serve it:

```bash
npx serve .
```

---

## Deploy

### Netlify — drag and drop (fastest)

1. Go to https://app.netlify.com/drop
2. Drag this whole folder onto the page.
3. Live in about ten seconds.

### Netlify — from GitHub (auto-deploys on every push)

1. Push this repo to GitHub (below).
2. Netlify → **Add new site → Import an existing project → GitHub** → pick the repo.
3. Build command: *(leave empty)* · Publish directory: `.`
4. Deploy. `netlify.toml` already sets the publish dir, redirects and security headers.

### Netlify CLI

```bash
npm i -g netlify-cli && netlify deploy --prod --dir .
```

### GitHub

```bash
gh auth login && gh repo create 100millclub --public --source=. --push
```

### GitHub Pages (free alternative to Netlify)

Repo → **Settings → Pages → Source: Deploy from a branch → `main` / `root`**.
Live at `https://<your-username>.github.io/100millclub/`.

---

## Note

All prices, fills and backtest results are **simulated**. Nothing connects to a real
broker or exchange, no orders leave the browser, and none of it is financial advice.
