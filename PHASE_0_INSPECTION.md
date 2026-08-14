# Phase 0 — Inspection of the existing 100MillClub terminal

*Written before any upgrade code, per the mission brief. This documents what
actually exists in the repo as of commit `a13f246`, what the design language
is, and how the "100x hub" upgrade maps onto it.*

---

## What the app is

A **pure static** trading terminal — HTML + CSS + vanilla JS, no framework, no
build step. 38 JS modules share a single `MC` namespace via plain `<script>`
tags (load order matters, listed at the bottom of `index.html`). It works over
`file://` as well as HTTPS, and that property is preserved deliberately.

- **Live**: https://100millclub.netlify.app — Netlify project `100millclub`
  (`746eefba-d90d-4c24-99ed-cf079c0f2b22`), push-to-deploy from
  `github.com/Tyrrellkdlemons/100millclub`, publish dir `.`, no build command.
- **Caching contract** (do not undo): `index.html`, `/css/*` and `/js/*` are
  `max-age=0, must-revalidate` because filenames carry no content hash. Only
  `/assets/*` caches for a day.

## Design language (to preserve)

- Tokens in `css/base.css`: near-black surfaces (`--bg #07090b`, panels
  `#0e1216 → #182029`), text `#e9eef5`, **brand gold `#f5c518`** reserved for
  identity, **interactive accent blue `#4f8cff`**, market green/red
  `#26c96a / #ff4d5e`. Radius 14px/9px, Inter font, FontAwesome icons.
- The 100MillClub **crest** (gold laurel/crown, green candles, silver Q-blade)
  is the brand mark — never replaced, only presented better. Gold Q cursor,
  gold scrollbar, glass backdrop layers already exist.
- Rich hover tooltips via `data-tip` / `data-tip-desc` / `data-tip-key` on
  nearly every control; a guided tour (`tour.js`, Coach persona) runs on first
  visit; a full-guide modal; hint markers.

## Feature inventory (already built and working)

| Area | State before this upgrade |
| --- | --- |
| Watchlist | 34 instruments (futures micros, stocks, crypto, forex, indices), grouped, drag-to-reorder, sparklines, LIVE/DEMO honesty per row |
| Market tabs | `All/Futures/Stocks/Crypto/Forex/Indices` — **filter the watchlist only** |
| Charts | TradingView Advanced Chart (live) + Lightweight-Charts simulated engine with 35 indicators, custom indicator builder (safe parser, no eval), drawings, 6 styles, 8 timeframes |
| Real data | `quotes.js`: Binance (6 crypto pairs) + ECB Frankfurter (5 forex pairs) keyless; stocks only with a user-pasted Finnhub/TwelveData key; everything else simulated with honest labels |
| Demo trading | `trade.js` — derived-balance funded account (never a drifting stored number), market/limit/stop/stop-limit, SL/TP auto-fire, slippage + commission, buying-power discipline, equity snapshots, CSV export, reset sizes |
| Coach | `review.js` grades demo trades AND the real Folio; `queez.js` chat persona with KB; `read.js` plain-English chart read; `ai.js` OpenRouter AI desk (visitor's own key, free-model default) |
| Portfolio | `portfolio.js` real-book ledger with live pricing where available |
| Alerts | price/RSI/MA-cross/news-keyword alerts; Telegram/Discord/webhook/email/SMS delivery |
| Vlogs/YouTube | real embedded videos, floating mini-player, shelf, platform strip into signed-in tabs |
| Cloud | `cloud.js` — Supabase (`waugpjyrkkkavrnqmmyk.supabase.co`) magic-link auth + `user_state` JSONB row under RLS; local-first, keys never sync |
| PWA | `manifest.webmanifest` + icons exist; **no service worker yet** |
| Mobile | bottom tab bar, drawers, landscape layout, 320px-safe |

## Gaps this upgrade fills (the actual mission)

1. **Market mode is only a watchlist filter.** It must drive the whole site:
   chart, ticker tape, screener/heatmap/news panels, search scope, signals.
2. **Universe is small (34).** Expand curated coverage per class (~130) and
   make **any** searched symbol loadable dynamically.
3. **No TradingView-style search.** Build the big Ctrl+K modal: fuzzy match,
   class tabs, badges, recents, favorites, live long-tail via APIs.
4. **No serverless layer.** Add Netlify Functions: keyless real quotes for
   stocks/indices/futures/metals (Yahoo proxied server-side — browsers are
   CORS-blocked from it directly), history for signals, symbol search, and an
   OpenRouter proxy that activates when `OPENROUTER_API_KEY` is set.
5. **No signals hub.** Compute honest TA signals (the `MC.ind` math already
   exists) over real history, per mode, personalized by what the visitor
   actually views, with plain-English rationale + pro-resource directory.
6. **No service worker / installability polish.**
7. **Docs**: `.env.example`, Supabase migration SQL, deployment report.

## Constraints honoured

- **No credentials are ever entered or committed by the agent.** Server-side
  keys (OpenRouter etc.) are optional env vars the owner sets in Netlify;
  every feature has a working keyless fallback and says so in the UI.
- Demo trading stays simulated — no broker, no real orders, not advice.
- Brand assets untouched. Existing visual identity elevated, not replaced.
- Every UI works at 320 / 768 / 1280 (verified in QA phase).
