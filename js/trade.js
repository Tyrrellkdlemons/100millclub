/* ==========================================================================
   trade.js — the order ticket and the simulated position book
   Nothing here touches a real broker: fills are instant against the
   simulated feed, and everything lives in memory for the session.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var Trade = MC.trade = {};

  var HISTORY_KEY = 'mc_trade_history';

  /** Closed trades, newest first — the raw material for the Coach's report. */
  Trade.history = function () {
    try {
      var v = JSON.parse(MC.store.get(HISTORY_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  };

  Trade.clearHistory = function () { MC.store.set(HISTORY_KEY, '[]'); };

  var START_BALANCE = 100000;

  /**
   * The demo account, derived — never stored as a mutable number that could
   * drift: balance = starting cash + everything the history says was won or
   * lost, and equity adds what the open positions are worth right now.
   */
  Trade.account = function () {
    var realized = Trade.history().reduce(function (s, t) { return s + t.pnl; }, 0);
    var open = (MC.State.positions || []).reduce(function (s, p) {
      var a = MC.MAP[p.sym];
      if (!a) return s;
      return s + (a.p - p.entry) * p.qty * (p.side === 'buy' ? 1 : -1);
    }, 0);
    return {
      start: START_BALANCE,
      realized: realized,
      open: open,
      balance: START_BALANCE + realized,
      equity: START_BALANCE + realized + open
    };
  };

  /** Wipe the demo back to a fresh $100,000 — positions and history both. */
  Trade.resetDemo = function () {
    MC.State.positions = [];
    Trade.clearHistory();
    Trade.renderPositions();
    Trade.renderAccount();
  };

  /**
   * One-tap test trade: sized so a 2%% stop risks about 1%% of the balance,
   * with the target twice as far. The whole risk lesson in one button.
   */
  Trade.quick = function (side) {
    var asset = MC.State.asset;
    var acct = Trade.account();
    var qty = (acct.balance * 0.01) / (asset.p * 0.02);
    qty = Math.min(qty, acct.balance / asset.p);            // never over 1x notional
    qty = qty >= 100 ? Math.round(qty) : Math.round(qty * 10000) / 10000;
    if (qty <= 0) return;

    var dir = side === 'buy' ? 1 : -1;
    var position = {
      id: 'ORD-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
      sym: MC.State.symbol,
      side: side,
      qty: qty,
      entry: asset.p,
      sl: round(asset.p - dir * asset.p * 0.02, asset.d),
      tp: round(asset.p + dir * asset.p * 0.04, asset.d),
      at: new Date()
    };
    MC.State.positions.unshift(position);
    Trade.renderPositions();
    Trade.renderAccount();
    MC.ui.toast(
      side === 'buy' ? 'Demo buy in ✓' : 'Demo sell in ✓',
      qty + ' ' + position.sym + ' @ ' + MC.fmtPx(asset.p, asset.d) +
      ' · stop and target set, risking about 1% of the account',
      'ok'
    );
  };

  function round(v, d) { return Math.round(v * Math.pow(10, d)) / Math.pow(10, d); }

  /** The balance strip above the ticket. */
  Trade.renderAccount = function () {
    var el = MC.$('acctBar');
    if (!el) return;
    var a = Trade.account();
    MC.$('acctEquity').textContent = MC.fmtMoney(a.equity);
    setPl('acctOpen', a.open);
    setPl('acctClosed', a.realized);
  };

  function setPl(id, v) {
    var el = MC.$(id);
    el.textContent = (v > 0 ? '+' : '') + MC.fmtMoney(v);
    el.className = 'mono ' + (v > 0 ? 'up' : v < 0 ? 'down' : '');
  }

  function recordClose(position, exitPrice, reason) {
    var pctMove = position.entry
      ? ((exitPrice - position.entry) / position.entry) * 100 * (position.side === 'buy' ? 1 : -1)
      : 0;
    if (MC.queez && MC.queezUI) {
      var quip = MC.queez.notePnl(pctMove);
      if (quip) MC.queezUI.remark(quip);
    }
    var direction = position.side === 'buy' ? 1 : -1;
    var pnl = (exitPrice - position.entry) * position.qty * direction;
    var list = Trade.history();
    list.unshift({
      sym: position.sym,
      side: position.side,
      qty: position.qty,
      entry: position.entry,
      exit: exitPrice,
      pnl: Math.round(pnl * 100) / 100,
      pct: position.entry ? Math.round(((exitPrice - position.entry) / position.entry) * direction * 10000) / 100 : 0,
      hadSl: !!position.sl,
      hadTp: !!position.tp,
      openedAt: position.at ? +new Date(position.at) : null,
      closedAt: Date.now(),
      reason: reason
    });
    MC.store.set(HISTORY_KEY, JSON.stringify(list.slice(0, 200)));
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

  /** Recalculate the risk / reward / order value block. */
  Trade.updateSummary = function () {
    var asset = MC.State.asset;
    var qty = parseFloat(MC.$('oQty').value) || 0;
    var isMarket = MC.$('oType').value === 'market';
    var price = isMarket ? asset.p : (parseFloat(MC.$('oPx').value) || asset.p);
    var stop = parseFloat(MC.$('oSl').value);
    var target = parseFloat(MC.$('oTp').value);

    MC.$('sumPx').textContent = MC.fmtPx(price, asset.d);
    MC.$('sumTotal').textContent = MC.fmtMoney(price * qty);

    var riskEl = MC.$('sumRisk');
    riskEl.textContent = isFinite(stop) ? MC.fmtMoney(-Math.abs((price - stop) * qty)) : '–';
    riskEl.className = 'mono ' + (isFinite(stop) ? 'down' : '');

    var rewardEl = MC.$('sumRew');
    rewardEl.textContent = isFinite(target) ? MC.fmtMoney(Math.abs((target - price) * qty)) : '–';
    rewardEl.className = 'mono ' + (isFinite(target) ? 'up' : '');
  };

  /**
   * Fill the ticket as a new position.
   * Validates quantity and price first so bad input gets a clear message
   * rather than a NaN in the book.
   */
  Trade.place = function () {
    var asset = MC.State.asset;
    var qty = parseFloat(MC.$('oQty').value);

    if (!qty || qty <= 0) {
      MC.ui.toast('Check the quantity', 'Enter how many units you want to trade.', 'err');
      MC.$('oQty').focus();
      return;
    }

    var isMarket = MC.$('oType').value === 'market';
    var price = isMarket ? asset.p : parseFloat(MC.$('oPx').value);

    if (!isFinite(price) || price <= 0) {
      MC.ui.toast('Check the price', 'Enter a valid limit price.', 'err');
      MC.$('oPx').focus();
      return;
    }

    var position = {
      id: 'ORD-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
      sym: MC.State.symbol,
      side: MC.State.side,
      qty: qty,
      entry: price,
      sl: parseFloat(MC.$('oSl').value) || null,
      tp: parseFloat(MC.$('oTp').value) || null,
      at: new Date()
    };

    MC.State.positions.unshift(position);
    Trade.renderPositions();

    MC.ui.toast(
      'Order filled ✓',
      MC.State.side.toUpperCase() + ' ' + qty + ' ' + MC.State.symbol +
      ' @ ' + MC.fmtPx(price, asset.d) + '  ·  ' + position.id,
      'ok'
    );
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
    Trade.renderPositions();
    Trade.renderAccount();
    MC.ui.toast(
      'Position closed',
      position.sym + ' · ' + (pnl.value >= 0 ? 'profit ' : 'loss ') + MC.fmtMoney(pnl.value),
      pnl.value >= 0 ? 'ok' : 'err'
    );
  };

})(window);
