/* ==========================================================================
   quotes.js — real market prices, from every source a browser can honestly use

   The pecking order, all keyless:

     Crypto   data-api.binance.vision   REST for the whole board in one call,
                                        plus a live WebSocket stream so crypto
                                        ticks in real time. CORS open.
              api.coinbase.com          REST fallback.
     Stocks / indices / futures / metals
              /api/quote                our own Netlify function proxying
                                        Yahoo Finance server-side — the feed
                                        browsers are CORS-blocked from. Real
                                        micro futures, real index levels,
                                        real stocks, no key. (Off on file://,
                                        where there are no functions.)
     Forex    api.frankfurter.dev       ECB reference rates; every pair and
                                        cross is derived from the USD table.
                                        Works even offline-deployed.

   Finnhub and Twelve Data stay as bring-your-own-key upgrades. Anything
   unpriceable stays on the simulated feed, and the UI keeps labelling every
   row honestly.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var Q = MC.quotes = {};

  var CFG_KEY = 'mc_quotes_cfg';

  /** symbol → { price, changePct, at, source } for anything priced for real. */
  var live = {};
  var lastRun = 0;
  var running = false;

  /* the /api proxy: assumed present on http(s), proven dead on first failure */
  var proxyState = /^https?:$/.test(location.protocol) ? 'unknown' : 'dead';

  Q.STOCK_PROVIDERS = [
    { id: 'auto',       name: 'Site feed — real prices, no key', needsKey: false,
      note: 'Stocks, indices, micro futures and metals priced through the site’s own keyless proxy. The default.' },
    { id: 'none',       name: 'Demo prices only', needsKey: false,
      note: 'Stocks and indices run on the built-in simulated feed.' },
    { id: 'finnhub',    name: 'Finnhub (your key)',    needsKey: true,
      note: 'Free key at finnhub.io. Real-time US stocks, one call per symbol.' },
    { id: 'twelvedata', name: 'Twelve Data (your key)', needsKey: true,
      note: 'Free key at twelvedata.com. Covers stocks and indices in one call.' }
  ];

  Q.config = function () {
    var cfg;
    try { cfg = JSON.parse(MC.store.get(CFG_KEY) || 'null'); } catch (e) { cfg = null; }
    cfg = cfg || { crypto: true, forex: true, stockProvider: 'auto', stockKey: '' };
    // accounts saved before the proxy existed default to the new real feed
    if (!cfg.v2) { if (cfg.stockProvider === 'none') cfg.stockProvider = 'auto'; cfg.v2 = true; }
    return cfg;
  };
  Q.saveConfig = function (cfg) { cfg.v2 = true; MC.store.set(CFG_KEY, JSON.stringify(cfg)); };

  /** Live quote for a symbol, or null when we are simulating it. */
  Q.get = function (sym) { return live[sym] || null; };
  Q.isLive = function (sym) { return !!live[sym]; };
  Q.liveCount = function () { return Object.keys(live).length; };
  Q.lastRun = function () { return lastRun; };
  Q.proxyAlive = function () { return proxyState === 'alive'; };

  /* ----------------------------------------------------------------------
     SYMBOL MAPS — derived from the asset list, so search-added instruments
     join the feeds automatically
     ---------------------------------------------------------------------- */
  function cryptoAssets() {
    // noBinance marks search-added coins whose USDT pair proved absent —
    // one of those in the batch call would 400 the whole board
    return MC.ASSETS.filter(function (a) { return a.m === 'crypto' && !a.noBinance; });
  }
  function binancePair(a) { return (a.bp || (a.s + 'USDT')).toUpperCase(); }

  function forexAssets() {
    return MC.ASSETS.filter(function (a) { return a.m === 'forex' && a.s.length === 6; });
  }

  /** Everything the /api proxy can price: any asset carrying a Yahoo symbol
      except crypto (Binance owns crypto) and forex (ECB owns forex). */
  function proxyAssets() {
    return MC.ASSETS.filter(function (a) {
      return a.yh && a.m !== 'crypto' && a.m !== 'forex';
    });
  }

  /* ----------------------------------------------------------------------
     FETCHERS
     ---------------------------------------------------------------------- */
  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' from ' + new URL(url, location.href).host);
      return r.json();
    });
  }

  /** Real crypto: last price plus a genuine rolling 24h change, whole board. */
  function fetchCrypto() {
    var assets = cryptoAssets();
    if (!assets.length) return Promise.resolve();
    var pairs = assets.map(binancePair);
    var url = 'https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' +
              encodeURIComponent(JSON.stringify(pairs));

    return getJSON(url).then(function (rows) {
      var byPair = {};
      rows.forEach(function (r) { byPair[r.symbol] = r; });

      assets.forEach(function (a) {
        var row = byPair[binancePair(a)];
        if (!row) return;
        var price = parseFloat(row.lastPrice);
        if (!isFinite(price)) return;
        live[a.s] = {
          price: price,
          changePct: parseFloat(row.priceChangePercent),
          at: Date.now(),
          source: 'Binance'
        };
      });
    }).catch(function () { return fetchCryptoFallback(); });
  }

  /** Coinbase gives rates as "how many X per USD", so each one is inverted. */
  function fetchCryptoFallback() {
    return getJSON('https://api.coinbase.com/v2/exchange-rates?currency=USD').then(function (d) {
      var rates = d && d.data && d.data.rates;
      if (!rates) return;
      cryptoAssets().forEach(function (a) {
        var per = parseFloat(rates[a.s]);
        if (!isFinite(per) || per === 0) return;
        var prev = live[a.s];
        live[a.s] = {
          price: 1 / per,
          changePct: prev ? prev.changePct : 0,   // Coinbase gives no 24h change
          at: Date.now(),
          source: 'Coinbase'
        };
      });
    }).catch(function () {});
  }

  /** Real FX for every pair, derived from the ECB's USD table.
      With base USD, r[X] = X per USD, r.USD = 1 — so BASEQUOTE = r[quote]/r[base]. */
  function fetchForex() {
    var assets = forexAssets();
    if (!assets.length) return Promise.resolve();

    var wanted = {};
    assets.forEach(function (a) {
      wanted[a.s.slice(0, 3)] = true;
      wanted[a.s.slice(3)] = true;
    });
    delete wanted.USD;

    return getJSON('https://api.frankfurter.dev/v1/latest?base=USD&symbols=' +
                   Object.keys(wanted).join(','))
      .then(function (d) {
        var r = d && d.rates;
        if (!r) return;
        r.USD = 1;

        assets.forEach(function (a) {
          var base = a.s.slice(0, 3), quote = a.s.slice(3);
          if (!isFinite(r[base]) || !isFinite(r[quote])) return;
          var price = r[quote] / r[base];
          if (!isFinite(price) || price <= 0) return;

          var prev = live[a.s];
          // never overwrite an intraday proxy quote with a daily ECB one
          if (prev && prev.source === 'Yahoo' && Date.now() - prev.at < 90000) return;
          live[a.s] = {
            price: price,
            changePct: prev ? prev.changePct : 0,
            at: Date.now(),
            source: 'ECB'
          };
        });
      }).catch(function () {});
  }

  /** Stocks, indices, futures and metals — through our own keyless proxy. */
  function fetchProxy() {
    if (proxyState === 'dead') return Promise.resolve();
    var assets = proxyAssets();
    if (!assets.length) return Promise.resolve();

    var bySymbol = {};
    assets.forEach(function (a) { bySymbol[a.yh] = a; });

    // the function caps a call at 60 symbols — chunk politely under that
    var all = Object.keys(bySymbol);
    var chunks = [];
    for (var i = 0; i < all.length; i += 50) chunks.push(all.slice(i, i + 50));

    return Promise.all(chunks.map(function (chunk) {
      return getJSON('/api/quote?symbols=' + encodeURIComponent(chunk.join(',')));
    })).then(function (responses) {
      proxyState = 'alive';
      responses.forEach(function (d) {
        ((d && d.quotes) || []).forEach(function (row) {
          var a = bySymbol[row.symbol];
          if (!a || !isFinite(row.price)) return;
          live[a.s] = {
            price: row.price,
            changePct: isFinite(row.changePct) ? row.changePct : 0,
            at: Date.now(),
            source: 'Yahoo'
          };
        });
      });
    }).catch(function () {
      // one failed run could be a blip; a failed run on file:// is forever
      if (location.protocol === 'file:') proxyState = 'dead';
    });
  }

  /** Bring-your-own-key providers, kept as before. */
  function fetchStocksWithKey(cfg) {
    var symbols = MC.ASSETS
      .filter(function (a) { return a.m === 'stocks'; })
      .map(function (a) { return a.s; });

    if (cfg.stockProvider === 'twelvedata') {
      var url = 'https://api.twelvedata.com/quote?symbol=' + symbols.slice(0, 8).join(',') +
                '&apikey=' + encodeURIComponent(cfg.stockKey);
      return getJSON(url).then(function (d) {
        var rows = (d && d.close !== undefined) ? { single: d } : d;
        Object.keys(rows || {}).forEach(function (key) {
          var row = rows[key];
          if (!row || row.status === 'error') return;
          var sym = row.symbol || key;
          var price = parseFloat(row.close);
          if (!isFinite(price) || !MC.MAP[sym]) return;
          live[sym] = {
            price: price,
            changePct: parseFloat(row.percent_change) || 0,
            at: Date.now(),
            source: 'Twelve Data'
          };
        });
      }).catch(function () {});
    }

    if (cfg.stockProvider === 'finnhub') {
      // Finnhub prices one symbol per call, so keep it to a sensible handful.
      return Promise.all(symbols.slice(0, 12).map(function (sym) {
        return getJSON('https://finnhub.io/api/v1/quote?symbol=' + sym +
                       '&token=' + encodeURIComponent(cfg.stockKey))
          .then(function (d) {
            if (!d || !isFinite(d.c) || d.c === 0) return;
            live[sym] = {
              price: d.c,
              changePct: isFinite(d.dp) ? d.dp : 0,
              at: Date.now(),
              source: 'Finnhub'
            };
          }).catch(function () {});
      }));
    }

    return Promise.resolve();
  }

  /* ----------------------------------------------------------------------
     THE CRYPTO STREAM — real-time ticks over one WebSocket
     ---------------------------------------------------------------------- */
  var ws = null;
  var wsAlive = false;
  var wsRetryMs = 4000;
  var wsWanted = false;

  Q.streaming = function () { return wsAlive; };

  function openStream() {
    if (!wsWanted || (ws && ws.readyState <= 1)) return;
    var assets = cryptoAssets();
    if (!assets.length || !window.WebSocket) return;

    var streams = assets.slice(0, 60).map(function (a) {
      return binancePair(a).toLowerCase() + '@miniTicker';
    }).join('/');

    try {
      ws = new WebSocket('wss://data-stream.binance.vision/stream?streams=' + streams);
    } catch (e) { return; }

    var pairToSym = {};
    assets.forEach(function (a) { pairToSym[binancePair(a)] = a.s; });

    ws.onopen = function () { wsAlive = true; wsRetryMs = 4000; };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      var t = msg && msg.data;
      if (!t || !t.s) return;
      var sym = pairToSym[t.s];
      if (!sym) return;
      var price = parseFloat(t.c), open = parseFloat(t.o);
      if (!isFinite(price)) return;
      live[sym] = {
        price: price,
        changePct: isFinite(open) && open > 0 ? ((price - open) / open) * 100 : (live[sym] ? live[sym].changePct : 0),
        at: Date.now(),
        source: 'Binance live'
      };
      // data only — the existing tick loop repaints, so 30 streams of
      // updates never turn into 30 streams of DOM work
      var a = MC.MAP[sym];
      if (a) { a.p = price; a.base = price; if (isFinite(live[sym].changePct)) a.chg = live[sym].changePct; a.liveSource = 'Binance live'; }
    };
    ws.onclose = function () {
      wsAlive = false;
      ws = null;
      if (wsWanted) {
        setTimeout(openStream, wsRetryMs);
        wsRetryMs = Math.min(wsRetryMs * 2, 60000);   // back off, never hammer
      }
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  function closeStream() {
    wsWanted = false;
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
    wsAlive = false;
  }

  /* ----------------------------------------------------------------------
     REFRESH
     ---------------------------------------------------------------------- */

  /** Pull everything that is enabled, then push it into the asset list. */
  Q.refresh = function () {
    if (running) return Promise.resolve();
    running = true;

    var cfg = Q.config();
    var jobs = [];
    if (cfg.crypto) jobs.push(fetchCrypto());
    if (cfg.forex) jobs.push(fetchForex());
    if (cfg.stockProvider === 'auto') jobs.push(fetchProxy());
    if ((cfg.stockProvider === 'finnhub' || cfg.stockProvider === 'twelvedata') && cfg.stockKey) {
      jobs.push(fetchStocksWithKey(cfg));
    }

    return Promise.all(jobs).then(function () {
      applyToAssets();
      lastRun = Date.now();
      running = false;
      if (Q.onUpdate) Q.onUpdate();
    }).catch(function () {
      running = false;
    });
  };

  /**
   * Copy live prices onto the assets so every existing screen — watchlist,
   * order ticket, portfolio, alerts — uses them without knowing the source.
   */
  function applyToAssets() {
    Object.keys(live).forEach(function (sym) {
      var asset = MC.MAP[sym];
      if (!asset) return;
      var q = live[sym];
      asset.p = q.price;
      asset.base = q.price;
      if (isFinite(q.changePct) && q.changePct !== 0) asset.chg = q.changePct;
      asset.liveSource = q.source;
    });
  }

  /** Live symbols must not be nudged by the simulator. */
  Q.shouldSimulate = function (sym) { return !live[sym]; };

  /** One line of truth for the settings panel. */
  Q.summary = function () {
    var counts = {};
    Object.keys(live).forEach(function (sym) {
      var s = live[sym].source;
      counts[s] = (counts[s] || 0) + 1;
    });
    var parts = Object.keys(counts).map(function (s) { return counts[s] + ' via ' + s; });
    if (wsAlive) parts.push('crypto streaming live');
    return parts.length ? 'Live: ' + parts.join(' · ') : 'No live feeds reachable — running simulated.';
  };

  var timer = null;
  Q.startAuto = function (seconds) {
    clearInterval(timer);
    timer = setInterval(Q.refresh, Math.max(15, seconds || 30) * 1000);
    wsWanted = true;
    openStream();
  };
  Q.stopAuto = function () {
    clearInterval(timer);
    closeStream();
  };

})(window);
