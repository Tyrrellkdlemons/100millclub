/* ==========================================================================
   registry.js — the indicator library

   One entry per indicator. Each says what it is in plain English, what its
   settings are, and how to draw it. `calc` returns:

     { plots: [ {key, label, data, color, type, lineWidth, dashed} ],
       levels: [ {value, color} ]   ← guide rails, sub-pane only
       range:  [min, max]           ← fixed scale, sub-pane only
     }

   `pane` is 'main' to draw over the candles, or 'sub' for its own panel.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var I = MC.ind;

  var C = {
    blue: '#4f8cff', gold: '#f5c518', green: '#3ddc4b', red: '#ff4d5e',
    purple: '#9d7bff', cyan: '#2bd9d9', orange: '#ff9f43', pink: '#ff6fb5',
    grey: '#8a97a8', white: '#e9eef5'
  };

  /** Shorthand for a plot spec. */
  function line(key, label, data, color, width, dashed) {
    return { key: key, label: label, data: data, color: color, type: 'line',
             lineWidth: width || 1.6, dashed: !!dashed };
  }

  var LIB = [
    /* ================= MOVING AVERAGES ================= */
    { id: 'sma', name: 'Simple moving average (SMA)', group: 'Moving averages', pane: 'main',
      desc: 'The plain average of the last N closes. The most common way to see the underlying direction once the noise is stripped out.',
      params: [{ k: 'period', label: 'Bars', def: 20 }],
      calc: function (b, p) { return { plots: [line('sma', 'SMA ' + p.period, I.sma(I.src.close(b), p.period), C.blue)] }; } },

    { id: 'ema', name: 'Exponential moving average (EMA)', group: 'Moving averages', pane: 'main',
      desc: 'Like the SMA but recent bars count for more, so it turns sooner. Popular for spotting a change of direction early.',
      params: [{ k: 'period', label: 'Bars', def: 50 }],
      calc: function (b, p) { return { plots: [line('ema', 'EMA ' + p.period, I.ema(I.src.close(b), p.period), C.gold)] }; } },

    { id: 'wma', name: 'Weighted moving average (WMA)', group: 'Moving averages', pane: 'main',
      desc: 'Weights each bar in a straight line, newest heaviest. Sits between the SMA and the EMA in responsiveness.',
      params: [{ k: 'period', label: 'Bars', def: 20 }],
      calc: function (b, p) { return { plots: [line('wma', 'WMA ' + p.period, I.wma(I.src.close(b), p.period), C.cyan)] }; } },

    { id: 'hma', name: 'Hull moving average (HMA)', group: 'Moving averages', pane: 'main',
      desc: 'Fast and unusually smooth at the same time. Good when ordinary averages feel too laggy but too jumpy to trust.',
      params: [{ k: 'period', label: 'Bars', def: 21 }],
      calc: function (b, p) { return { plots: [line('hma', 'HMA ' + p.period, I.hma(I.src.close(b), p.period), C.purple)] }; } },

    { id: 'dema', name: 'Double EMA (DEMA)', group: 'Moving averages', pane: 'main',
      desc: 'An EMA with much of the lag mathematically removed.',
      params: [{ k: 'period', label: 'Bars', def: 21 }],
      calc: function (b, p) { return { plots: [line('dema', 'DEMA ' + p.period, I.dema(I.src.close(b), p.period), C.orange)] }; } },

    { id: 'tema', name: 'Triple EMA (TEMA)', group: 'Moving averages', pane: 'main',
      desc: 'Takes the lag reduction a step further than DEMA. Very quick to react, and quick to whipsaw in a quiet market.',
      params: [{ k: 'period', label: 'Bars', def: 21 }],
      calc: function (b, p) { return { plots: [line('tema', 'TEMA ' + p.period, I.tema(I.src.close(b), p.period), C.pink)] }; } },

    { id: 'vwma', name: 'Volume-weighted MA (VWMA)', group: 'Moving averages', pane: 'main',
      desc: 'An average that leans on the bars where the most actually traded.',
      params: [{ k: 'period', label: 'Bars', def: 20 }],
      calc: function (b, p) { return { plots: [line('vwma', 'VWMA ' + p.period, I.vwma(b, p.period), C.green)] }; } },

    { id: 'vwap', name: 'VWAP', group: 'Moving averages', pane: 'main',
      desc: 'The average price everyone actually paid, weighted by volume. Institutions use it as a fair-value benchmark.',
      params: [],
      calc: function (b) { return { plots: [line('vwap', 'VWAP', I.vwap(b), C.orange, 2)] }; } },

    /* ================= BANDS & CHANNELS ================= */
    { id: 'bbands', name: 'Bollinger Bands', group: 'Bands and channels', pane: 'main',
      desc: 'An average with a band above and below set by how volatile things are. Price near a band means it is stretched unusually far.',
      params: [{ k: 'period', label: 'Bars', def: 20 }, { k: 'mult', label: 'Width', def: 2, step: 0.1 }],
      calc: function (b, p) {
        var r = I.bbands(I.src.close(b), p.period, p.mult);
        return { plots: [
          line('bbU', 'Upper', r.upper, C.purple),
          line('bbM', 'Middle', r.mid, C.grey, 1, true),
          line('bbL', 'Lower', r.lower, C.purple)
        ] };
      } },

    { id: 'keltner', name: 'Keltner Channels', group: 'Bands and channels', pane: 'main',
      desc: 'Like Bollinger Bands but the width comes from average range instead of standard deviation, so it is steadier.',
      params: [{ k: 'period', label: 'Bars', def: 20 }, { k: 'mult', label: 'Width', def: 2, step: 0.1 }],
      calc: function (b, p) {
        var r = I.keltner(b, p.period, p.mult);
        return { plots: [
          line('kU', 'Upper', r.upper, C.cyan),
          line('kM', 'Middle', r.mid, C.grey, 1, true),
          line('kL', 'Lower', r.lower, C.cyan)
        ] };
      } },

    { id: 'donchian', name: 'Donchian Channels', group: 'Bands and channels', pane: 'main',
      desc: 'The highest high and lowest low of the last N bars. A break beyond the channel is the classic breakout signal.',
      params: [{ k: 'period', label: 'Bars', def: 20 }],
      calc: function (b, p) {
        var r = I.donchian(b, p.period);
        return { plots: [
          line('dU', 'Highest', r.upper, C.green),
          line('dM', 'Middle', r.mid, C.grey, 1, true),
          line('dL', 'Lowest', r.lower, C.red)
        ] };
      } },

    { id: 'envelope', name: 'Moving average envelope', group: 'Bands and channels', pane: 'main',
      desc: 'A fixed percentage band around an average. Simple way to mark "unusually far from normal".',
      params: [{ k: 'period', label: 'Bars', def: 20 }, { k: 'pct', label: 'Percent', def: 2.5, step: 0.1 }],
      calc: function (b, p) {
        var r = I.envelope(I.src.close(b), p.period, p.pct);
        return { plots: [
          line('eU', 'Upper', r.upper, C.orange),
          line('eM', 'Middle', r.mid, C.grey, 1, true),
          line('eL', 'Lower', r.lower, C.orange)
        ] };
      } },

    /* ================= TREND ================= */
    { id: 'supertrend', name: 'Supertrend', group: 'Trend', pane: 'main',
      desc: 'A trailing line that sits under price in an uptrend and above it in a downtrend. Flips side when the trend turns.',
      params: [{ k: 'period', label: 'Bars', def: 10 }, { k: 'mult', label: 'Factor', def: 3, step: 0.1 }],
      calc: function (b, p) {
        var r = I.supertrend(b, p.period, p.mult);
        return { plots: [line('st', 'Supertrend', r.line, C.green, 2)] };
      } },

    { id: 'psar', name: 'Parabolic SAR', group: 'Trend', pane: 'main',
      desc: 'A trailing stop that creeps closer as a move matures. When price crosses it, the trend is considered over.',
      params: [{ k: 'step', label: 'Step', def: 0.02, step: 0.01 }, { k: 'max', label: 'Max', def: 0.2, step: 0.01 }],
      calc: function (b, p) { return { plots: [line('psar', 'SAR', I.psar(b, p.step, p.max), C.gold, 1)] }; } },

    { id: 'ichimoku', name: 'Ichimoku Cloud', group: 'Trend', pane: 'main',
      desc: 'A whole system in one overlay: two fast lines plus a shaded "cloud" that acts as support and resistance.',
      params: [{ k: 'conv', label: 'Conversion', def: 9 }, { k: 'base', label: 'Base', def: 26 }, { k: 'spanB', label: 'Span B', def: 52 }],
      calc: function (b, p) {
        var r = I.ichimoku(b, p.conv, p.base, p.spanB);
        return { plots: [
          line('tenkan', 'Conversion', r.tenkan, C.blue),
          line('kijun', 'Base', r.kijun, C.red),
          line('spanA', 'Span A', r.senkouA, C.green, 1),
          line('spanB', 'Span B', r.senkouB, C.orange, 1)
        ] };
      } },

    { id: 'pivots', name: 'Pivot points', group: 'Trend', pane: 'main',
      desc: 'Support and resistance levels worked out from the previous bar. Floor traders have used these for decades.',
      params: [],
      calc: function (b) {
        var r = I.pivots(b);
        return { plots: [
          line('r2', 'R2', r.r2, C.red, 1, true),
          line('r1', 'R1', r.r1, C.red, 1),
          line('pp', 'Pivot', r.p, C.gold, 1.6),
          line('s1', 'S1', r.s1, C.green, 1),
          line('s2', 'S2', r.s2, C.green, 1, true)
        ] };
      } },

    { id: 'adx', name: 'ADX / Directional movement', group: 'Trend', pane: 'sub',
      desc: 'Measures how STRONG a trend is, not which way. Above 25 usually means a real trend; below 20 means it is drifting.',
      params: [{ k: 'period', label: 'Bars', def: 14 }],
      calc: function (b, p) {
        var r = I.adx(b, p.period);
        return {
          plots: [
            line('adx', 'ADX', r.adx, C.white, 2),
            line('pdi', '+DI', r.plusDI, C.green),
            line('mdi', '-DI', r.minusDI, C.red)
          ],
          levels: [{ value: 25, color: 'rgba(138,151,168,.5)' }]
        };
      } },

    { id: 'aroon', name: 'Aroon', group: 'Trend', pane: 'sub',
      desc: 'How recently the highest high and lowest low happened. When the up line stays near 100, the uptrend is fresh.',
      params: [{ k: 'period', label: 'Bars', def: 14 }],
      calc: function (b, p) {
        var r = I.aroon(b, p.period);
        return {
          plots: [line('up', 'Aroon up', r.up, C.green), line('dn', 'Aroon down', r.down, C.red)],
          levels: [{ value: 50, color: 'rgba(138,151,168,.4)' }], range: [0, 100]
        };
      } },

    /* ================= MOMENTUM ================= */
    { id: 'rsi', name: 'RSI', group: 'Momentum', pane: 'sub',
      desc: 'A 0–100 meter of how hard price has been pushed lately. Over 70 is hot, under 30 is cold.',
      params: [{ k: 'period', label: 'Bars', def: 14 }],
      calc: function (b, p) {
        return {
          plots: [line('rsi', 'RSI ' + p.period, I.rsi(I.src.close(b), p.period), C.green, 1.8)],
          levels: [{ value: 70, color: 'rgba(255,77,94,.55)' }, { value: 30, color: 'rgba(38,201,106,.55)' }],
          range: [0, 100]
        };
      } },

    { id: 'macd', name: 'MACD', group: 'Momentum', pane: 'sub',
      desc: 'The gap between a fast and a slow average, plus a signal line. Crossings mark momentum flipping over.',
      params: [{ k: 'fast', label: 'Fast', def: 12 }, { k: 'slow', label: 'Slow', def: 26 }, { k: 'signal', label: 'Signal', def: 9 }],
      calc: function (b, p) {
        var r = I.macd(I.src.close(b), p.fast, p.slow, p.signal);
        return {
          plots: [
            { key: 'hist', label: 'Histogram', data: r.histogram, color: C.grey, type: 'histogram' },
            line('macd', 'MACD', r.line, C.blue, 1.8),
            line('signal', 'Signal', r.signal, C.orange)
          ],
          levels: [{ value: 0, color: 'rgba(138,151,168,.4)' }]
        };
      } },

    { id: 'stoch', name: 'Stochastic', group: 'Momentum', pane: 'sub',
      desc: 'Where the close sits inside the recent high-low range. Above 80 is stretched up, below 20 stretched down.',
      params: [{ k: 'k', label: '%K', def: 14 }, { k: 'd', label: '%D', def: 3 }, { k: 'smooth', label: 'Smooth', def: 3 }],
      calc: function (b, p) {
        var r = I.stoch(b, p.k, p.d, p.smooth);
        return {
          plots: [line('k', '%K', r.k, C.blue, 1.8), line('d', '%D', r.d, C.orange)],
          levels: [{ value: 80, color: 'rgba(255,77,94,.5)' }, { value: 20, color: 'rgba(38,201,106,.5)' }],
          range: [0, 100]
        };
      } },

    { id: 'stochrsi', name: 'Stochastic RSI', group: 'Momentum', pane: 'sub',
      desc: 'The stochastic formula applied to RSI. Reacts faster than either on its own — sharp, but noisier.',
      params: [{ k: 'rsiP', label: 'RSI bars', def: 14 }, { k: 'stochP', label: 'Stoch bars', def: 14 },
               { k: 'k', label: '%K', def: 3 }, { k: 'd', label: '%D', def: 3 }],
      calc: function (b, p) {
        var r = I.stochRsi(I.src.close(b), p.rsiP, p.stochP, p.k, p.d);
        return {
          plots: [line('k', '%K', r.k, C.purple, 1.8), line('d', '%D', r.d, C.orange)],
          levels: [{ value: 80, color: 'rgba(255,77,94,.5)' }, { value: 20, color: 'rgba(38,201,106,.5)' }],
          range: [0, 100]
        };
      } },

    { id: 'cci', name: 'CCI', group: 'Momentum', pane: 'sub',
      desc: 'How far price is from its own average, in typical units. Beyond ±100 counts as unusual.',
      params: [{ k: 'period', label: 'Bars', def: 20 }],
      calc: function (b, p) {
        return {
          plots: [line('cci', 'CCI ' + p.period, I.cci(b, p.period), C.cyan, 1.8)],
          levels: [{ value: 100, color: 'rgba(255,77,94,.5)' }, { value: -100, color: 'rgba(38,201,106,.5)' }]
        };
      } },

    { id: 'williams', name: 'Williams %R', group: 'Momentum', pane: 'sub',
      desc: 'A flipped stochastic running from 0 to -100. Above -20 is stretched up, below -80 stretched down.',
      params: [{ k: 'period', label: 'Bars', def: 14 }],
      calc: function (b, p) {
        return {
          plots: [line('wr', '%R ' + p.period, I.williamsR(b, p.period), C.pink, 1.8)],
          levels: [{ value: -20, color: 'rgba(255,77,94,.5)' }, { value: -80, color: 'rgba(38,201,106,.5)' }],
          range: [-100, 0]
        };
      } },

    { id: 'momentum', name: 'Momentum', group: 'Momentum', pane: 'sub',
      desc: 'Simply today\'s price minus the price N bars ago. Above zero means it is higher than it was.',
      params: [{ k: 'period', label: 'Bars', def: 10 }],
      calc: function (b, p) {
        return {
          plots: [line('mom', 'Momentum', I.momentum(I.src.close(b), p.period), C.blue, 1.8)],
          levels: [{ value: 0, color: 'rgba(138,151,168,.4)' }]
        };
      } },

    { id: 'roc', name: 'Rate of change', group: 'Momentum', pane: 'sub',
      desc: 'The same idea as momentum but expressed as a percentage, so it is comparable across markets.',
      params: [{ k: 'period', label: 'Bars', def: 12 }],
      calc: function (b, p) {
        return {
          plots: [line('roc', 'ROC %', I.roc(I.src.close(b), p.period), C.gold, 1.8)],
          levels: [{ value: 0, color: 'rgba(138,151,168,.4)' }]
        };
      } },

    { id: 'trix', name: 'TRIX', group: 'Momentum', pane: 'sub',
      desc: 'Momentum of a heavily smoothed average, so most of the noise is filtered out before it is measured.',
      params: [{ k: 'period', label: 'Bars', def: 15 }],
      calc: function (b, p) {
        return {
          plots: [line('trix', 'TRIX', I.trix(I.src.close(b), p.period), C.purple, 1.8)],
          levels: [{ value: 0, color: 'rgba(138,151,168,.4)' }]
        };
      } },

    { id: 'ultimate', name: 'Ultimate Oscillator', group: 'Momentum', pane: 'sub',
      desc: 'Blends three different lookbacks into one line, which cuts down the false signals shorter oscillators give.',
      params: [{ k: 'short', label: 'Short', def: 7 }, { k: 'mid', label: 'Middle', def: 14 }, { k: 'long', label: 'Long', def: 28 }],
      calc: function (b, p) {
        return {
          plots: [line('uo', 'UO', I.ultimate(b, p.short, p.mid, p.long), C.cyan, 1.8)],
          levels: [{ value: 70, color: 'rgba(255,77,94,.5)' }, { value: 30, color: 'rgba(38,201,106,.5)' }],
          range: [0, 100]
        };
      } },

    { id: 'awesome', name: 'Awesome Oscillator', group: 'Momentum', pane: 'sub',
      desc: 'The gap between a 5 and 34 bar midpoint average, drawn as bars. Above zero, the short term is winning.',
      params: [],
      calc: function (b) {
        return {
          plots: [{ key: 'ao', label: 'AO', data: I.awesome(b), color: C.blue, type: 'histogram' }],
          levels: [{ value: 0, color: 'rgba(138,151,168,.4)' }]
        };
      } },

    /* ================= VOLUME ================= */
    { id: 'obv', name: 'On-balance volume', group: 'Volume', pane: 'sub',
      desc: 'Adds volume on up bars and subtracts it on down bars. Rising OBV means buyers are doing the heavy lifting.',
      params: [],
      calc: function (b) { return { plots: [line('obv', 'OBV', I.obv(b), C.green, 1.8)] }; } },

    { id: 'mfi', name: 'Money Flow Index', group: 'Volume', pane: 'sub',
      desc: 'RSI with volume folded in — momentum that only counts if real money moved. Over 80 hot, under 20 cold.',
      params: [{ k: 'period', label: 'Bars', def: 14 }],
      calc: function (b, p) {
        return {
          plots: [line('mfi', 'MFI ' + p.period, I.mfi(b, p.period), C.orange, 1.8)],
          levels: [{ value: 80, color: 'rgba(255,77,94,.5)' }, { value: 20, color: 'rgba(38,201,106,.5)' }],
          range: [0, 100]
        };
      } },

    { id: 'cmf', name: 'Chaikin Money Flow', group: 'Volume', pane: 'sub',
      desc: 'Whether closes are landing near the top or bottom of each bar, weighted by volume. Above zero favours buyers.',
      params: [{ k: 'period', label: 'Bars', def: 20 }],
      calc: function (b, p) {
        return {
          plots: [{ key: 'cmf', label: 'CMF', data: I.cmf(b, p.period), color: C.cyan, type: 'histogram' }],
          levels: [{ value: 0, color: 'rgba(138,151,168,.4)' }]
        };
      } },

    { id: 'force', name: 'Force Index', group: 'Volume', pane: 'sub',
      desc: 'Combines how far price moved with how much traded, to gauge the power behind a move.',
      params: [{ k: 'period', label: 'Bars', def: 13 }],
      calc: function (b, p) {
        return {
          plots: [line('fi', 'Force', I.forceIndex(b, p.period), C.pink, 1.8)],
          levels: [{ value: 0, color: 'rgba(138,151,168,.4)' }]
        };
      } },

    /* ================= VOLATILITY ================= */
    { id: 'atr', name: 'Average true range (ATR)', group: 'Volatility', pane: 'sub',
      desc: 'How far this market typically travels in one bar. The standard way to size a stop loss sensibly.',
      params: [{ k: 'period', label: 'Bars', def: 14 }],
      calc: function (b, p) { return { plots: [line('atr', 'ATR ' + p.period, I.atr(b, p.period), C.orange, 1.8)] }; } },

    { id: 'stdev', name: 'Standard deviation', group: 'Volatility', pane: 'sub',
      desc: 'Raw scatter of price around its own average. Rising means conditions are getting wilder.',
      params: [{ k: 'period', label: 'Bars', def: 20 }],
      calc: function (b, p) { return { plots: [line('sd', 'StdDev', I.stdev(I.src.close(b), p.period), C.purple, 1.8)] }; } }
  ];

  /* ----------------------------------------------------------------------
     PUBLIC
     ---------------------------------------------------------------------- */
  MC.registry = {
    /** Built-in indicators, in library order. */
    list: LIB,

    /** Built-ins plus anything the user has built, keyed by id. */
    all: function () {
      return LIB.concat(MC.builder ? MC.builder.customIndicators() : []);
    },

    get: function (id) {
      var all = MC.registry.all();
      for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
      return null;
    },

    /** Default parameter object for an indicator. */
    defaults: function (def) {
      var p = {};
      (def.params || []).forEach(function (x) { p[x.k] = x.def; });
      return p;
    },

    /** Group names in display order, including the custom group if present. */
    groups: function () {
      var seen = [];
      MC.registry.all().forEach(function (d) {
        if (seen.indexOf(d.group) === -1) seen.push(d.group);
      });
      return seen;
    },

    colors: C
  };

})(window);
