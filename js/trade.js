/* ==========================================================================
   trade.js — the funded demo account and its broker engine

   A real brokerage in miniature, with none of the money: cash accounting,
   buying power, commissions, slippage, working orders (limit / stop /
   stop-limit) that fill off the live tick, an equity curve built from
   snapshots, and CSV export. Nothing here touches a real broker.

   The account is DERIVED, never stored as a mutable number that could
   drift: balance = starting cash + everything the history says was won or
   lost (net of commissions), and equity adds what the open positions are
   worth right now. Positions and working orders persist across sessions.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var Trade = MC.trade = {};

  var HISTORY_KEY = 'mc_trade_history';
  var POS_KEY     = 'mc_positions';
  var PEND_KEY    = 'mc_pending_orders';
  var CFG_KEY     = 'mc_acct_cfg';
  var SNAP_KEY    = 'mc_equity_snaps';

  var COMMISSION_RATE = 0.0005;   // 0.05% of notional per side — realistic, visible
  var MAX_SLIP = 0.0001;          // market orders slip up to 0.01% against you
  var SNAP_EVERY_MS = 30000;
  var MAX_SNAPS = 600;

  var lastSnap = 0;

  /* ----------------------------------------------------------------------
     CONFIG — the funded account's starting size
     ---------------------------------------------------------------------- */
  Trade.config = function () {
    try {
      var c = JSON.parse(MC.store.get(CFG_KEY) || 'null');
      if (c && isFinite(c.start) && c.start > 0) return c;
    } catch (e) { /* fall through */ }
    // migration: accounts that predate the configurable size were $100k.
    // A returning user may have an empty ledger, so ANY old-build footprint
    // counts as legacy — never silently halve someone's account.
    var legacy = Trade.history().length > 0 ||
                 MC.store.get('mc_tour_done') !== null ||
                 MC.store.get('mc_symbol') !== null ||
                 MC.store.get('mc_order') !== null;
    var cfg = { start: legacy ? 100000 : 50000 };
    MC.store.set(CFG_KEY, JSON.stringify(cfg));
    return cfg;
  };

  /* ----------------------------------------------------------------------
     LEDGERS — history, positions, working orders (all persisted)
     ---------------------------------------------------------------------- */
  function readList(key) {
    try {
      var v = JSON.parse(MC.store.get(key) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  /** Closed trades, newest first — the raw material for the Coach's report. */
  Trade.history = function () { return readList(HISTORY_KEY); };
  Trade.clearHistory = function () { MC.store.set(HISTORY_KEY, '[]'); };

  Trade.pending = function () { return readList(PEND_KEY); };
  function writePending(list) { MC.store.set(PEND_KEY, JSON.stringify(list)); }

  function savePositions() {
    MC.store.set(POS_KEY, JSON.stringify((MC.State.positions || []).map(function (p) {
      return { id: p.id, sym: p.sym, side: p.side, qty: p.qty, entry: p.entry,
               sl: p.sl, tp: p.tp, at: p.at ? +new Date(p.at) : Date.now() };
    })));
  }

  /** Rehydrate positions from the last session. Symbols that no longer exist
      in the asset map are dropped rather than left to NaN the maths. */
  Trade.init = function () {
    var saved = readList(POS_KEY).filter(function (p) { return MC.MAP[p.sym]; });
    if (saved.length && !(MC.State.positions || []).length) {
      MC.State.positions = saved.map(function (p) {
        return { id: p.id, sym: p.sym, side: p.side, qty: p.qty, entry: p.entry,
                 sl: p.sl || null, tp: p.tp || null, at: new Date(p.at) };
      });
    }
    // drop pending orders for vanished symbols too
    var pend = Trade.pending().filter(function (o) { return MC.MAP[o.sym]; });
    writePending(pend);
  };

  /* ----------------------------------------------------------------------
     THE ACCOUNT — derived, with cash discipline
     ---------------------------------------------------------------------- */
  Trade.account = function () {
    var start = Trade.config().start;
    var hist = Trade.history();

    // rows trimmed off the 200-row ledger bank their P/L here, so the
    // balance never jumps when old history is dropped
    var carry = parseFloat(MC.store.get('mc_realized_carry')) || 0;
    var realized = carry + hist.reduce(function (s, t) { return s + t.pnl; }, 0);

    var midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    var dayRealized = hist.reduce(function (s, t) {
      return s + (t.closedAt && t.closedAt >= +midnight ? t.pnl : 0);
    }, 0);

    var open = 0, openNotional = 0;
    (MC.State.positions || []).forEach(function (p) {
      var a = MC.MAP[p.sym];
      if (!a) return;
      open += (a.p - p.entry) * p.qty * (p.side === 'buy' ? 1 : -1);
      openNotional += p.entry * p.qty;
    });

    // working orders reserve their notional so the account cannot promise
    // the same dollar to two orders at once
    var pendingNotional = Trade.pending().reduce(function (s, o) {
      return s + (o.price || o.trig || 0) * o.qty;
    }, 0);

    var balance = start + realized;
    var equity = balance + open;
    return {
      start: start,
      realized: realized,
      dayRealized: dayRealized,
      open: open,
      openNotional: openNotional,
      pendingNotional: pendingNotional,
      balance: balance,
      equity: equity,
      buyingPower: Math.max(0, equity - openNotional - pendingNotional)
    };
  };

  /** Wipe the account back to a chosen starting size — everything goes. */
  Trade.resetDemo = function (amount) {
    var start = isFinite(amount) && amount > 0 ? amount : Trade.config().start;
    MC.store.set(CFG_KEY, JSON.stringify({ start: start }));
    MC.State.positions = [];
    savePositions();
    writePending([]);
    Trade.clearHistory();
    MC.store.set('mc_realized_carry', '0');
    MC.store.set(SNAP_KEY, '[]');
    lastSnap = 0;
    Trade.renderPositions();
    Trade.renderPending();
    Trade.renderAccount();
    Trade.drawEquitySpark();
  };

  /* ----------------------------------------------------------------------
     FILLS — slippage and commissions, so the demo tells the truth
     ---------------------------------------------------------------------- */
  function round(v, d) { return Math.round(v * Math.pow(10, d)) / Math.pow(10, d); }

  /** Market fills land up to 0.01% against you — the spread never sleeps. */
  function slip(price, side, digits) {
    var adverse = side === 'buy' ? 1 : -1;
    return round(price * (1 + adverse * Math.random() * MAX_SLIP), digits);
  }

  function commissionOn(notional) { return Math.round(notional * COMMISSION_RATE * 100) / 100; }

  function openPosition(sym, side, qty, fillPx, sl, tp, sourceLabel) {
    var asset = MC.MAP[sym];
    var position = {
      id: 'ORD-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
      sym: sym,
      side: side,
      qty: qty,
      entry: fillPx,
      sl: sl || null,
      tp: tp || null,
      at: new Date()
    };
    MC.State.positions.unshift(position);
    savePositions();
    Trade.renderPositions();
    Trade.renderAccount();
    MC.ui.toast(
      (sourceLabel || 'Order filled') + ' ✓',
      side.toUpperCase() + ' ' + qty + ' ' + sym + ' @ ' + MC.fmtPx(fillPx, asset.d) +
      ' · fee ' + MC.fmtMoney(commissionOn(fillPx * qty)) + ' · ' + position.id,
      'ok'
    );
    return position;
  }

  /* ----------------------------------------------------------------------
     ONE-TAP TEST TRADE — the whole risk lesson in one button
     ---------------------------------------------------------------------- */
  Trade.quick = function (side) {
    var asset = MC.State.asset;
    var acct = Trade.account();
    var qty = (acct.balance * 0.01) / (asset.p * 0.02);
    qty = Math.min(qty, acct.buyingPower / asset.p);        // never past buying power
    qty = qty >= 100 ? Math.round(qty) : Math.round(qty * 10000) / 10000;
    var cap = acct.buyingPower / asset.p;
    if (qty > cap) qty = Math.floor(cap * 10000) / 10000;   // rounding must not overdraw
    if (qty <= 0) {
      MC.ui.toast('No buying power', 'The account is fully committed. Close something or reset.', 'err');
      return;
    }

    var dir = side === 'buy' ? 1 : -1;
    var px = slip(asset.p, side, asset.d);
    openPosition(MC.State.symbol, side, qty, px,
      round(px - dir * px * 0.02, asset.d),
      round(px + dir * px * 0.04, asset.d),
      side === 'buy' ? 'Demo buy in' : 'Demo sell in');
  };

  /* ----------------------------------------------------------------------
     CLOSES — commissions charged on both sides at close
     ---------------------------------------------------------------------- */
  function recordClose(position, exitPrice, reason) {
    var pctMove = position.entry
      ? ((exitPrice - position.entry) / position.entry) * 100 * (position.side === 'buy' ? 1 : -1)
      : 0;
    if (MC.queez && MC.queezUI) {
      var quip = MC.queez.notePnl(pctMove);
      if (quip) MC.queezUI.remark(quip);
    }
    var direction = position.side === 'buy' ? 1 : -1;
    var gross = (exitPrice - position.entry) * position.qty * direction;
    var commission = commissionOn(position.entry * position.qty) +
                     commissionOn(exitPrice * position.qty);
    var list = Trade.history();
    list.unshift({
      sym: position.sym,
      side: position.side,
      qty: position.qty,
      entry: position.entry,
      exit: exitPrice,
      gross: Math.round(gross * 100) / 100,
      commission: Math.round(commission * 100) / 100,
      pnl: Math.round((gross - commission) * 100) / 100,   // net — what the account feels
      pct: position.entry ? Math.round(((exitPrice - position.entry) / position.entry) * direction * 10000) / 100 : 0,
      hadSl: !!position.sl,
      hadTp: !!position.tp,
      openedAt: position.at ? +new Date(position.at) : null,
      closedAt: Date.now(),
      reason: reason
    });
    if (list.length > 200) {
      // bank the trimmed rows' P/L so the derived balance never moves
      var carry = parseFloat(MC.store.get('mc_realized_carry')) || 0;
      list.slice(200).forEach(function (t) { carry += t.pnl; });
      MC.store.set('mc_realized_carry', String(Math.round(carry * 100) / 100));
      list = list.slice(0, 200);
    }
    MC.store.set(HISTORY_KEY, JSON.stringify(list));
  }

  /* ----------------------------------------------------------------------
     ORDER TICKET
     ---------------------------------------------------------------------- */

  /** Highlight BUY or SELL and restyle the submit button to match. */
  Trade.setSide = function (side) {
    MC.State.side = side;
    MC.$('sideBuy').classList.toggle('on', side === 'buy');
    MC.$('sideSell').classList.toggle('on', side === 'sell');
    MC.$('sideBuy').setAttribute('aria-pressed', side === 'buy');
    MC.$('sideSell').setAttribute('aria-pressed', side === 'sell');
    MC.$('placeBtn').classList.toggle('sell', side === 'sell');
    MC.$('placeTxt').textContent = 'Place ' + side + ' order';
    Trade.updateSummary();
  };

  /** Keep the price box in step with the feed while on a market order. */
  Trade.syncPrice = function () {
    var asset = MC.State.asset;
    if (MC.$('oType').value === 'market') {
      MC.$('oPx').value = asset.p.toFixed(asset.d);
    }
    Trade.updateSummary();
  };

  /** Recalculate the risk / reward / fee / order value block. */
  Trade.updateSummary = function () {
    var asset = MC.State.asset;
    var qty = parseFloat(MC.$('oQty').value) || 0;
    var type = MC.$('oType').value;
    var price = type === 'market' ? asset.p : (parseFloat(MC.$('oPx').value) || asset.p);
    if (type === 'stop') price = parseFloat(MC.$('oTrig').value) || asset.p;
    var stop = parseFloat(MC.$('oSl').value);
    var target = parseFloat(MC.$('oTp').value);

    MC.$('sumPx').textContent = MC.fmtPx(price, asset.d);
    MC.$('sumTotal').textContent = MC.fmtMoney(price * qty);

    var feeEl = MC.$('sumFee');
    if (feeEl) feeEl.textContent = qty > 0 ? MC.fmtMoney(commissionOn(price * qty)) : '–';

    var riskEl = MC.$('sumRisk');
    riskEl.textContent = isFinite(stop) ? MC.fmtMoney(-Math.abs((price - stop) * qty)) : '–';
    riskEl.className = 'mono ' + (isFinite(stop) ? 'down' : '');

    var rewardEl = MC.$('sumRew');
    rewardEl.textContent = isFinite(target) ? MC.fmtMoney(Math.abs((target - price) * qty)) : '–';
    rewardEl.className = 'mono ' + (isFinite(target) ? 'up' : '');
  };

  /**
   * Submit the ticket. Market orders fill now (with slippage and the fee);
   * limit, stop and stop-limit orders join the working book and watch the
   * tick. Buying power is checked up front — the account never promises the
   * same dollar twice.
   */
  Trade.place = function () {
    var asset = MC.State.asset;
    var side = MC.State.side;
    var type = MC.$('oType').value;
    var qty = parseFloat(MC.$('oQty').value);

    if (!qty || qty <= 0) {
      MC.ui.toast('Check the quantity', 'Enter how many units you want to trade.', 'err');
      MC.$('oQty').focus();
      return;
    }

    var limitPx = parseFloat(MC.$('oPx').value);
    var trigPx = parseFloat(MC.$('oTrig') ? MC.$('oTrig').value : NaN);

    if ((type === 'limit' || type === 'stoplimit') && (!isFinite(limitPx) || limitPx <= 0)) {
      MC.ui.toast('Check the price', 'Enter a valid limit price.', 'err');
      MC.$('oPx').focus();
      return;
    }
    if ((type === 'stop' || type === 'stoplimit') && (!isFinite(trigPx) || trigPx <= 0)) {
      MC.ui.toast('Check the trigger', 'A stop order needs the trigger price that wakes it up.', 'err');
      MC.$('oTrig').focus();
      return;
    }
    if (type === 'stop' || type === 'stoplimit') {
      // an entry stop waits for the market to COME to the trigger — a trigger
      // already passed would fire instantly at a price the tape never printed
      var wrongSide = side === 'buy' ? trigPx <= asset.p : trigPx >= asset.p;
      if (wrongSide) {
        MC.ui.toast('Trigger is on the wrong side',
          side === 'buy'
            ? 'A buy stop waits for a breakout ABOVE the market — put the trigger above ' +
              MC.fmtPx(asset.p, asset.d) + '. To buy below the market, that is a limit order.'
            : 'A sell stop waits for a breakdown BELOW the market — put the trigger below ' +
              MC.fmtPx(asset.p, asset.d) + '. To sell above the market, that is a limit order.',
          'err');
        MC.$('oTrig').focus();
        return;
      }
    }

    var intended = type === 'market' ? asset.p : (type === 'stop' ? trigPx : limitPx);
    var acct = Trade.account();
    if (intended * qty > acct.buyingPower + 0.005) {
      MC.ui.toast('Not enough buying power',
        'That order needs ' + MC.fmtMoney(intended * qty) + ' but only ' +
        MC.fmtMoney(acct.buyingPower) + ' is free. Size down, close something, or cancel a working order.', 'err');
      return;
    }

    var sl = parseFloat(MC.$('oSl').value) || null;
    var tp = parseFloat(MC.$('oTp').value) || null;

    if (type === 'market') {
      openPosition(MC.State.symbol, side, qty, slip(asset.p, side, asset.d), sl, tp, 'Order filled');
      return;
    }

    var order = {
      id: 'WRK-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
      sym: MC.State.symbol,
      side: side,
      type: type,                                  // 'limit' | 'stop' | 'stoplimit'
      qty: qty,
      price: type === 'stop' ? null : limitPx,     // the fill-at price
      trig: type === 'limit' ? null : trigPx,      // the wake-up price
      sl: sl, tp: tp,
      armed: false,                                // stop-limit: trigger touched yet?
      at: Date.now()
    };
    var pend = Trade.pending();
    pend.unshift(order);
    writePending(pend);
    Trade.renderPending();
    Trade.renderAccount();
    MC.ui.toast('Working order set ⏳',
      side.toUpperCase() + ' ' + qty + ' ' + order.sym + ' · ' + Trade.typeLabel(type) +
      (order.trig ? ' · trigger ' + MC.fmtPx(order.trig, asset.d) : '') +
      (order.price ? ' · price ' + MC.fmtPx(order.price, asset.d) : '') +
      ' — it watches the tape so you do not have to.', 'ok');
  };

  Trade.typeLabel = function (type) {
    return { limit: 'Limit', stop: 'Stop', stoplimit: 'Stop-limit' }[type] || type;
  };

  /* ----------------------------------------------------------------------
     THE WORKING BOOK — pending orders that fill off the tick
     ---------------------------------------------------------------------- */
  Trade.cancelOrder = function (id) {
    var pend = Trade.pending();
    var order = pend.filter(function (o) { return o.id === id; })[0];
    writePending(pend.filter(function (o) { return o.id !== id; }));
    Trade.renderPending();
    Trade.renderAccount();
    if (order) MC.ui.toast('Order cancelled', order.side.toUpperCase() + ' ' + order.qty + ' ' + order.sym + ' · ' + order.id, 'info');
  };

  /** Called every tick: fire whatever the market just made true. */
  Trade.checkPending = function () {
    var pend = Trade.pending();
    if (!pend.length) return;

    var changed = false, filled = [];

    pend.forEach(function (o) {
      var a = MC.MAP[o.sym];
      if (!a) return;
      var p = a.p;

      // limit legs fill at "my price or better": if the market is already
      // through the limit, the better market price is the honest fill
      if (o.type === 'limit') {
        if (o.side === 'buy' ? p <= o.price : p >= o.price) {
          filled.push({ o: o, px: o.side === 'buy' ? Math.min(p, o.price) : Math.max(p, o.price) });
        }
      } else if (o.type === 'stop') {
        // triggered stops fill where the market IS, not where the trigger was —
        // gaps through the trigger fill at the gapped price like real life
        if (o.side === 'buy' ? p >= o.trig : p <= o.trig) filled.push({ o: o, px: slip(p, o.side, a.d) });
      } else if (o.type === 'stoplimit') {
        if (!o.armed && (o.side === 'buy' ? p >= o.trig : p <= o.trig)) { o.armed = true; changed = true; }
        if (o.armed && (o.side === 'buy' ? p <= o.price : p >= o.price)) {
          filled.push({ o: o, px: o.side === 'buy' ? Math.min(p, o.price) : Math.max(p, o.price) });
        }
      }
    });

    if (filled.length) {
      var ids = filled.map(function (f) { return f.o.id; });
      writePending(pend.filter(function (o) { return ids.indexOf(o.id) < 0; }));
      filled.forEach(function (f) {
        // equity may have moved since placement — re-check the leash at fill
        // time (the order's own reservation is already released above)
        var acct = Trade.account();
        if (f.px * f.o.qty > acct.buyingPower + 0.01) {
          MC.ui.toast('Working order cancelled',
            f.o.side.toUpperCase() + ' ' + f.o.qty + ' ' + f.o.sym + ' would need ' +
            MC.fmtMoney(f.px * f.o.qty) + ' but only ' + MC.fmtMoney(acct.buyingPower) +
            ' is free now — the account moved against it while it waited.', 'err');
          return;
        }
        openPosition(f.o.sym, f.o.side, f.o.qty, f.px, f.o.sl, f.o.tp,
          Trade.typeLabel(f.o.type) + ' order filled');
      });
      Trade.renderPending();
    } else if (changed) {
      writePending(pend);
      Trade.renderPending();
    }
  };

  Trade.renderPending = function () {
    var box = MC.$('pending');
    var title = MC.$('pendTitle');
    if (!box) return;
    var pend = Trade.pending();
    if (title) title.style.display = pend.length ? '' : 'none';
    if (MC.$('pendCount')) MC.$('pendCount').textContent = pend.length;

    box.innerHTML = pend.map(function (o) {
      var a = MC.MAP[o.sym];
      var d = a ? a.d : 2;
      return '<div class="pend">' +
        '<div class="pend-top">' +
          '<span class="pos-sym">' + o.sym +
            ' <span class="pos-side ' + (o.side === 'buy' ? 'b' : 's') + '">' + o.side.toUpperCase() + '</span>' +
            ' <span class="pend-type">' + Trade.typeLabel(o.type) + (o.armed ? ' · armed' : '') + '</span>' +
          '</span>' +
          '<button class="pend-x" data-cancel-ord="' + o.id + '" aria-label="Cancel order">' +
            '<i class="fa-solid fa-xmark"></i> Cancel</button>' +
        '</div>' +
        '<div class="pos-mid">' +
          '<span>' + o.qty + ' units</span>' +
          '<span>' +
            (o.trig ? 'trigger ' + MC.fmtPx(o.trig, d) : '') +
            (o.trig && o.price ? ' · ' : '') +
            (o.price ? 'price ' + MC.fmtPx(o.price, d) : '') +
          '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  };

  /* ----------------------------------------------------------------------
     ACCOUNT STRIP + EQUITY CURVE
     ---------------------------------------------------------------------- */
  Trade.renderAccount = function () {
    var el = MC.$('acctBar');
    if (!el) return;
    var a = Trade.account();
    MC.$('acctEquity').textContent = MC.fmtMoney(a.equity);
    setPl('acctOpen', a.open);
    setPl('acctClosed', a.realized);
    if (MC.$('acctBP')) MC.$('acctBP').textContent = MC.fmtMoney(a.buyingPower);
    if (MC.$('acctDay')) setPl('acctDay', a.dayRealized);
  };

  function setPl(id, v) {
    var el = MC.$(id);
    if (!el) return;
    el.textContent = (v > 0 ? '+' : '') + MC.fmtMoney(v);
    el.className = 'mono ' + (v > 0 ? 'up' : v < 0 ? 'down' : '');
  }

  /** Record where the equity stands, at most twice a minute. Real snapshots
      only — the curve starts when you do, no invented history. */
  Trade.snapshotEquity = function () {
    var now = Date.now();
    if (now - lastSnap < SNAP_EVERY_MS) return;

    var a = Trade.account();
    var snaps = readList(SNAP_KEY);
    var last = snaps[snaps.length - 1];
    // only when something is actually happening — a flat untouched account
    // does not need a heartbeat trace
    var busy = (MC.State.positions || []).length || Trade.pending().length ||
               Math.abs(a.equity - a.start) > 0.009;
    if (!busy) return;
    if (last && Math.abs(last.eq - a.equity) < 0.01) { lastSnap = now; return; }

    lastSnap = now;
    snaps.push({ t: now, eq: Math.round(a.equity * 100) / 100 });
    if (snaps.length > MAX_SNAPS) snaps = snaps.slice(snaps.length - MAX_SNAPS);
    MC.store.set(SNAP_KEY, JSON.stringify(snaps));
    Trade.drawEquitySpark();
  };

  Trade.drawEquitySpark = function () {
    var canvas = MC.$('eqSpark');
    if (!canvas) return;
    var snaps = readList(SNAP_KEY);
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = 150, h = 26;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (snaps.length < 2) {
      ctx.fillStyle = 'rgba(233,238,245,.28)';
      ctx.font = '9px sans-serif';
      ctx.fillText('equity curve builds as you trade', 6, 16);
      return;
    }

    var vals = snaps.map(function (s) { return s.eq; });
    var hi = Math.max.apply(null, vals), lo = Math.min.apply(null, vals);
    var span = (hi - lo) || 1;
    var start = Trade.config().start;
    var up = vals[vals.length - 1] >= start;
    var color = up ? '#26c96a' : '#ff4d5e';

    var X = function (i) { return (i / (vals.length - 1)) * (w - 2) + 1; };
    var Y = function (v) { return h - 2 - ((v - lo) / span) * (h - 4); };

    ctx.beginPath();
    vals.forEach(function (v, i) { i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); });
    ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.stroke();

    // the starting line, so up and down mean something
    if (start >= lo && start <= hi) {
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(1, Y(start)); ctx.lineTo(w - 1, Y(start));
      ctx.strokeStyle = 'rgba(217,174,21,.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  /* ----------------------------------------------------------------------
     CSV EXPORT — take the ledger anywhere
     ---------------------------------------------------------------------- */
  Trade.exportCsv = function () {
    var hist = Trade.history();
    if (!hist.length) {
      MC.ui.toast('Nothing to export', 'Close a trade first — the ledger is empty.', 'info');
      return;
    }
    var rows = [['closed_at', 'symbol', 'side', 'qty', 'entry', 'exit', 'gross_pnl', 'commission', 'net_pnl', 'pct', 'reason']];
    hist.slice().reverse().forEach(function (t) {
      rows.push([
        t.closedAt ? new Date(t.closedAt).toISOString() : '',
        t.sym, t.side, t.qty, t.entry, t.exit,
        t.gross !== undefined ? t.gross : t.pnl,
        t.commission !== undefined ? t.commission : 0,
        t.pnl, t.pct, t.reason || ''
      ]);
    });
    var csv = rows.map(function (r) { return r.join(','); }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'grind-trades.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    MC.ui.toast('Ledger exported', hist.length + ' closed trades in grind-trades.csv.', 'ok');
  };

  /* ----------------------------------------------------------------------
     POSITION BOOK
     ---------------------------------------------------------------------- */

  /** Unrealised profit/loss for a position at the current price. */
  function pnlOf(position) {
    var asset = MC.MAP[position.sym];
    var direction = position.side === 'buy' ? 1 : -1;
    var value = (asset.p - position.entry) * position.qty * direction;
    var percent = ((asset.p - position.entry) / position.entry) * 100 * direction;
    return { value: value, percent: percent };
  }

  Trade.renderPositions = function () {
    var box = MC.$('positions');
    var positions = MC.State.positions;
    MC.$('posCount').textContent = positions.length;

    if (!positions.length) {
      box.innerHTML =
        '<div class="empty"><i class="fa-solid fa-inbox"></i>' +
        'No open positions yet.<br>Place an order to see it here.</div>';
      return;
    }

    box.innerHTML = positions.map(function (p) {
      var asset = MC.MAP[p.sym];
      var pnl = pnlOf(p);
      var dir = pnl.value >= 0 ? 'up' : 'down';

      return '<div class="pos">' +
        '<div class="pos-top">' +
          '<span class="pos-sym">' + p.sym +
            ' <span class="pos-side ' + (p.side === 'buy' ? 'b' : 's') + '">' + p.side.toUpperCase() + '</span>' +
          '</span>' +
          '<span class="pos-pl ' + dir + '" data-pl="' + p.id + '">' + MC.fmtMoney(pnl.value) + '</span>' +
        '</div>' +
        '<div class="pos-mid">' +
          '<span>' + p.qty + ' @ ' + MC.fmtPx(p.entry, asset.d) + '</span>' +
          '<span data-plp="' + p.id + '" class="' + dir + '">' + MC.fmtPct(pnl.percent) + '</span>' +
        '</div>' +
        (p.sl || p.tp
          ? '<div class="pos-mid" style="margin-top:3px">' +
              '<span>Stop ' + (p.sl ? MC.fmtPx(p.sl, asset.d) : '—') + '</span>' +
              '<span>Target ' + (p.tp ? MC.fmtPx(p.tp, asset.d) : '—') + '</span>' +
            '</div>'
          : '') +
        '<button class="pos-close" data-close-pos="' + p.id + '">' +
          '<i class="fa-solid fa-xmark"></i> Close position</button>' +
      '</div>';
    }).join('');
  };

  /** Repaint P/L on every tick and fire any stop loss / take profit. */
  Trade.updatePositions = function () {
    MC.State.positions.slice().forEach(function (p) {
      var asset = MC.MAP[p.sym];
      var pnl = pnlOf(p);
      var dir = pnl.value >= 0 ? 'up' : 'down';

      var valueEl = document.querySelector('[data-pl="' + p.id + '"]');
      if (valueEl) {
        valueEl.textContent = MC.fmtMoney(pnl.value);
        valueEl.className = 'pos-pl ' + dir;
      }
      var pctEl = document.querySelector('[data-plp="' + p.id + '"]');
      if (pctEl) {
        pctEl.textContent = MC.fmtPct(pnl.percent);
        pctEl.className = dir;
      }

      // automatic exits
      if (p.side === 'buy') {
        if (p.tp && asset.p >= p.tp) return autoClose(p, true);
        if (p.sl && asset.p <= p.sl) return autoClose(p, false);
      } else {
        if (p.tp && asset.p <= p.tp) return autoClose(p, true);
        if (p.sl && asset.p >= p.sl) return autoClose(p, false);
      }
    });
  };

  function autoClose(position, hitTarget) {
    var asset = MC.MAP[position.sym];
    recordClose(position, hitTarget ? (position.tp || asset.p) : (position.sl || asset.p),
                hitTarget ? 'target' : 'stop');
    MC.State.positions = MC.State.positions.filter(function (x) { return x.id !== position.id; });
    savePositions();
    Trade.renderPositions();
    Trade.renderAccount();
    MC.ui.toast(
      hitTarget ? 'Take profit hit 🎯' : 'Stop loss hit',
      position.sym + ' ' + position.side.toUpperCase() + ' closed automatically · ' + position.id,
      hitTarget ? 'ok' : 'err'
    );
  }

  /** Manual close from the position card. */
  Trade.close = function (id) {
    var position = MC.State.positions.filter(function (x) { return x.id === id; })[0];
    if (!position) return;
    var pnl = pnlOf(position);
    recordClose(position, MC.MAP[position.sym].p, 'manual');
    MC.State.positions = MC.State.positions.filter(function (x) { return x.id !== id; });
    savePositions();
    Trade.renderPositions();
    Trade.renderAccount();
    MC.ui.toast(
      'Position closed',
      position.sym + ' · ' + (pnl.value >= 0 ? 'profit ' : 'loss ') + MC.fmtMoney(pnl.value),
      pnl.value >= 0 ? 'ok' : 'err'
    );
  };

})(window);
