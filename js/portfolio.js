/* ==========================================================================
   portfolio.js — holdings, cost basis, and profit/loss over time

   The ledger is a list of buys and sells. Everything else is derived from it,
   which keeps the numbers honest: positions, average cost, realised profit
   and unrealised profit all fall out of the same transactions rather than
   being stored separately and drifting apart.

   Cost basis uses the average-cost method — the same one most retail brokers
   report — so selling part of a position leaves the remaining average
   untouched and books the difference as realised.

   The value curve is built from snapshots taken as prices move. Nothing is
   back-filled: a fabricated history would look better and mean nothing.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var P = MC.portfolio = {};

  var TX_KEY = 'mc_portfolio_tx';
  var SNAP_KEY = 'mc_portfolio_snaps';
  var MAX_SNAPS = 600;
  var SNAP_EVERY_MS = 30000;

  var lastSnap = 0;

  /* ----------------------------------------------------------------------
     LEDGER
     ---------------------------------------------------------------------- */
  function read(key, fallback) {
    try {
      var v = JSON.parse(MC.store.get(key) || 'null');
      return Array.isArray(v) ? v : fallback;
    } catch (e) { return fallback; }
  }

  P.transactions = function () { return read(TX_KEY, []); };
  function writeTx(list) { MC.store.set(TX_KEY, JSON.stringify(list)); }

  /**
   * Record a buy or sell.
   * A sell larger than the holding is rejected — silently allowing it would
   * quietly produce a negative position and nonsense averages.
   */
  P.add = function (tx) {
    if (!MC.MAP[tx.sym]) return { error: 'Unknown market.' };
    if (!isFinite(tx.qty) || tx.qty <= 0) return { error: 'Quantity has to be more than zero.' };
    if (!isFinite(tx.price) || tx.price <= 0) return { error: 'Price has to be more than zero.' };

    if (tx.side === 'sell') {
      var held = P.positionFor(tx.sym);
      if (!held || held.qty < tx.qty - 1e-9) {
        return { error: 'You only hold ' + (held ? MC.fmtPx(held.qty, 4) : '0') + ' ' + tx.sym + '.' };
      }
    }

    var list = P.transactions();
    list.push({
      id: 'T' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      sym: tx.sym,
      side: tx.side,
      qty: tx.qty,
      price: tx.price,
      at: tx.at || Date.now(),
      note: tx.note || ''
    });
    list.sort(function (a, b) { return a.at - b.at; });
    writeTx(list);
    return { ok: true };
  };

  P.remove = function (id) {
    writeTx(P.transactions().filter(function (t) { return t.id !== id; }));
  };

  P.clear = function () {
    writeTx([]);
    MC.store.set(SNAP_KEY, '[]');
  };

  /* ----------------------------------------------------------------------
     DERIVED POSITIONS
     ---------------------------------------------------------------------- */

  /**
   * Replay the ledger to get current holdings and realised profit.
   * Returns { positions: {...}, realised: number }.
   */
  P.build = function () {
    var book = {};
    var realised = 0;

    P.transactions().forEach(function (t) {
      var pos = book[t.sym] || (book[t.sym] = { sym: t.sym, qty: 0, avgCost: 0, realised: 0, first: t.at });

      if (t.side === 'buy') {
        var newQty = pos.qty + t.qty;
        // weighted average cost across the old holding and the new lot
        pos.avgCost = newQty ? (pos.avgCost * pos.qty + t.price * t.qty) / newQty : 0;
        pos.qty = newQty;
      } else {
        var gain = (t.price - pos.avgCost) * t.qty;
        pos.realised += gain;
        realised += gain;
        pos.qty -= t.qty;
        if (pos.qty < 1e-9) { pos.qty = 0; pos.avgCost = 0; }
      }
    });

    return { book: book, realised: realised };
  };

  P.positionFor = function (sym) {
    var pos = P.build().book[sym];
    return pos && pos.qty > 0 ? pos : null;
  };

  /** Everything the UI needs, priced at the current market. */
  P.summary = function () {
    var built = P.build();
    var rows = [];
    var marketValue = 0, costBasis = 0, dayChange = 0;

    Object.keys(built.book).forEach(function (sym) {
      var pos = built.book[sym];
      if (pos.qty <= 0) return;

      var asset = MC.MAP[sym];
      if (!asset) return;

      var value = asset.p * pos.qty;
      var cost = pos.avgCost * pos.qty;
      var unrealised = value - cost;

      // yesterday's close implied by today's percentage move
      var prevClose = asset.p / (1 + (asset.chg || 0) / 100);
      var day = (asset.p - prevClose) * pos.qty;

      marketValue += value;
      costBasis += cost;
      dayChange += day;

      rows.push({
        sym: sym,
        name: asset.n,
        market: asset.m,
        digits: asset.d,
        qty: pos.qty,
        avgCost: pos.avgCost,
        price: asset.p,
        value: value,
        cost: cost,
        unrealised: unrealised,
        unrealisedPct: cost ? (unrealised / cost) * 100 : 0,
        realised: pos.realised,
        dayChange: day,
        dayPct: asset.chg || 0,
        isLive: MC.quotes ? MC.quotes.isLive(sym) : false,
        source: asset.liveSource || null
      });
    });

    rows.sort(function (a, b) { return b.value - a.value; });

    var unrealised = marketValue - costBasis;
    return {
      rows: rows,
      marketValue: marketValue,
      costBasis: costBasis,
      unrealised: unrealised,
      unrealisedPct: costBasis ? (unrealised / costBasis) * 100 : 0,
      realised: built.realised,
      total: unrealised + built.realised,
      dayChange: dayChange,
      dayPct: marketValue - dayChange ? (dayChange / (marketValue - dayChange)) * 100 : 0,
      positions: rows.length
    };
  };

  /* ----------------------------------------------------------------------
     VALUE HISTORY
     ---------------------------------------------------------------------- */
  P.snapshots = function () { return read(SNAP_KEY, []); };

  /**
   * Record where the portfolio stands, at most once every SNAP_EVERY_MS.
   * Called from the price tick, so history builds while the tab is open.
   */
  P.snapshot = function (force) {
    var now = Date.now();
    if (!force && now - lastSnap < SNAP_EVERY_MS) return;

    var s = P.summary();
    if (!s.positions) return;

    lastSnap = now;
    var snaps = P.snapshots();
    snaps.push({
      at: now,
      value: round2(s.marketValue),
      cost: round2(s.costBasis),
      pl: round2(s.unrealised + s.realised)
    });

    // keep the file small — drop the oldest once we are over the cap
    if (snaps.length > MAX_SNAPS) snaps = snaps.slice(snaps.length - MAX_SNAPS);
    MC.store.set(SNAP_KEY, JSON.stringify(snaps));
  };

  function round2(n) { return Math.round(n * 100) / 100; }

  /** Change over a window, for the "today / this week" style readouts. */
  P.changeOver = function (ms) {
    var snaps = P.snapshots();
    if (snaps.length < 2) return null;

    var cutoff = Date.now() - ms;
    var start = null;
    for (var i = 0; i < snaps.length; i++) {
      if (snaps[i].at >= cutoff) { start = snaps[i]; break; }
    }
    if (!start) start = snaps[0];

    var end = snaps[snaps.length - 1];
    if (start === end) return null;

    return {
      abs: end.value - start.value,
      pct: start.value ? ((end.value - start.value) / start.value) * 100 : 0,
      from: start.at,
      to: end.at
    };
  };

  /* ----------------------------------------------------------------------
     IMPORT FROM PAPER TRADING
     ---------------------------------------------------------------------- */

  /** Turn the open paper positions into portfolio buys, so nothing is retyped. */
  P.importPaperPositions = function () {
    var open = MC.State.positions || [];
    var added = 0;

    open.forEach(function (p) {
      if (p.side !== 'buy') return;          // the ledger tracks holdings, not shorts
      var r = P.add({ sym: p.sym, side: 'buy', qty: p.qty, price: p.entry, at: p.at ? +new Date(p.at) : Date.now(), note: 'from paper trade ' + p.id });
      if (r.ok) added++;
    });

    return { added: added, skipped: open.length - added };
  };

})(window);
