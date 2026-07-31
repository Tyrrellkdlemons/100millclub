/* ==========================================================================
   watchlist.js — the left sidebar: grouping, filtering, search, live prices
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var WL = MC.watchlist = {};
  var ORDER = ['futures', 'stocks', 'crypto', 'forex', 'indices'];

  /** Apply the active market tab and the search box to the full asset list. */
  function visibleAssets() {
    var state = MC.State;
    var q = state.query.trim().toLowerCase();
    return MC.ASSETS.filter(function (a) {
      var marketOk = state.market === 'all' || a.m === state.market;
      var searchOk = !q ||
        a.s.toLowerCase().indexOf(q) !== -1 ||
        a.n.toLowerCase().indexOf(q) !== -1;
      return marketOk && searchOk;
    });
  }

  /** Rebuild the whole list — cheap enough at this size, and keeps it simple. */
  WL.render = function () {
    var box = MC.$('watchlist');
    var list = visibleAssets();
    MC.$('wlCount').textContent = list.length;

    if (!list.length) {
      box.innerHTML =
        '<div class="wl-empty"><i class="fa-solid fa-magnifying-glass"></i>' +
        'Nothing matches “' + MC.esc(MC.State.query) + '”.</div>';
      return;
    }

    var groups = {};
    list.forEach(function (a) {
      (groups[a.m] = groups[a.m] || []).push(a);
    });

    var html = '';
    ORDER.forEach(function (market) {
      if (!groups[market]) return;
      html += '<div class="wl-group">' + MC.MKT_LABEL[market] + '</div>';

      groups[market].forEach(function (a) {
        var dir = a.chg >= 0 ? 'up' : 'down';
        html +=
          '<div class="wl-row' + (a.s === MC.State.symbol ? ' on' : '') + '" data-sym="' + a.s + '" ' +
               'draggable="true" role="button" tabindex="0" ' +
               'data-tip="' + MC.esc(a.n) + '" ' +
               'data-tip-desc="Click to load this market. Drag it up or down to reorder, ' +
                              'or drag it onto the chart or the trade panel.">' +
            '<i class="fa-solid fa-grip-vertical wl-grip"></i>' +
            '<div>' +
              '<div class="wl-sym">' + a.s + '</div>' +
              '<div class="wl-name">' + MC.esc(a.n) + '</div>' +
            '</div>' +
            '<div class="wl-px ' + dir + '" data-px="' + a.s + '">' + MC.fmtPx(a.p, a.d) + '</div>' +
            '<div class="wl-chg ' + dir + '" data-chg="' + a.s + '">' + MC.fmtPct(a.chg) + '</div>' +
          '</div>';
      });
    });

    box.innerHTML = html;
  };

  /**
   * Push one simulated tick into every asset, then repaint just the numbers.
   * Movement is a small fraction of daily volatility so prices drift the way
   * a real feed does instead of jumping around.
   */
  WL.tick = function () {
    MC.ASSETS.forEach(function (a) {
      // Symbols on a real feed are owned by that feed — nudging them would
      // overwrite a genuine quote with noise.
      if (MC.quotes && !MC.quotes.shouldSimulate(a.s)) {
        var el = document.querySelector('[data-px="' + a.s + '"]');
        if (el) {
          el.textContent = MC.fmtPx(a.p, a.d);
          el.className = 'wl-px ' + (a.chg >= 0 ? 'up' : 'down');
        }
        var cg0 = document.querySelector('[data-chg="' + a.s + '"]');
        if (cg0) {
          cg0.textContent = MC.fmtPct(a.chg);
          cg0.className = 'wl-chg ' + (a.chg >= 0 ? 'up' : 'down');
        }
        return;
      }
      var move = (Math.random() - 0.5) * a.v * a.p * 0.16;
      var next = Math.max(a.p + move, a.p * 0.5);
      var rising = next > a.p;

      a.p = next;
      a.base = next;
      a.chg = MC.clamp(a.chg + (move / next) * 100, -14, 14);

      var priceEl = document.querySelector('[data-px="' + a.s + '"]');
      if (!priceEl) return;                       // filtered out of the list

      priceEl.textContent = MC.fmtPx(a.p, a.d);
      priceEl.className = 'wl-px ' + (a.chg >= 0 ? 'up' : 'down') + ' ' + (rising ? 'flash-up' : 'flash-dn');
      setTimeout(function () { priceEl.classList.remove('flash-up', 'flash-dn'); }, 620);

      var chgEl = document.querySelector('[data-chg="' + a.s + '"]');
      if (chgEl) {
        chgEl.textContent = MC.fmtPct(a.chg);
        chgEl.className = 'wl-chg ' + (a.chg >= 0 ? 'up' : 'down');
      }
    });
  };

  /* ----------------------------------------------------------------------
     FALLBACK TICKER TAPE
     Only used when the live TradingView tape cannot load.
     ---------------------------------------------------------------------- */
  WL.buildFallbackTape = function () {
    var track = MC.$('tapeTrack');
    if (!track) return;
    var row = MC.ASSETS.map(function (a) {
      return '<div class="tape-item">' +
        '<b>' + a.s + '</b>' +
        '<span data-tape="' + a.s + '">' + MC.fmtPx(a.p, a.d) + '</span>' +
        '<span data-tapec="' + a.s + '" class="' + (a.chg >= 0 ? 'up' : 'down') + '">' + MC.fmtPct(a.chg) + '</span>' +
      '</div>';
    }).join('');
    track.innerHTML = row + row;      // duplicated so the scroll loops seamlessly
    MC.$('tapeFallback').classList.add('on');
  };

  WL.updateFallbackTape = function () {
    if (!MC.$('tapeFallback') || !MC.$('tapeFallback').classList.contains('on')) return;
    MC.ASSETS.forEach(function (a) {
      MC.$$('[data-tape="' + a.s + '"]').forEach(function (el) {
        el.textContent = MC.fmtPx(a.p, a.d);
      });
      MC.$$('[data-tapec="' + a.s + '"]').forEach(function (el) {
        el.textContent = MC.fmtPct(a.chg);
        el.className = a.chg >= 0 ? 'up' : 'down';
      });
    });
  };

})(window);
