/* ==========================================================================
   signals.js — the signals engine: honest maths over real bars

   Four desks look at the same history and vote:

     TrendCatcher   EMA 20/50 posture + ADX trend strength
     Momentum       RSI 14 + the MACD histogram and its slope
     Mean reversion Bollinger position — stretched things snap back
     Volume         OBV slope — is real money behind the move?

   The bars are real wherever real is obtainable (Binance klines for crypto,
   the /api history proxy for everything Yahoo covers) and clearly labelled
   simulated when offline. The maths is the site's own indicator library —
   the same code the chart draws. Nothing here is advice; it is a reading of
   indicators, shown with the reasoning attached so it teaches.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var SIG = MC.signals = {};

  var CACHE_KEY = 'mc_signal_cache';
  var TTL = 5 * 60 * 1000;

  /* Binance interval names match ours for the ones we use. */
  var BIN_INT = { '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d' };
  var YH_INT = { '15m': '15m', '1h': '1h', '4h': '1h', '1d': '1d' };   // Yahoo has no 4h — 1h serves
  var YH_RANGE = { '15m': '5d', '1h': '1mo', '4h': '3mo', '1d': '1y' };
  var TF_SECONDS = { '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };

  /* ----------------------------------------------------------------------
     CONFIRMED BARS + VETOES — the hardening rules
     A signal computed on a half-formed candle changes its mind when the
     candle closes; a signal computed on stale data is a guess wearing a
     number. Both get stopped here, and the card says which rule fired.
     ---------------------------------------------------------------------- */

  /** Drop the still-forming last bar so every input is a CONFIRMED close. */
  SIG.confirmedBars = function (bars, tfSec, nowMs) {
    if (!bars || !bars.length) return bars;
    var now = (nowMs || Date.now()) / 1000;
    var lastBar = bars[bars.length - 1];
    if (lastBar.time + tfSec > now) return bars.slice(0, -1);
    return bars;
  };

  /**
   * The veto rules, pure so the tests can hammer them.
   *  - stale: the newest confirmed bar is too old for the timeframe. 24/7
   *    markets get 3 intervals of grace; session markets also get the
   *    overnight/weekend allowance so a Monday open is not "stale".
   *  - disagreement: TrendCatcher and Momentum pointing hard in opposite
   *    directions is not a signal, it is a coin flip — no trade.
   */
  SIG.applyVetoes = function (votes, barAgeSec, tfSec, marketClass) {
    var vetoes = [];
    var allowed = marketClass === 'crypto'
      ? tfSec * 3
      : Math.max(tfSec * 3, 66 * 3600);   // covers a weekend + a session gap
    if (isFinite(barAgeSec) && barAgeSec > allowed) {
      vetoes.push({
        type: 'stale',
        text: 'Stale data — the newest confirmed bar closed ' +
              Math.round(barAgeSec / 3600) + 'h ago. Confidence capped, no lean taken.'
      });
    }
    var t = votes.trend, m = votes.momo;
    if (t && m && t.dir !== 0 && m.dir !== 0 && t.dir === -m.dir &&
        t.conf >= 0.55 && m.conf >= 0.55) {
      vetoes.push({
        type: 'disagreement',
        text: 'TrendCatcher and Momentum disagree hard (' +
              (t.dir > 0 ? 'trend up, momentum down' : 'trend down, momentum up') +
              ') — that is a coin flip, not a signal.'
      });
    }
    return vetoes;
  };

  /* ----------------------------------------------------------------------
     CONTRACT ROLLS — the micros expire; the card should know
     Quarterly equity futures (H/M/U/Z) expire the third Friday of Mar,
     Jun, Sep, Dec. Front-month proxies roll themselves; the countdown is
     shown so nobody is surprised by roll-week behaviour.
     ---------------------------------------------------------------------- */
  var QUARTERLY = { MES: 1, MNQ: 1, MYM: 1, M2K: 1 };

  function thirdFriday(year, month) {
    var d = new Date(Date.UTC(year, month, 1));
    var day = d.getUTCDay();
    var firstFriday = 1 + ((5 - day + 7) % 7);
    return new Date(Date.UTC(year, month, firstFriday + 14));
  }

  SIG.rollInfo = function (sym, nowMs) {
    if (!QUARTERLY[sym]) return null;
    var now = nowMs ? new Date(nowMs) : new Date();
    var months = [2, 5, 8, 11];
    for (var y = now.getUTCFullYear(); y <= now.getUTCFullYear() + 1; y++) {
      for (var i = 0; i < months.length; i++) {
        var expiry = thirdFriday(y, months[i]);
        if (expiry.getTime() > now.getTime()) {
          var days = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
          return {
            days: days,
            date: expiry.toISOString().slice(0, 10),
            soon: days <= 8,
            label: days <= 8 ? 'rolls in ' + days + 'd' : 'expiry in ' + days + 'd'
          };
        }
      }
    }
    return null;
  };

  /* ----------------------------------------------------------------------
     BARS — real where possible, honestly labelled when not
     ---------------------------------------------------------------------- */
  function cacheRead() {
    try { return JSON.parse(MC.store.get(CACHE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function cacheWrite(c) {
    var keys = Object.keys(c);
    if (keys.length > 40) {
      keys.sort(function (a, b) { return c[a].at - c[b].at; })
          .slice(0, keys.length - 40)
          .forEach(function (k) { delete c[k]; });
    }
    MC.store.set(CACHE_KEY, JSON.stringify(c));
  }

  function fetchBars(asset, tf) {
    tf = BIN_INT[tf] ? tf : '1h';

    if (asset.m === 'crypto' && !asset.noBinance) {
      var pair = (asset.bp || (asset.s + 'USDT')).toUpperCase();
      return fetch('https://data-api.binance.vision/api/v3/klines?symbol=' + pair +
                   '&interval=' + BIN_INT[tf] + '&limit=140')
        .then(function (r) { if (!r.ok) throw new Error('binance ' + r.status); return r.json(); })
        .then(function (rows) {
          return {
            source: 'Binance',
            bars: rows.map(function (k) {
              return { time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2],
                       low: +k[3], close: +k[4], volume: +k[5] };
            })
          };
        });
    }

    if (asset.yh && /^https?:$/.test(location.protocol)) {
      return fetch('/api/history?symbol=' + encodeURIComponent(asset.yh) +
                   '&interval=' + YH_INT[tf] + '&range=' + YH_RANGE[tf])
        .then(function (r) { if (!r.ok) throw new Error('proxy ' + r.status); return r.json(); })
        .then(function (d) {
          if (!d.bars || d.bars.length < 40) throw new Error('thin history');
          return { source: 'Yahoo', bars: d.bars.slice(-140) };
        });
    }

    return Promise.reject(new Error('no live source'));
  }

  /* ----------------------------------------------------------------------
     THE DESKS
     Each returns { dir: -1|0|1, conf: 0..1, text: 'plain English why' }.
     ---------------------------------------------------------------------- */
  function last(arr) {
    for (var i = arr.length - 1; i >= 0; i--) if (arr[i] != null && isFinite(arr[i])) return arr[i];
    return null;
  }
  function at(arr, back) {
    var found = 0;
    for (var i = arr.length - 1; i >= 0; i--) {
      if (arr[i] == null || !isFinite(arr[i])) continue;
      if (found === back) return arr[i];
      found++;
    }
    return null;
  }
  function fmt(v, d) { return v == null ? '–' : MC.fmtPx(v, d); }

  function deskTrend(bars, closes, d) {
    var e20 = MC.ind.ema(closes, 20), e50 = MC.ind.ema(closes, 50);
    var adx = MC.ind.adx(bars, 14).adx;
    var f = last(e20), s = last(e50), a = last(adx), px = last(closes);
    if (f == null || s == null) return { dir: 0, conf: 0.1, text: 'Not enough history for the averages yet.' };

    var above = f > s;
    var strength = a == null ? 0.4 : MC.clamp((a - 15) / 30, 0, 1);
    var dir = above ? 1 : -1;
    var conf = 0.35 + strength * 0.55;
    var text = 'EMA20 ' + fmt(f, d) + ' is ' + (above ? 'above' : 'below') + ' EMA50 ' + fmt(s, d) +
               (a != null ? ', ADX ' + a.toFixed(0) + (a >= 25 ? ' — a real trend' : a >= 18 ? ' — a developing trend' : ' — barely trending') : '') +
               '. Price ' + fmt(px, d) + ' sits ' + (px > f ? 'above' : 'below') + ' the fast average.';
    if (a != null && a < 16) { dir = 0; conf = 0.3; }
    return { dir: dir, conf: conf, text: text };
  }

  function deskMomentum(closes, d) {
    var rsi = MC.ind.rsi(closes, 14);
    var macd = MC.ind.macd(closes, 12, 26, 9);
    var r = last(rsi);
    var h = last(macd.histogram), hPrev = at(macd.histogram, 3);
    if (r == null || h == null) return { dir: 0, conf: 0.1, text: 'Momentum needs more bars.' };

    var rising = hPrev != null ? h > hPrev : h > 0;
    var dir = 0, conf = 0.35;
    if (r >= 58 && h > 0) { dir = 1; conf = 0.55 + MC.clamp((r - 58) / 60, 0, 0.3); }
    else if (r <= 42 && h < 0) { dir = -1; conf = 0.55 + MC.clamp((42 - r) / 60, 0, 0.3); }
    else if (h > 0 && rising) { dir = 1; conf = 0.45; }
    else if (h < 0 && !rising) { dir = -1; conf = 0.45; }
    if (r >= 74) { dir = 1; conf = Math.min(conf, 0.5); }   // hot enough to be late
    if (r <= 26) { dir = -1; conf = Math.min(conf, 0.5); }

    return {
      dir: dir, conf: conf,
      text: 'RSI ' + r.toFixed(0) + (r >= 70 ? ' — hot' : r <= 30 ? ' — cold' : '') +
            ', MACD histogram ' + (h >= 0 ? 'positive' : 'negative') + ' and ' + (rising ? 'building' : 'fading') + '.'
    };
  }

  function deskReversion(closes, d) {
    var bb = MC.ind.bbands(closes, 20, 2);
    var px = last(closes), up = last(bb.upper), lo = last(bb.lower), mid = last(bb.mid);
    if (px == null || up == null || lo == null || up === lo) {
      return { dir: 0, conf: 0.1, text: 'Bands need more bars.' };
    }
    var z = (px - mid) / ((up - lo) / 2);   // -1 = lower band, +1 = upper band
    var dir = 0, conf = 0.3, state;
    if (z > 0.95) { dir = -1; conf = 0.5; state = 'pressed into the upper band — stretched'; }
    else if (z < -0.95) { dir = 1; conf = 0.5; state = 'pressed into the lower band — stretched'; }
    else if (z > 0.4) { state = 'upper half of the band'; }
    else if (z < -0.4) { state = 'lower half of the band'; }
    else { state = 'hugging the middle — coiled'; }
    return { dir: dir, conf: conf, text: 'Price is ' + state + ' (band position ' + z.toFixed(2) + ').' };
  }

  function deskVolume(bars) {
    var obv = MC.ind.obv(bars);
    var now = last(obv), then = at(obv, 10);
    if (now == null || then == null) return { dir: 0, conf: 0.1, text: 'No volume story yet.' };
    var rising = now > then;
    return {
      dir: rising ? 1 : -1, conf: 0.35,
      text: 'On-balance volume is ' + (rising ? 'rising — buyers are doing the lifting.' : 'falling — sellers carry the tape.')
    };
  }

  /* ----------------------------------------------------------------------
     THE VOTE
     ---------------------------------------------------------------------- */
  var DESKS = [
    { key: 'trend', name: 'TrendCatcher', icon: 'fa-arrow-trend-up', weight: 0.35 },
    { key: 'momo',  name: 'Momentum desk', icon: 'fa-gauge-high',    weight: 0.30 },
    { key: 'revert',name: 'Mean reversion', icon: 'fa-arrows-rotate', weight: 0.15 },
    { key: 'vol',   name: 'Volume desk',   icon: 'fa-chart-column',  weight: 0.20 }
  ];
  SIG.DESKS = DESKS;

  function analyze(asset, tf, bars, source) {
    // only confirmed closes vote — the forming candle changes its mind
    var tfSec = TF_SECONDS[tf] || 3600;
    bars = SIG.confirmedBars(bars, tfSec);

    var closes = MC.ind.src.close(bars);
    var d = asset.d;

    var votes = {
      trend: deskTrend(bars, closes, d),
      momo: deskMomentum(closes, d),
      revert: deskReversion(closes, d),
      vol: deskVolume(bars)
    };

    var score = 0, weightSum = 0;
    DESKS.forEach(function (desk) {
      var v = votes[desk.key];
      score += v.dir * v.conf * desk.weight;
      weightSum += desk.weight;
    });
    score /= weightSum;   // -1 … 1

    var dir = score > 0.12 ? 'buy' : score < -0.12 ? 'sell' : 'neutral';
    var confidence = Math.round(Math.min(0.92, Math.abs(score) + 0.18) * 100);

    // freshness + the veto rules
    var lastBarTime = bars.length ? bars[bars.length - 1].time : null;
    var barAgeSec = lastBarTime ? (Date.now() / 1000 - (lastBarTime + tfSec)) : Infinity;
    if (barAgeSec < 0) barAgeSec = 0;
    var vetoes = source === 'Simulated' ? [] : SIG.applyVetoes(votes, barAgeSec, tfSec, asset.m);
    if (vetoes.length) {
      dir = 'neutral';
      confidence = Math.min(confidence, 30);
      if (SIG.onVeto) {
        vetoes.forEach(function (v) { try { SIG.onVeto(asset.s, tf, v); } catch (e) {} });
      }
    }

    // levels people can actually use, from ATR — spelled out, not mystical
    var atr = last(MC.ind.atr(bars, 14));
    var px = last(closes);
    var levels = null;
    if (atr != null && px != null && dir !== 'neutral') {
      var sgn = dir === 'buy' ? 1 : -1;
      levels = {
        entry: px,
        stop: px - sgn * atr * 1.5,
        target: px + sgn * atr * 3
      };
    }

    return {
      sym: asset.s, tf: tf, source: source, at: Date.now(),
      dir: dir, confidence: confidence, score: score,
      votes: votes, levels: levels,
      price: px, atr: atr,
      barAgeSec: isFinite(barAgeSec) ? Math.round(barAgeSec) : null,
      vetoes: vetoes,
      roll: SIG.rollInfo(asset.s)
    };
  }

  /* ----------------------------------------------------------------------
     PUBLIC
     ---------------------------------------------------------------------- */

  /** Signal for one symbol — cached five minutes, small queue so a board of
      cards never fires twenty fetches at once. */
  var queue = [];
  var inFlight = 0;
  var MAX_FLIGHT = 4;

  function pump() {
    while (inFlight < MAX_FLIGHT && queue.length) {
      var job = queue.shift();
      inFlight++;
      (function (j) {
        fetchBars(j.asset, j.tf)
          .then(function (r) { j.resolve(analyze(j.asset, j.tf, r.bars, r.source)); })
          .catch(function () {
            // offline or unpriceable: the simulated engine still teaches,
            // and the card says "Simulated" in plain sight
            var bars = MC.genBars(j.asset.s, j.tf === '1d' ? '1d' : '1h', 140);
            j.resolve(analyze(j.asset, j.tf, bars, 'Simulated'));
          })
          .then(function () { inFlight--; pump(); });
      })(job);
    }
  }

  SIG.get = function (sym, tf, force) {
    tf = tf || '1h';
    var asset = MC.MAP[sym];
    if (!asset) return Promise.reject(new Error('unknown symbol'));

    var cache = cacheRead();
    var key = sym + ':' + tf;
    var hit = cache[key];
    if (!force && hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);

    return new Promise(function (resolve) {
      queue.push({ asset: asset, tf: tf, resolve: function (sig) {
        var c = cacheRead();
        c[key] = { at: Date.now(), data: sig };
        cacheWrite(c);
        resolve(sig);
      } });
      pump();
    });
  };

  /** The context block handed to the AI desk — only computed truths. */
  SIG.aiContext = function (sig) {
    var a = MC.MAP[sig.sym];
    var lines = [
      'Market: ' + sig.sym + ' (' + (a ? a.n : '') + '), class ' + (a ? a.m : '?') + ', timeframe ' + sig.tf + '.',
      'Bar source: ' + sig.source + (sig.source === 'Simulated' ? ' (practice data, not real prices)' : ' (real market data)') + '.',
      'Last price: ' + sig.price + '. ATR14: ' + (sig.atr != null ? sig.atr.toFixed(a ? Math.min(a.d, 6) : 4) : 'n/a') + '.',
      'Composite read: ' + sig.dir.toUpperCase() + ' at ' + sig.confidence + '% confidence (score ' + sig.score.toFixed(2) + ').'
    ];
    DESKS.forEach(function (desk) {
      var v = sig.votes[desk.key];
      lines.push(desk.name + ': ' + (v.dir > 0 ? 'bullish' : v.dir < 0 ? 'bearish' : 'neutral') +
                 ' (' + Math.round(v.conf * 100) + '%) — ' + v.text);
    });
    if (sig.levels) {
      lines.push('ATR-derived levels — entry ' + sig.levels.entry + ', stop ' + sig.levels.stop.toFixed(a ? a.d : 2) +
                 ', target ' + sig.levels.target.toFixed(a ? a.d : 2) + ' (1.5×ATR risk, 2:1 reward).');
    }
    return lines.join('\n');
  };

  /** Ask for an AI read: site key first, then the visitor's own key. */
  SIG.aiRead = function (sig) {
    var context = SIG.aiContext(sig);
    var question = 'Give your read of this market based only on these indicators.';

    var siteTry = /^https?:$/.test(location.protocol)
      ? fetch('/api/ai-signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: context, question: question })
        }).then(function (r) { return r.json(); })
      : Promise.resolve({ enabled: false });

    return siteTry.then(function (d) {
      if (d && d.enabled && d.ok && d.text) return { text: d.text, via: 'site AI' };
      if (d && d.enabled && !d.ok) throw new Error(d.reason || 'The site AI had a moment.');
      // site AI not configured — the visitor's own OpenRouter key still works
      if (MC.ai && MC.ai.enabled()) {
        return MC.ai.ask(question + '\n\nIndicator context:\n' + context)
          .then(function (text) { return { text: text, via: 'your OpenRouter key' }; });
      }
      throw new Error('No AI is configured yet. The site owner can set OPENROUTER_API_KEY in Netlify, ' +
                      'or paste your own free key in the Coach’s AI desk — either switches this on.');
    });
  };

})(window);
