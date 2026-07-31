/* ==========================================================================
   indicators.js — SMA, EMA, RSI, MACD, Bollinger Bands
   Every function returns an array the same length as the input, padded with
   nulls for the warm-up period so it lines up bar-for-bar with the chart.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var I = MC.ind = {};

  /** Simple moving average over `period` bars. */
  I.sma = function (values, period) {
    var out = new Array(values.length).fill(null);
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  };

  /** Exponential moving average — seeded with an SMA of the first period. */
  I.ema = function (values, period) {
    var out = new Array(values.length).fill(null);
    var k = 2 / (period + 1);
    var prev = null;
    for (var i = 0; i < values.length; i++) {
      if (i === period - 1) {
        var seed = 0;
        for (var j = 0; j < period; j++) seed += values[j];
        prev = seed / period;
        out[i] = prev;
      } else if (i >= period) {
        prev = values[i] * k + prev * (1 - k);
        out[i] = prev;
      }
    }
    return out;
  };

  /** Wilder-smoothed Relative Strength Index, 0–100. */
  I.rsi = function (values, period) {
    var out = new Array(values.length).fill(null);
    var avgGain = 0, avgLoss = 0;
    for (var i = 1; i < values.length; i++) {
      var change = values[i] - values[i - 1];
      var gain = Math.max(change, 0);
      var loss = Math.max(-change, 0);
      if (i <= period) {
        avgGain += gain / period;
        avgLoss += loss / period;
        if (i === period) out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      } else {
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
    }
    return out;
  };

  /** MACD — returns { line, signal, histogram }. */
  I.macd = function (values, fast, slow, signalPeriod) {
    var emaFast = I.ema(values, fast);
    var emaSlow = I.ema(values, slow);

    var line = values.map(function (_, i) {
      return (emaFast[i] != null && emaSlow[i] != null) ? emaFast[i] - emaSlow[i] : null;
    });

    // The signal line is an EMA of the MACD line, so it has to skip the nulls
    // first and then be mapped back onto the original indexes.
    var compact = line.filter(function (v) { return v != null; });
    var compactSignal = I.ema(compact, signalPeriod);
    var signal = new Array(line.length).fill(null);
    var k = 0;
    for (var i = 0; i < line.length; i++) {
      if (line[i] != null) signal[i] = compactSignal[k++];
    }

    var histogram = line.map(function (v, i) {
      return (v != null && signal[i] != null) ? v - signal[i] : null;
    });

    return { line: line, signal: signal, histogram: histogram };
  };

  /** Bollinger Bands — returns { mid, upper, lower }. */
  I.bbands = function (values, period, multiplier) {
    var mid = I.sma(values, period);
    var upper = new Array(values.length).fill(null);
    var lower = new Array(values.length).fill(null);

    for (var i = 0; i < values.length; i++) {
      if (mid[i] == null) continue;
      var variance = 0;
      for (var j = i - period + 1; j <= i; j++) variance += Math.pow(values[j] - mid[i], 2);
      var sd = Math.sqrt(variance / period);
      upper[i] = mid[i] + multiplier * sd;
      lower[i] = mid[i] - multiplier * sd;
    }
    return { mid: mid, upper: upper, lower: lower };
  };

})(window);
