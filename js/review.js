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

   The same card also grades the REAL book — the Folio ledger — on its own
   four pillars: Spread (concentration), Risk mix (volatile allocation),
   Entries (averaging down vs scaling into strength) and Results (P/L on
   cost). Two books, one report, same honest arithmetic.
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

    if (!isFinite(m.profitFactor) && m.n >= 10) {
      add('good', 'Not one losing trade in ' + m.n + ' closed. Either you are an oracle, Queez, or nothing has ' +
        'been allowed to hit a stop yet — enjoy it, and do not mistake a hot streak for a system.');
    } else if (m.profitFactor >= 1.5 && m.n >= 10) {
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
     THE FOLIO — grading the real book
     ---------------------------------------------------------------------- */
  R.analyzeFolio = function () {
    var P = MC.portfolio;
    var tx = P.transactions();
    if (!tx.length) return { empty: true };

    var s = P.summary();
    if (!s.positions) return { empty: true, soldOut: true, realised: s.realised };

    var buys = tx.filter(function (t) { return t.side === 'buy'; }).length;
    var topWeight = s.marketValue ? (s.rows[0].value / s.marketValue) * 100 : 0;

    var marketSet = {};
    s.rows.forEach(function (r) { marketSet[r.market] = 1; });

    var cryptoValue = s.rows.filter(function (r) { return r.market === 'crypto'; })
      .reduce(function (a, r) { return a + r.value; }, 0);

    // replay the ledger to spot averaging down: buying MORE of something
    // already priced under its average cost — adding to a loser. The same
    // pass totals every dollar that ever went in, so the P/L percentage is
    // measured against ALL deployed capital — summary().costBasis only
    // covers the still-open rows and would overstate wildly after big sells.
    var book = {}, avgDown = 0, scaleIn = 0, invested = 0;
    tx.forEach(function (t) {
      var pos = book[t.sym] || (book[t.sym] = { qty: 0, avg: 0 });
      if (t.side === 'buy') {
        invested += t.qty * t.price;
        if (pos.qty > 0 && t.price < pos.avg * 0.97) avgDown++;
        if (pos.qty > 0 && t.price > pos.avg * 1.03) scaleIn++;
        var q = pos.qty + t.qty;
        pos.avg = q ? (pos.avg * pos.qty + t.price * t.qty) / q : 0;
        pos.qty = q;
      } else {
        pos.qty -= t.qty;
        if (pos.qty < 1e-9) { pos.qty = 0; pos.avg = 0; }
      }
    });

    var m = {
      positions: s.positions,
      buys: buys,
      sells: tx.length - buys,
      topSym: s.rows[0].sym,
      topWeight: topWeight,
      markets: Object.keys(marketSet).length,
      cryptoShare: s.marketValue ? (cryptoValue / s.marketValue) * 100 : 0,
      avgDown: avgDown,
      scaleIn: scaleIn,
      marketValue: s.marketValue,
      unrealised: s.unrealised,
      realised: s.realised,
      totalPct: invested ? ((s.unrealised + s.realised) / invested) * 100 : 0,
      liveCount: s.rows.filter(function (r) { return r.isLive; }).length
    };
    return { empty: false, m: m, grades: gradeFolio(m), findings: folioFindings(m) };
  };

  function gradeFolio(m) {
    var spread = 0;
    spread += m.positions >= 5 ? 40 : m.positions >= 3 ? 30 : m.positions === 2 ? 18 : 8;
    spread += m.topWeight <= 35 ? 35 : m.topWeight <= 50 ? 24 : m.topWeight <= 70 ? 12 : 0;
    spread += m.markets >= 3 ? 25 : m.markets === 2 ? 15 : 6;

    var risk = 100;
    if (m.cryptoShare > 60) risk -= 45;
    else if (m.cryptoShare > 40) risk -= 25;
    else if (m.cryptoShare > 25) risk -= 10;
    if (m.positions === 1) risk -= 25;
    if (m.topWeight > 70) risk -= 15;
    risk = Math.max(0, risk);

    var entries = Math.max(0, 100 - Math.min(50, m.avgDown * 22));

    var results = m.totalPct >= 10 ? 92 : m.totalPct >= 3 ? 78
                : m.totalPct >= 0 ? 62 : m.totalPct >= -5 ? 50
                : m.totalPct >= -15 ? 42 : 28;

    var overall = Math.round((spread + risk + entries + results) / 4);
    return {
      spread: letter(spread), risk: letter(risk), entries: letter(entries),
      results: letter(results), overall: letter(overall), score: overall
    };
  }

  function folioFindings(m) {
    var out = [];
    function add(kind, text, next) { out.push({ kind: kind, text: text, next: next || null }); }

    if (m.topWeight > 50) {
      add('bad',
        Math.round(m.topWeight) + '% of the book is <b>' + m.topSym + '</b>. That is not a portfolio, Queez, ' +
        'that is one bet wearing a briefcase.',
        'The classic concentration rule of thumb: no single position past about a third of the book. ' +
        'Diversification is the only free lunch in this business — where yours sits is your call.');
    } else if (m.positions >= 3 && m.topWeight <= 40) {
      add('good', 'Biggest holding is ' + Math.round(m.topWeight) + '% across ' + m.positions +
        ' positions. Spread like an adult. I am almost proud.');
    }

    if (m.positions === 1) {
      add('bad',
        'One holding. If <b>' + m.topSym + '</b> sneezes, the whole book catches the flu.',
        'Add a second and third position from a different market group — the watchlist has five groups for a reason.');
    } else if (m.markets === 1 && m.positions >= 2) {
      add('bad',
        'Every holding lives in the <b>same market group</b>. When that group has a bad week, ' +
        'everything you own is the same trade, clown.',
        'Pull one position from a different group — an index against your tech, some forex against your crypto. ' +
        'Five groups in the watchlist, all loggable.');
    }

    if (m.cryptoShare > 40) {
      add('bad',
        Math.round(m.cryptoShare) + '% of the book is <b>crypto</b>. Fine when it moons — fatal when it does ' +
        'the other thing it is famous for.',
        'Size crypto so a 50% drawdown stings but does not end you. Most sane books keep it under a quarter.');
    }

    if (m.avgDown >= 1) {
      add('bad',
        'You averaged <b>down</b> ' + m.avgDown + (m.avgDown === 1 ? ' time' : ' times') + ' — buying more of ' +
        'something already under water. Adding to losers is nursing with extra steps, Queez.',
        'Add to what is working, not what is wounded. Cheaper is not the same as better — if the thesis broke, the position goes.');
    } else if (m.scaleIn >= 1) {
      add('good', 'You scaled into strength ' + m.scaleIn + (m.scaleIn === 1 ? ' time' : ' times') +
        ' — adding to winners. That is how professionals build size.');
    }

    if (m.totalPct >= 3) {
      add('good', 'The book is up <b>' + m.totalPct.toFixed(1) + '%</b> on the money you put in (' +
        MC.fmtMoney(m.unrealised + m.realised) + '). The grind is grinding.');
    } else if (m.totalPct <= -5) {
      add('bad',
        'The book is down <b>' + Math.abs(m.totalPct).toFixed(1) + '%</b> on the money you put in. ' +
        'Not fatal — unmanaged would be fatal.',
        'Re-underwrite every holding: would you buy it today, at this price? If the answer is no, why are you holding it?');
    }

    if (m.realised > 0) {
      add('good', MC.fmtMoney(m.realised) + ' already <b>banked</b> as realised profit. ' +
        'Paper gains are opinions; realised is money.');
    }

    if (m.liveCount === m.positions) {
      add('good',
        'Live pricing covers <b>all ' + m.positions + '</b> of your ' +
        (m.positions === 1 ? 'holding' : 'holdings') + ' — the P/L on this card is the real mark, not a simulation.');
    } else {
      add('info',
        'Live pricing covers <b>' + m.liveCount + ' of ' + m.positions + '</b> holdings; the rest are ' +
        'simulated marks, so read their P/L as directional.',
        'Crypto and forex are live out of the box. A free Twelve Data or Finnhub key under Folio \u2192 Price data makes stocks live too.');
    }

    return out;
  }

  /* ----------------------------------------------------------------------
     RENDER
     ---------------------------------------------------------------------- */
  R.render = function () {
    MC.$('reviewBody').innerHTML = tradeSection() + folioSection();
  };

  /** The demo reps — the original report. */
  function tradeSection() {
    var head = sect('fa-bolt', 'The trades — your demo reps');
    var report = R.analyze();

    if (report.empty) {
      return head +
        '<div class="rv-empty">' +
          '<span class="qz-face" style="width:30px;height:30px;font-size:15px">🎩</span>' +
          '<div>Nothing to grade yet, Queez — I mark <b>closed</b> trades. Place a practice order above, ' +
          'let it hit a stop or a target (or close it yourself), then come back and face the music.</div>' +
        '</div>';
    }

    var m = report.m, g = report.grades;

    return head +
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

      findingsHtml(report.findings);
  }

  /** The real book — the Folio ledger, graded on its own pillars. */
  function folioSection() {
    var head = sect('fa-briefcase', 'The Folio — your real book');
    var fr = R.analyzeFolio();

    if (fr.empty) {
      if (fr.soldOut) {
        return head +
          '<div class="rv-find info"><i class="fa-solid fa-circle-info"></i><div>Everything in the Folio is sold — ' +
          MC.fmtMoney(fr.realised) + ' realised. Log the buys you hold now and I will grade the book itself.</div></div>';
      }
      return head +
        '<div class="rv-find info"><i class="fa-solid fa-circle-info"></i><div>The Folio is empty, Queez. Log what you ' +
        'actually own in the <b>Folio</b> tab — or import your paper trades — and I will grade that book too: ' +
        'spread, risk mix, entries, results.</div></div>';
    }

    var m = fr.m, g = fr.grades;

    return head +
      '<div class="rv-head">' +
        '<div class="rv-overall grade-' + g.overall + '">' + g.overall + '</div>' +
        '<div class="rv-headtext">' +
          '<b>' + folioLine(g) + '</b>' +
          '<span>' + m.positions + (m.positions === 1 ? ' holding' : ' holdings') + ' · value ' +
          MC.fmtMoney(m.marketValue) + ' · P/L ' + (m.totalPct >= 0 ? '+' : '') + m.totalPct.toFixed(1) + '% on money in</span>' +
        '</div>' +
      '</div>' +

      '<div class="rv-pillars">' +
        pillar('Spread', g.spread, m.topSym + ' is ' + Math.round(m.topWeight) + '%') +
        pillar('Risk mix', g.risk, 'crypto ' + Math.round(m.cryptoShare) + '%') +
        pillar('Entries', g.entries, m.avgDown + '× avg-down') +
        pillar('Results', g.results, (m.totalPct >= 0 ? '+' : '') + m.totalPct.toFixed(1) + '%') +
      '</div>' +

      findingsHtml(fr.findings);
  }

  function sect(icon, title) {
    return '<div class="rv-sect"><i class="fa-solid ' + icon + '"></i>' + title + '</div>';
  }

  function findingsHtml(list) {
    return list.map(function (f) {
      return '<div class="rv-find ' + f.kind + '">' +
        '<i class="fa-solid ' + (f.kind === 'good' ? 'fa-circle-check' : f.kind === 'bad' ? 'fa-circle-xmark' : 'fa-circle-info') + '"></i>' +
        '<div>' + f.text +
          (f.next ? '<span class="rv-next"><b>Next move:</b> ' + f.next + '</span>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function folioLine(g) {
    return {
      A: 'A real book, properly built. Who taught you this? Oh. Right. Me.',
      B: 'A solid book, Queez. One or two allocations away from genuinely good.',
      C: 'A middle-of-class book. The lines below say exactly where the marks went.',
      D: 'This book needs work, Queez. Start with the top line below.',
      F: 'This is not a portfolio yet, it is a pile. We sort piles. Read on.'
    }[g.overall];
  }

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
