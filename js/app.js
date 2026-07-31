/* ==========================================================================
   app.js — symbol/chart orchestration, event wiring, boot

   Load order matters: utils → data → indicators → chart → tradingview →
   ui → watchlist → trade → backtest → vlogs → app.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC;
  var State = MC.State;
  var $ = MC.$, $$ = MC.$$;

  /* ======================================================================
     SYMBOL + CHART
     ====================================================================== */

  /**
   * Load a market everywhere at once: header, chart, order ticket,
   * backtest form and the live TradingView panels.
   */
  function selectSymbol(symbol) {
    if (!MC.MAP[symbol]) return;
    State.symbol = symbol;
    var asset = State.asset;

    $('symBadge').textContent = symbol.slice(0, 2);
    $('symName').textContent = symbol;
    $('symSub').textContent = asset.n;
    $('symMkt').textContent = MC.MKT_LABEL[asset.m];

    // Say so plainly when the live chart is tracking an ETF rather than the
    // index itself, because no free index feed exists for it.
    var proxyChip = $('symProxy');
    proxyChip.classList.toggle('hidden', !asset.tvProxy);
    if (asset.tvProxy) {
      proxyChip.textContent = 'via ' + asset.tvProxy;
      proxyChip.setAttribute('data-tip', 'Charting the ' + asset.tvProxy);
      proxyChip.setAttribute('data-tip-desc',
        asset.n + ' has no free live index feed, so the chart tracks the ' + asset.tvProxy +
        ', which follows it closely. Hit the TradingView button for the real index — ' +
        'if your account has the data, you will see it there.');
    }
    $('oSym').value = symbol + ' · ' + asset.n;
    $('bSym').value = symbol;

    $$('.wl-row').forEach(function (row) {
      row.classList.toggle('on', row.dataset.sym === symbol);
    });

    loadBars();
    updateHeaderPrice();
    MC.trade.syncPrice();
    MC.TV.refreshSymbol();
    if (MC.youtubeUI) MC.youtubeUI.refreshChips();   // search ideas follow the market
    MC.store.set('mc_symbol', symbol);
  }
  MC.selectSymbol = selectSymbol;

  /** Regenerate the simulated series for the current symbol + timeframe. */
  function loadBars() {
    State.bars = MC.genBars(State.symbol, State.tf, 320);
    State.chart.setData(State.bars);
    applyIndicators();
    updateOHLC(State.bars[State.bars.length - 1]);
    $('sB').textContent = State.bars.length;
  }

  /** Fill the O/H/L/C strip — driven by the crosshair, or the last bar. */
  function updateOHLC(bar) {
    if (!bar) return;
    var d = State.asset.d;
    $('sO').textContent = MC.fmtPx(bar.open, d);
    $('sH').textContent = MC.fmtPx(bar.high, d);
    $('sL').textContent = MC.fmtPx(bar.low, d);
    $('sC').textContent = MC.fmtPx(bar.close, d);
    $('sC').className = bar.close >= bar.open ? 'up' : 'down';
    $('sV').textContent = MC.fmtVol(bar.volume);

    var recent = State.bars.slice(-24);
    if (recent.length) {
      var hi = Math.max.apply(null, recent.map(function (b) { return b.high; }));
      var lo = Math.min.apply(null, recent.map(function (b) { return b.low; }));
      $('sR').textContent = MC.fmtPx(lo, d) + ' – ' + MC.fmtPx(hi, d);
    }
  }

  /** Big price + daily change in the chart toolbar. */
  function updateHeaderPrice() {
    var a = State.asset;
    var previousClose = a.base / (1 + a.chg / 100);
    var diff = a.p - previousClose;
    var dir = a.chg >= 0 ? 'up' : 'down';

    var priceEl = $('pxNow');
    priceEl.textContent = MC.fmtPx(a.p, a.d);
    priceEl.className = 'px-now mono ' + dir;

    var chgEl = $('pxChg');
    chgEl.textContent = (diff >= 0 ? '+' : '') + MC.fmtPx(diff, a.d) + ' (' + MC.fmtPct(a.chg) + ')';
    chgEl.className = 'px-chg mono ' + dir;
  }

  /* ======================================================================
     INDICATORS
     ====================================================================== */
  /**
   * Draw every active indicator.
   * Overlay-type ones go straight onto the candles; oscillator-type ones get
   * their own strip underneath. Both come from the same registry definition,
   * so a custom-built indicator behaves exactly like a built-in one.
   */
  function applyIndicators() {
    var legend = [];
    var seenOverlays = {};
    var seenPanes = {};

    State.activeIndicators.forEach(function (entry) {
      var def = MC.registry.get(entry.id);
      if (!def) return;

      var spec;
      try {
        spec = def.calc(State.bars, entry.params);
      } catch (err) {
        // a broken custom formula must not take the whole chart down
        console.warn('Indicator "' + entry.id + '" failed:', err.message);
        return;
      }
      if (!spec || !spec.plots || !spec.plots.length) return;

      if (def.pane === 'main') {
        spec.plots.forEach(function (plot) {
          var key = entry.uid + ':' + plot.key;
          seenOverlays[key] = true;
          State.chart.setOverlay(key, plot.data, plot.color);
        });
        var lead = spec.plots[0];
        var last = lastValue(lead.data);
        legend.push([def.name, lead.color, last]);
      } else {
        seenPanes[entry.uid] = true;
        MC.panes.set(entry.uid, def, spec, State.bars);
      }
    });

    // drop overlays belonging to indicators that are no longer active
    Object.keys(activeOverlayKeys).forEach(function (key) {
      if (!seenOverlays[key]) State.chart.removeOverlay(key);
    });
    activeOverlayKeys = seenOverlays;

    State.chart.setVolume(State.showVolume);

    $('legend').innerHTML = legend.map(function (l) {
      return '<div class="leg" style="color:' + l[1] + '">' +
        MC.esc(l[0]) + (l[2] != null ? '  ' + MC.fmtPx(l[2], State.asset.d) : '') + '</div>';
    }).join('');

    $('panes').classList.toggle('on', Object.keys(seenPanes).length > 0);
    $('btnInd').classList.toggle('on', State.activeIndicators.length > 0);

    setTimeout(function () { State.chart.fit(); MC.panes.resize(); }, 60);
  }
  MC.applyIndicators = applyIndicators;

  var activeOverlayKeys = {};

  function lastValue(data) {
    for (var i = data.length - 1; i >= 0; i--) if (data[i] != null) return data[i];
    return null;
  }

  /* ======================================================================
     DATA SOURCE — live TradingView vs simulated Lightweight Charts
     ====================================================================== */
  function setSource(source) {
    State.source = source;
    $$('.src').forEach(function (b) { b.classList.toggle('on', b.dataset.src === source); });

    var live = source === 'live';
    $('tvChart').classList.toggle('hidden', !live);
    $('chart').classList.toggle('hidden', live);
    $('legend').classList.toggle('hidden', live);
    $('statStrip').classList.toggle('hidden', live);
    $('panes').classList.toggle('hidden', live);

    // The header price comes from the simulated feed, so it would contradict
    // the real quote inside the TradingView chart. Hide it in live mode —
    // TradingView prints its own (real) price at the top of the chart.
    $('pxBlock').classList.toggle('hidden', live);

    if (live) {
      MC.TV.advancedChart();
    } else {
      setTimeout(function () { State.chart.fit(); }, 60);
    }
  }

  /** Chart tools only apply to the simulated chart — hop over automatically. */
  function requireSimMode(what) {
    if (State.source !== 'live') return true;
    setSource('sim');
    MC.ui.toast(
      'Switched to Simulated mode',
      what + ' works on the built-in chart. The live TradingView chart has its own toolbar for this.',
      'info'
    );
    return true;
  }

  /* ======================================================================
     LIVE FEED SIMULATION
     ====================================================================== */
  function tick() {
    MC.watchlist.tick();

    // roll the newest candle so the simulated chart breathes
    if (State.bars.length) {
      var asset = State.asset;
      var last = Object.assign({}, State.bars[State.bars.length - 1]);
      last.close = asset.p;
      last.high = Math.max(last.high, asset.p);
      last.low = Math.min(last.low, asset.p);
      last.volume += Math.round(MC.baseVolume(asset) * Math.random() * 0.08);
      State.chart.updateLast(last);
    }

    updateHeaderPrice();
    MC.watchlist.updateFallbackTape();
    MC.trade.updatePositions();

    if (State.activeIndicators.length) applyIndicators();
    MC.alerts.check();
    MC.calendar.check();
    MC.portfolio.snapshot();
    if (document.getElementById('pane-folio').classList.contains('on')) MC.portfolioUI.render();
  }

  function startLive() {
    clearInterval(State.liveTimer);
    if (State.cfg.live) State.liveTimer = setInterval(tick, State.cfg.speed);
  }

  /* ======================================================================
     DRAWING TOOLS
     ====================================================================== */
  function beginDraw(tool) {
    if (!MC.HAS_LWC) {
      if (tool === 'ray') {
        State.chart.addLevel(State.asset.p, MC.THEME.sma);
        MC.ui.toast('Level added', 'Marked ' + MC.fmtPx(State.asset.p, State.asset.d) + ' on the chart.', 'ok');
      } else {
        MC.ui.toast('Trend lines need the chart library', 'You are on the offline renderer — price levels still work.', 'err');
      }
      return;
    }

    State.draw = tool;
    State.drawPts = [];
    $('btnDraw').classList.add('on');
    $('drawHint').classList.add('on');
    $('drawHintTxt').textContent = tool === 'trend'
      ? 'Click the first point of your trend line'
      : 'Click where you want the price level';
  }

  function endDraw() {
    State.draw = null;
    State.drawPts = [];
    $('btnDraw').classList.remove('on');
    $('drawHint').classList.remove('on');
  }

  function onChartClick(param) {
    if (!State.draw) return;

    if (!param || !param.point || param.time === undefined) {
      MC.ui.toast('Click inside the chart', 'Pick a spot on top of the candles.', 'err');
      return;
    }

    var price = State.chart.priceAt(param.point.y);
    if (price == null) return;

    if (State.draw === 'ray') {
      State.chart.addLevel(price, MC.THEME.sma);
      MC.ui.toast('Level added', 'Marked ' + MC.fmtPx(price, State.asset.d) + '.', 'ok');
      endDraw();
      return;
    }

    State.drawPts.push({ time: param.time, value: price });
    if (State.drawPts.length === 1) {
      $('drawHintTxt').textContent = 'Now click the second point';
    } else {
      var points = State.drawPts.slice().sort(function (a, b) { return a.time - b.time; });
      State.chart.addTrend(points);
      MC.ui.toast('Trend line drawn', 'Connected two points on the chart.', 'ok');
      endDraw();
    }
  }

  /* ======================================================================
     FULLSCREEN
     ====================================================================== */
  function toggleFullscreen() {
    var card = $('chartCard');
    var active = document.fullscreenElement || card.classList.contains('fs-fallback');

    if (active) {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      card.classList.remove('fs-fallback');
      $('btnFs').innerHTML = '<i class="fa-solid fa-expand"></i>';
    } else if (card.requestFullscreen) {
      card.requestFullscreen().catch(function () { card.classList.add('fs-fallback'); });
      $('btnFs').innerHTML = '<i class="fa-solid fa-compress"></i>';
    } else {
      card.classList.add('fs-fallback');       // Safari on iOS, older browsers
      $('btnFs').innerHTML = '<i class="fa-solid fa-compress"></i>';
    }

    setTimeout(function () { State.chart.fit(); }, 260);
  }

  /* ======================================================================
     PANES + DOCK
     ====================================================================== */
  function openPane(name) {
    $$('.rtab').forEach(function (t) { t.classList.toggle('on', t.dataset.pane === name); });
    $$('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'pane-' + name); });
    if (MC.ui.rightIsDrawer()) {
      $('rightPanel').classList.add('open');
      $('scrim').classList.add('on');
    }
  }

  function openDockTab(name) {
    $$('.dock-tab').forEach(function (t) { t.classList.toggle('on', t.dataset.dock === name); });
    $$('.dock-pane').forEach(function (p) { p.classList.toggle('on', p.id === 'dock-' + name); });
    $('dock').classList.remove('collapsed');
    MC.TV.ensurePanel(name);
    setTimeout(function () { State.chart.fit(); }, 300);
  }

  /* ======================================================================
     LOGO UPLOAD
     ====================================================================== */
  function setLogo(src) {
    var btn = $('logoBtn');
    var existing = btn.querySelector('img');
    if (existing) existing.remove();

    var placeholder = btn.querySelector('.logo-default');
    if (placeholder) placeholder.style.display = 'none';

    var img = document.createElement('img');
    img.src = src;
    img.alt = 'Site logo';
    btn.insertBefore(img, btn.querySelector('.cam'));
  }

  /** Shared by the file picker and the drag-and-drop handler. */
  function readLogoFile(file) {
    if (!file.type || file.type.indexOf('image/') !== 0) {
      MC.ui.toast('Not an image', 'Pick a PNG, JPG, SVG or WebP file.', 'err');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      setLogo(reader.result);
      var saved = MC.store.set('mc_logo', reader.result);   // false if over quota
      MC.ui.toast(
        'Logo updated',
        saved ? 'Your mark is now on the terminal.'
              : 'Showing it now — the file was too large to remember for next time.',
        'gold'
      );
    };
    reader.onerror = function () {
      MC.ui.toast('Could not read that file', 'Try a different image.', 'err');
    };
    reader.readAsDataURL(file);
  }

  /* ======================================================================
     EVENT WIRING
     ====================================================================== */
  function wire() {

    /* ---- watchlist ---- */
    MC.on($('watchlist'), 'click', '.wl-row', function (e, row) {
      selectSymbol(row.dataset.sym);
      if (window.innerWidth <= 860) MC.ui.closeDrawers();
    });
    MC.on($('watchlist'), 'keydown', '.wl-row', function (e, row) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSymbol(row.dataset.sym); }
    });

    /* ---- market tabs + search ---- */
    MC.on($('mtabs'), 'click', '.mtab', function (e, tab) {
      $$('.mtab').forEach(function (t) { t.classList.toggle('on', t === tab); });
      State.market = tab.dataset.mkt;
      MC.watchlist.render();
    });
    $('search').addEventListener('input', function (e) {
      State.query = e.target.value;
      MC.watchlist.render();
    });

    /* ---- timeframes ---- */
    MC.on($('tfGroup'), 'click', '.tf', function (e, btn) {
      $$('.tf').forEach(function (t) { t.classList.toggle('on', t === btn); });
      State.tf = btn.dataset.tf;
      loadBars();
      MC.TV.refreshInterval();
      MC.ui.toast('Timeframe changed', 'Each bar now covers ' + btn.textContent.trim() + '.', 'info');
    });

    /* ---- chart style ---- */
    MC.on($('styleSwitch'), 'click', '.cstyle', function (e, btn) {
      var style = btn.dataset.cstyle;
      State.chartStyle = style;
      MC.store.set('mc_chart_style', style);
      $$('.cstyle').forEach(function (b) { b.classList.toggle('on', b === btn); });

      if (State.source === 'live') {
        MC.TV.advancedChart();               // rebuild the widget with the new style
      } else {
        // The built-in engine draws candles, line and area. The live-only
        // styles fall back to their nearest look, and say so.
        var simMap = { candles: 'candles', bars: 'candles', heikin: 'candles',
                       line: 'line', area: 'area', baseline: 'area' };
        State.chart.setStyle(simMap[style]);
        applyIndicators();
        if (style !== simMap[style] && ['bars', 'heikin', 'baseline'].indexOf(style) !== -1) {
          MC.ui.toast('Live-chart style',
            btn.textContent.trim() + ' is a TradingView style — showing the nearest look here. Switch to Live for the real thing.',
            'info');
        }
      }
      var cfgSel = $('cfgStyle');
      if (cfgSel) cfgSel.value = { candles: 'candles', bars: 'candles', heikin: 'candles',
                                   line: 'line', area: 'area', baseline: 'area' }[style];
    });

    /* ---- data source ---- */
    MC.on($('srcSwitch'), 'click', '.src', function (e, btn) { setSource(btn.dataset.src); });

    /* ---- chart tools ---- */
    $('btnInd').addEventListener('click', function () {
      if (requireSimMode('The indicator panel')) MC.ui.openModal('mdInd');
    });
    $('btnDraw').addEventListener('click', function () {
      if (requireSimMode('Drawing')) MC.ui.openModal('mdDraw');
    });
    $('btnCfg').addEventListener('click', function () { MC.ui.openModal('mdCfg'); });
    $('btnFs').addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', function () {
      if (!document.fullscreenElement) $('btnFs').innerHTML = '<i class="fa-solid fa-expand"></i>';
      setTimeout(function () { State.chart.fit(); }, 200);
    });

    /* ---- indicator switches ---- */
    $('swVol').addEventListener('click', function () {
      State.showVolume = !State.showVolume;
      $('swVol').classList.toggle('on', State.showVolume);
      MC.store.set('mc_volume', State.showVolume ? '1' : '0');
      applyIndicators();
    });

    /* ---- drawing ---- */
    $$('[data-draw]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        MC.ui.closeModals();
        beginDraw(btn.dataset.draw);
      });
    });
    $('drawCancel').addEventListener('click', endDraw);
    $('clearDraw').addEventListener('click', function () {
      State.chart.clearDrawings();
      MC.ui.closeModals();
      MC.ui.toast('Drawings cleared', 'The chart is clean again.', 'info');
    });

    /* ---- chart settings ---- */
    $('cfgStyle').addEventListener('change', function (e) {
      if (State.source === 'live') { setSource('sim'); }
      State.chart.setStyle(e.target.value);
      applyIndicators();
    });
    bindSwitch('cfgGrid', function (on) { State.chart.setGrid(on); });
    bindSwitch('cfgCross', function (on) { State.chart.setCrosshair(on); });
    bindSwitch('cfgLast', function (on) { State.chart.setLastLine(on); });
    $('cfgResetLayout').addEventListener('click', function () {
      MC.resize.reset();
      MC.ui.toast('Layout reset', 'Every panel is back to its standard size.', 'ok');
    });
    bindSwitch('cfgTvReuse', function (on) {
      MC.store.set('mc_tv_reuse', on ? '1' : '0');
      MC.ui.toast(on ? 'Reusing one tab' : 'New tab each time',
        on ? 'TradingView handoffs will keep landing in the same tab.'
           : 'Every handoff opens a fresh tab.', 'info');
    });
    bindSwitch('cfgLive', function (on) {
      State.cfg.live = on;
      startLive();
      MC.ui.toast(on ? 'Live updates on' : 'Live updates paused',
                  on ? 'Prices are streaming again.' : 'Prices are frozen.', 'info');
    });
    $('cfgSpeed').addEventListener('change', function (e) {
      State.cfg.speed = parseInt(e.target.value, 10);
      startLive();
    });

    /* ---- right sidebar tabs ---- */
    $$('.rtab').forEach(function (tab) {
      tab.addEventListener('click', function () { openPane(tab.dataset.pane); });
    });

    /* ---- order ticket ---- */
    $('sideBuy').addEventListener('click', function () { MC.trade.setSide('buy'); });
    $('sideSell').addEventListener('click', function () { MC.trade.setSide('sell'); });
    $('oType').addEventListener('change', function (e) {
      var isLimit = e.target.value === 'limit';
      $('oPx').disabled = !isLimit;
      if (!isLimit) MC.trade.syncPrice();
      MC.trade.updateSummary();
    });
    $('oPxLast').addEventListener('click', function () {
      $('oPx').value = State.asset.p.toFixed(State.asset.d);
      MC.trade.updateSummary();
    });
    $$('[data-qty]').forEach(function (b) {
      b.addEventListener('click', function () {
        $('oQty').value = b.dataset.qty;
        MC.trade.updateSummary();
      });
    });
    $$('[data-risk]').forEach(function (b) {
      b.addEventListener('click', function () {
        var pct = parseFloat(b.dataset.risk);
        var asset = State.asset;
        if (!pct) {
          $('oSl').value = '';
          $('oTp').value = '';
          MC.trade.updateSummary();
          return;
        }
        var price = $('oType').value === 'market' ? asset.p : (parseFloat($('oPx').value) || asset.p);
        var dir = State.side === 'buy' ? 1 : -1;
        $('oSl').value = (price - dir * price * pct / 100).toFixed(asset.d);
        $('oTp').value = (price + dir * price * pct / 100 * 2).toFixed(asset.d);   // 2:1 reward-to-risk
        MC.trade.updateSummary();
      });
    });
    ['oQty', 'oPx', 'oSl', 'oTp'].forEach(function (id) {
      $(id).addEventListener('input', MC.trade.updateSummary);
    });
    $('placeBtn').addEventListener('click', function () {
      MC.trade.place();
      MC.queezUI.remark(MC.queez.noteOrder());
    });
    $('reviewBtn').addEventListener('click', function () {
      var section = $('reviewWrap');
      section.classList.toggle('on');
      if (section.classList.contains('on')) {
        MC.review.render();
        section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    MC.on($('positions'), 'click', '[data-close-pos]', function (e, btn) {
      MC.trade.close(btn.getAttribute('data-close-pos'));
    });

    /* ---- backtest ---- */
    $('bStrat').addEventListener('change', function (e) {
      $('stratNote').textContent = MC.STRAT_NOTE[e.target.value];
    });
    $('runBtn').addEventListener('click', MC.backtest.run);

    /* ---- navbar ---- */
    $('connectBtn').addEventListener('click', function () {
      var btn = $('connectBtn');
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span class="lbl">Connecting…</span>';
      setTimeout(function () {
        btn.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--green)"></i><span class="lbl">Connected</span>';
        btn.classList.add('on');
        MC.ui.toast('Broker linked ✓', 'Demo account connected · balance $100,000 · paper trading only.', 'ok');
      }, 1100);
    });
    $('navBacktest').addEventListener('click', function () {
      openPane('test');
      MC.ui.toast('Strategy tester', 'Pick a rule set and a date range, then run it.', 'info');
    });
    $('navVlogs').addEventListener('click', function () {
      var dock = $('dock');
      var hiding = !dock.classList.contains('hidden');
      dock.classList.toggle('hidden', hiding);
      $('navVlogs').classList.toggle('on', !hiding);
      if (!hiding) openDockTab('vlogs');
      setTimeout(function () { State.chart.fit(); }, 300);
    });
    /* ---- help menu ---- */
    $('helpBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      $('helpMenu').classList.toggle('on');
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#helpWrap')) $('helpMenu').classList.remove('on');
    });
    $('miTour').addEventListener('click', function () {
      $('helpMenu').classList.remove('on');
      MC.tour.start();
    });
    $('miHints').addEventListener('click', function () {
      $('helpMenu').classList.remove('on');
      var on = MC.tour.toggleHints();
      $('miHints').querySelector('span').firstChild.nodeValue = on ? 'Hide hints' : 'Show hints';
    });
    $('miGuide').addEventListener('click', function () {
      $('helpMenu').classList.remove('on');
      MC.ui.openModal('mdHelp');
    });
    $('miShortcuts').addEventListener('click', function () {
      $('helpMenu').classList.remove('on');
      MC.ui.openModal('mdKeys');
    });

    /* ---- open on the visitor's own TradingView account ---- */
    $('btnOpenTV').addEventListener('click', function () { MC.TV.openInTradingView('chart'); });
    $('dockOpenTV').addEventListener('click', function () {
      // send them to whichever panel they are actually looking at
      var active = document.querySelector('.dock-tab.on');
      var kind = active ? active.dataset.dock : 'chart';
      MC.TV.openInTradingView(kind === 'vlogs' ? 'chart' : kind);
    });

    /* ---- dock ---- */
    MC.on($('dockTabs'), 'click', '.dock-tab', function (e, tab) {
      openDockTab(tab.dataset.dock);
      // the TradingView button is meaningless on the vlogs tab
      $('dockOpenTV').classList.toggle('hidden', tab.dataset.dock === 'vlogs');
    });
    $('dockToggle').addEventListener('click', function () {
      var nowOpen = $('dock').classList.toggle('collapsed') === false;
      MC.store.set('mc_dock_open', nowOpen ? '1' : '');
      setTimeout(function () { State.chart.fit(); }, 300);
    });

    // A hidden tab burns battery for nobody. Freeze the simulated feed and
    // the quote poller until the tab is looked at again.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearInterval(State.liveTimer);
        MC.quotes.stopAuto();
        MC.news.stopAuto();
      } else {
        startLive();
        MC.quotes.startAuto(30);
        MC.news.startAuto();
        MC.quotes.refresh();
      }
    });

    /* ---- vlogs ---- */
    MC.on($('vlogBody'), 'click', '.vid', function (e, card) {
      if (card.dataset.ytid) { MC.youtubeUI.handleCardClick(e, card); return; }
      var video = MC.vlogs.find(card.dataset.vid);
      var shareBtn = e.target.closest('[data-plat]');
      if (shareBtn) {
        e.stopPropagation();
        if (shareBtn.dataset.plat === 'more') MC.vlogs.openShareSheet(video);
        else MC.vlogs.shareTo(shareBtn.dataset.plat, video);
        return;
      }
      // any click that is not a share button plays the real video, floating
      MC.youtubeUI.play({
        id: video.yt,
        title: video.t,
        author: video.by,
        thumb: 'https://i.ytimg.com/vi/' + video.yt + '/hqdefault.jpg'
      });
    });
    $$('[data-share]').forEach(function (b) {
      b.addEventListener('click', function () {
        var target = MC.vlogs.getShareTarget();
        if (target) MC.vlogs.shareTo(b.dataset.share, target);
      });
    });
    $('copyLink').addEventListener('click', MC.vlogs.copyLink);

    /* ---- logo upload (click or drop) ---- */
    $('logoBtn').addEventListener('click', function () { $('logoInput').click(); });
    $('logoInput').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) readLogoFile(file);
    });

    /* ---- bottom tab bar (phones) ---- */
    function bnavSelect(name) {
      $$('.bnav').forEach(function (b) { b.classList.toggle('on', b.dataset.bnav === name); });
    }
    MC.on($('bottomNav'), 'click', '.bnav', function (e, btn) {
      var name = btn.dataset.bnav;
      if (name === 'markets') {
        MC.ui.toggleDrawer('left');
        bnavSelect($('leftPanel').classList.contains('open') ? 'markets' : 'chart');
        return;
      }
      if (name === 'chart') {
        MC.ui.closeDrawers();
        bnavSelect('chart');
        return;
      }
      // trade / alerts / folio all live in the right drawer
      var pane = name === 'trade' ? 'trade' : name === 'alerts' ? 'alerts' : 'folio';
      openPane(pane);
      bnavSelect(name);
      if (name === 'folio') MC.portfolioUI.render();
    });
    // closing the drawers by scrim or Esc snaps the bar back to Chart
    $('scrim').addEventListener('click', function () { bnavSelect('chart'); });

    /* ---- mobile drawers ---- */
    $('mobLeft').addEventListener('click', function () { MC.ui.toggleDrawer('left'); });
    $('mobRight').addEventListener('click', function () { MC.ui.toggleDrawer('right'); });
    $('scrim').addEventListener('click', MC.ui.closeDrawers);

    /* ---- keyboard shortcuts ---- */
    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);

      if (e.key === 'Escape') {
        if (MC.tour.isRunning()) { MC.tour.stop(); return; }
        MC.ui.closeModals();
        MC.ui.closeDrawers();
        $('helpMenu').classList.remove('on');
        endDraw();
        if (document.activeElement.blur) document.activeElement.blur();
        return;
      }
      if (typing) return;

      // while the tour is up, the arrow keys and Enter drive it
      if (MC.tour.isRunning()) {
        if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); MC.tour.next(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); MC.tour.back(); }
        return;
      }

      var key = e.key.toLowerCase();
      if (e.key === '/') { e.preventDefault(); $('search').focus(); }
      else if (e.key === '?') MC.ui.openModal('mdHelp');
      else if (key === 'b') { openPane('trade'); MC.trade.setSide('buy'); }
      else if (key === 's') { openPane('trade'); MC.trade.setSide('sell'); }
      else if (key === 'f') toggleFullscreen();
      else if (key === 'v') $('navVlogs').click();
    });

    window.addEventListener('resize', MC.debounce(function () {
      MC.ui.closeModals();
      State.chart.fit();
    }, 150));
  }

  /** Toggle helper for the pill switches in the settings modals. */
  function bindSwitch(id, onChange) {
    $(id).addEventListener('click', function () {
      var on = !$(id).classList.contains('on');
      $(id).classList.toggle('on', on);
      onChange(on);
    });
  }

  /* ======================================================================
     BOOT
     ====================================================================== */
  function init() {
    // 1. simulated chart engine (Lightweight Charts, or the canvas fallback)
    State.chart = MC.createChart($('chart'), updateOHLC);
    if (State.chart.onClick) State.chart.onClick(onChartClick);
    MC.panes.init($('panes'), State.chart);
    MC.onRemoveIndicator = function (uid) { MC.indicatorUI.removeUid(uid); };

    // 2. restore anything the user personalised last visit
    var savedLogo = MC.store.get('mc_logo');
    if (savedLogo) setLogo(savedLogo);
    var savedStyle = MC.store.get('mc_chart_style');
    if (savedStyle) {
      State.chartStyle = savedStyle;
      $$('.cstyle').forEach(function (b) { b.classList.toggle('on', b.dataset.cstyle === savedStyle); });
    }
    var savedSymbol = MC.store.get('mc_symbol');
    if (savedSymbol && MC.MAP[savedSymbol]) State.symbol = savedSymbol;
    MC.dragdrop.applySavedOrder();      // their own watchlist arrangement

    // 3. populate the static bits of the UI
    $('bSym').innerHTML = MC.ASSETS.map(function (a) {
      return '<option value="' + a.s + '">' + a.s + ' — ' + MC.esc(a.n) + '</option>';
    }).join('');
    $('bFrom').value = MC.todayISO(-365);
    $('bTo').value = MC.todayISO(0);
    $('stratNote').textContent = MC.STRAT_NOTE.sma;

    State.showVolume = MC.store.get('mc_volume') !== '0';
    $('swVol').classList.toggle('on', State.showVolume);

    MC.ui.initTooltips();
    MC.ui.initModals();
    MC.watchlist.render();
    MC.vlogs.render();

    // indicator library + alerts
    MC.indicatorUI.restore();
    MC.indicatorUI.init();
    MC.indicatorUI.render();
    MC.alertsUI.init();
    MC.radarUI.init();
    MC.portfolioUI.init();
    MC.queezUI.init();
    MC.resize.init();
    MC.youtubeUI.init();
    MC.quotes.refresh().then(function () { MC.portfolio.snapshot(true); });
    MC.quotes.startAuto(30);
    MC.news.refresh().then(function () { MC.news.primeSeen(); });
    MC.news.startAuto();

    // 4. live TradingView panels — the tape falls back to the simulated
    //    marquee if TradingView cannot be reached
    MC.TV.tickerTape(function () { MC.watchlist.buildFallbackTape(); });

    // Phones: calmer tick rate out of the box, and the dock starts folded
    // so the chart owns the screen. Opening it once is remembered.
    var isPhone = window.matchMedia('(max-width: 860px)').matches;
    if (isPhone) {
      State.cfg.speed = 3000;
      var speedSel = $('cfgSpeed');
      if (speedSel) speedSel.value = '3000';
      if (!MC.store.get('mc_dock_open')) $('dock').classList.add('collapsed');
    }

    // 5. wire everything, then load the opening market
    wire();
    selectSymbol(State.symbol);
    setSource('live');
    MC.trade.setSide('buy');
    MC.trade.renderPositions();
    startLive();

    // 6. the "make it easy" layer: drag-and-drop, hint markers, guided tour
    MC.dragdrop.init({
      onImageFile: readLogoFile,
      onSymbol: selectSymbol
    });
    MC.tour.buildHints();

    if (!MC.HAS_LWC) {
      MC.ui.toast('Offline chart mode',
        'The chart library did not load, so the built-in renderer is running. Everything else works normally.', 'info');
    }

    // First visit gets the walkthrough; after that, just a nudge.
    if (!MC.tour.maybeAutoStart()) {
      setTimeout(function () {
        MC.ui.toast('Welcome back to the City of Grind 👑',
          'Hover anything for an explanation, or hit the ? button to replay the tour.', 'gold');
      }, 900);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
