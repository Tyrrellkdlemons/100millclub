/* ==========================================================================
   quotes.js — real market prices, where real market prices are obtainable

   Everything here was picked by testing, not by hope. What a browser can
   actually reach, with no backend and no key:

     Crypto   data-api.binance.vision  real last price and real 24h change,
                                       many symbols in one call, CORS open.
                                       (api.binance.com itself answers 451
                                       from some regions; the vision mirror
                                       does not.)
     Crypto   api.coinbase.com         fallback, one call covers everything
     Forex    api.frankfurter.dev      ECB reference rates, CORS open
     Stocks   — nothing free and key-free exists. Finnhub and Twelve Data
              both send CORS headers and both work the moment you paste a
              free key, so those are offered as an opt-in.

   Anything we cannot price for real keeps running on the simulated feed, and
   the UI labels every row LIVE or DEMO so the difference is never hidden.
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

  Q.STOCK_PROVIDERS = [
    { id: 'none',       name: 'Demo prices (no key needed)', needsKey: false,
      note: 'Stocks and indices keep using the built-in simulated feed.' },
    { id: 'finnhub',    name: 'Finnhub',    needsKey: true,
      note: 'Free key at finnhub.io. Real-time US stocks, one call per symbol.' },
    { id: 'twelvedata', name: 'Twelve Data', needsKey: true,
      note: 'Free key at twelvedata.com. Covers stocks and indices in one call.' }
  ];

  Q.config = function () {
    try {
      var v = JSON.parse(MC.store.get(CFG_KEY) || 'null');
      return v || { crypto: true, forex: true, stockProvider: 'none', stockKey: '' };
    } catch (e) {
      return { crypto: true, forex: true, stockProvider: 'none', stockKey: '' };
    }
  };
  Q.saveConfig = function (cfg) { MC.store.set(CFG_KEY, JSON.stringify(cfg)); };

  /** Live quote for a symbol, or null when we are simulating it. */
  Q.get = function (sym) { return live[sym] || null; };
  Q.isLive = function (sym) { return !!live[sym]; };
  Q.liveCount = function () { return Object.keys(live).length; };
  Q.lastRun = function () { return lastRun; };

  /* ----------------------------------------------------------------------
     SYMBOL MAPS
     ---------------------------------------------------------------------- */
  var BINANCE = {
    BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT',
    XRP: 'XRPUSDT', ADA: 'ADAUSDT', DOGE: 'DOGEUSDT'
  };

  /** Our forex pairs expressed as base/quote so ECB rates can build them. */
  var FX = {
    EURUSD: ['EUR', 'USD'], GBPUSD: ['GBP', 'USD'], AUDUSD: ['AUD', 'USD'],
    USDJPY: ['USD', 'JPY'], USDCAD: ['USD', 'CAD']
  };

  /* ----------------------------------------------------------------------
     FETCHERS
     ---------------------------------------------------------------------- */
  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' from ' + new URL(url).host);
      return r.json();
    });
  }

  /** Real crypto: last price plus a genuine rolling 24h change. */
  function fetchCrypto() {
    var pairs = Object.keys(BINANCE).map(function (k) { return BINANCE[k]; });
    var url = 'https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' +
              encodeURIComponent(JSON.stringify(pairs));

    return getJSON(url).then(function (rows) {
      var byPair = {};
      rows.forEach(function (r) { byPair[r.symbol] = r; });

      Object.keys(BINANCE).forEach(function (sym) {
        var row = byPair[BINANCE[sym]];
        if (!row) return;
        var price = parseFloat(row.lastPrice);
        if (!isFinite(price)) return;
        live[sym] = {
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
      Object.keys(BINANCE).forEach(function (sym) {
        var per = parseFloat(rates[sym]);
        if (!isFinite(per) || per === 0) return;
        var prev = live[sym];
        live[sym] = {
          price: 1 / per,
          changePct: prev ? prev.changePct : 0,   // Coinbase gives no 24h change
          at: Date.now(),
          source: 'Coinbase'
        };
      });
    }).catch(function () {});
  }

  /** Real FX, built from ECB reference rates against USD. */
  function fetchForex() {
    return getJSON('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,JPY,AUD,CAD')
      .then(function (d) {
        var r = d && d.rates;
        if (!r) return;

        Object.keys(FX).forEach(function (sym) {
          var base = FX[sym][0], quote = FX[sym][1];
          var price;

          if (base === 'USD') {
            price = r[quote];                       // USDJPY, USDCAD
          } else {
            price = r[base] ? 1 / r[base] : null;   // EURUSD, GBPUSD, AUDUSD
          }
          if (!isFinite(price)) return;

          var prev = live[sym];
          live[sym] = {
            price: price,
            changePct: prev ? prev.changePct : 0,
            at: Date.now(),
            source: 'ECB'
          };
        });
      }).catch(function () {});
  }

  /** Stocks and indices, only when the visitor has supplied a key. */
  function fetchStocks(cfg) {
    var symbols = MC.ASSETS
      .filter(function (a) { return a.m === 'stocks'; })
      .map(function (a) { return a.s; });

    if (cfg.stockProvider === 'twelvedata') {
      var url = 'https://api.twelvedata.com/quote?symbol=' + symbols.join(',') +
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
      return Promise.all(symbols.slice(0, 8).map(function (sym) {
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
    if (cfg.stockProvider !== 'none' && cfg.stockKey) jobs.push(fetchStocks(cfg));

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

  var timer = null;
  Q.startAuto = function (seconds) {
    clearInterval(timer);
    timer = setInterval(Q.refresh, Math.max(15, seconds || 30) * 1000);
  };
  Q.stopAuto = function () { clearInterval(timer); };

})(window);
