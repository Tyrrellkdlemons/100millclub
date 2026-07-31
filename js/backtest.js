/* ==========================================================================
   backtest.js — a real (if simple) long-only strategy tester

   Rules of the engine:
     · one position at a time, all-in, entries and exits at the bar close
     · a percentage fee is charged on both sides of every trade
     · anything still open at the end is closed on the final bar
   Metrics are computed from the resulting equity curve, so they always
   agree with each other.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var BT = MC.backtest = {};

  var TRADING_DAYS = 252;

  /* ----------------------------------------------------------------------
     SIGNALS — 1 = enter long, -1 = exit, 0 = do nothing
     ---------------------------------------------------------------------- */
  function buildSignals(strategy, closes) {
    var n = closes.length;
    var sig = new Array(n).fill(0);
    var i;

    if (strategy === 'sma') {
      var fast = MC.ind.sma(closes, 10);
      var slow = MC.ind.sma(closes, 30);
      for (i = 1; i < n; i++) {
        if (fast[i] == null || slow[i] == null || fast[i - 1] == null || slow[i - 1] == null) continue;
        if (fast[i - 1] <= slow[i - 1] && fast[i] > slow[i]) sig[i] = 1;
        else if (fast[i - 1] >= slow[i - 1] && fast[i] < slow[i]) sig[i] = -1;
      }

    } else if (strategy === 'rsi') {
      var r = MC.ind.rsi(closes, 14);
      for (i = 1; i < n; i++) {
        if (r[i] == null || r[i - 1] == null) continue;
        if (r[i - 1] < 30 && r[i] >= 30) sig[i] = 1;        // climbing out of oversold
        else if (r[i - 1] > 70 && r[i] <= 70) sig[i] = -1;  // rolling out of overbought
      }

    } else if (strategy === 'macd') {
      var m = MC.ind.macd(closes, 12, 26, 9);
      for (i = 1; i < n; i++) {
        if (m.line[i] == null || m.signal[i] == null || m.line[i - 1] == null || m.signal[i - 1] == null) continue;
        if (m.line[i - 1] <= m.signal[i - 1] && m.line[i] > m.signal[i]) sig[i] = 1;
        else if (m.line[i - 1] >= m.signal[i - 1] && m.line[i] < m.signal[i]) sig[i] = -1;
      }

    } else {  // Bollinger mean reversion
      var b = MC.ind.bbands(closes, 20, 2);
      for (i = 1; i < n; i++) {
        if (b.lower[i] == null || b.mid[i] == null) continue;
        if (closes[i] < b.lower[i]) sig[i] = 1;
        else if (closes[i] > b.mid[i]) sig[i] = -1;
      }
    }

    return sig;
  }

  /* ----------------------------------------------------------------------
     RUN
     ---------------------------------------------------------------------- */

  /** Button handler — shows a spinner, then hands off to `execute`. */
  BT.run = function () {
    var btn = MC.$('runBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Crunching numbers…';

    setTimeout(function () {
      try {
        BT.execute();
      } catch (err) {
        MC.ui.toast('Backtest failed', err.message, 'err');
      }
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-play"></i> Run backtest';
    }, 480);
  };

  BT.execute = function () {
    var symbol = MC.$('bSym').value;
    var strategy = MC.$('bStrat').value;
    var startCapital = parseFloat(MC.$('bCap').value) || 10000;
    var fee = (parseFloat(MC.$('bFee').value) || 0) / 100;

    var from = new Date(MC.$('bFrom').value + 'T00:00:00').getTime() / 1000;
    var to = new Date(MC.$('bTo').value + 'T23:59:59').getTime() / 1000;

    if (!isFinite(from) || !isFinite(to) || to <= from) {
      MC.ui.toast('Check the dates', 'The "to" date has to come after the "from" date.', 'err');
      return;
    }

    // ~4 years of daily history, trimmed to the requested window
    var bars = MC.genBars(symbol, '1d', 1000).filter(function (b) {
      return b.time >= from && b.time <= to;
    });

    if (bars.length < 40) {
      MC.ui.toast('Not enough history', 'Widen the date range — a backtest needs at least 40 trading days.', 'err');
      return;
    }

    var closes = bars.map(function (b) { return b.close; });
    var signals = buildSignals(strategy, closes);

    var cash = startCapital, units = 0, entry = 0;
    var trades = [], equity = [], buyHold = [];
    var holdUnits = startCapital / closes[0];

    for (var i = 0; i < bars.length; i++) {
      var price = closes[i];

      if (signals[i] === 1 && units === 0) {
        units = (cash * (1 - fee)) / price;
        entry = price;
        cash = 0;
      } else if (signals[i] === -1 && units > 0) {
        var proceeds = units * price * (1 - fee);
        trades.push({
          entry: entry, exit: price, time: bars[i].time,
          pnl: proceeds - units * entry,
          ret: (price - entry) / entry
        });
        cash = proceeds;
        units = 0;
      }

      equity.push(cash + units * price);
      buyHold.push(holdUnits * price);
    }

    // close anything still running on the last bar
    if (units > 0) {
      var lastPrice = closes[closes.length - 1];
      var finalProceeds = units * lastPrice * (1 - fee);
      trades.push({
        entry: entry, exit: lastPrice, time: bars[bars.length - 1].time,
        pnl: finalProceeds - units * entry,
        ret: (lastPrice - entry) / entry,
        stillOpen: true
      });
      cash = finalProceeds;
      equity[equity.length - 1] = cash;
    }

    render(computeStats(equity, trades, startCapital), {
      symbol: symbol, trades: trades, equity: equity, buyHold: buyHold, startCapital: startCapital
    });
  };

  /* ----------------------------------------------------------------------
     METRICS
     ---------------------------------------------------------------------- */
  function computeStats(equity, trades, startCapital) {
    var finalEquity = equity[equity.length - 1];
    var totalReturn = (finalEquity / startCapital - 1) * 100;

    var wins = trades.filter(function (t) { return t.pnl > 0; }).length;
    var winRate = trades.length ? (wins / trades.length) * 100 : 0;

    // Sharpe from daily equity returns, annualised, risk-free assumed zero.
    var returns = [];
    for (var i = 1; i < equity.length; i++) returns.push(equity[i] / equity[i - 1] - 1);
    var mean = returns.reduce(function (s, v) { return s + v; }, 0) / (returns.length || 1);
    var variance = returns.reduce(function (s, v) { return s + Math.pow(v - mean, 2); }, 0) / (returns.length || 1);
    var sd = Math.sqrt(variance);
    var sharpe = sd ? (mean / sd) * Math.sqrt(TRADING_DAYS) : 0;

    // Largest peak-to-trough fall in the equity curve.
    var peak = -Infinity, maxDrawdown = 0;
    equity.forEach(function (v) {
      peak = Math.max(peak, v);
      maxDrawdown = Math.max(maxDrawdown, ((peak - v) / peak) * 100);
    });

    return {
      totalReturn: totalReturn,
      winRate: winRate,
      totalTrades: trades.length,
      sharpe: sharpe,
      maxDrawdown: maxDrawdown,
      finalEquity: finalEquity
    };
  }

  /* ----------------------------------------------------------------------
     RESULTS PANEL
     ---------------------------------------------------------------------- */
  function render(stats, ctx) {
    MC.$('bRes').classList.add('on');

    var retEl = MC.$('rRet');
    retEl.textContent = MC.fmtPct(stats.totalReturn);
    retEl.className = stats.totalReturn >= 0 ? 'up' : 'down';
    MC.$('rBar').style.width = MC.clamp(Math.abs(stats.totalReturn), 2, 100) + '%';

    var winEl = MC.$('rWin');
    winEl.textContent = stats.winRate.toFixed(1) + '%';
    winEl.className = stats.winRate >= 50 ? 'up' : 'down';

    MC.$('rTrades').textContent = stats.totalTrades;

    var sharpeEl = MC.$('rSharpe');
    sharpeEl.textContent = stats.sharpe.toFixed(2);
    sharpeEl.className = stats.sharpe >= 1 ? 'up' : (stats.sharpe >= 0 ? '' : 'down');

    MC.$('rDD').textContent = '-' + stats.maxDrawdown.toFixed(2) + '%';
    MC.$('rDD').className = 'down';

    var eqEl = MC.$('rEq');
    eqEl.textContent = MC.fmtMoney(stats.finalEquity);
    eqEl.className = stats.finalEquity >= ctx.startCapital ? 'up' : 'down';

    drawEquityCurve(ctx.equity, ctx.buyHold);

    var digits = MC.MAP[ctx.symbol].d;
    MC.$('tradeLog').innerHTML = ctx.trades.length
      ? ctx.trades.slice(-40).reverse().map(function (t) {
          return '<div class="tl-row">' +
            '<b>' + MC.fmtDate(t.time) +
              (t.stillOpen ? ' <span style="color:var(--accent)">·open</span>' : '') + '</b>' +
            '<span>' + MC.fmtPx(t.entry, digits) + ' → ' + MC.fmtPx(t.exit, digits) + '</span>' +
            '<span class="' + (t.pnl >= 0 ? 'up' : 'down') + '">' + MC.fmtPct(t.ret * 100) + '</span>' +
          '</div>';
        }).join('')
      : '<div class="wl-empty" style="padding:16px">This strategy never triggered in that window. ' +
        'Try a longer date range or a different rule set.</div>';

    var bh = (ctx.buyHold[ctx.buyHold.length - 1] / ctx.startCapital - 1) * 100;
    MC.ui.toast(
      'Backtest complete',
      ctx.symbol + ' · ' + stats.totalTrades + ' trades · strategy ' + MC.fmtPct(stats.totalReturn, 1) +
      ' vs buy & hold ' + MC.fmtPct(bh, 1),
      stats.totalReturn >= bh ? 'gold' : 'info'
    );

    MC.$('bRes').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** Equity curve with a dashed buy-and-hold reference line. */
  function drawEquityCurve(equity, buyHold) {
    var canvas = MC.$('eqCanvas');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = 74;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var all = equity.concat(buyHold);
    var hi = Math.max.apply(null, all);
    var lo = Math.min.apply(null, all);
    var X = function (i) { return (i / (equity.length - 1)) * (w - 2) + 1; };
    var Y = function (v) { return h - 4 - ((v - lo) / ((hi - lo) || 1)) * (h - 8); };

    // buy & hold reference
    ctx.beginPath();
    buyHold.forEach(function (v, i) { i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); });
    ctx.strokeStyle = 'rgba(138,151,168,.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // strategy equity, filled
    var positive = equity[equity.length - 1] >= equity[0];
    var trace = function () {
      ctx.beginPath();
      equity.forEach(function (v, i) { i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); });
    };

    trace();
    ctx.lineTo(X(equity.length - 1), h);
    ctx.lineTo(X(0), h);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, positive ? 'rgba(38,201,106,.34)' : 'rgba(255,77,94,.34)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fill();

    trace();
    ctx.strokeStyle = positive ? '#26c96a' : '#ff4d5e';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

})(window);
