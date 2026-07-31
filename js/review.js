/* ==========================================================================
   review.js — the Coach's report card

   Reads the closed-trade history the ticket now records and tells Queez
   what he is actually doing — not vibes, arithmetic. Four pillars:

     Discipline  did trades have stops, and did any loss dwarf the rest
     Edge        profit factor and expectancy — does the approach make money
     Patience    overtrading bursts and revenge re-entries after losses
     Exits       are winners cut short while losers are nursed

   Each pillar gets a letter grade and Coach commentary tied to the number
   that earned it, plus a concrete next move. No history yet → honest
   onboarding, not an invented score.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var R = MC.review = {};

  /* ----------------------------------------------------------------------
     ANALYSIS
     ---------------------------------------------------------------------- */
  R.analyze = function () {
    var H = MC.trade.history();
    if (!H.length) return { empty: true };

    var wins = H.filter(function (t) { return t.pnl > 0; });
    var losses = H.filter(function (t) { return t.pnl <= 0; });

    var grossWin = sum(wins, 'pnl');
    var grossLoss = Math.abs(sum(losses, 'pnl'));
    var avgWin = wins.length ? grossWin / wins.length : 0;
    var avgLoss = losses.length ? grossLoss / losses.length : 0;
    var winRate = wins.length / H.length;

    var m = {
      n: H.length,
      wins: wins.length,
      losses: losses.length,
      winRate: winRate * 100,
      netPnl: sum(H, 'pnl'),
      avgWin: avgWin,
      avgLoss: avgLoss,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0),
      expectancy: winRate * avgWin - (1 - winRate) * avgLoss,
      stopUsage: H.filter(function (t) { return t.hadSl; }).length / H.length * 100,
      biggestLoss: losses.length ? Math.max.apply(null, losses.map(function (t) { return -t.pnl; })) : 0,
      revenge: countRevenge(H),
      burst: maxBurst(H),
      holdWin: avgDuration(wins),
      holdLoss: avgDuration(losses)
    };
    m.biggestLossRatio = avgLoss > 0 ? m.biggestLoss / avgLoss : 0;
    m.nurseRatio = (m.holdWin > 0 && m.holdLoss > 0) ? m.holdLoss / m.holdWin : 1;

    return { empty: false, m: m, grades: grade(m), findings: findings(m) };
  };

  function sum(list, key) {
    return list.reduce(function (s, t) { return s + t[key]; }, 0);
  }

  function avgDuration(list) {
    var timed = list.filter(function (t) { return t.openedAt && t.closedAt; });
    if (!timed.length) return 0;
    return sum(timed.map(function (t) { return { d: t.closedAt - t.openedAt }; }), 'd') / timed.length;
  }

  /** Losing close followed by a fresh entry in the same market within 3 min. */
  function countRevenge(H) {
    var n = 0;
    for (var i = 0; i < H.length; i++) {
      if (H[i].pnl >= 0) continue;
      for (var j = 0; j < H.length; j++) {
        if (j === i || H[j].sym !== H[i].sym || !H[j].openedAt || !H[i].closedAt) continue;
        var gap = H[j].openedAt - H[i].closedAt;
        if (gap > 0 && gap < 3 * 60000) { n++; break; }
      }
    }
    return n;
  }

  /** Most entries opened inside any rolling ten-minute window. */
  function maxBurst(H) {
    var opens = H.map(function (t) { return t.openedAt; }).filter(Boolean).sort();
    var best = 0;
    for (var i = 0; i < opens.length; i++) {
      var count = 0;
      for (var j = i; j < opens.length && opens[j] - opens[i] <= 10 * 60000; j++) count++;
      best = Math.max(best, count);
    }
    return best;
  }

  /* ----------------------------------------------------------------------
     GRADING — score each pillar 0–100, then letter it
     ---------------------------------------------------------------------- */
  function grade(m) {
    var discipline = 0;
    discipline += Math.min(70, m.stopUsage * 0.7);                       // stops carry it
    discipline += m.biggestLossRatio <= 2 ? 30 : m.biggestLossRatio <= 3 ? 15 : 0;

    var edge = 0;
    if (m.profitFactor >= 1.5) edge += 55;
    else if (m.profitFactor >= 1.1) edge += 40;
    else if (m.profitFactor >= 0.9) edge += 22;
    else edge += 8;
    edge += m.expectancy > 0 ? 45 : m.expectancy > -1 ? 20 : 5;

    var patience = 100;
    patience -= Math.min(50, m.revenge * 18);
    if (m.burst >= 8) patience -= 40;
    else if (m.burst >= 5) patience -= 22;
    patience = Math.max(0, patience);

    var exits = 100;
    var ratio = m.avgWin > 0 ? m.avgLoss / m.avgWin : (m.avgLoss > 0 ? 3 : 1);
    if (ratio > 2.2) exits -= 55;
    else if (ratio > 1.5) exits -= 30;
    else if (ratio > 1.1) exits -= 12;
    if (m.nurseRatio > 2.2) exits -= 25;
    exits = Math.max(0, exits);

    var overall = Math.round((discipline + edge + patience + exits) / 4);
    return {
      discipline: letter(discipline), edge: letter(edge),
      patience: letter(patience), exits: letter(exits),
      overall: letter(overall), score: overall
    };
  }

  function letter(score) {
    return score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
  }

  /* ----------------------------------------------------------------------
     FINDINGS — what went wrong, what went right, what to do next.
     Every line cites the number that earned it.
     ---------------------------------------------------------------------- */
  function findings(m) {
    var out = [];
    function add(kind, text, next) { out.push({ kind: kind, text: text, next: next || null }); }

    if (m.stopUsage < 80) {
      add('bad',
        Math.round(100 - m.stopUsage) + '% of your trades went out with <b>no stop loss</b>, Queez. ' +
        'That is not brave, it is unpriced risk.',
        'The ±2% button sets a stop and a 2:1 target in one tap. Use it on every entry this week.');
    } else {
      add('good', 'Stops on ' + Math.round(m.stopUsage) + '% of trades. Discipline, from you? I am shaken.');
    }

    if (m.biggestLossRatio > 3) {
      add('bad',
        'Your worst loss was <b>' + m.biggestLossRatio.toFixed(1) + '× your average loss</b>. One trade got ' +
        'special treatment — special treatment is how accounts die, bozo.',
        'When the stop is set, it is set. Moving it away from price is the one rule with no exceptions.');
    }

    if (m.avgWin > 0 && m.avgLoss / m.avgWin > 1.5) {
      add('bad',
        'Average loss ' + MC.fmtMoney(m.avgLoss) + ' vs average win ' + MC.fmtMoney(m.avgWin) + ' — you are ' +
        '<b>cutting winners and nursing losers</b>. The classic, Queez. Textbook.',
        'Aim the target at twice the stop distance and let it get hit. Winners have to out-earn losers.');
    } else if (m.avgWin > m.avgLoss && m.n >= 5) {
      add('good', 'Winners out-earn losers (' + MC.fmtMoney(m.avgWin) + ' vs ' + MC.fmtMoney(m.avgLoss) + '). That maths compounds.');
    }

    if (m.nurseRatio > 2.2 && m.losses >= 3) {
      add('bad',
        'You hold losers about <b>' + m.nurseRatio.toFixed(1) + '× longer</b> than winners. Hope is not a strategy, clown.',
        'If the reason you entered is gone, the trade goes too — the stop decides, not your feelings.');
    }

    if (m.revenge > 0) {
      add('bad',
        m.revenge + ' <b>revenge ' + (m.revenge === 1 ? 'trade' : 'trades') + '</b> — back into the same market ' +
        'within three minutes of losing in it. The market did not insult you, Queez.',
        'After any loss: stand up, thirty seconds away from the screen. New trade needs a new reason.');
    }

    if (m.burst >= 5) {
      add('bad',
        m.burst + ' entries inside ten minutes at your worst. Machine Gun Kelly drum solo. Every extra trade ' +
        'pays the spread again.',
        'Pick your setup BEFORE the session and set an alert at the level — let the market come to you.');
    } else if (m.n >= 5) {
      add('good', 'No overtrading bursts detected. Patience, the rarest edge there is.');
    }

    if (m.profitFactor >= 1.5 && m.n >= 10) {
      add('good', 'Profit factor ' + m.profitFactor.toFixed(2) + ' over ' + m.n + ' trades — you make ' +
        MC.fmtMoney(m.profitFactor) + ' for every $1.00 you lose. Genuinely respectable.');
    } else if (m.profitFactor < 0.9 && m.n >= 8) {
      add('bad',
        'Profit factor <b>' + m.profitFactor.toFixed(2) + '</b> — the approach loses money as a system, ' +
        'independent of any single trade.',
        'Stop trading it live-style. Take the idea to the Test tab and change ONE variable at a time until the number clears 1.');
    }

    if (m.n < 10) {
      add('info',
        'Only ' + m.n + ' closed ' + (m.n === 1 ? 'trade' : 'trades') + ' so far — these numbers are weather, ' +
        'not climate. Grades firm up around twenty.',
        'Keep taking practice trades with stops. Volume of reps is the point right now.');
    }

    return out;
  }

  /* ----------------------------------------------------------------------
     RENDER
     ---------------------------------------------------------------------- */
  R.render = function () {
    var box = MC.$('reviewBody');
    var report = R.analyze();

    if (report.empty) {
      box.innerHTML =
        '<div class="rv-empty">' +
          '<span class="qz-face" style="width:30px;height:30px;font-size:15px">🎩</span>' +
          '<div>Nothing to grade yet, Queez — I mark <b>closed</b> trades. Place a practice order above, ' +
          'let it hit a stop or a target (or close it yourself), then come back and face the music.</div>' +
        '</div>';
      return;
    }

    var m = report.m, g = report.grades;

    box.innerHTML =
      '<div class="rv-head">' +
        '<div class="rv-overall grade-' + g.overall + '">' + g.overall + '</div>' +
        '<div class="rv-headtext">' +
          '<b>' + overallLine(g) + '</b>' +
          '<span>' + m.n + ' closed trades · net ' + (m.netPnl >= 0 ? '+' : '') + MC.fmtMoney(m.netPnl) +
          ' · win rate ' + m.winRate.toFixed(0) + '%</span>' +
        '</div>' +
      '</div>' +

      '<div class="rv-pillars">' +
        pillar('Discipline', g.discipline, 'stops on ' + Math.round(m.stopUsage) + '%') +
        pillar('Edge', g.edge, 'PF ' + (isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : '∞')) +
        pillar('Patience', g.patience, m.revenge + ' revenge · burst ' + m.burst) +
        pillar('Exits', g.exits, MC.fmtMoney(m.avgWin) + ' / ' + MC.fmtMoney(m.avgLoss)) +
      '</div>' +

      report.findings.map(function (f) {
        return '<div class="rv-find ' + f.kind + '">' +
          '<i class="fa-solid ' + (f.kind === 'good' ? 'fa-circle-check' : f.kind === 'bad' ? 'fa-circle-xmark' : 'fa-circle-info') + '"></i>' +
          '<div>' + f.text +
            (f.next ? '<span class="rv-next"><b>Next move:</b> ' + f.next + '</span>' : '') +
          '</div>' +
        '</div>';
      }).join('');
  };

  function pillar(name, letterGrade, detail) {
    return '<div class="rv-pill">' +
      '<span class="rv-grade grade-' + letterGrade + '">' + letterGrade + '</span>' +
      '<b>' + name + '</b><span>' + MC.esc(detail) + '</span>' +
    '</div>';
  }

  function overallLine(g) {
    return {
      A: 'Look at this. An actual trader. I want no credit — okay, some credit.',
      B: 'Solid work, Queez. A few bad habits away from dangerous.',
      C: 'Middle of the class. The report below says exactly where the marks went.',
      D: 'Rough, Queez. Good news: every problem below has a fix printed next to it.',
      F: 'We do not panic. We read the list, we fix the top item, we grade again.'
    }[g.overall];
  }

})(window);
