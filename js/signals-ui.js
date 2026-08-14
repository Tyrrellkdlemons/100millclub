/* ==========================================================================
   signals-ui.js — the Signals desk in the dock

   A board of signal cards for the current market mode, with the visitor's
   own most-watched markets pinned first. Every card shows the composite
   read, how confident the desks are, and — one tap deeper — exactly WHY,
   desk by desk, in plain English, plus ATR-derived levels and an optional
   AI read. Below the board: the curated pro-resources shelf per mode, and
   the honest line about what is real and what is simulated.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var UI = MC.signalsUI = {};

  var built = false;
  var currentTf = '1h';
  var expanded = null;         // sym currently opened to its reasoning

  /* ----------------------------------------------------------------------
     PRO RESOURCES — the shelf of places professionals actually read
     ---------------------------------------------------------------------- */
  var RESOURCES = {
    all: [
      { n: 'TradingView Ideas', u: function (a) { return 'https://www.tradingview.com/symbols/' + (a ? (a.tvPro || a.tv || '').replace(':', '-') : '') + '/ideas/'; }, d: 'What other traders are charting on this exact market.' },
      { n: 'Investing.com', u: 'https://www.investing.com/', d: 'Broad market coverage, calendars and analysis.' },
      { n: 'ForexFactory calendar', u: 'https://www.forexfactory.com/calendar', d: 'THE macro calendar — what moves everything, dated.' },
      { n: 'Finviz map', u: 'https://finviz.com/map.ashx', d: 'The whole US market on one heat map.' }
    ],
    stocks: [
      { n: 'Finviz screener', u: 'https://finviz.com/screener.ashx', d: 'Screen thousands of stocks by any filter.' },
      { n: 'TradingView Ideas', u: function (a) { return 'https://www.tradingview.com/symbols/' + (a ? (a.tvPro || a.tv || '').replace(':', '-') : '') + '/ideas/'; }, d: 'Published trade ideas for the loaded symbol.' },
      { n: 'StockTwits', u: function (a) { return 'https://stocktwits.com/symbol/' + (a ? a.s : 'AAPL'); }, d: 'The live crowd conversation on this ticker.' },
      { n: 'Yahoo Finance', u: function (a) { return 'https://finance.yahoo.com/quote/' + (a ? (a.yh || a.s) : 'AAPL'); }, d: 'Fundamentals, earnings dates, analyst targets.' }
    ],
    crypto: [
      { n: 'CoinGecko', u: 'https://www.coingecko.com/', d: 'Every coin, ranked, with the honest numbers.' },
      { n: 'CoinGlass', u: 'https://www.coinglass.com/', d: 'Liquidations, funding, open interest — the leverage picture.' },
      { n: 'Fear & Greed index', u: 'https://alternative.me/crypto/fear-and-greed-index/', d: 'One number for the crowd’s mood.' },
      { n: 'Binance markets', u: 'https://www.binance.com/en/markets', d: 'The deepest order books in crypto.' }
    ],
    forex: [
      { n: 'DailyFX', u: 'https://www.dailyfx.com/', d: 'Professional FX analysis and sentiment.' },
      { n: 'ForexFactory', u: 'https://www.forexfactory.com/calendar', d: 'The macro calendar every FX desk watches.' },
      { n: 'Myfxbook sentiment', u: 'https://www.myfxbook.com/community/outlook', d: 'How retail is positioned, pair by pair.' },
      { n: 'FXStreet', u: 'https://www.fxstreet.com/', d: 'Rates news and technical confluence levels.' }
    ],
    futures: [
      { n: 'CME micro futures', u: 'https://www.cmegroup.com/markets/equities/micro-e-mini-futures.html', d: 'The exchange’s own page for your micros.' },
      { n: 'Barchart futures', u: 'https://www.barchart.com/futures', d: 'Quotes, charts and commitment of traders.' },
      { n: 'Investing.com futures', u: 'https://www.investing.com/indices/indices-futures', d: 'Global futures board at a glance.' },
      { n: 'ForexFactory calendar', u: 'https://www.forexfactory.com/calendar', d: 'Index futures live and die on this schedule.' }
    ],
    indices: [
      { n: 'Investing.com indices', u: 'https://www.investing.com/indices/', d: 'Every world benchmark, live.' },
      { n: 'Finviz map', u: 'https://finviz.com/map.ashx', d: 'What is dragging the index today.' },
      { n: 'CNN Fear & Greed', u: 'https://edition.cnn.com/markets/fear-and-greed', d: 'The classic sentiment dial.' },
      { n: 'TradingView Ideas', u: function (a) { return 'https://www.tradingview.com/symbols/' + (a ? (a.tvPro || a.tv || '').replace(':', '-') : '') + '/ideas/'; }, d: 'Ideas published on the loaded market.' }
    ]
  };

  /* ----------------------------------------------------------------------
     WHICH SYMBOLS GET CARDS
     ---------------------------------------------------------------------- */
  function boardSymbols() {
    var mode = MC.State.market;
    var picks = MC.markets.personalPicks(mode, 4).map(function (a) { return a.s; });

    var flag = { all: ['MES', 'AAPL', 'BTC', 'EURUSD', 'GOLD', 'SPX'],
                 futures: ['MES', 'MNQ', 'MYM', 'M2K', 'GOLD', 'USOIL'],
                 stocks: ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'META', 'AMZN'],
                 crypto: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE'],
                 forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'EURJPY'],
                 indices: ['SPX', 'NDX', 'DJI', 'FTSE', 'DAX', 'N225'] }[mode] || [];

    var list = [];
    picks.concat([MC.State.symbol]).concat(flag).forEach(function (s) {
      if (MC.MAP[s] && list.indexOf(s) === -1) list.push(s);
    });
    return list.slice(0, 8);
  }

  /* ----------------------------------------------------------------------
     RENDERING
     ---------------------------------------------------------------------- */
  function dirMeta(dir) {
    return dir === 'buy' ? { cls: 'buy', label: 'LEANS LONG', icon: 'fa-arrow-trend-up' }
         : dir === 'sell' ? { cls: 'sell', label: 'LEANS SHORT', icon: 'fa-arrow-trend-down' }
         : { cls: 'neut', label: 'NO EDGE', icon: 'fa-minus' };
  }

  function skeletonCard(sym) {
    return '<div class="sig-card" data-sig="' + sym + '">' +
      '<div class="sig-head"><span class="sym-badge m-' + (MC.MAP[sym] ? MC.MAP[sym].m : 'stocks') + '">' + sym.slice(0, 4) + '</span>' +
      '<div class="sig-title"><b>' + sym + '</b><small>' + MC.esc(MC.MAP[sym] ? MC.MAP[sym].n : '') + '</small></div></div>' +
      '<div class="sig-skel"></div><div class="sig-skel short"></div>' +
    '</div>';
  }

  function cardHtml(sig) {
    var a = MC.MAP[sig.sym];
    if (!a) return '';
    var meta = dirMeta(sig.dir);
    var srcCls = sig.source === 'Simulated' ? 'sim' : 'live';
    var isOpen = expanded === sig.sym;
    var watched = (MC.markets.viewCounts()[sig.sym] || 0) > 1;

    var html =
      '<div class="sig-card ' + meta.cls + (isOpen ? ' open' : '') + '" data-sig="' + sig.sym + '">' +
        '<div class="sig-head">' +
          '<span class="sym-badge m-' + a.m + '">' + sig.sym.slice(0, 4) + '</span>' +
          '<div class="sig-title"><b>' + sig.sym + '</b><small>' + MC.esc(a.n) + '</small></div>' +
          (watched ? '<span class="sig-watch" data-tip="Ranked up because you actually watch this market"><i class="fa-solid fa-eye"></i></span>' : '') +
          '<span class="sig-src ' + srcCls + '" data-tip="' + (sig.source === 'Simulated'
            ? 'No live feed reachable for this one — computed on practice bars'
            : 'Computed on real ' + MC.esc(sig.source) + ' price history') + '">' + MC.esc(sig.source) + '</span>' +
        '</div>' +
        '<div class="sig-verdict">' +
          '<span class="sig-dir ' + meta.cls + '"><i class="fa-solid ' + meta.icon + '"></i> ' + meta.label + '</span>' +
          '<div class="sig-conf" data-tip="How strongly the four desks agree — not a probability of profit">' +
            '<i style="width:' + sig.confidence + '%"></i><span>' + sig.confidence + '%</span>' +
          '</div>' +
          '<span class="sig-tf">' + sig.tf + '</span>' +
        '</div>' +
        '<div class="sig-desks">' +
          MC.signals.DESKS.map(function (desk) {
            var v = sig.votes[desk.key];
            var dcls = v.dir > 0 ? 'buy' : v.dir < 0 ? 'sell' : 'neut';
            return '<span class="sig-desk ' + dcls + '" data-tip="' + MC.esc(desk.name) + '" data-tip-desc="' + MC.esc(v.text) + '">' +
                     '<i class="fa-solid ' + desk.icon + '"></i></span>';
          }).join('') +
          '<button class="sig-more" data-expand="' + sig.sym + '">' +
            (isOpen ? 'Close the reasoning' : 'Why? Show the reasoning') + ' <i class="fa-solid fa-chevron-' + (isOpen ? 'up' : 'down') + '"></i>' +
          '</button>' +
        '</div>';

    if (isOpen) {
      html += '<div class="sig-detail">';
      MC.signals.DESKS.forEach(function (desk) {
        var v = sig.votes[desk.key];
        var dcls = v.dir > 0 ? 'buy' : v.dir < 0 ? 'sell' : 'neut';
        html += '<div class="sig-line"><b class="' + dcls + '"><i class="fa-solid ' + desk.icon + '"></i> ' +
                desk.name + '</b><span>' + MC.esc(v.text) + '</span></div>';
      });
      if (sig.levels) {
        html += '<div class="sig-levels" data-tip="From volatility, not prophecy" ' +
                'data-tip-desc="Stop 1.5× the average bar range away, target twice the risk. A sizing lesson, not a promise.">' +
          '<span><b>Entry</b> ' + MC.fmtPx(sig.levels.entry, a.d) + '</span>' +
          '<span class="down"><b>Stop</b> ' + MC.fmtPx(sig.levels.stop, a.d) + '</span>' +
          '<span class="up"><b>Target</b> ' + MC.fmtPx(sig.levels.target, a.d) + '</span>' +
        '</div>';
      }
      html += '<div class="sig-ai" id="sigAi-' + sig.sym + '"></div>' +
        '<div class="sig-actions">' +
          '<button class="qbtn" data-sig-load="' + sig.sym + '"><i class="fa-solid fa-chart-column"></i> Load chart</button>' +
          '<button class="qbtn" data-sig-trade="' + sig.sym + '" data-dir="' + sig.dir + '"><i class="fa-solid fa-bolt"></i> Practice it</button>' +
          '<button class="qbtn" data-sig-ai="' + sig.sym + '"><i class="fa-solid fa-robot"></i> AI read</button>' +
          '<button class="qbtn" data-sig-refresh="' + sig.sym + '"><i class="fa-solid fa-rotate"></i></button>' +
        '</div>' +
      '</div>';
    }

    return html + '</div>';
  }

  function resourcesHtml() {
    var mode = MC.State.market;
    var list = RESOURCES[mode] || RESOURCES.all;
    var a = MC.State.asset;
    return '<div class="sig-res-head"><i class="fa-solid fa-book-bookmark"></i> The pro shelf — ' +
           (MC.markets.MODES[mode] ? MC.markets.MODES[mode].label : 'All markets') +
           '<span>real desks read these; they open in a new tab</span></div>' +
      '<div class="sig-res">' +
        list.map(function (r) {
          var url = typeof r.u === 'function' ? r.u(a) : r.u;
          return '<a class="sig-res-card" href="' + url + '" target="_blank" rel="noopener noreferrer">' +
                 '<b>' + r.n + ' <i class="fa-solid fa-arrow-up-right-from-square"></i></b><span>' + r.d + '</span></a>';
        }).join('') +
        '<button class="sig-res-card lab" id="sigBotLab">' +
          '<b><i class="fa-solid fa-flask"></i> Bot lab — right here</b>' +
          '<span>Before trusting any bot or signal seller, replay its rules on real history. That is the backtester’s whole job.</span>' +
        '</button>' +
      '</div>';
  }

  function render() {
    var host = MC.$('sigBoard');
    if (!host) return;

    var syms = boardSymbols();
    host.innerHTML = syms.map(skeletonCard).join('');
    MC.$('sigRes').innerHTML = resourcesHtml();
    var lab = MC.$('sigBotLab');
    if (lab) lab.addEventListener('click', function () {
      MC.$$('.rtab').forEach(function (t) { t.classList.toggle('on', t.dataset.pane === 'test'); });
      MC.$$('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'pane-test'); });
      if (MC.ui.rightIsDrawer()) { MC.$('rightPanel').classList.add('open'); MC.$('scrim').classList.add('on'); }
      MC.ui.toast('The Bot lab', 'Pick a strategy and a date range, run it, and read the drawdown before the return.', 'info');
    });

    syms.forEach(function (sym) {
      MC.signals.get(sym, currentTf).then(function (sig) {
        var slot = host.querySelector('[data-sig="' + sym + '"]');
        if (slot) slot.outerHTML = cardHtml(sig);
      });
    });
  }

  /* ----------------------------------------------------------------------
     PUBLIC + WIRING
     ---------------------------------------------------------------------- */
  UI.ensure = function () {
    if (!built) { built = true; wire(); }
    render();
  };

  UI.refreshIfVisible = function () {
    var pane = MC.$('dock-signals');
    if (built && pane && pane.classList.contains('on')) render();
  };

  function wire() {
    MC.on(MC.$('dock-signals'), 'click', '[data-expand]', function (e, btn) {
      var sym = btn.dataset.expand;
      expanded = expanded === sym ? null : sym;
      MC.signals.get(sym, currentTf).then(function (sig) {
        var slot = MC.$('sigBoard').querySelector('[data-sig="' + sym + '"]');
        if (slot) slot.outerHTML = cardHtml(sig);
      });
    });

    MC.on(MC.$('dock-signals'), 'click', '[data-sig-load]', function (e, btn) {
      MC.selectSymbol(btn.dataset.sigLoad);
      MC.ui.toast('Loaded', btn.dataset.sigLoad + ' is on the chart.', 'ok');
    });

    MC.on(MC.$('dock-signals'), 'click', '[data-sig-trade]', function (e, btn) {
      var sym = btn.dataset.sigTrade;
      MC.selectSymbol(sym);
      MC.$$('.rtab').forEach(function (t) { t.classList.toggle('on', t.dataset.pane === 'trade'); });
      MC.$$('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'pane-trade'); });
      if (MC.ui.rightIsDrawer()) { MC.$('rightPanel').classList.add('open'); MC.$('scrim').classList.add('on'); }
      if (btn.dataset.dir === 'buy' || btn.dataset.dir === 'sell') MC.trade.setSide(btn.dataset.dir);
      MC.ui.toast('Practice ticket open', 'Demo money only — set the stop before the size, like the signal card shows.', 'info');
    });

    MC.on(MC.$('dock-signals'), 'click', '[data-sig-refresh]', function (e, btn) {
      var sym = btn.dataset.sigRefresh;
      MC.signals.get(sym, currentTf, true).then(function (sig) {
        var slot = MC.$('sigBoard').querySelector('[data-sig="' + sym + '"]');
        if (slot) slot.outerHTML = cardHtml(sig);
      });
    });

    MC.on(MC.$('dock-signals'), 'click', '[data-sig-ai]', function (e, btn) {
      var sym = btn.dataset.sigAi;
      var box = MC.$('sigAi-' + sym);
      if (!box) return;
      box.innerHTML = '<div class="sig-ai-busy"><i class="fa-solid fa-circle-notch fa-spin"></i> The desk is reading the indicators…</div>';
      MC.signals.get(sym, currentTf).then(function (sig) {
        return MC.signals.aiRead(sig);
      }).then(function (r) {
        box.innerHTML = '<div class="sig-ai-out"><div class="sig-ai-via"><i class="fa-solid fa-robot"></i> via ' +
                        MC.esc(r.via) + '</div>' + MC.ai.toHtml(r.text) + '</div>';
      }).catch(function (err) {
        box.innerHTML = '<div class="sig-ai-out err"><i class="fa-solid fa-circle-info"></i> ' + MC.esc(err.message) + '</div>';
      });
    });

    MC.on(MC.$('dock-signals'), 'click', '.sig-tf-pick .tf', function (e, btn) {
      currentTf = btn.dataset.stf;
      MC.$$('.sig-tf-pick .tf').forEach(function (t) { t.classList.toggle('on', t === btn); });
      expanded = null;
      render();
    });

    var refreshAll = MC.$('sigRefreshAll');
    if (refreshAll) refreshAll.addEventListener('click', function () {
      MC.store.set('mc_signal_cache', '{}');
      expanded = null;
      render();
      MC.ui.toast('Fresh signals', 'Every desk recomputed from the latest bars.', 'ok');
    });

    // mode changes recompute the board when it is on screen
    MC.markets.onMode(function () { UI.refreshIfVisible(); });
  }

})(window);
