/* ==========================================================================
   chart.js — mock OHLCV generation + the simulated chart engine
   Two interchangeable backends behind one small API:
     1. TradingView Lightweight Charts (preferred, loaded from CDN)
     2. a built-in canvas renderer used when that CDN is unreachable
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};

  MC.THEME = {
    up: '#26c96a', down: '#ff4d5e',
    grid: '#151d26', border: '#1d2530', text: '#8a97a8',
    sma: '#4f8cff', ema: '#f5c518', bb: '#9d7bff', rsi: '#3ddc4b'
  };

  /* ----------------------------------------------------------------------
     MOCK MARKET DATA
     ---------------------------------------------------------------------- */

  /** Typical per-bar volume for an asset class. */
  MC.baseVolume = function (asset) {
    if (asset.m === 'crypto') return 22000;
    if (asset.m === 'forex') return 180000;
    if (asset.m === 'indices') return 420000;
    return 900000;
  };

  /**
   * Build a deterministic OHLCV series that finishes exactly on the asset's
   * quoted price, so the chart and the header never disagree.
   * Seeded by symbol+timeframe: the same market always redraws identically.
   */
  MC.genBars = function (symbol, timeframe, count) {
    var asset = MC.MAP[symbol];
    var step = MC.TF_SEC[timeframe];
    var rnd = MC.mulberry32(MC.hash(symbol + '|' + timeframe));

    var now = Math.floor(Date.now() / 1000);
    var start = (Math.floor(now / step) - (count - 1)) * step;

    // Scale the daily volatility down to this bar size (square-root of time).
    var sigma = asset.v * Math.sqrt(step / 86400);
    var bars = [];
    var price = asset.base * (0.82 + rnd() * 0.3);
    var drift = (rnd() - 0.42) * sigma * 0.12;

    for (var i = 0; i < count; i++) {
      // Shift the regime every 40 bars so the series trends and ranges
      // instead of looking like pure noise.
      if (i % 40 === 0) drift = (rnd() - 0.45) * sigma * 0.18;

      // Sum of four uniforms ≈ normal, which keeps jumps realistic.
      var shock = (rnd() + rnd() + rnd() + rnd() - 2) * sigma;
      var open = price;
      var close = Math.max(open * (1 + drift + shock), 1e-6);
      var wick = Math.abs(shock) * (0.5 + rnd()) + sigma * 0.25;
      var high = Math.max(open, close) * (1 + wick * rnd());
      var low = Math.min(open, close) * (1 - wick * rnd());
      var range = Math.abs(close - open) / Math.max(open, 1e-9);
      var volume = Math.round((0.6 + rnd() * 0.8 + range * 22) * MC.baseVolume(asset));

      bars.push({ time: start + i * step, open: open, high: high, low: low, close: close, volume: volume });
      price = close;
    }

    // Rescale the whole series so the final close equals today's price.
    var k = asset.base / bars[bars.length - 1].close;
    bars.forEach(function (b) { b.open *= k; b.high *= k; b.low *= k; b.close *= k; });
    return bars;
  };

  /* ----------------------------------------------------------------------
     BACKEND 1 — Lightweight Charts
     ---------------------------------------------------------------------- */
  function LwcChart(host, onCrosshair) {
    var T = MC.THEME;
    var chart = LightweightCharts.createChart(host, {
      autoSize: true,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: T.text, fontFamily: 'Inter, sans-serif', fontSize: 11
      },
      grid: { vertLines: { color: T.grid }, horzLines: { color: T.grid } },
      rightPriceScale: { borderColor: T.border, scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: T.border, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 8 },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: '#3a4756', width: 1, style: 2, labelBackgroundColor: '#26313d' },
        horzLine: { color: '#3a4756', width: 1, style: 2, labelBackgroundColor: '#26313d' }
      },
      handleScroll: true,
      handleScale: true
    });

    var candleOptions = {
      upColor: T.up, downColor: T.down,
      borderUpColor: T.up, borderDownColor: T.down,
      wickUpColor: T.up, wickDownColor: T.down
    };

    var main = chart.addCandlestickSeries(candleOptions);
    var volume = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    var overlays = {};      // named indicator line series
    var levels = [];        // horizontal price lines
    var trends = [];        // trend line series
    var style = 'candles';
    var raw = [];

    function priceFormat() {
      var digits = MC.State.asset.d;
      return { type: 'price', precision: digits, minMove: Math.pow(10, -digits) };
    }
    function volColor(bar) {
      return bar.close >= bar.open ? 'rgba(38,201,106,.35)' : 'rgba(255,77,94,.35)';
    }
    function lineData() {
      return raw.map(function (b) { return { time: b.time, value: b.close }; });
    }

    /** Swap the main series when the user changes chart style. */
    function rebuildMain() {
      chart.removeSeries(main);
      if (style === 'candles') {
        main = chart.addCandlestickSeries(Object.assign({}, candleOptions, { priceFormat: priceFormat() }));
        main.setData(raw);
      } else if (style === 'line') {
        main = chart.addLineSeries({ color: T.ema, lineWidth: 2, priceFormat: priceFormat() });
        main.setData(lineData());
      } else {
        main = chart.addAreaSeries({
          lineColor: T.ema, topColor: 'rgba(245,197,24,.32)', bottomColor: 'rgba(245,197,24,0)',
          lineWidth: 2, priceFormat: priceFormat()
        });
        main.setData(lineData());
      }
      // Price lines belong to the series, so they have to be re-attached.
      levels.forEach(function (l) { l.handle = main.createPriceLine(l.opts); });
    }

    chart.subscribeCrosshairMove(function (param) {
      if (!onCrosshair) return;
      if (!param || !param.time) { onCrosshair(raw[raw.length - 1]); return; }
      for (var i = 0; i < raw.length; i++) {
        if (raw[i].time === param.time) { onCrosshair(raw[i]); return; }
      }
    });

    return {
      kind: 'lwc',
      chart: chart,
      get series() { return main; },

      setData: function (bars) {
        raw = bars;
        main.applyOptions({ priceFormat: priceFormat() });
        main.setData(style === 'candles' ? bars : lineData());
        volume.setData(bars.map(function (b) {
          return { time: b.time, value: b.volume, color: volColor(b) };
        }));
        chart.timeScale().fitContent();
      },

      updateLast: function (bar) {
        raw[raw.length - 1] = bar;
        main.update(style === 'candles' ? bar : { time: bar.time, value: bar.close });
        volume.update({ time: bar.time, value: bar.volume, color: volColor(bar) });
      },

      setOverlay: function (key, values, color) {
        if (!overlays[key]) {
          overlays[key] = chart.addLineSeries({
            color: color, lineWidth: 1.6,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false
          });
        } else {
          overlays[key].applyOptions({ color: color });
        }
        overlays[key].setData(raw
          .map(function (b, i) { return values[i] == null ? null : { time: b.time, value: values[i] }; })
          .filter(Boolean));
      },

      removeOverlay: function (key) {
        if (!overlays[key]) return;
        chart.removeSeries(overlays[key]);
        delete overlays[key];
      },

      addLevel: function (price, color) {
        var opts = { price: price, color: color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'level' };
        levels.push({ opts: opts, handle: main.createPriceLine(opts) });
      },

      addTrend: function (points) {
        var series = chart.addLineSeries({
          color: T.ema, lineWidth: 2,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false
        });
        series.setData(points);
        trends.push(series);
      },

      clearDrawings: function () {
        levels.forEach(function (l) { try { main.removePriceLine(l.handle); } catch (e) {} });
        trends.forEach(function (s) { try { chart.removeSeries(s); } catch (e) {} });
        levels = [];
        trends = [];
      },

      setStyle: function (next) { style = next; rebuildMain(); },
      setGrid: function (on) { chart.applyOptions({ grid: { vertLines: { visible: on }, horzLines: { visible: on } } }); },
      setCrosshair: function (on) {
        chart.applyOptions({
          crosshair: { mode: on ? LightweightCharts.CrosshairMode.Normal : LightweightCharts.CrosshairMode.Hidden }
        });
      },
      setLastLine: function (on) { main.applyOptions({ priceLineVisible: on }); },
      setVolume: function (on) { volume.applyOptions({ visible: on }); },
      onClick: function (fn) { chart.subscribeClick(fn); },
      priceAt: function (y) { return main.coordinateToPrice(y); },
      fit: function () { chart.timeScale().fitContent(); }
    };
  }

  /* ----------------------------------------------------------------------
     BACKEND 2 — canvas fallback (used only if the CDN is unreachable)
     Draws candles, volume, indicator overlays, levels and a crosshair so the
     dashboard never shows a dead panel.
     ---------------------------------------------------------------------- */
  function CanvasChart(host, onCrosshair) {
    var T = MC.THEME;
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:crosshair';
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var bars = [], overlays = {}, levels = [];
    var mouse = null, style = 'candles', showVolume = true, showGrid = true;

    function resize() {
      var rect = host.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, rect.width * dpr);
      canvas.height = Math.max(1, rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function draw() {
      var w = host.clientWidth, h = host.clientHeight;
      if (!w || !h || !bars.length) return;

      var padRight = 62, padBottom = 22;
      var volH = showVolume ? h * 0.16 : 0;
      var plotW = w - padRight, plotH = h - padBottom - volH;
      var digits = MC.State.asset.d;

      var visibleCount = Math.min(bars.length, Math.max(30, Math.floor(plotW / 7)));
      var view = bars.slice(-visibleCount);
      var offset = bars.length - view.length;

      var hi = -Infinity, lo = Infinity, maxVol = 0;
      view.forEach(function (b) {
        hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); maxVol = Math.max(maxVol, b.volume);
      });
      Object.keys(overlays).forEach(function (k) {
        overlays[k].values.slice(offset).forEach(function (v) {
          if (v == null) return;
          hi = Math.max(hi, v); lo = Math.min(lo, v);
        });
      });
      var pad = (hi - lo) * 0.08 || 1;
      hi += pad; lo -= pad;

      var X = function (i) { return (i + 0.5) * (plotW / view.length); };
      var Y = function (p) { return plotH - ((p - lo) / (hi - lo)) * plotH; };

      ctx.clearRect(0, 0, w, h);

      if (showGrid) {
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        for (var g = 0; g <= 5; g++) {
          var gy = Math.round(plotH * g / 5) + 0.5;
          ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(plotW, gy); ctx.stroke();
        }
        for (var gx = 0; gx <= 6; gx++) {
          var x = Math.round(plotW * gx / 6) + 0.5;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, plotH + volH); ctx.stroke();
        }
      }

      // price axis
      ctx.fillStyle = T.text; ctx.font = '10px Inter'; ctx.textAlign = 'left';
      for (var a = 0; a <= 5; a++) {
        ctx.fillText(MC.fmtPx(hi - (hi - lo) * a / 5, digits), plotW + 7, plotH * a / 5 + 3);
      }

      // volume
      if (showVolume) {
        view.forEach(function (b, i) {
          var bh = (b.volume / maxVol) * (volH * 0.85);
          ctx.fillStyle = b.close >= b.open ? 'rgba(38,201,106,.34)' : 'rgba(255,77,94,.34)';
          ctx.fillRect(X(i) - plotW / view.length * 0.32, plotH + volH - bh, plotW / view.length * 0.64, bh);
        });
      }

      // price series
      var cw = Math.max(1.5, plotW / view.length * 0.62);
      if (style === 'candles') {
        view.forEach(function (b, i) {
          var color = b.close >= b.open ? T.up : T.down;
          ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(X(i)) + 0.5, Y(b.high));
          ctx.lineTo(Math.round(X(i)) + 0.5, Y(b.low));
          ctx.stroke();
          var y1 = Y(b.open), y2 = Y(b.close);
          ctx.fillRect(X(i) - cw / 2, Math.min(y1, y2), cw, Math.max(1, Math.abs(y2 - y1)));
        });
      } else {
        var trace = function () {
          ctx.beginPath();
          view.forEach(function (b, i) { i ? ctx.lineTo(X(i), Y(b.close)) : ctx.moveTo(X(i), Y(b.close)); });
        };
        if (style === 'area') {
          trace();
          ctx.lineTo(X(view.length - 1), plotH); ctx.lineTo(X(0), plotH); ctx.closePath();
          var grad = ctx.createLinearGradient(0, 0, 0, plotH);
          grad.addColorStop(0, 'rgba(245,197,24,.32)');
          grad.addColorStop(1, 'rgba(245,197,24,0)');
          ctx.fillStyle = grad; ctx.fill();
        }
        trace();
        ctx.strokeStyle = T.ema; ctx.lineWidth = 2; ctx.stroke();
      }

      // indicator overlays
      Object.keys(overlays).forEach(function (k) {
        var o = overlays[k];
        ctx.beginPath(); ctx.strokeStyle = o.color; ctx.lineWidth = 1.6;
        var started = false;
        o.values.slice(offset).forEach(function (v, i) {
          if (v == null) { started = false; return; }
          if (!started) { ctx.moveTo(X(i), Y(v)); started = true; } else { ctx.lineTo(X(i), Y(v)); }
        });
        ctx.stroke();
      });

      // drawn levels
      levels.forEach(function (l) {
        var y = Y(l.price);
        if (y < 0 || y > plotH) return;
        ctx.setLineDash([5, 4]); ctx.strokeStyle = l.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke();
        ctx.setLineDash([]);
        tagPrice(l.price, y, l.color, plotW, padRight, digits);
      });

      // last price marker
      var last = view[view.length - 1];
      var ly = Y(last.close);
      var lc = last.close >= last.open ? T.up : T.down;
      ctx.setLineDash([3, 3]); ctx.strokeStyle = lc;
      ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(plotW, ly); ctx.stroke();
      ctx.setLineDash([]);
      tagPrice(last.close, ly, lc, plotW, padRight, digits);

      // crosshair
      if (mouse && mouse.x < plotW) {
        var idx = MC.clamp(Math.floor(mouse.x / (plotW / view.length)), 0, view.length - 1);
        ctx.setLineDash([3, 4]); ctx.strokeStyle = '#5f6b7a';
        ctx.beginPath(); ctx.moveTo(X(idx), 0); ctx.lineTo(X(idx), plotH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, mouse.y); ctx.lineTo(plotW, mouse.y); ctx.stroke();
        ctx.setLineDash([]);
        if (onCrosshair) onCrosshair(view[idx]);
      }

      // time axis
      ctx.fillStyle = T.text; ctx.font = '10px Inter';
      for (var t = 0; t < 5; t++) {
        var ti = Math.floor(view.length * t / 5);
        var label = new Date(view[ti].time * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        ctx.fillText(label, X(ti) - 14, h - 6);
      }
    }

    function tagPrice(price, y, color, plotW, padRight, digits) {
      ctx.fillStyle = color;
      ctx.fillRect(plotW + 2, y - 8, padRight - 4, 16);
      ctx.fillStyle = '#0b0f13'; ctx.font = '700 9px Inter'; ctx.textAlign = 'center';
      ctx.fillText(MC.fmtPx(price, digits), plotW + 2 + (padRight - 4) / 2, y + 3);
      ctx.textAlign = 'left';
    }

    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      draw();
    });
    canvas.addEventListener('mouseleave', function () {
      mouse = null;
      draw();
      if (onCrosshair) onCrosshair(bars[bars.length - 1]);
    });

    new ResizeObserver(resize).observe(host);
    resize();

    return {
      kind: 'canvas',
      setData: function (next) { bars = next; draw(); },
      updateLast: function (bar) { if (bars.length) { bars[bars.length - 1] = bar; draw(); } },
      setOverlay: function (key, values, color) { overlays[key] = { values: values, color: color }; draw(); },
      removeOverlay: function (key) { delete overlays[key]; draw(); },
      addLevel: function (price, color) { levels.push({ price: price, color: color }); draw(); },
      addTrend: function () { /* not supported on the fallback renderer */ },
      clearDrawings: function () { levels = []; draw(); },
      setStyle: function (next) { style = next; draw(); },
      setGrid: function (on) { showGrid = on; draw(); },
      setCrosshair: function () {},
      setLastLine: function () {},
      setVolume: function (on) { showVolume = on; draw(); },
      onClick: null,
      priceAt: function () { return null; },
      fit: function () { draw(); }
    };
  }

  /** Pick whichever backend is available. */
  MC.createChart = function (host, onCrosshair) {
    MC.HAS_LWC = typeof window.LightweightCharts !== 'undefined';
    return MC.HAS_LWC ? LwcChart(host, onCrosshair) : CanvasChart(host, onCrosshair);
  };

})(window);
