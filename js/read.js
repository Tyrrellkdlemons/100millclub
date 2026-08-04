/* ==========================================================================
   read.js — the Coach reads the chart out loud

   Say "go" (or "read the chart") and the Coach turns the last 120 hours of
   the loaded market into a structured read: bias, the levels that matter,
   heat, what would confirm the move and what would flip it. Every line is
   arithmetic on the bars — averages, momentum, recent highs and lows —
   written in plain words. No invented probabilities, ever: a percentage
   nobody computed is a costume, not a number.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var R = MC.read = {};

  function sma(values, n, endOffset) {
    var end = values.length - (endOffset || 0);
    if (end - n < 0) return null;
    var s = 0;
    for (var i = end - n; i < end; i++) s += values[i];
    return s / n;
  }

  function rsi(closes, n) {
    if (closes.length < n + 1) return 50;
    var gain = 0, loss = 0;
    for (var i = closes.length - n; i < closes.length; i++) {
      var d = closes[i] - closes[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    if (gain + loss === 0) return 50;
    var rs = loss === 0 ? Infinity : gain / loss;
    return 100 - 100 / (1 + rs);
  }

  /** The full read for the currently loaded market. */
  R.go = function () {
    var sym = MC.State.symbol;
    var asset = MC.State.asset;
    var d = asset.d;
    var p = asset.p;

    var bars = MC.genBars(sym, '1h', 120);
    var closes = bars.map(function (b) { return b.close; });

    var s20 = sma(closes, 20);
    var s50 = sma(closes, 50);
    var s20back = sma(closes, 20, 6);            // where the 20-average was 6 hours ago
    var rising = s20back !== null && s20 !== null && s20 > s20back;
    var heat = rsi(closes, 14);

    // the levels the market actually respected recently
    var recent = bars.slice(-40);
    var ceiling = Math.max.apply(null, recent.map(function (b) { return b.high; }));
    var floor = Math.min.apply(null, recent.map(function (b) { return b.low; }));

    // typical hourly swing, as a percentage — how much noise is normal
    var trSum = 0;
    for (var i = bars.length - 14; i < bars.length; i++) {
      trSum += bars[i].high - bars[i].low;
    }
    var atrPct = (trSum / 14 / p) * 100;

    var upCase = s20 !== null && s50 !== null && s20 > s50 && p > s20;
    var downCase = s20 !== null && s50 !== null && s20 < s50 && p < s20;

    var bias, biasWhy;
    if (upCase) {
      bias = 'Leaning up';
      biasWhy = 'price is above its 20-hour average, the short average is above the long one' +
                (rising ? ', and the short average is still climbing' : ', though the climb is flattening');
    } else if (downCase) {
      bias = 'Leaning down';
      biasWhy = 'price is under its 20-hour average and the short average is under the long one' +
                (rising ? ', although the short average has started curling up — watch that' : '');
    } else {
      bias = 'Coin-flip range';
      biasWhy = 'the averages disagree with each other, which is chart-speak for nobody is in charge yet';
    }

    var offCeiling = ((ceiling - p) / p) * 100;
    var offFloor = ((p - floor) / p) * 100;

    var heatLine = heat >= 70
      ? 'RSI ' + heat.toFixed(0) + ' — stretched. Buyers have been busy; chasing here is paying top of the range prices.'
      : heat <= 30
        ? 'RSI ' + heat.toFixed(0) + ' — washed out. Sellers have been busy; this is where bounces are born and where knives keep falling. Both.'
        : 'RSI ' + heat.toFixed(0) + ' — middle of the dial, room to move either way.';

    var isLive = MC.quotes && MC.quotes.isLive && MC.quotes.isLive(sym);
    var honesty = isLive
      ? 'The price is live; the hourly history behind it is this terminal’s simulation, so treat the levels as ' +
        'teaching aids and check the real tape on TradingView before you believe a number.'
      : 'This whole read is computed from the simulated feed — it is a classroom chart. The method is real; ' +
        'the bars are practice bars.';

    var text =
      '<b>' + sym + ' — read from the last 120 hours.</b><br><br>' +
      '🧭 <b>Bias: ' + bias + '.</b> Because ' + biasWhy + '.<br><br>' +
      '📏 <b>The levels that matter:</b> ceiling at <b>' + MC.fmtPx(ceiling, d) + '</b> (' +
        offCeiling.toFixed(1) + '% above), floor at <b>' + MC.fmtPx(floor, d) + '</b> (' +
        offFloor.toFixed(1) + '% below). Price is ' +
        (offCeiling < offFloor ? 'closer to the ceiling — the fight is happening up here.' :
                                 'closer to the floor — that support is the story right now.') + '<br><br>' +
      '🌡️ <b>Heat:</b> ' + heatLine + ' Typical hourly swing is about ±' +
        atrPct.toFixed(2) + '%, so moves smaller than that are noise wearing a costume.<br><br>' +
      '✅ <b>What would confirm up:</b> holding above <b>' + MC.fmtPx(ceiling, d) + '</b> instead of ' +
        'poking through and falling back — a poke that fails is how traps are built.<br>' +
      '⛔ <b>What flips it down:</b> losing <b>' + MC.fmtPx(floor, d) + '</b> and not reclaiming it. ' +
        'Below that, the read is wrong and the correct move is admitting it fast.<br><br>' +
      '🎓 ' + honesty + ' And no, Queez, I will not dress this up with made-up percentages — ' +
      'a number nobody computed is a costume, not a probability.';

    return {
      text: text,
      next: 'Set an alert at ' + MC.fmtPx(offCeiling < offFloor ? ceiling : floor, d) +
            ' in the Alerts tab — let the market ping you instead of you staring at it like a hawk with a phone.',
      related: ['alerts', 'indicators', 'risk'],
      topic: 'The chart read',
      // the raw numbers, for anything that wants to reason about the read
      m: { sym: sym, price: p, bias: bias, ceiling: ceiling, floor: floor,
           rsi: heat, atrPct: atrPct, sma20: s20, sma50: s50, live: !!isLive }
    };
  };

  /** The read as plain text — context for the AI desk. */
  R.plain = function () {
    var r = R.go();
    var div = document.createElement('div');
    div.innerHTML = r.text.replace(/<br\s*\/?>/g, '\n');
    return div.textContent;
  };

})(window);
