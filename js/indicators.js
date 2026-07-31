/* ==========================================================================
   indicators.js — the maths behind every indicator in the library

   Conventions:
     · every function takes plain arrays and returns arrays of the SAME length
     · the warm-up period is padded with nulls so results line up bar-for-bar
     · nothing here touches the DOM — this file is pure maths
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var I = MC.ind = {};

  /* ======================================================================
     PRICE SOURCES
     ====================================================================== */
  I.src = {
    open:   function (b) { return b.map(function (x) { return x.open; }); },
    high:   function (b) { return b.map(function (x) { return x.high; }); },
    low:    function (b) { return b.map(function (x) { return x.low; }); },
    close:  function (b) { return b.map(function (x) { return x.close; }); },
    volume: function (b) { return b.map(function (x) { return x.volume; }); },
    hl2:    function (b) { return b.map(function (x) { return (x.high + x.low) / 2; }); },
    hlc3:   function (b) { return b.map(function (x) { return (x.high + x.low + x.close) / 3; }); },
    ohlc4:  function (b) { return b.map(function (x) { return (x.open + x.high + x.low + x.close) / 4; }); }
  };

  /** Human labels for the source picker in the builder. */
  I.SOURCE_LABELS = {
    close: 'Close', open: 'Open', high: 'High', low: 'Low',
    hl2: 'Midpoint (H+L)/2', hlc3: 'Typical (H+L+C)/3', ohlc4: 'Average (O+H+L+C)/4',
    volume: 'Volume'
  };

  /* ======================================================================
     MOVING AVERAGES
     ====================================================================== */

  /** Simple moving average. */
  I.sma = function (v, p) {
    var out = new Array(v.length).fill(null), sum = 0;
    for (var i = 0; i < v.length; i++) {
      sum += v[i];
      if (i >= p) sum -= v[i - p];
      if (i >= p - 1) out[i] = sum / p;
    }
    return out;
  };

  /** Exponential moving average, seeded with an SMA. */
  I.ema = function (v, p) {
    var out = new Array(v.length).fill(null), k = 2 / (p + 1), prev = null;
    for (var i = 0; i < v.length; i++) {
      if (i === p - 1) {
        var s = 0;
        for (var j = 0; j < p; j++) s += v[j];
        prev = s / p; out[i] = prev;
      } else if (i >= p) {
        prev = v[i] * k + prev * (1 - k); out[i] = prev;
      }
    }
    return out;
  };

  /** Wilder's smoothing — the averaging RSI, ATR and ADX are defined with. */
  I.rma = function (v, p) {
    var out = new Array(v.length).fill(null), prev = null;
    for (var i = 0; i < v.length; i++) {
      if (v[i] == null) continue;
      if (prev == null) {
        if (i >= p - 1) {
          var s = 0;
          for (var j = i - p + 1; j <= i; j++) s += v[j];
          prev = s / p; out[i] = prev;
        }
      } else {
        prev = (prev * (p - 1) + v[i]) / p; out[i] = prev;
      }
    }
    return out;
  };

  /** Weighted moving average — newer bars count for more, linearly. */
  I.wma = function (v, p) {
    var out = new Array(v.length).fill(null);
    var denom = (p * (p + 1)) / 2;
    for (var i = p - 1; i < v.length; i++) {
      var acc = 0;
      for (var j = 0; j < p; j++) acc += v[i - j] * (p - j);
      out[i] = acc / denom;
    }
    return out;
  };

  /** Hull moving average — fast and unusually smooth. */
  I.hma = function (v, p) {
    var half = I.wma(v, Math.max(1, Math.round(p / 2)));
    var full = I.wma(v, p);
    var raw = v.map(function (_, i) {
      return (half[i] == null || full[i] == null) ? null : 2 * half[i] - full[i];
    });
    var compact = raw.filter(function (x) { return x != null; });
    var smoothed = I.wma(compact, Math.max(1, Math.round(Math.sqrt(p))));
    return realign(raw, smoothed);
  };

  /** Double EMA — less lag than a plain EMA. */
  I.dema = function (v, p) {
    var e1 = I.ema(v, p);
    var e2 = I.ema(e1.filter(nn), p);
    var e2a = realign(e1, e2);
    return v.map(function (_, i) {
      return (e1[i] == null || e2a[i] == null) ? null : 2 * e1[i] - e2a[i];
    });
  };

  /** Triple EMA — less lag again. */
  I.tema = function (v, p) {
    var e1 = I.ema(v, p);
    var e2 = realign(e1, I.ema(e1.filter(nn), p));
    var e3 = realign(e2, I.ema(e2.filter(nn), p));
    return v.map(function (_, i) {
      return (e1[i] == null || e2[i] == null || e3[i] == null)
        ? null : 3 * e1[i] - 3 * e2[i] + e3[i];
    });
  };

  /** Volume-weighted moving average. */
  I.vwma = function (bars, p) {
    var out = new Array(bars.length).fill(null);
    for (var i = p - 1; i < bars.length; i++) {
      var pv = 0, vv = 0;
      for (var j = i - p + 1; j <= i; j++) { pv += bars[j].close * bars[j].volume; vv += bars[j].volume; }
      out[i] = vv ? pv / vv : null;
    }
    return out;
  };

  /** Volume-weighted average price, accumulated from the first bar. */
  I.vwap = function (bars) {
    var out = [], pv = 0, vv = 0;
    var tp = I.src.hlc3(bars);
    for (var i = 0; i < bars.length; i++) {
      pv += tp[i] * bars[i].volume;
      vv += bars[i].volume;
      out.push(vv ? pv / vv : null);
    }
    return out;
  };

  /* ======================================================================
     VOLATILITY / BANDS
     ====================================================================== */

  /** Rolling standard deviation. */
  I.stdev = function (v, p) {
    var mean = I.sma(v, p);
    var out = new Array(v.length).fill(null);
    for (var i = 0; i < v.length; i++) {
      if (mean[i] == null) continue;
      var acc = 0;
      for (var j = i - p + 1; j <= i; j++) acc += Math.pow(v[j] - mean[i], 2);
      out[i] = Math.sqrt(acc / p);
    }
    return out;
  };

  /** Bollinger Bands. */
  I.bbands = function (v, p, mult) {
    var mid = I.sma(v, p), sd = I.stdev(v, p);
    return {
      mid: mid,
      upper: v.map(function (_, i) { return mid[i] == null ? null : mid[i] + mult * sd[i]; }),
      lower: v.map(function (_, i) { return mid[i] == null ? null : mid[i] - mult * sd[i]; })
    };
  };

  /** True range for one bar. */
  function trueRange(bars, i) {
    if (i === 0) return bars[0].high - bars[0].low;
    var pc = bars[i - 1].close;
    return Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - pc),
      Math.abs(bars[i].low - pc)
    );
  }

  /** Average true range — how far this market typically travels per bar. */
  I.atr = function (bars, p) {
    var tr = bars.map(function (_, i) { return trueRange(bars, i); });
    return I.rma(tr, p);
  };

  /** Keltner Channels — an EMA wrapped in ATR bands. */
  I.keltner = function (bars, p, mult) {
    var basis = I.ema(I.src.close(bars), p);
    var atr = I.atr(bars, p);
    return {
      mid: basis,
      upper: basis.map(function (b, i) { return (b == null || atr[i] == null) ? null : b + mult * atr[i]; }),
      lower: basis.map(function (b, i) { return (b == null || atr[i] == null) ? null : b - mult * atr[i]; })
    };
  };

  /** Donchian Channels — the highest high and lowest low of the window. */
  I.donchian = function (bars, p) {
    var upper = new Array(bars.length).fill(null);
    var lower = new Array(bars.length).fill(null);
    var mid = new Array(bars.length).fill(null);
    for (var i = p - 1; i < bars.length; i++) {
      var hi = -Infinity, lo = Infinity;
      for (var j = i - p + 1; j <= i; j++) {
        hi = Math.max(hi, bars[j].high);
        lo = Math.min(lo, bars[j].low);
      }
      upper[i] = hi; lower[i] = lo; mid[i] = (hi + lo) / 2;
    }
    return { upper: upper, lower: lower, mid: mid };
  };

  /** Moving average envelope — a percentage band around an MA. */
  I.envelope = function (v, p, pct) {
    var basis = I.sma(v, p);
    return {
      mid: basis,
      upper: basis.map(function (b) { return b == null ? null : b * (1 + pct / 100); }),
      lower: basis.map(function (b) { return b == null ? null : b * (1 - pct / 100); })
    };
  };

  /** Parabolic SAR — trailing dots that flip with the trend. */
  I.psar = function (bars, step, max) {
    var out = new Array(bars.length).fill(null);
    if (bars.length < 2) return out;

    var bull = bars[1].close >= bars[0].close;
    var sar = bull ? bars[0].low : bars[0].high;
    var ep = bull ? bars[0].high : bars[0].low;
    var af = step;

    for (var i = 1; i < bars.length; i++) {
      sar = sar + af * (ep - sar);

      if (bull) {
        sar = Math.min(sar, bars[i - 1].low, bars[i === 1 ? 0 : i - 2].low);
        if (bars[i].high > ep) { ep = bars[i].high; af = Math.min(af + step, max); }
        if (bars[i].low < sar) { bull = false; sar = ep; ep = bars[i].low; af = step; }
      } else {
        sar = Math.max(sar, bars[i - 1].high, bars[i === 1 ? 0 : i - 2].high);
        if (bars[i].low < ep) { ep = bars[i].low; af = Math.min(af + step, max); }
        if (bars[i].high > sar) { bull = true; sar = ep; ep = bars[i].high; af = step; }
      }
      out[i] = sar;
    }
    return out;
  };

  /** Supertrend — an ATR trailing stop that flips side with the trend. */
  I.supertrend = function (bars, p, mult) {
    var atr = I.atr(bars, p);
    var hl2 = I.src.hl2(bars);
    var line = new Array(bars.length).fill(null);
    var dir = new Array(bars.length).fill(null);
    var upper = null, lower = null, trendUp = true;

    for (var i = 0; i < bars.length; i++) {
      if (atr[i] == null) continue;
      var bu = hl2[i] + mult * atr[i];
      var bl = hl2[i] - mult * atr[i];

      upper = (upper == null || bu < upper || bars[i - 1].close > upper) ? bu : upper;
      lower = (lower == null || bl > lower || bars[i - 1].close < lower) ? bl : lower;

      if (bars[i].close > upper) trendUp = true;
      else if (bars[i].close < lower) trendUp = false;

      line[i] = trendUp ? lower : upper;
      dir[i] = trendUp ? 1 : -1;
    }
    return { line: line, dir: dir };
  };

  /** Ichimoku Cloud. */
  I.ichimoku = function (bars, conv, base, spanB) {
    function midRange(period) {
      var out = new Array(bars.length).fill(null);
      for (var i = period - 1; i < bars.length; i++) {
        var hi = -Infinity, lo = Infinity;
        for (var j = i - period + 1; j <= i; j++) {
          hi = Math.max(hi, bars[j].high);
          lo = Math.min(lo, bars[j].low);
        }
        out[i] = (hi + lo) / 2;
      }
      return out;
    }
    var tenkan = midRange(conv);
    var kijun = midRange(base);
    return {
      tenkan: tenkan,
      kijun: kijun,
      senkouA: tenkan.map(function (t, i) { return (t == null || kijun[i] == null) ? null : (t + kijun[i]) / 2; }),
      senkouB: midRange(spanB)
    };
  };

  /* ======================================================================
     OSCILLATORS
     ====================================================================== */

  /** Relative Strength Index, 0–100. */
  I.rsi = function (v, p) {
    var out = new Array(v.length).fill(null);
    var ag = 0, al = 0;
    for (var i = 1; i < v.length; i++) {
      var ch = v[i] - v[i - 1];
      var g = Math.max(ch, 0), l = Math.max(-ch, 0);
      if (i <= p) {
        ag += g / p; al += l / p;
        if (i === p) out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
      } else {
        ag = (ag * (p - 1) + g) / p;
        al = (al * (p - 1) + l) / p;
        out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
      }
    }
    return out;
  };

  /** MACD — { line, signal, histogram }. */
  I.macd = function (v, fast, slow, sig) {
    var ef = I.ema(v, fast), es = I.ema(v, slow);
    var line = v.map(function (_, i) {
      return (ef[i] != null && es[i] != null) ? ef[i] - es[i] : null;
    });
    var signal = realign(line, I.ema(line.filter(nn), sig));
    return {
      line: line,
      signal: signal,
      histogram: line.map(function (x, i) { return (x == null || signal[i] == null) ? null : x - signal[i]; })
    };
  };

  /** Stochastic oscillator — { k, d }. */
  I.stoch = function (bars, kP, dP, smooth) {
    var raw = new Array(bars.length).fill(null);
    for (var i = kP - 1; i < bars.length; i++) {
      var hi = -Infinity, lo = Infinity;
      for (var j = i - kP + 1; j <= i; j++) {
        hi = Math.max(hi, bars[j].high);
        lo = Math.min(lo, bars[j].low);
      }
      raw[i] = hi === lo ? 50 : ((bars[i].close - lo) / (hi - lo)) * 100;
    }
    var k = realign(raw, I.sma(raw.filter(nn), smooth || 1));
    var d = realign(k, I.sma(k.filter(nn), dP));
    return { k: k, d: d };
  };

  /** Stochastic RSI — the stochastic formula applied to RSI. */
  I.stochRsi = function (v, rsiP, stochP, kP, dP) {
    var r = I.rsi(v, rsiP);
    var out = new Array(v.length).fill(null);
    for (var i = 0; i < v.length; i++) {
      if (r[i] == null || i < stochP) continue;
      var hi = -Infinity, lo = Infinity, ok = true;
      for (var j = i - stochP + 1; j <= i; j++) {
        if (r[j] == null) { ok = false; break; }
        hi = Math.max(hi, r[j]); lo = Math.min(lo, r[j]);
      }
      if (ok) out[i] = hi === lo ? 50 : ((r[i] - lo) / (hi - lo)) * 100;
    }
    var k = realign(out, I.sma(out.filter(nn), kP));
    var d = realign(k, I.sma(k.filter(nn), dP));
    return { k: k, d: d };
  };

  /** Commodity Channel Index. */
  I.cci = function (bars, p) {
    var tp = I.src.hlc3(bars);
    var ma = I.sma(tp, p);
    var out = new Array(bars.length).fill(null);
    for (var i = 0; i < bars.length; i++) {
      if (ma[i] == null) continue;
      var dev = 0;
      for (var j = i - p + 1; j <= i; j++) dev += Math.abs(tp[j] - ma[i]);
      dev /= p;
      out[i] = dev === 0 ? 0 : (tp[i] - ma[i]) / (0.015 * dev);
    }
    return out;
  };

  /** Williams %R — like the stochastic, inverted, -100 to 0. */
  I.williamsR = function (bars, p) {
    var out = new Array(bars.length).fill(null);
    for (var i = p - 1; i < bars.length; i++) {
      var hi = -Infinity, lo = Infinity;
      for (var j = i - p + 1; j <= i; j++) {
        hi = Math.max(hi, bars[j].high); lo = Math.min(lo, bars[j].low);
      }
      out[i] = hi === lo ? -50 : ((hi - bars[i].close) / (hi - lo)) * -100;
    }
    return out;
  };

  /** Average Directional Index — { adx, plusDI, minusDI }. Trend strength. */
  I.adx = function (bars, p) {
    var plusDM = [], minusDM = [], tr = [];
    for (var i = 0; i < bars.length; i++) {
      if (i === 0) { plusDM.push(0); minusDM.push(0); tr.push(trueRange(bars, 0)); continue; }
      var up = bars[i].high - bars[i - 1].high;
      var down = bars[i - 1].low - bars[i].low;
      plusDM.push(up > down && up > 0 ? up : 0);
      minusDM.push(down > up && down > 0 ? down : 0);
      tr.push(trueRange(bars, i));
    }
    var atr = I.rma(tr, p);
    var pdm = I.rma(plusDM, p), mdm = I.rma(minusDM, p);

    var plusDI = atr.map(function (a, i) { return (a == null || !a || pdm[i] == null) ? null : (pdm[i] / a) * 100; });
    var minusDI = atr.map(function (a, i) { return (a == null || !a || mdm[i] == null) ? null : (mdm[i] / a) * 100; });
    var dx = plusDI.map(function (p1, i) {
      if (p1 == null || minusDI[i] == null) return null;
      var sum = p1 + minusDI[i];
      return sum === 0 ? 0 : (Math.abs(p1 - minusDI[i]) / sum) * 100;
    });
    return { adx: I.rma(dx, p), plusDI: plusDI, minusDI: minusDI };
  };

  /** Rate of change, as a percentage. */
  I.roc = function (v, p) {
    return v.map(function (x, i) {
      return (i < p || !v[i - p]) ? null : ((x - v[i - p]) / v[i - p]) * 100;
    });
  };

  /** Raw momentum — today minus N bars ago. */
  I.momentum = function (v, p) {
    return v.map(function (x, i) { return i < p ? null : x - v[i - p]; });
  };

  /** On-balance volume. */
  I.obv = function (bars) {
    var out = [0];
    for (var i = 1; i < bars.length; i++) {
      var prev = out[i - 1];
      if (bars[i].close > bars[i - 1].close) out.push(prev + bars[i].volume);
      else if (bars[i].close < bars[i - 1].close) out.push(prev - bars[i].volume);
      else out.push(prev);
    }
    return out;
  };

  /** Money Flow Index — RSI weighted by volume. */
  I.mfi = function (bars, p) {
    var tp = I.src.hlc3(bars);
    var out = new Array(bars.length).fill(null);
    for (var i = p; i < bars.length; i++) {
      var pos = 0, neg = 0;
      for (var j = i - p + 1; j <= i; j++) {
        var flow = tp[j] * bars[j].volume;
        if (tp[j] > tp[j - 1]) pos += flow;
        else if (tp[j] < tp[j - 1]) neg += flow;
      }
      out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
    }
    return out;
  };

  /** Chaikin Money Flow. */
  I.cmf = function (bars, p) {
    var out = new Array(bars.length).fill(null);
    for (var i = p - 1; i < bars.length; i++) {
      var mfv = 0, vol = 0;
      for (var j = i - p + 1; j <= i; j++) {
        var range = bars[j].high - bars[j].low;
        var mult = range === 0 ? 0 : ((bars[j].close - bars[j].low) - (bars[j].high - bars[j].close)) / range;
        mfv += mult * bars[j].volume;
        vol += bars[j].volume;
      }
      out[i] = vol ? mfv / vol : null;
    }
    return out;
  };

  /** Aroon — how recently the window's high and low were set. */
  I.aroon = function (bars, p) {
    var up = new Array(bars.length).fill(null);
    var down = new Array(bars.length).fill(null);
    for (var i = p; i < bars.length; i++) {
      var hi = -Infinity, lo = Infinity, hiIdx = i, loIdx = i;
      for (var j = i - p; j <= i; j++) {
        if (bars[j].high >= hi) { hi = bars[j].high; hiIdx = j; }
        if (bars[j].low <= lo) { lo = bars[j].low; loIdx = j; }
      }
      up[i] = ((p - (i - hiIdx)) / p) * 100;
      down[i] = ((p - (i - loIdx)) / p) * 100;
    }
    return { up: up, down: down };
  };

  /** TRIX — rate of change of a triple-smoothed EMA. */
  I.trix = function (v, p) {
    var e1 = I.ema(v, p);
    var e2 = realign(e1, I.ema(e1.filter(nn), p));
    var e3 = realign(e2, I.ema(e2.filter(nn), p));
    return e3.map(function (x, i) {
      return (x == null || e3[i - 1] == null || !e3[i - 1]) ? null : ((x - e3[i - 1]) / e3[i - 1]) * 10000;
    });
  };

  /** Awesome Oscillator — 5 vs 34 period midpoint momentum. */
  I.awesome = function (bars) {
    var hl2 = I.src.hl2(bars);
    var f = I.sma(hl2, 5), s = I.sma(hl2, 34);
    return f.map(function (x, i) { return (x == null || s[i] == null) ? null : x - s[i]; });
  };

  /** Force Index — price change scaled by volume. */
  I.forceIndex = function (bars, p) {
    var raw = bars.map(function (b, i) { return i === 0 ? 0 : (b.close - bars[i - 1].close) * b.volume; });
    return I.ema(raw, p);
  };

  /** Ultimate Oscillator — blends three lookbacks. */
  I.ultimate = function (bars, s, m, l) {
    var bp = [], tr = [];
    for (var i = 0; i < bars.length; i++) {
      if (i === 0) { bp.push(0); tr.push(trueRange(bars, 0)); continue; }
      var minLow = Math.min(bars[i].low, bars[i - 1].close);
      bp.push(bars[i].close - minLow);
      tr.push(Math.max(bars[i].high, bars[i - 1].close) - minLow);
    }
    function avg(period, i) {
      var b = 0, t = 0;
      for (var j = i - period + 1; j <= i; j++) { b += bp[j]; t += tr[j]; }
      return t === 0 ? 0 : b / t;
    }
    var out = new Array(bars.length).fill(null);
    for (var k = l; k < bars.length; k++) {
      out[k] = (4 * avg(s, k) + 2 * avg(m, k) + avg(l, k)) / 7 * 100;
    }
    return out;
  };

  /** Classic floor-trader pivot points, from the previous bar. */
  I.pivots = function (bars) {
    var p = new Array(bars.length).fill(null);
    var r1 = p.slice(), s1 = p.slice(), r2 = p.slice(), s2 = p.slice();
    for (var i = 1; i < bars.length; i++) {
      var b = bars[i - 1];
      var pp = (b.high + b.low + b.close) / 3;
      p[i] = pp;
      r1[i] = 2 * pp - b.low;
      s1[i] = 2 * pp - b.high;
      r2[i] = pp + (b.high - b.low);
      s2[i] = pp - (b.high - b.low);
    }
    return { p: p, r1: r1, s1: s1, r2: r2, s2: s2 };
  };

  /* ======================================================================
     HELPERS
     ====================================================================== */
  function nn(x) { return x != null; }

  /**
   * Map a compacted result back onto the original indexes.
   * Several indicators feed one series into another; the inner call has to
   * skip nulls, so the answer needs re-spreading over the original array.
   */
  function realign(reference, compact) {
    var out = new Array(reference.length).fill(null);
    var k = 0;
    for (var i = 0; i < reference.length; i++) {
      if (reference[i] != null) out[i] = compact[k++];
    }
    return out;
  }
  I.realign = realign;

})(window);
