/* ==========================================================================
   desk.js — My Desk: the demo trader's own room

   Everything about YOUR trading in one full-width space, graded the way
   real journals grade: equity and day P/L up top, then the numbers that
   matter (win rate, profit factor, expectancy in R, drawdown, streaks),
   the equity curve big enough to read, the open book, the working orders,
   a journal you can write on, per-market results, and the risk guard —
   a daily loss limit run the way funded desks run one.

   Tools here are browser-local (the position calculator computes, nothing
   transmits) — a manner borrowed from the Trader Agent.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var Desk = MC.desk = {};

  var NOTES_KEY = 'mc_journal';
  var built = false;
  var journalFilter = '';

  /* ----------------------------------------------------------------------
     JOURNAL NOTES — keyed by the trade's close timestamp
     ---------------------------------------------------------------------- */
  function notes() {
    try { return JSON.parse(MC.store.get(NOTES_KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  /** Rows written before ids existed are still keyed by their close time. */
  function noteKey(trade) { return trade.id || trade.closedAt; }

  function saveNote(key, text) {
    var n = notes();
    if (text && text.trim()) n[key] = text.trim().slice(0, 400);
    else delete n[key];
    MC.store.set(NOTES_KEY, JSON.stringify(n));
  }

  /* ----------------------------------------------------------------------
     RENDER PIECES
     ---------------------------------------------------------------------- */
  function fmtR(r) {
    if (r == null) return '–';
    return (r >= 0 ? '+' : '') + r.toFixed(2) + 'R';
  }

  function heroHtml(acct, stats) {
    var guard = MC.trade.guard();
    var blocked = MC.trade.guardBlock();
    var guardCls = !guard.on ? 'off' : blocked ? 'hit' : 'ok';
    var guardLabel = !guard.on ? 'GUARD OFF' : blocked ? 'LIMIT HIT' : 'GUARD ON';
    return '<div class="dk-hero">' +
      '<div class="dk-hero-cell main"><b>Equity</b><span class="mono">' + MC.fmtMoney(acct.equity) + '</span>' +
        '<small>started ' + MC.fmtMoney(acct.start) + '</small></div>' +
      '<div class="dk-hero-cell"><b>Today</b><span class="mono ' + (acct.dayRealized > 0 ? 'up' : acct.dayRealized < 0 ? 'down' : '') + '">' +
        (acct.dayRealized >= 0 ? '+' : '') + MC.fmtMoney(acct.dayRealized) + '</span></div>' +
      '<div class="dk-hero-cell"><b>Open P/L</b><span class="mono ' + (acct.open > 0 ? 'up' : acct.open < 0 ? 'down' : '') + '">' +
        (acct.open >= 0 ? '+' : '') + MC.fmtMoney(acct.open) + '</span></div>' +
      '<div class="dk-hero-cell"><b>Buying power</b><span class="mono">' + MC.fmtMoney(acct.buyingPower) + '</span></div>' +
      '<span class="dk-guard ' + guardCls + '" id="dkGuardPill" role="button" tabindex="0" ' +
        'data-tip="The risk guard" data-tip-desc="' + (guard.on
          ? 'Daily loss limit ' + MC.fmtMoney(guard.limit) + '. Hit it and new entries are refused until tomorrow — closing positions always stays allowed. Click to adjust.'
          : 'No daily loss limit set. Funded desks always run one. Click to set yours.') + '">' +
        '<i class="fa-solid fa-shield-halved"></i> ' + guardLabel + '</span>' +
    '</div>';
  }

  function tilesHtml(stats) {
    function tile(label, value, tip, cls) {
      return '<div class="dk-tile' + (cls ? ' ' + cls : '') + '" data-tip="' + MC.esc(tip) + '">' +
        '<b>' + label + '</b><span class="mono">' + value + '</span></div>';
    }
    var pf = stats.profitFactor === Infinity ? '∞'
           : stats.profitFactor == null ? '–' : stats.profitFactor.toFixed(2);
    return '<div class="dk-tiles">' +
      tile('Win rate', stats.winRate == null ? '–' : stats.winRate + '%',
           'Winning trades over all closed trades. Fine to be under 50% when winners outsize losers.') +
      tile('Profit factor', pf,
           'Gross wins divided by gross losses. Above 1 the book makes money; serious journals want 1.5+.',
           stats.profitFactor != null && stats.profitFactor !== Infinity ? (stats.profitFactor >= 1 ? 'good' : 'bad') : '') +
      tile('Expectancy', fmtR(stats.expectancyR),
           'Average R per trade — profit measured in units of what was risked at the stop. The single most honest number in trading. Only trades that had a stop count (' + stats.rCoverage + '% of yours did).',
           stats.expectancyR != null ? (stats.expectancyR >= 0 ? 'good' : 'bad') : '') +
      tile('Avg win / loss', (stats.avgWin ? MC.fmtMoney(stats.avgWin) : '–') + ' / ' +
           (stats.avgLoss ? MC.fmtMoney(stats.avgLoss) : '–'),
           'The size of a typical winner against a typical loser.') +
      tile('Max drawdown', stats.maxDrawdownPct ? stats.maxDrawdownPct + '%' : '–',
           'The deepest peak-to-valley dip in your recorded equity curve. Pros read this before any return number.') +
      tile('Trades', String(stats.trades),
           'Closed trades in the ledger.') +
      tile('Streaks', stats.bestStreak + 'W / ' + stats.worstStreak + 'L',
           'Longest winning and losing runs. Losing streaks happen to everyone — surviving them is the skill.') +
    '</div>';
  }

  function positionsHtml() {
    var open = MC.State.positions || [];
    var rows = open.map(function (p) {
      var a = MC.MAP[p.sym];
      if (!a) return '';
      var dir = p.side === 'buy' ? 1 : -1;
      var pl = (a.p - p.entry) * p.qty * dir;
      var plPct = ((a.p - p.entry) / p.entry) * 100 * dir;
      var cls = pl >= 0 ? 'up' : 'down';
      var rNow = p.sl ? pl / (Math.abs(p.entry - p.sl) * p.qty) : null;
      return '<tr>' +
        '<td><b>' + p.sym + '</b> <span class="pos-side ' + (p.side === 'buy' ? 'b' : 's') + '">' + p.side.toUpperCase() + '</span></td>' +
        '<td class="mono">' + p.qty + '</td>' +
        '<td class="mono">' + MC.fmtPx(p.entry, a.d) + '</td>' +
        '<td class="mono">' + MC.fmtPx(a.p, a.d) + '</td>' +
        '<td class="mono ' + cls + '">' + MC.fmtMoney(pl) + '</td>' +
        '<td class="mono ' + cls + '">' + MC.fmtPct(plPct) + '</td>' +
        '<td class="mono">' + (rNow == null ? '–' : fmtR(rNow)) + '</td>' +
        '<td class="mono dk-dim">' + (p.sl ? MC.fmtPx(p.sl, a.d) : '—') + ' / ' + (p.tp ? MC.fmtPx(p.tp, a.d) : '—') + '</td>' +
        '<td><button class="qbtn" data-close-pos="' + p.id + '"><i class="fa-solid fa-xmark"></i></button></td>' +
      '</tr>';
    }).join('');

    return '<div class="dk-sec-head"><i class="fa-solid fa-layer-group"></i> Open book <span class="pill">' + open.length + '</span>' +
      '<button class="qbtn dk-flat" id="dkFlatten" data-tip="Close everything at market" data-tip-desc="The panic button every real desk has. All open positions close at the current price, wins and losses alike.">' +
      '<i class="fa-solid fa-hand"></i> Flatten all</button></div>' +
      (open.length
        ? '<div class="dk-scroll"><table class="dk-table"><thead><tr>' +
          '<th>Market</th><th>Qty</th><th>Entry</th><th>Last</th><th>P/L $</th><th>P/L %</th>' +
          '<th data-tip="Open profit in R" data-tip-desc="Current profit measured against what the stop risks. +2R means you are up twice what you agreed to lose.">R now</th>' +
          '<th>Stop / Target</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="dk-empty">Flat. The Trade tab (or Quick BUY) opens a position — it lands here live.</div>');
  }

  function ordersHtml() {
    var pend = MC.trade.pending();
    if (!pend.length) return '';
    var rows = pend.map(function (o) {
      var a = MC.MAP[o.sym];
      var d = a ? a.d : 2;
      return '<tr>' +
        '<td><b>' + o.sym + '</b> <span class="pos-side ' + (o.side === 'buy' ? 'b' : 's') + '">' + o.side.toUpperCase() + '</span></td>' +
        '<td>' + MC.trade.typeLabel(o.type) + (o.armed ? ' · armed' : '') + '</td>' +
        '<td class="mono">' + o.qty + '</td>' +
        '<td class="mono">' + (o.trig ? MC.fmtPx(o.trig, d) : '—') + '</td>' +
        '<td class="mono">' + (o.price ? MC.fmtPx(o.price, d) : '—') + '</td>' +
        '<td><button class="qbtn" data-cancel-ord="' + o.id + '"><i class="fa-solid fa-xmark"></i></button></td>' +
      '</tr>';
    }).join('');
    return '<div class="dk-sec-head"><i class="fa-solid fa-hourglass-half"></i> Working orders <span class="pill">' + pend.length + '</span></div>' +
      '<div class="dk-scroll"><table class="dk-table"><thead><tr>' +
      '<th>Market</th><th>Type</th><th>Qty</th><th>Trigger</th><th>Price</th><th></th></tr></thead><tbody>' +
      rows + '</tbody></table></div>';
  }

  function journalHtml() {
    var hist = MC.trade.history();
    var n = notes();
    var q = journalFilter.trim().toLowerCase();
    var shown = hist.filter(function (t) {
      return !q || t.sym.toLowerCase().indexOf(q) !== -1 || t.side.indexOf(q) !== -1 ||
             (t.reason || '').indexOf(q) !== -1;
    }).slice(0, 60);

    var rows = shown.map(function (t) {
      var a = MC.MAP[t.sym];
      var d = a ? a.d : 2;
      var cls = t.pnl >= 0 ? 'up' : 'down';
      var reason = { target: 'target 🎯', stop: 'stopped', manual: 'manual', flatten: 'flattened' }[t.reason] || t.reason || '';
      var held = t.openedAt && t.closedAt ? Math.round((t.closedAt - t.openedAt) / 60000) : null;
      return '<tr>' +
        '<td class="dk-dim">' + (t.closedAt ? new Date(t.closedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '') + '</td>' +
        '<td><b>' + t.sym + '</b> <span class="pos-side ' + (t.side === 'buy' ? 'b' : 's') + '">' + t.side.toUpperCase() + '</span></td>' +
        '<td class="mono">' + MC.fmtPx(t.entry, d) + ' → ' + MC.fmtPx(t.exit, d) + '</td>' +
        '<td class="mono ' + cls + '">' + MC.fmtMoney(t.pnl) + '</td>' +
        '<td class="mono ' + cls + '">' + fmtR(t.r) + '</td>' +
        '<td class="dk-dim">' + reason + (held != null ? ' · ' + (held < 90 ? held + 'm' : Math.round(held / 60) + 'h') : '') + '</td>' +
        '<td class="dk-note-cell"><input class="dk-note" data-note="' + MC.esc(noteKey(t)) + '" ' +
          'placeholder="why? note it…" value="' + MC.esc(n[noteKey(t)] || '') + '" maxlength="400" /></td>' +
      '</tr>';
    }).join('');

    return '<div class="dk-sec-head"><i class="fa-solid fa-book"></i> Journal <span class="pill">' + hist.length + '</span>' +
      '<input class="input dk-filter" id="dkFilter" placeholder="filter — symbol, buy/sell, stop…" value="' + MC.esc(journalFilter) + '" />' +
      '<button class="qbtn" id="dkCsv"><i class="fa-solid fa-file-csv"></i> CSV</button></div>' +
      (hist.length
        ? '<div class="dk-scroll tall"><table class="dk-table"><thead><tr>' +
          '<th>Closed</th><th>Market</th><th>Entry → Exit</th><th>Net P/L</th>' +
          '<th data-tip="The R-multiple" data-tip-desc="Profit in units of what the stop risked. Trades without a stop have no R — one more reason to always set one.">R</th>' +
          '<th>How</th><th>Note to self</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="dk-empty">No closed trades yet. The journal writes itself as you close them — the notes column is yours.</div>');
  }

  function perSymbolHtml(stats) {
    if (!stats.perSymbol.length) return '';
    var rows = stats.perSymbol.slice(0, 10).map(function (r) {
      return '<tr><td><b>' + r.sym + '</b></td><td class="mono">' + r.trades + '</td>' +
        '<td class="mono">' + Math.round((r.wins / r.trades) * 100) + '%</td>' +
        '<td class="mono ' + (r.pnl >= 0 ? 'up' : 'down') + '">' + MC.fmtMoney(r.pnl) + '</td></tr>';
    }).join('');
    return '<div class="dk-sec-head"><i class="fa-solid fa-ranking-star"></i> By market</div>' +
      '<div class="dk-scroll"><table class="dk-table slim"><thead><tr>' +
      '<th>Market</th><th>Trades</th><th>Win %</th><th>Net P/L</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function toolsHtml() {
    var guard = MC.trade.guard();
    var a = MC.State.asset;
    return '<div class="dk-cols">' +
      '<div class="dk-tool">' +
        '<div class="dk-sec-head"><i class="fa-solid fa-shield-halved"></i> Risk guard</div>' +
        '<p class="dk-p">A daily loss limit, run the way funded desks run one: hit it and new entries are refused until tomorrow. Closing what is open always stays allowed.</p>' +
        '<div class="dk-tool-row">' +
          '<div class="sw' + (guard.on ? ' on' : '') + '" id="dkGuardSw" role="switch" aria-checked="' + guard.on + '"></div>' +
          '<div class="input-wrap dk-inline"><span class="dk-pre">$</span>' +
            '<input class="input mono" id="dkGuardLimit" type="number" min="10" step="10" value="' + guard.limit + '" /></div>' +
          '<span class="dk-dim">per day</span>' +
        '</div>' +
      '</div>' +
      '<div class="dk-tool">' +
        '<div class="dk-sec-head"><i class="fa-solid fa-calculator"></i> Position calculator <span class="dk-local" data-tip="Browser-local" data-tip-desc="Computes in this tab and transmits nothing — the Trader Agent manner.">local</span></div>' +
        '<p class="dk-p">Risk a fixed slice of the account and let the stop distance set the size — never the other way round.</p>' +
        '<div class="dk-tool-row wrap">' +
          '<label>Risk <div class="input-wrap dk-inline"><input class="input mono" id="dkcRisk" type="number" value="1" step="0.25" min="0.1" /><span class="suffix">%</span></div></label>' +
          '<label>Entry <div class="input-wrap dk-inline"><input class="input mono" id="dkcEntry" type="number" step="any" value="' + (a ? a.p.toFixed(a.d) : '') + '" /></div></label>' +
          '<label>Stop <div class="input-wrap dk-inline"><input class="input mono" id="dkcStop" type="number" step="any" placeholder="your exit" /></div></label>' +
        '</div>' +
        '<div class="dk-calc-out" id="dkcOut">Fill in a stop to get the size.</div>' +
      '</div>' +
    '</div>';
  }

  /* ----------------------------------------------------------------------
     EQUITY CURVE — the big one
     ---------------------------------------------------------------------- */
  function drawCurve() {
    var canvas = MC.$('dkCurve');
    if (!canvas) return;
    var snaps;
    try { snaps = JSON.parse(MC.store.get('mc_equity_snaps') || '[]') || []; } catch (e) { snaps = []; }
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 600, h = 120;
    canvas.width = w * dpr; canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (snaps.length < 2) {
      ctx.fillStyle = 'rgba(233,238,245,.3)';
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText('The curve draws itself from real snapshots as you trade — no invented history.', 12, h / 2);
      return;
    }
    var vals = snaps.map(function (s) { return s.eq; });
    var start = MC.trade.config().start;
    var hi = Math.max.apply(null, vals.concat(start)), lo = Math.min.apply(null, vals.concat(start));
    var span = (hi - lo) || 1;
    var X = function (i) { return (i / (vals.length - 1)) * (w - 16) + 8; };
    var Y = function (v) { return h - 10 - ((v - lo) / span) * (h - 24); };
    var up = vals[vals.length - 1] >= start;
    var color = up ? '#26c96a' : '#ff4d5e';

    ctx.beginPath();
    vals.forEach(function (v, i) { i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); });
    ctx.lineTo(X(vals.length - 1), h); ctx.lineTo(X(0), h); ctx.closePath();
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, up ? 'rgba(38,201,106,.22)' : 'rgba(255,77,94,.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fill();

    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(8, Y(start)); ctx.lineTo(w - 8, Y(start));
    ctx.strokeStyle = 'rgba(245,197,24,.45)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    vals.forEach(function (v, i) { i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); });
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
  }

  /* ----------------------------------------------------------------------
     RENDER + WIRING
     ---------------------------------------------------------------------- */
  function paneVisible() {
    var pane = MC.$('dock-desk');
    return pane && pane.classList.contains('on');
  }

  function typingInside() {
    var el = document.activeElement;
    return el && MC.$('dock-desk') && MC.$('dock-desk').contains(el) &&
           /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  }

  Desk.render = function () {
    var host = MC.$('dkRoot');
    if (!host) return;
    if (typingInside()) return;            // never eat a note mid-sentence
    var acct = MC.trade.account();
    var stats = MC.trade.stats();
    host.innerHTML =
      heroHtml(acct, stats) +
      tilesHtml(stats) +
      '<div class="dk-sec-head"><i class="fa-solid fa-chart-line"></i> Equity curve' +
        '<span class="dk-dim" style="font-weight:500">gold dashes = starting cash</span></div>' +
      '<canvas id="dkCurve" class="dk-curve"></canvas>' +
      positionsHtml() +
      ordersHtml() +
      journalHtml() +
      perSymbolHtml(stats) +
      toolsHtml();
    drawCurve();
    runCalc();
  };

  /** Light refresh on the live tick — full render, guarded against typing. */
  var lastTick = 0;
  Desk.tick = function () {
    if (!paneVisible()) return;
    var now = Date.now();
    if (now - lastTick < 2000) return;
    lastTick = now;
    Desk.render();
  };

  function runCalc() {
    var out = MC.$('dkcOut');
    if (!out) return;
    var acct = MC.trade.account();
    var riskPct = parseFloat((MC.$('dkcRisk') || {}).value);
    var entry = parseFloat((MC.$('dkcEntry') || {}).value);
    var stop = parseFloat((MC.$('dkcStop') || {}).value);
    if (!isFinite(riskPct) || !isFinite(entry) || !isFinite(stop) || entry === stop) {
      out.textContent = 'Fill in a stop to get the size.';
      return;
    }
    var riskUsd = acct.equity * (riskPct / 100);
    var qty = riskUsd / Math.abs(entry - stop);
    var notional = qty * entry;
    var fee = notional * 0.0005 * 2;
    out.innerHTML = 'Size <b class="mono">' + (qty >= 100 ? Math.round(qty) : qty.toFixed(4)) + '</b> units' +
      ' · risking <b class="mono">' + MC.fmtMoney(riskUsd) + '</b> (' + riskPct + '% of equity)' +
      ' · order value <span class="mono">' + MC.fmtMoney(notional) + '</span>' +
      ' · round-trip fees ≈ <span class="mono">' + MC.fmtMoney(fee) + '</span>' +
      (notional > acct.buyingPower ? ' · <b class="down">exceeds buying power</b>' : '');
  }

  Desk.ensure = function () {
    if (!built) { built = true; wire(); }
    Desk.render();
  };

  function wire() {
    var pane = MC.$('dock-desk');

    MC.on(pane, 'click', '[data-close-pos]', function (e, btn) {
      MC.trade.close(btn.getAttribute('data-close-pos'));
      Desk.render();
    });
    MC.on(pane, 'click', '[data-cancel-ord]', function (e, btn) {
      MC.trade.cancelOrder(btn.getAttribute('data-cancel-ord'));
      Desk.render();
    });
    MC.on(pane, 'click', '#dkFlatten', function () {
      MC.trade.flattenAll();
      Desk.render();
    });
    MC.on(pane, 'click', '#dkCsv', function () { MC.trade.exportCsv(); });

    MC.on(pane, 'change', '.dk-note', function (e, input) {
      saveNote(input.dataset.note, input.value);
      MC.ui.toast('Noted 📓', 'Saved to your journal' + (MC.cloud && MC.cloud.user() ? ' — and to the cloud.' : '.'), 'info');
    });
    MC.on(pane, 'input', '#dkFilter', function (e, input) {
      journalFilter = input.value;
      // re-render only the journal body on next frame — the input keeps focus
      clearTimeout(wire._t);
      wire._t = setTimeout(function () {
        var el = document.activeElement;
        var pos = el && el.id === 'dkFilter' ? el.selectionStart : null;
        Desk.renderForce();
        var fresh = MC.$('dkFilter');
        if (fresh && pos != null) { fresh.focus(); fresh.setSelectionRange(pos, pos); }
      }, 260);
    });

    MC.on(pane, 'click', '#dkGuardSw', function (e, sw) {
      var g = MC.trade.guard();
      g.on = !g.on;
      MC.trade.saveGuard(g);
      sw.classList.toggle('on', g.on);
      MC.ui.toast(g.on ? 'Risk guard armed 🛡️' : 'Risk guard off',
        g.on ? 'New entries stop for the day if losses reach ' + MC.fmtMoney(g.limit) + '.'
             : 'No daily limit. The discipline is all yours now.', g.on ? 'gold' : 'info');
      Desk.renderForce();
    });
    MC.on(pane, 'change', '#dkGuardLimit', function (e, input) {
      var g = MC.trade.guard();
      var v = parseFloat(input.value);
      if (isFinite(v) && v > 0) {
        g.limit = Math.round(v);
        MC.trade.saveGuard(g);
        MC.ui.toast('Limit set', 'The guard trips at -' + MC.fmtMoney(g.limit) + ' on the day.', 'ok');
      }
    });
    MC.on(pane, 'click', '#dkGuardPill', function () {
      var el = MC.$('dkGuardLimit');
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
    });

    ['dkcRisk', 'dkcEntry', 'dkcStop'].forEach(function () { /* delegated below */ });
    MC.on(pane, 'input', '#dkcRisk, #dkcEntry, #dkcStop', function () { runCalc(); });

    window.addEventListener('resize', MC.debounce(function () {
      if (paneVisible()) drawCurve();
    }, 200));
  }

  /** Render even while an input has focus (used right after deliberate UI acts). */
  Desk.renderForce = function () {
    var host = MC.$('dkRoot');
    if (!host) return;
    var acct = MC.trade.account();
    var stats = MC.trade.stats();
    host.innerHTML = heroHtml(acct, stats) + tilesHtml(stats) +
      '<div class="dk-sec-head"><i class="fa-solid fa-chart-line"></i> Equity curve' +
      '<span class="dk-dim" style="font-weight:500">gold dashes = starting cash</span></div>' +
      '<canvas id="dkCurve" class="dk-curve"></canvas>' +
      positionsHtml() + ordersHtml() + journalHtml() + perSymbolHtml(stats) + toolsHtml();
    drawCurve();
    runCalc();
  };

})(window);
