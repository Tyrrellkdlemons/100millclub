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
    $('oSym').value = symbol + ' · ' + asset.n;
    $('bSym').value = symbol;

    $$('.wl-row').forEach(function (row) {
      row.classList.toggle('on', row.dataset.sym === symbol);
    });

    loadBars();
    updateHeaderPrice();
    MC.trade.syncPrice();
    MC.TV.refreshSymbol();
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
  function applyIndicators() {
    var closes = State.bars.map(function (b) { return b.close; });
    var legend = [];
    var T = MC.THEME;

    if (State.ind.sma) {
      var smaValues = MC.ind.sma(closes, 20);
      State.chart.setOverlay('sma', smaValues, T.sma);
      legend.push(['SMA 20', T.sma, smaValues[smaValues.length - 1]]);
    } else {
      State.chart.removeOverlay('sma');
    }

    if (State.ind.ema) {
      var emaValues = MC.ind.ema(closes, 50);
      State.chart.setOverlay('ema', emaValues, T.ema);
      legend.push(['EMA 50', T.ema, emaValues[emaValues.length - 1]]);
    } else {
      State.chart.removeOverlay('ema');
    }

    if (State.ind.bb) {
      var bands = MC.ind.bbands(closes, 20, 2);
      State.chart.setOverlay('bbUpper', bands.upper, T.bb);
      State.chart.setOverlay('bbLower', bands.lower, T.bb);
      legend.push(['Bollinger 20, 2', T.bb, null]);
    } else {
      State.chart.removeOverlay('bbUpper');
      State.chart.removeOverlay('bbLower');
    }

    State.chart.setVolume(State.ind.vol);

    $('legend').innerHTML = legend.map(function (l) {
      return '<div class="leg" style="color:' + l[1] + '">' +
        l[0] + (l[2] != null ? '  ' + MC.fmtPx(l[2], State.asset.d) : '') + '</div>';
    }).join('');

    renderRsi(closes);

    // any indicator active (volume aside) lights up the toolbar button
    $('btnInd').classList.toggle(
      'on',
      State.ind.sma || State.ind.ema || State.ind.bb || State.ind.rsi
    );
  }

  /** RSI lives in its own pane under the chart, time-synced to the main one. */
  function renderRsi(closes) {
    $('rsiWrap').classList.toggle('on', State.ind.rsi);
    if (!State.ind.rsi) return;

    var values = MC.ind.rsi(closes, 14);

    if (!MC.HAS_LWC) {
      var latest = values[values.length - 1];
      $('rsi').innerHTML =
        '<div style="padding:34px 12px;text-align:center;color:var(--dim);font-size:11px">' +
        'RSI needs the chart library — currently offline. Latest reading: ' +
        '<b style="color:var(--accent)">' + (latest != null ? latest.toFixed(1) : '–') + '</b></div>';
      return;
    }

    if (!State.rsiChart) {
      State.rsiChart = LightweightCharts.createChart($('rsi'), {
        autoSize: true,
        layout: {
          background: { type: 'solid', color: 'transparent' },
          textColor: MC.THEME.text, fontFamily: 'Inter, sans-serif', fontSize: 10
        },
        grid: { vertLines: { visible: false }, horzLines: { color: MC.THEME.grid } },
        rightPriceScale: { borderColor: MC.THEME.border },
        timeScale: { visible: false, borderColor: MC.THEME.border },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        handleScroll: false,
        handleScale: false
      });

      State.rsiSeries = State.rsiChart.addLineSeries({
        color: MC.THEME.rsi, lineWidth: 1.6, priceLineVisible: false
      });
      // 70 / 30 guide rails
      State.rsiSeries.createPriceLine({ price: 70, color: 'rgba(255,77,94,.55)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      State.rsiSeries.createPriceLine({ price: 30, color: 'rgba(38,201,106,.55)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      State.rsiChart.priceScale('right').applyOptions({ autoScale: false, scaleMargins: { top: 0.1, bottom: 0.1 } });

      // keep both time axes in step (the flag stops the two feeding each other)
      var syncing = false;
      if (State.chart.chart) {
        State.chart.chart.timeScale().subscribeVisibleLogicalRangeChange(function (range) {
          if (syncing || !range || !State.rsiChart) return;
          syncing = true;
          State.rsiChart.timeScale().setVisibleLogicalRange(range);
          syncing = false;
        });
      }
    }

    State.rsiSeries.setData(State.bars
      .map(function (b, i) { return values[i] == null ? null : { time: b.time, value: values[i] }; })
      .filter(Boolean));

    if (State.chart.chart) {
      var visible = State.chart.chart.timeScale().getVisibleLogicalRange();
      if (visible) State.rsiChart.timeScale().setVisibleLogicalRange(visible);
    }
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
    $('rsiWrap').classList.toggle('hidden', live);

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

    if (State.ind.sma || State.ind.ema || State.ind.bb) applyIndicators();
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
    var SWITCHES = { swSma: 'sma', swEma: 'ema', swBb: 'bb', swRsi: 'rsi', swVol: 'vol' };
    Object.keys(SWITCHES).forEach(function (id) {
      $(id).addEventListener('click', function () {
        var key = SWITCHES[id];
        State.ind[key] = !State.ind[key];
        $(id).classList.toggle('on', State.ind[key]);
        applyIndicators();
        setTimeout(function () { State.chart.fit(); }, 280);
      });
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
    $('placeBtn').addEventListener('click', MC.trade.place);
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
    $('helpBtn').addEventListener('click', function () { MC.ui.openModal('mdHelp'); });

    /* ---- dock ---- */
    MC.on($('dockTabs'), 'click', '.dock-tab', function (e, tab) { openDockTab(tab.dataset.dock); });
    $('dockToggle').addEventListener('click', function () {
      $('dock').classList.toggle('collapsed');
      setTimeout(function () { State.chart.fit(); }, 300);
    });

    /* ---- vlogs ---- */
    MC.on($('vlogBody'), 'click', '.vid', function (e, card) {
      var video = MC.vlogs.find(card.dataset.vid);
      var shareBtn = e.target.closest('[data-plat]');
      if (shareBtn) {
        e.stopPropagation();
        if (shareBtn.dataset.plat === 'more') MC.vlogs.openShareSheet(video);
        else MC.vlogs.shareTo(shareBtn.dataset.plat, video);
        return;
      }
      MC.ui.toast('Now playing', video.t + ' · ' + video.dur, 'gold');
    });
    $$('[data-share]').forEach(function (b) {
      b.addEventListener('click', function () {
        var target = MC.vlogs.getShareTarget();
        if (target) MC.vlogs.shareTo(b.dataset.share, target);
      });
    });
    $('copyLink').addEventListener('click', MC.vlogs.copyLink);

    /* ---- logo upload ---- */
    $('logoBtn').addEventListener('click', function () { $('logoInput').click(); });
    $('logoInput').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!file.type.indexOf || file.type.indexOf('image/') !== 0) {
        MC.ui.toast('Not an image', 'Pick a PNG, JPG, SVG or WebP file.', 'err');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        setLogo(reader.result);
        MC.store.set('mc_logo', reader.result);   // silently skipped if too big
        MC.ui.toast('Logo updated', 'Your mark is now on the terminal.', 'gold');
      };
      reader.onerror = function () {
        MC.ui.toast('Could not read that file', 'Try a different image.', 'err');
      };
      reader.readAsDataURL(file);
    });

    /* ---- mobile drawers ---- */
    $('mobLeft').addEventListener('click', function () { MC.ui.toggleDrawer('left'); });
    $('mobRight').addEventListener('click', function () { MC.ui.toggleDrawer('right'); });
    $('scrim').addEventListener('click', MC.ui.closeDrawers);

    /* ---- keyboard shortcuts ---- */
    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);

      if (e.key === 'Escape') {
        MC.ui.closeModals();
        MC.ui.closeDrawers();
        endDraw();
        if (document.activeElement.blur) document.activeElement.blur();
        return;
      }
      if (typing) return;

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

    // 2. restore anything the user personalised last visit
    var savedLogo = MC.store.get('mc_logo');
    if (savedLogo) setLogo(savedLogo);
    var savedSymbol = MC.store.get('mc_symbol');
    if (savedSymbol && MC.MAP[savedSymbol]) State.symbol = savedSymbol;

    // 3. populate the static bits of the UI
    $('bSym').innerHTML = MC.ASSETS.map(function (a) {
      return '<option value="' + a.s + '">' + a.s + ' — ' + MC.esc(a.n) + '</option>';
    }).join('');
    $('bFrom').value = MC.todayISO(-365);
    $('bTo').value = MC.todayISO(0);
    $('stratNote').textContent = MC.STRAT_NOTE.sma;

    MC.ui.initTooltips();
    MC.ui.initModals();
    MC.watchlist.render();
    MC.vlogs.render();

    // 4. live TradingView panels — the tape falls back to the simulated
    //    marquee if TradingView cannot be reached
    MC.TV.tickerTape(function () { MC.watchlist.buildFallbackTape(); });

    // 5. wire everything, then load the opening market
    wire();
    selectSymbol(State.symbol);
    setSource('live');
    MC.trade.setSide('buy');
    MC.trade.renderPositions();
    startLive();

    if (!MC.HAS_LWC) {
      MC.ui.toast('Offline chart mode',
        'The chart library did not load, so the built-in renderer is running. Everything else works normally.', 'info');
    }

    setTimeout(function () {
      MC.ui.toast('Welcome to the City of Grind 👑',
        'Click any market on the left to load it. Press ? any time for a quick tour.', 'gold');
    }, 900);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
