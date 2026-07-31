/* ==========================================================================
   utils.js — DOM helpers, formatters, deterministic RNG
   Everything hangs off the global `MC` namespace so the modules can be
   plain <script> tags (works over file:// as well as https://).
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};

  /* ---- DOM ------------------------------------------------------------- */
  MC.$ = function (id) { return document.getElementById(id); };
  MC.$$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /** Attach a delegated listener: on(parent, 'click', '.row', handler) */
  MC.on = function (root, type, selector, handler) {
    root.addEventListener(type, function (e) {
      var match = e.target.closest(selector);
      if (match && root.contains(match)) handler.call(match, e, match);
    });
  };

  /* ---- numbers --------------------------------------------------------- */
  MC.clamp = function (v, min, max) { return Math.max(min, Math.min(max, v)); };

  /** Price with the right number of decimals for the instrument. */
  MC.fmtPx = function (value, digits) {
    if (value === null || value === undefined || !isFinite(value)) return '–';
    return Number(value).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  };

  /** $1,234.56 / -$1,234.56 — compacts the decimals above 1,000. */
  MC.fmtMoney = function (value) {
    if (!isFinite(value)) return '–';
    var abs = Math.abs(value);
    var body = abs >= 1000
      ? abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (value < 0 ? '-$' : '$') + body;
  };

  /** 1.2K / 3.4M / 5.6B */
  MC.fmtVol = function (value) {
    if (!isFinite(value)) return '–';
    if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
    if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
    if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
    return String(Math.round(value));
  };

  MC.fmtPct = function (value, decimals) {
    var d = decimals === undefined ? 2 : decimals;
    return (value >= 0 ? '+' : '') + value.toFixed(d) + '%';
  };

  /* ---- dates ----------------------------------------------------------- */
  /** ISO yyyy-mm-dd, optionally offset by N days from today. */
  MC.todayISO = function (dayOffset) {
    var d = new Date();
    d.setDate(d.getDate() + (dayOffset || 0));
    return d.toISOString().slice(0, 10);
  };

  MC.fmtDate = function (unixSeconds) {
    return new Date(unixSeconds * 1000)
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  };

  /* ---- deterministic randomness ---------------------------------------- */
  /**
   * mulberry32 — small, fast, seedable PRNG.
   * Seeding by symbol+timeframe means the same market always redraws the
   * same history instead of reshuffling on every click.
   */
  MC.mulberry32 = function (seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** FNV-1a string hash → 32-bit unsigned int, used as a PRNG seed. */
  MC.hash = function (str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  /* ---- storage (never throws — private mode / quota safe) --------------- */
  MC.store = {
    get: function (key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
    }
  };

  /* ---- misc ------------------------------------------------------------ */
  MC.debounce = function (fn, wait) {
    var timer;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  };

  /** Escape user/content text before dropping it into innerHTML. */
  MC.esc = function (str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

})(window);
