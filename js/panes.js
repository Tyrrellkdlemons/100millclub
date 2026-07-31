/* ==========================================================================
   panes.js — stacked oscillator panels under the main chart

   Indicators marked pane:'sub' (RSI, MACD, ADX, …) each get their own strip
   below the candles. Every strip is its own Lightweight Chart with its time
   axis slaved to the main one, so they scroll and zoom together.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var Panes = MC.panes = {};

  var host = null;          // the container all strips live in
  var mainChart = null;     // the Lightweight Chart the strips follow
  var strips = {};          // uid → { el, chart, series, spec }
  var syncing = false;      // guards the two-way time-axis sync

  var PANE_H = 118;

  /* ----------------------------------------------------------------------
     SETUP
     ---------------------------------------------------------------------- */
  Panes.init = function (hostEl, chartApi) {
    host = hostEl;
    mainChart = chartApi;

    // Whenever the main chart is panned or zoomed, push the range down.
    if (mainChart && mainChart.chart) {
      mainChart.chart.timeScale().subscribeVisibleLogicalRangeChange(function (range) {
        if (syncing || !range) return;
        syncing = true;
        Object.keys(strips).forEach(function (uid) {
          try { strips[uid].chart.timeScale().setVisibleLogicalRange(range); } catch (e) {}
        });
        syncing = false;
      });
    }
  };

  /** Total height the strips currently occupy, so the layout can budget for it. */
  Panes.height = function () {
    return Object.keys(strips).length * PANE_H;
  };

  /* ----------------------------------------------------------------------
     CREATE / UPDATE
     ---------------------------------------------------------------------- */

  /**
   * Draw (or redraw) one indicator strip.
   * @param {string} uid   unique instance id
   * @param {object} def   registry definition (for the name)
   * @param {object} spec  result of def.calc() — plots, levels, range
   * @param {array}  bars  the bar series, for timestamps
   */
  Panes.set = function (uid, def, spec, bars) {
    if (!MC.HAS_LWC) return;

    var strip = strips[uid];
    if (!strip) {
      strip = strips[uid] = { series: {}, spec: spec };

      strip.el = document.createElement('div');
      strip.el.className = 'pane-strip';
      strip.el.innerHTML =
        '<div class="pane-head">' +
          '<span class="pane-name"></span>' +
          '<span class="pane-vals"></span>' +
          '<button class="pane-x" title="Remove"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="pane-plot"></div>';
      host.appendChild(strip.el);

      strip.el.querySelector('.pane-x').addEventListener('click', function () {
        if (MC.onRemoveIndicator) MC.onRemoveIndicator(uid);
      });

      strip.chart = LightweightCharts.createChart(strip.el.querySelector('.pane-plot'), {
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

      // Dragging a strip should move the main chart, not just itself.
      strip.chart.timeScale().subscribeVisibleLogicalRangeChange(function (range) {
        if (syncing || !range || !mainChart || !mainChart.chart) return;
        syncing = true;
        try { mainChart.chart.timeScale().setVisibleLogicalRange(range); } catch (e) {}
        syncing = false;
      });
    }

    strip.el.querySelector('.pane-name').textContent = def.name;

    // Rebuild the series set — the plot list can change when params change.
    Object.keys(strip.series).forEach(function (k) {
      try { strip.chart.removeSeries(strip.series[k]); } catch (e) {}
    });
    strip.series = {};

    spec.plots.forEach(function (plot) {
      var series;
      if (plot.type === 'histogram') {
        series = strip.chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
        series.setData(bars.map(function (b, i) {
          if (plot.data[i] == null) return null;
          return {
            time: b.time,
            value: plot.data[i],
            color: plot.data[i] >= 0 ? 'rgba(38,201,106,.55)' : 'rgba(255,77,94,.55)'
          };
        }).filter(Boolean));
      } else {
        series = strip.chart.addLineSeries({
          color: plot.color,
          lineWidth: plot.lineWidth || 1.6,
          lineStyle: plot.dashed ? 2 : 0,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true
        });
        series.setData(bars.map(function (b, i) {
          return plot.data[i] == null ? null : { time: b.time, value: plot.data[i] };
        }).filter(Boolean));
      }
      strip.series[plot.key] = series;
    });

    // Guide rails (70/30, zero line, ±100 …) hang off the first series.
    var first = strip.series[spec.plots[0].key];
    if (first && spec.levels) {
      spec.levels.forEach(function (lv) {
        first.createPriceLine({
          price: lv.value, color: lv.color, lineWidth: 1,
          lineStyle: 2, axisLabelVisible: true, title: ''
        });
      });
    }
    if (first && spec.range) {
      strip.chart.priceScale('right').applyOptions({
        autoScale: false, scaleMargins: { top: 0.08, bottom: 0.08 }
      });
    }

    // latest readings in the strip header
    strip.el.querySelector('.pane-vals').innerHTML = spec.plots.map(function (plot) {
      var last = null;
      for (var i = plot.data.length - 1; i >= 0; i--) {
        if (plot.data[i] != null) { last = plot.data[i]; break; }
      }
      return '<b style="color:' + plot.color + '">' + plot.label + '</b> ' +
             (last == null ? '–' : formatValue(last));
    }).join('<span class="pane-sep">·</span>');

    // adopt the main chart's current view straight away
    if (mainChart && mainChart.chart) {
      var vr = mainChart.chart.timeScale().getVisibleLogicalRange();
      if (vr) { try { strip.chart.timeScale().setVisibleLogicalRange(vr); } catch (e) {} }
    }
  };

  /** Oscillator values are small; volume-scale ones are not. */
  function formatValue(v) {
    var abs = Math.abs(v);
    if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (abs >= 1e4) return (v / 1e3).toFixed(1) + 'K';
    if (abs >= 100) return v.toFixed(1);
    return v.toFixed(2);
  }

  /* ----------------------------------------------------------------------
     TEARDOWN
     ---------------------------------------------------------------------- */
  Panes.remove = function (uid) {
    var strip = strips[uid];
    if (!strip) return;
    try { strip.chart.remove(); } catch (e) {}
    strip.el.remove();
    delete strips[uid];
  };

  Panes.clear = function () {
    Object.keys(strips).forEach(Panes.remove);
  };

  Panes.has = function (uid) { return !!strips[uid]; };

  Panes.resize = function () {
    Object.keys(strips).forEach(function (uid) {
      try { strips[uid].chart.timeScale().fitContent(); } catch (e) {}
    });
  };

})(window);
