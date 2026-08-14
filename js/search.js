/* ==========================================================================
   search.js — the big symbol search, the way TradingView does it

   One box that finds anything: fuzzy over the whole local universe, plus the
   live long tail — Yahoo's search through our /api proxy (stocks, indices,
   futures, forex worldwide) and CoinGecko for crypto (their API allows the
   browser in directly). Anything picked from the long tail is registered as
   a real instrument on the spot: it charts, quotes and demo-trades like a
   built-in from that moment on.

   Recents and favourites live at the top, class tabs narrow the hunt,
   arrows + Enter drive it from the keyboard, and typing “?” explains the
   syntax instead of leaving you guessing.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var S = MC.searchUI = {};

  var CLS_LABEL = { stocks: 'Stock', crypto: 'Crypto', forex: 'Forex', futures: 'Futures', indices: 'Index' };
  var PREFIX = { 's:': 'stocks', 'c:': 'crypto', 'f:': 'forex', 'fu:': 'futures', 'i:': 'indices' };

  var query = '';
  var cls = 'all';            // the class tab
  var activeIdx = 0;          // keyboard cursor over the flat row list
  var rows = [];              // flat list of currently rendered selectables
  var remote = [];            // latest long-tail results
  var remoteSeq = 0;          // stale-response guard
  var remoteBusy = false;
  var isOpen = false;

  /* ----------------------------------------------------------------------
     OPEN / CLOSE
     ---------------------------------------------------------------------- */
  S.open = function (seed) {
    isOpen = true;
    MC.ui.openModal('mdSearch');
    var input = MC.$('smInput');
    if (typeof seed === 'string') { query = seed; input.value = seed; }
    render();
    runRemote();
    setTimeout(function () { input.focus(); input.select(); }, 40);
  };

  S.close = function () {
    isOpen = false;
    MC.ui.closeModals();
    // the modal's query narrows the watchlist live; leaving clears it
    if (MC.State.query) { MC.State.query = ''; MC.watchlist.render(); }
  };

  S.isOpen = function () { return isOpen; };

  /* ----------------------------------------------------------------------
     LOCAL + REMOTE RESULTS
     ---------------------------------------------------------------------- */

  /** Strip a class prefix like "c:doge" and apply it to the tab. */
  function parseQuery(raw) {
    var q = raw.trim();
    var lower = q.toLowerCase();
    for (var p in PREFIX) {
      if (lower.indexOf(p) === 0) return { q: q.slice(p.length).trim(), cls: PREFIX[p] };
    }
    return { q: q, cls: null };
  }

  function localMatches(q, klass) {
    return MC.ASSETS
      .map(function (a) { return { a: a, score: MC.markets.fuzzyScore(q, a.s, a.n) }; })
      .filter(function (x) {
        if (!x.score) return false;
        return klass === 'all' || x.a.m === klass;
      })
      .sort(function (x, y) { return y.score - x.score; })
      .slice(0, 30)
      .map(function (x) { return x.a; });
  }

  var debouncedRemote = MC.debounce(function () { runRemote(true); }, 300);

  /** The long tail: Yahoo via the proxy + CoinGecko direct. */
  function runRemote(fromTyping) {
    var parsed = parseQuery(query);
    var q = parsed.q;
    if (!q || q === '?' || q.length < 2) { remote = []; if (fromTyping) render(); return; }

    var seq = ++remoteSeq;
    remoteBusy = true;
    if (fromTyping) render();          // show the skeleton while we hunt

    var jobs = [];

    // Yahoo through the function proxy (absent on file:// — that is fine)
    if (/^https?:$/.test(location.protocol)) {
      jobs.push(
        fetch('/api/search?q=' + encodeURIComponent(q))
          .then(function (r) { return r.ok ? r.json() : { results: [] }; })
          .then(function (d) { return (d.results || []).map(mapYahoo).filter(Boolean); })
          .catch(function () { return []; })
      );
    }

    // CoinGecko lets the browser in directly — the crypto long tail
    jobs.push(
      fetch('https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(q))
        .then(function (r) { return r.ok ? r.json() : { coins: [] }; })
        .then(function (d) {
          return (d.coins || []).slice(0, 6).map(function (c) {
            var sym = (c.symbol || '').toUpperCase();
            if (!sym) return null;
            var existing = MC.MAP[sym];
            // a symbol already taken by a non-crypto instrument stays theirs
            if (existing && existing.m !== 'crypto') return null;
            return {
              symbol: sym, name: c.name, exch: 'CoinGecko',
              type: c.market_cap_rank ? 'Crypto · #' + c.market_cap_rank : 'Crypto',
              market: 'crypto', tv: 'BINANCE:' + sym + 'USDT', yh: null
            };
          }).filter(Boolean);
        })
        .catch(function () { return []; })
    );

    Promise.all(jobs).then(function (lists) {
      if (seq !== remoteSeq) return;    // something newer already landed
      var seen = {};
      remote = [];
      lists.forEach(function (list) {
        list.forEach(function (r) {
          var key = r.market + ':' + r.symbol;
          if (seen[key] || MC.MAP[r.symbol]) return;   // locals already rank
          seen[key] = true;
          remote.push(r);
        });
      });
      remoteBusy = false;
      render();
    });
  }

  /** Yahoo search row → our candidate shape (null = not chartable here). */
  function mapYahoo(r) {
    var sym = r.symbol || '';
    if (!sym) return null;
    // foreign listings like RY.TO quote fine but their TradingView venue
    // prefixes are a guessing game — keep the list honest instead
    if (r.market === 'stocks' && sym.indexOf('.') > 0) return null;
    if (r.market === 'forex') {
      r.symbol = sym.replace('=X', '');
      if (r.symbol.length !== 6) return null;
    }
    if (r.market === 'futures') r.symbol = sym.replace('=F', '');
    if (r.market === 'indices') r.symbol = sym.replace(/^\^/, '');
    return r;
  }

  /* ----------------------------------------------------------------------
     PICKING — registration + selection
     ---------------------------------------------------------------------- */
  function pickLocal(sym) {
    MC.selectSymbol(sym);
    S.close();
  }

  function pickRemote(r) {
    var def = {
      s: r.symbol, n: r.name, m: r.market, tv: r.tv, yh: r.yh,
      exch: r.exch, sec: r.type
    };
    var asset = MC.markets.ensureAsset(def);

    // custom crypto: prove the Binance pair exists before trusting it, so one
    // unlisted coin can never poison the whole board's batch quote call
    if (asset.m === 'crypto' && asset.custom && !asset.bpChecked) {
      asset.bpChecked = true;
      fetch('https://data-api.binance.vision/api/v3/ticker/price?symbol=' + asset.s + 'USDT')
        .then(function (res) {
          if (!res.ok) throw new Error('no pair');
          return res.json();
        })
        .then(function (d) {
          var p = parseFloat(d.price);
          if (isFinite(p) && p > 0) {
            asset.p = p; asset.base = p;
            asset.d = p >= 100 ? 2 : p >= 1 ? 3 : p >= 0.01 ? 5 : 8;
          }
          MC.quotes.refresh();
        })
        .catch(function () {
          asset.noBinance = true;
          asset.tv = 'CRYPTO:' + asset.s + 'USD';   // TradingView's aggregate index
          MC.ui.toast('Thin market', asset.s + ' has no Binance pair — charting TradingView’s aggregate feed, prices simulated.', 'info');
        });
    }

    MC.selectSymbol(asset.s);
    MC.ui.toast('Added to the board ✓', asset.s + ' · ' + asset.n + ' joined your universe — it charts, quotes and demo-trades like any built-in now.', 'gold');
    S.close();
  }

  /* ----------------------------------------------------------------------
     RENDER
     ---------------------------------------------------------------------- */
  function rowHtml(item, idx) {
    var a = item.a;
    var isFav = MC.markets.isFav(a ? a.s : '');
    var sym = a ? a.s : item.r.symbol;
    var name = a ? a.n : item.r.name;
    var market = a ? a.m : item.r.market;
    var exch = a ? (a.exch || (a.tv ? a.tv.split(':')[0] : '')) : item.r.exch;
    var tag = a ? (a.sec || CLS_LABEL[market] || market) : (item.r.type || CLS_LABEL[market]);
    var liveNow = a && MC.quotes && MC.quotes.isLive(a.s);

    return '<div class="sm-row' + (idx === activeIdx ? ' active' : '') + '" data-idx="' + idx + '" role="option" aria-selected="' + (idx === activeIdx) + '">' +
      '<span class="sym-badge m-' + market + '">' + MC.esc(sym.slice(0, 4)) + '</span>' +
      '<span class="sm-main"><b>' + MC.esc(sym) + '</b><small>' + MC.esc(name) + '</small></span>' +
      (liveNow ? '<span class="sm-live" data-tip="Priced by a real feed right now">LIVE</span>' : '') +
      '<span class="sm-tag">' + MC.esc(tag) + '</span>' +
      '<span class="sm-exch">' + MC.esc(exch || '') + '</span>' +
      (a ? '<button class="sm-star' + (isFav ? ' on' : '') + '" data-star="' + MC.esc(a.s) + '" aria-label="Favourite" data-tip="' + (isFav ? 'Unpin from favourites' : 'Pin to favourites') + '">' +
             '<i class="fa-' + (isFav ? 'solid' : 'regular') + ' fa-star"></i></button>'
         : '<span class="sm-add"><i class="fa-solid fa-plus"></i></span>') +
    '</div>';
  }

  function sectionHtml(title, icon, items) {
    if (!items.length) return '';
    var html = '<div class="sm-sec"><i class="fa-solid ' + icon + '"></i>' + title + '</div>';
    items.forEach(function (item) {
      rows.push(item);
      html += rowHtml(item, rows.length - 1);
    });
    return html;
  }

  function helpHtml() {
    return '<div class="sm-help">' +
      '<div class="sm-help-t"><i class="fa-solid fa-circle-question"></i> How this search thinks</div>' +
      '<p><b>Type anything</b> — a symbol (<code>NVDA</code>, <code>btc</code>) or a name (<code>nikkei</code>, ' +
        '<code>shiba</code>). Fuzzy matching means <code>msft</code>, <code>micro soft</code> and <code>MSFT</code> all land.</p>' +
      '<p><b>Narrow by class</b> with the tabs, or type a prefix: ' +
        '<code>s:</code> stocks · <code>c:</code> crypto · <code>f:</code> forex · <code>fu:</code> futures · <code>i:</code> indices. ' +
        'So <code>c:pepe</code> hunts only crypto.</p>' +
      '<p><b>Beyond the board</b> — anything the local list does not know is hunted live across Yahoo Finance ' +
        '(stocks, indices, futures, forex worldwide) and CoinGecko (every listed coin). Pick one and it joins ' +
        'your universe permanently: chart, live price, demo trading, alerts.</p>' +
      '<p><b>Keys</b> — <span class="kbd">↑</span><span class="kbd">↓</span> move · <span class="kbd">Enter</span> open · ' +
        '<span class="kbd">Esc</span> close · press <span class="kbd">/</span> anywhere to come back here.</p>' +
    '</div>';
  }

  function render() {
    var body = MC.$('smBody');
    if (!body) return;
    rows = [];
    activeIdx = MC.clamp(activeIdx, 0, 999);

    var parsed = parseQuery(query);
    var effCls = parsed.cls || cls;
    var q = parsed.q;

    // tab UI reflects a typed prefix too
    MC.$$('#smTabs .sm-tab').forEach(function (t) {
      t.classList.toggle('on', t.dataset.cls === effCls);
    });

    if (q === '?') { body.innerHTML = helpHtml(); return; }

    var html = '';

    if (!q) {
      var recents = MC.markets.recents().map(function (s) { return { a: MC.MAP[s] }; });
      var favs = MC.markets.favorites().map(function (s) { return { a: MC.MAP[s] }; });
      var picks = MC.markets.personalPicks(effCls, 6).map(function (a) { return { a: a }; });
      var board = MC.ASSETS
        .filter(function (a) { return effCls === 'all' || a.m === effCls; })
        .slice(0, effCls === 'all' ? 14 : 24)
        .map(function (a) { return { a: a }; });

      html += sectionHtml('Favourites', 'fa-star', favs.slice(0, 8));
      html += sectionHtml('Recent', 'fa-clock-rotate-left', recents.slice(0, 8));
      if (picks.length && !favs.length) html += sectionHtml('Your usual suspects', 'fa-fire', picks);
      html += sectionHtml(effCls === 'all' ? 'The board' : MC.markets.MODES[effCls].label, 'fa-list', board);
      html += '<div class="sm-tip-line">Type to hunt the whole market — or <b>?</b> for how the search thinks.</div>';
    } else {
      var locals = localMatches(q, effCls).map(function (a) { return { a: a }; });
      html += sectionHtml('On your board', 'fa-list-check', locals);

      var remoteFiltered = remote.filter(function (r) {
        return effCls === 'all' || r.market === effCls;
      }).map(function (r) { return { r: r }; });

      if (remoteBusy && !remoteFiltered.length) {
        html += '<div class="sm-sec"><i class="fa-solid fa-globe"></i>Across the market</div>' +
                '<div class="sm-skel"></div><div class="sm-skel"></div><div class="sm-skel"></div>';
      } else {
        html += sectionHtml('Across the market — pick one to add it', 'fa-globe', remoteFiltered);
      }

      if (!locals.length && !remoteFiltered.length && !remoteBusy) {
        html += '<div class="wl-empty"><i class="fa-solid fa-magnifying-glass"></i>Nothing matches “' +
                MC.esc(q) + '” — try fewer letters, or a prefix like <b>c:</b> for crypto.</div>';
      }
    }

    if (activeIdx >= rows.length) activeIdx = Math.max(0, rows.length - 1);
    body.innerHTML = html;

    var activeEl = body.querySelector('.sm-row.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  /* ----------------------------------------------------------------------
     WIRING
     ---------------------------------------------------------------------- */
  S.init = function () {
    var input = MC.$('smInput');
    if (!input) return;

    input.addEventListener('input', function (e) {
      query = e.target.value;
      activeIdx = 0;
      // the background watchlist narrows live with the hunt
      MC.State.query = parseQuery(query).q === '?' ? '' : parseQuery(query).q;
      MC.watchlist.render();
      render();
      debouncedRemote();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, rows.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); render(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var item = rows[activeIdx];
        if (!item) return;
        if (item.a) pickLocal(item.a.s); else pickRemote(item.r);
      }
    });

    MC.on(MC.$('smTabs'), 'click', '.sm-tab', function (e, tab) {
      cls = tab.dataset.cls;
      activeIdx = 0;
      render();
      MC.$('smInput').focus();
    });

    MC.on(MC.$('smBody'), 'click', '.sm-row', function (e, row) {
      var star = e.target.closest('[data-star]');
      if (star) {
        e.stopPropagation();
        var on = MC.markets.toggleFav(star.dataset.star);
        MC.ui.toast(on ? 'Pinned ★' : 'Unpinned', star.dataset.star + (on ? ' now sits in your favourites.' : ' left your favourites.'), 'info');
        render();
        return;
      }
      var item = rows[parseInt(row.dataset.idx, 10)];
      if (!item) return;
      if (item.a) pickLocal(item.a.s); else pickRemote(item.r);
    });

    // the navbar box is the doorway — typing happens in the modal
    var navSearch = MC.$('search');
    if (navSearch) {
      navSearch.addEventListener('focus', function () { navSearch.blur(); S.open(); });
      navSearch.addEventListener('click', function () { S.open(); });
    }

    // dismissals that bypass S.close (scrim click, the X, Escape) must still
    // clear the live watchlist filter the modal was driving
    document.addEventListener('click', function (e) {
      if (!isOpen) return;
      if (e.target.id === 'mdSearch' ||
          (e.target.closest('[data-close]') && e.target.closest('#mdSearch'))) {
        S.close();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) S.close();
    });
  };

})(window);
