/* ==========================================================================
   portfolio-ui.js — the Folio tab: holdings, P&L curve, ledger, data sources
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var UI = MC.portfolioUI = {};
  var $ = MC.$;
  var side = 'buy';

  UI.init = function () {
    $('pfSym').innerHTML = MC.ASSETS.map(function (a) {
      return '<option value="' + a.s + '">' + a.s + ' — ' + MC.esc(a.n) + '</option>';
    }).join('');
    $('pfSym').value = MC.State.symbol;
    $('pfDate').value = MC.todayISO(0);

    $('pfBuy').addEventListener('click', function () { setSide('buy'); });
    $('pfSell').addEventListener('click', function () { setSide('sell'); });
    $('pfSym').addEventListener('change', fillPrice);
    $('pfUseLast').addEventListener('click', fillPrice);
    $('pfAdd').addEventListener('click', addTrade);

    $('pfImport').addEventListener('click', function () {
      var r = MC.portfolio.importPaperPositions();
      if (!r.added) {
        MC.ui.toast('Nothing to import', 'Open a paper buy on the Trade tab first.', 'info');
        return;
      }
      MC.portfolio.snapshot(true);
      UI.render();
      MC.ui.toast('Imported', r.added + ' paper position' + (r.added > 1 ? 's' : '') +
                  ' added to your portfolio.', 'ok');
    });

    $('pfReset').addEventListener('click', function () {
      if (!window.confirm('Delete every trade and the whole value history? This cannot be undone.')) return;
      MC.portfolio.clear();
      UI.render();
      MC.ui.toast('Portfolio cleared', 'The ledger is empty again.', 'info');
    });

    MC.on($('pfLedger'), 'click', '[data-txdel]', function (e, btn) {
      MC.portfolio.remove(btn.getAttribute('data-txdel'));
      UI.render();
      MC.ui.toast('Entry removed', 'Your holdings have been recalculated.', 'info');
    });

    initQuoteControls();
    fillPrice();
    UI.render();
  };

  function setSide(s) {
    side = s;
    $('pfBuy').classList.toggle('on', s === 'buy');
    $('pfSell').classList.toggle('on', s === 'sell');
    $('pfBuy').setAttribute('aria-pressed', s === 'buy');
    $('pfSell').setAttribute('aria-pressed', s === 'sell');
  }

  function fillPrice() {
    var a = MC.MAP[$('pfSym').value];
    if (a) $('pfPrice').value = a.p.toFixed(a.d);
  }

  function addTrade() {
    var sym = $('pfSym').value;
    var qty = parseFloat($('pfQty').value);
    var price = parseFloat($('pfPrice').value);
    var at = $('pfDate').value ? new Date($('pfDate').value + 'T12:00:00').getTime() : Date.now();

    var res = MC.portfolio.add({ sym: sym, side: side, qty: qty, price: price, at: at });
    if (res.error) {
      MC.ui.toast('Could not add that', res.error, 'err');
      return;
    }

    $('pfQty').value = '';
    MC.portfolio.snapshot(true);
    UI.render();
    MC.ui.toast(
      side === 'buy' ? 'Purchase recorded' : 'Sale recorded',
      (side === 'buy' ? 'Bought ' : 'Sold ') + qty + ' ' + sym + ' at ' + MC.fmtPx(price, MC.MAP[sym].d),
      'ok'
    );
  }

  /* ======================================================================
     RENDER
     ====================================================================== */
  UI.render = function () {
    var s = MC.portfolio.summary();

    $('pfValue').textContent = MC.fmtMoney(s.marketValue);
    $('pfCount').textContent = s.positions;

    setSigned('pfTotalPL', s.total, MC.fmtMoney);
    setSigned('pfTotalPct', s.unrealisedPct, function (v) { return MC.fmtPct(v); });
    setSigned('pfUnreal', s.unrealised, MC.fmtMoney);
    setSigned('pfReal', s.realised, MC.fmtMoney);
    setSigned('pfDay', s.dayChange, MC.fmtMoney);
    $('pfCost').textContent = MC.fmtMoney(s.costBasis);
    $('pfCost').className = 'mono';

    // how much of the portfolio is priced for real
    var liveRows = s.rows.filter(function (r) { return r.isLive; }).length;
    $('pfLiveTag').textContent = s.positions
      ? (liveRows === s.positions ? 'all live prices'
        : liveRows ? liveRows + ' of ' + s.positions + ' live' : 'demo prices')
      : '';

    renderHoldings(s);
    renderLedger();
    drawCurve();
  };

  function setSigned(id, value, fmt) {
    var el = $(id);
    if (!el) return;
    el.textContent = (value > 0 ? '+' : '') + fmt(value);
    el.className = 'mono ' + (value > 0 ? 'up' : value < 0 ? 'down' : '');
  }

  function renderHoldings(s) {
    var box = $('pfHoldings');
    if (!s.rows.length) {
      box.innerHTML = '<div class="empty"><i class="fa-solid fa-briefcase"></i>' +
        'No holdings yet.<br>Record a trade below, or import your paper trades.</div>';
      return;
    }

    box.innerHTML = s.rows.map(function (r) {
      var dir = r.unrealised >= 0 ? 'up' : 'down';
      var weight = s.marketValue ? (r.value / s.marketValue) * 100 : 0;
      return '<div class="pf-row">' +
        '<div class="pf-top">' +
          '<span class="pf-sym">' + r.sym +
            (r.isLive
              ? '<span class="pf-live" title="Real price from ' + MC.esc(r.source || '') + '">live</span>'
              : '<span class="pf-demo">demo</span>') +
          '</span>' +
          '<span class="pf-val mono">' + MC.fmtMoney(r.value) + '</span>' +
        '</div>' +
        '<div class="pf-mid">' +
          '<span>' + trimQty(r.qty) + ' @ ' + MC.fmtPx(r.avgCost, r.digits) + '</span>' +
          '<span class="' + dir + '">' + (r.unrealised >= 0 ? '+' : '') + MC.fmtMoney(r.unrealised) +
            ' (' + MC.fmtPct(r.unrealisedPct) + ')</span>' +
        '</div>' +
        '<div class="pf-bar"><i style="width:' + Math.min(100, weight).toFixed(1) + '%"></i></div>' +
        '<div class="pf-mid pf-sub">' +
          '<span>now ' + MC.fmtPx(r.price, r.digits) + '</span>' +
          '<span>' + weight.toFixed(1) + '% of folio</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function trimQty(q) {
    return q >= 1 ? (Math.round(q * 10000) / 10000).toLocaleString('en-US') : q.toFixed(6).replace(/0+$/, '');
  }

  function renderLedger() {
    var tx = MC.portfolio.transactions().slice().reverse();
    var box = $('pfLedger');
    if (!tx.length) {
      box.innerHTML = '<div class="empty" style="padding:14px">' +
        '<i class="fa-solid fa-receipt"></i>Nothing recorded yet.</div>';
      return;
    }
    box.innerHTML = tx.slice(0, 30).map(function (t) {
      var a = MC.MAP[t.sym];
      return '<div class="pf-tx">' +
        '<span class="pf-tx-side ' + (t.side === 'buy' ? 'b' : 's') + '">' +
          (t.side === 'buy' ? 'BUY' : 'SELL') + '</span>' +
        '<span class="pf-tx-main">' + t.sym + ' · ' + trimQty(t.qty) +
          ' @ ' + MC.fmtPx(t.price, a ? a.d : 2) + '</span>' +
        '<span class="pf-tx-date">' + new Date(t.at).toLocaleDateString([], { month: 'short', day: 'numeric' }) + '</span>' +
        '<button data-txdel="' + t.id + '" aria-label="Delete"><i class="fa-solid fa-xmark"></i></button>' +
      '</div>';
    }).join('');
  }

  /* ======================================================================
     P&L CURVE
     ====================================================================== */
  function drawCurve() {
    var canvas = $('pfCanvas');
    var snaps = MC.portfolio.snapshots();
    var note = $('pfCurveNote');

    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = 74;
    canvas.width = w * dpr; canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (snaps.length < 2) {
      note.textContent = '— building as prices move';
      ctx.fillStyle = 'rgba(138,151,168,.6)';
      ctx.font = '11px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(
        snaps.length ? 'Recording — the line appears once there are two readings'
                     : 'Add a holding and the curve starts here',
        w / 2, h / 2 + 4
      );
      ctx.textAlign = 'left';
      return;
    }

    var span = snaps[snaps.length - 1].at - snaps[0].at;
    note.textContent = '— ' + describeSpan(span) + ', ' + snaps.length + ' readings';

    var vals = snaps.map(function (s) { return s.pl; });
    var hi = Math.max.apply(null, vals);
    var lo = Math.min.apply(null, vals);
    if (hi === lo) { hi += 1; lo -= 1; }

    var X = function (i) { return (i / (snaps.length - 1)) * (w - 2) + 1; };
    var Y = function (v) { return h - 5 - ((v - lo) / (hi - lo)) * (h - 10); };

    // zero line, when profit and loss both appear
    if (lo < 0 && hi > 0) {
      var zy = Y(0);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(138,151,168,.45)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, zy); ctx.lineTo(w, zy); ctx.stroke();
      ctx.setLineDash([]);
    }

    var up = vals[vals.length - 1] >= 0;
    var trace = function () {
      ctx.beginPath();
      vals.forEach(function (v, i) { i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); });
    };

    trace();
    ctx.lineTo(X(vals.length - 1), h);
    ctx.lineTo(X(0), h);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, up ? 'rgba(38,201,106,.32)' : 'rgba(255,77,94,.32)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fill();

    trace();
    ctx.strokeStyle = up ? '#26c96a' : '#ff4d5e';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  function describeSpan(ms) {
    var mins = Math.round(ms / 60000);
    if (mins < 60) return mins + ' minutes';
    var hours = Math.round(mins / 60);
    if (hours < 48) return hours + ' hours';
    return Math.round(hours / 24) + ' days';
  }

  /* ======================================================================
     PRICE SOURCE CONTROLS
     ====================================================================== */
  function initQuoteControls() {
    var Q = MC.quotes;
    $('qProvider').innerHTML = Q.STOCK_PROVIDERS.map(function (p) {
      return '<option value="' + p.id + '">' + p.name + '</option>';
    }).join('');

    var cfg = Q.config();
    $('qProvider').value = cfg.stockProvider;
    $('qKey').value = cfg.stockKey || '';
    $('qCrypto').classList.toggle('on', cfg.crypto !== false);
    $('qForex').classList.toggle('on', cfg.forex !== false);
    syncProvider();

    $('qProvider').addEventListener('change', function () { syncProvider(); saveQuotes(); });
    $('qKey').addEventListener('change', function () { saveQuotes(); Q.refresh(); });
    $('qCrypto').addEventListener('click', function () { $('qCrypto').classList.toggle('on'); saveQuotes(); Q.refresh(); });
    $('qForex').addEventListener('click', function () { $('qForex').classList.toggle('on'); saveQuotes(); Q.refresh(); });
    $('qRefresh').addEventListener('click', function () {
      MC.ui.toast('Fetching prices…', 'Pulling the latest from your enabled sources.', 'info');
      Q.refresh().then(function () {
        MC.ui.toast('Prices updated', Q.liveCount() + ' markets priced live.', 'ok');
      });
    });

    Q.onUpdate = function () {
      updateQuoteStatus();
      UI.render();
      MC.watchlist.render();
    };
    updateQuoteStatus();
  }

  function syncProvider() {
    var id = $('qProvider').value;
    var p = MC.quotes.STOCK_PROVIDERS.filter(function (x) { return x.id === id; })[0];
    $('qKeyWrap').classList.toggle('hidden', !p.needsKey);
    $('qProviderNote').textContent = p.note;
  }

  function saveQuotes() {
    MC.quotes.saveConfig({
      crypto: $('qCrypto').classList.contains('on'),
      forex: $('qForex').classList.contains('on'),
      stockProvider: $('qProvider').value,
      stockKey: $('qKey').value.trim()
    });
  }

  function updateQuoteStatus() {
    var n = MC.quotes.liveCount();
    var when = MC.quotes.lastRun();
    $('qStatus').textContent = n
      ? n + ' of ' + MC.ASSETS.length + ' markets are on real prices' +
        (when ? ', updated ' + new Date(when).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '') + '.'
      : 'Everything is on the built-in demo feed right now.';
  }

})(window);
