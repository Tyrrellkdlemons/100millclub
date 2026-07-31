/* ==========================================================================
   builder.js — "Create an indicator"

   Two ways to build one:
     · Guided   — pick a source and a recipe, fill in the numbers
     · Formula  — write an expression like  ema(close,12) - ema(close,26)

   Formulas are parsed by the small recursive-descent parser below and
   evaluated over the bar arrays. Nothing is ever passed to eval() or the
   Function constructor, so a saved formula can never become running code.

   Values flowing through the parser are either a plain number or an array
   the same length as the bar series; binary operators broadcast between them.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var B = MC.builder = {};
  var I = MC.ind;

  var STORE_KEY = 'mc_custom_indicators';

  /* ======================================================================
     TOKENISER
     ====================================================================== */
  function tokenize(src) {
    var tokens = [], i = 0;
    while (i < src.length) {
      var c = src[i];

      if (/\s/.test(c)) { i++; continue; }

      if (/[0-9.]/.test(c)) {
        var num = '';
        while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++];
        if (isNaN(parseFloat(num))) throw new Error('"' + num + '" is not a number');
        tokens.push({ t: 'num', v: parseFloat(num) });
        continue;
      }

      if (/[a-zA-Z_]/.test(c)) {
        var id = '';
        while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) id += src[i++];
        tokens.push({ t: 'id', v: id.toLowerCase() });
        continue;
      }

      if ('+-*/(),'.indexOf(c) !== -1) { tokens.push({ t: c }); i++; continue; }

      throw new Error('I do not understand the character "' + c + '"');
    }
    return tokens;
  }

  /* ======================================================================
     SERIES HELPERS
     ====================================================================== */
  function isSeries(x) { return Array.isArray(x); }

  /** Apply a binary op element-wise, broadcasting scalars. */
  function combine(a, b, fn) {
    if (!isSeries(a) && !isSeries(b)) return fn(a, b);

    var len = isSeries(a) ? a.length : b.length;
    var out = new Array(len);
    for (var i = 0; i < len; i++) {
      var x = isSeries(a) ? a[i] : a;
      var y = isSeries(b) ? b[i] : b;
      out[i] = (x == null || y == null) ? null : fn(x, y);
    }
    return out;
  }

  function needSeries(v, fnName) {
    if (v === undefined) throw new Error(fnName + '() is missing its inputs — try ' + fnName + '(close, 14)');
    if (!isSeries(v)) throw new Error(fnName + '() needs a price series as its first input, like close or hl2');
    return v;
  }
  function needNumber(v, fnName) {
    if (v === undefined) throw new Error(fnName + '() is missing its period — try ' + fnName + '(close, 14)');
    if (isSeries(v)) throw new Error(fnName + '() needs a plain number for its period, not a price series');
    if (!isFinite(v)) throw new Error(fnName + '() needs a number for its period');
    return Math.max(1, Math.round(v));
  }

  /* ======================================================================
     PARSER  (recursive descent)
     ====================================================================== */
  function parse(tokens, bars) {
    var pos = 0;

    function peek() { return tokens[pos]; }
    function eat(t) {
      var tok = tokens[pos];
      if (!tok || (t && tok.t !== t)) throw new Error('Expected "' + t + '"');
      pos++;
      return tok;
    }

    function expr() {
      var left = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        var op = eat().t;
        var right = term();
        left = combine(left, right, op === '+'
          ? function (a, b) { return a + b; }
          : function (a, b) { return a - b; });
      }
      return left;
    }

    function term() {
      var left = factor();
      while (peek() && (peek().t === '*' || peek().t === '/')) {
        var op = eat().t;
        var right = factor();
        left = combine(left, right, op === '*'
          ? function (a, b) { return a * b; }
          : function (a, b) { return b === 0 ? null : a / b; });
      }
      return left;
    }

    function factor() {
      if (peek() && peek().t === '-') { eat('-'); return combine(0, factor(), function (a, b) { return a - b; }); }
      if (peek() && peek().t === '+') { eat('+'); return factor(); }
      return primary();
    }

    function primary() {
      var tok = peek();
      if (!tok) throw new Error('The formula ends too early');

      if (tok.t === 'num') { eat('num'); return tok.v; }

      if (tok.t === '(') { eat('('); var v = expr(); eat(')'); return v; }

      if (tok.t === 'id') {
        eat('id');
        var name = tok.v;

        // function call?
        if (peek() && peek().t === '(') {
          eat('(');
          var args = [];
          if (peek() && peek().t !== ')') {
            args.push(expr());
            while (peek() && peek().t === ',') { eat(','); args.push(expr()); }
          }
          eat(')');
          return callFn(name, args, bars);
        }

        // bare series name
        if (I.src[name]) return I.src[name](bars);
        throw new Error('"' + name + '" is not something I know. Try close, high, low, open, volume, hl2, hlc3 or ohlc4.');
      }

      throw new Error('Unexpected "' + (tok.v || tok.t) + '"');
    }

    var result = expr();
    if (pos < tokens.length) throw new Error('There is leftover text after the formula');
    return result;
  }

  /** The function vocabulary a formula can use. */
  var FUNCS = {
    sma:   function (a, bars) { return I.sma(needSeries(a[0], 'sma'), needNumber(a[1], 'sma')); },
    ema:   function (a) { return I.ema(needSeries(a[0], 'ema'), needNumber(a[1], 'ema')); },
    wma:   function (a) { return I.wma(needSeries(a[0], 'wma'), needNumber(a[1], 'wma')); },
    hma:   function (a) { return I.hma(needSeries(a[0], 'hma'), needNumber(a[1], 'hma')); },
    rma:   function (a) { return I.rma(needSeries(a[0], 'rma'), needNumber(a[1], 'rma')); },
    rsi:   function (a) { return I.rsi(needSeries(a[0], 'rsi'), needNumber(a[1], 'rsi')); },
    stdev: function (a) { return I.stdev(needSeries(a[0], 'stdev'), needNumber(a[1], 'stdev')); },
    roc:   function (a) { return I.roc(needSeries(a[0], 'roc'), needNumber(a[1], 'roc')); },
    mom:   function (a) { return I.momentum(needSeries(a[0], 'mom'), needNumber(a[1], 'mom')); },
    cci:   function (a, bars) { return I.cci(bars, needNumber(a[0], 'cci')); },
    atr:   function (a, bars) { return I.atr(bars, needNumber(a[0], 'atr')); },
    obv:   function (a, bars) { return I.obv(bars); },
    vwap:  function (a, bars) { return I.vwap(bars); },
    abs:   function (a) { return mapSeries(a[0], Math.abs); },
    max:   function (a) { return combine(a[0], a[1], Math.max); },
    min:   function (a) { return combine(a[0], a[1], Math.min); }
  };

  function mapSeries(v, fn) {
    if (!isSeries(v)) return fn(v);
    return v.map(function (x) { return x == null ? null : fn(x); });
  }

  function callFn(name, args, bars) {
    if (!FUNCS[name]) {
      throw new Error('"' + name + '()" is not a function I know. Available: ' +
                      Object.keys(FUNCS).join(', '));
    }
    return FUNCS[name](args, bars);
  }

  /**
   * Evaluate a formula against a bar series.
   * Always returns an array so it can be plotted.
   */
  B.evaluate = function (formula, bars) {
    var value = parse(tokenize(formula), bars);
    if (!isSeries(value)) {
      // a constant is legal — spread it so it still draws as a flat line
      return bars.map(function () { return value; });
    }
    return value;
  };

  /** Check a formula without plotting it. Returns {ok, error, preview}. */
  B.validate = function (formula, bars) {
    if (!formula || !formula.trim()) return { ok: false, error: 'Write a formula first.' };
    try {
      var data = B.evaluate(formula, bars);
      var last = null, count = 0;
      for (var i = data.length - 1; i >= 0; i--) {
        if (data[i] != null) { if (last == null) last = data[i]; count++; }
      }
      if (!count) return { ok: false, error: 'That formula produces no values — check the periods are not longer than the chart.' };
      return { ok: true, last: last, count: count };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  /* ======================================================================
     GUIDED RECIPES — formula templates for people who would rather not type
     ====================================================================== */
  B.RECIPES = [
    { id: 'ma', name: 'Moving average of a price',
      hint: 'A smoothed line through the price you choose.',
      build: function (o) { return o.maType + '(' + o.source + ',' + o.periodA + ')'; },
      fields: ['maType', 'source', 'periodA'] },

    { id: 'spread', name: 'Fast average minus slow average',
      hint: 'Above zero means the short term is outpacing the long term. This is how MACD works.',
      build: function (o) { return o.maType + '(' + o.source + ',' + o.periodA + ') - ' + o.maType + '(' + o.source + ',' + o.periodB + ')'; },
      fields: ['maType', 'source', 'periodA', 'periodB'], pane: 'sub' },

    { id: 'distance', name: 'Distance from an average, in percent',
      hint: 'How stretched price is from its own average. Useful for spotting overextension.',
      build: function (o) { return '(' + o.source + ' - ' + o.maType + '(' + o.source + ',' + o.periodA + ')) / ' + o.maType + '(' + o.source + ',' + o.periodA + ') * 100'; },
      fields: ['maType', 'source', 'periodA'], pane: 'sub' },

    { id: 'volatility', name: 'Volatility band width',
      hint: 'How wide the market is swinging right now, as a percentage of price.',
      build: function (o) { return 'stdev(' + o.source + ',' + o.periodA + ') / ' + o.source + ' * 100'; },
      fields: ['source', 'periodA'], pane: 'sub' },

    { id: 'smoothrsi', name: 'Smoothed RSI',
      hint: 'RSI with an average run over it, to cut down on false signals.',
      build: function (o) { return o.maType + '(rsi(' + o.source + ',' + o.periodA + '),' + o.periodB + ')'; },
      fields: ['maType', 'source', 'periodA', 'periodB'], pane: 'sub' },

    { id: 'rangepos', name: 'Price versus recent range',
      hint: 'Price relative to its own average true range — a rough "how far is this move" gauge.',
      build: function (o) { return '(' + o.source + ' - sma(' + o.source + ',' + o.periodA + ')) / atr(' + o.periodA + ')'; },
      fields: ['source', 'periodA'], pane: 'sub' }
  ];

  /* ======================================================================
     SAVED CUSTOM INDICATORS
     ====================================================================== */
  function load() {
    try {
      var raw = JSON.parse(MC.store.get(STORE_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }

  function persist(list) {
    MC.store.set(STORE_KEY, JSON.stringify(list));
  }

  B.saved = load;

  B.save = function (def) {
    var list = load();
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === def.id) { idx = i; break; }
    if (idx >= 0) list[idx] = def; else list.push(def);
    persist(list);
    return def;
  };

  B.remove = function (id) {
    persist(load().filter(function (d) { return d.id !== id; }));
  };

  B.nextId = function () {
    return 'custom_' + Math.random().toString(36).slice(2, 8);
  };

  /**
   * Turn the saved definitions into registry-shaped entries so custom
   * indicators behave exactly like the built-in ones everywhere else.
   */
  B.customIndicators = function () {
    return load().map(function (d) {
      return {
        id: d.id,
        name: d.name,
        group: 'My indicators',
        pane: d.pane || 'sub',
        desc: d.desc || ('Your own formula: ' + d.formula),
        formula: d.formula,
        custom: true,
        params: [],
        calc: function (bars) {
          var data;
          try {
            data = B.evaluate(d.formula, bars);
          } catch (e) {
            data = bars.map(function () { return null; });
          }
          return {
            plots: [{
              key: 'v', label: d.name, data: data,
              color: d.color || MC.registry.colors.gold,
              type: d.plotType === 'histogram' ? 'histogram' : 'line',
              lineWidth: 1.8
            }],
            levels: d.zeroLine ? [{ value: 0, color: 'rgba(138,151,168,.4)' }] : []
          };
        }
      };
    });
  };

})(window);
