/* ==========================================================================
   indicator-ui.js — the indicator library screen and the builder screen
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var UI = MC.indicatorUI = {};
  var $ = MC.$, $$ = MC.$$;

  var query = '';

  /* ======================================================================
     ACTIVE INDICATOR LIST
     ====================================================================== */
  function active() { return MC.State.activeIndicators; }

  function isOn(id) {
    return active().some(function (a) { return a.id === id; });
  }

  UI.add = function (id) {
    var def = MC.registry.get(id);
    if (!def) return;
    active().push({
      uid: id + '_' + Math.random().toString(36).slice(2, 6),
      id: id,
      params: MC.registry.defaults(def)
    });
    UI.persist();
    MC.applyIndicators();
    UI.render();
    MC.ui.toast('Added', def.name + ' is on the chart.', 'ok');
  };

  UI.removeUid = function (uid) {
    var entry = active().filter(function (a) { return a.uid === uid; })[0];
    MC.State.activeIndicators = active().filter(function (a) { return a.uid !== uid; });
    if (MC.panes.has(uid)) MC.panes.remove(uid);
    UI.persist();
    MC.applyIndicators();
    UI.render();
    if (entry) {
      var def = MC.registry.get(entry.id);
      MC.ui.toast('Removed', (def ? def.name : 'Indicator') + ' taken off the chart.', 'info');
    }
  };

  UI.removeById = function (id) {
    active().filter(function (a) { return a.id === id; })
            .forEach(function (a) { UI.removeUid(a.uid); });
  };

  UI.clearAll = function () {
    active().slice().forEach(function (a) {
      if (MC.panes.has(a.uid)) MC.panes.remove(a.uid);
    });
    MC.State.activeIndicators = [];
    UI.persist();
    MC.applyIndicators();
    UI.render();
    MC.ui.toast('Chart cleared', 'All indicators removed.', 'info');
  };

  UI.setParam = function (uid, key, value) {
    active().forEach(function (a) {
      if (a.uid === uid) a.params[key] = value;
    });
    UI.persist();
    MC.applyIndicators();
    UI.render();
  };

  /* ---- persistence so a reload keeps the same setup ---- */
  UI.persist = function () {
    MC.store.set('mc_indicators', JSON.stringify(active().map(function (a) {
      return { id: a.id, params: a.params };
    })));
  };

  UI.restore = function () {
    var saved;
    try { saved = JSON.parse(MC.store.get('mc_indicators') || '[]'); }
    catch (e) { saved = []; }
    if (!Array.isArray(saved)) saved = [];

    MC.State.activeIndicators = saved
      .filter(function (s) { return MC.registry.get(s.id); })
      .map(function (s) {
        var def = MC.registry.get(s.id);
        return {
          uid: s.id + '_' + Math.random().toString(36).slice(2, 6),
          id: s.id,
          params: Object.assign(MC.registry.defaults(def), s.params || {})
        };
      });
  };

  /* ======================================================================
     RENDER
     ====================================================================== */
  UI.render = function () {
    renderActive();
    renderLibrary();
  };

  function renderActive() {
    var box = $('indActive');
    var list = active();

    if (!list.length) {
      box.innerHTML = '<div class="lib-empty">Nothing on the chart yet — pick something below, ' +
                      'or build your own.</div>';
      return;
    }

    box.innerHTML = '<div class="lib-active-t">On the chart · ' + list.length + '</div>' +
      list.map(function (a) {
        var def = MC.registry.get(a.id);
        if (!def) return '';
        var params = (def.params || []).map(function (p) {
          return '<label class="ip"><span>' + p.label + '</span>' +
            '<input type="number" step="' + (p.step || 1) + '" value="' + a.params[p.k] + '" ' +
            'data-uid="' + a.uid + '" data-key="' + p.k + '"></label>';
        }).join('');

        return '<div class="lib-chip">' +
          '<span class="lib-chip-dot" style="background:' + swatch(def) + '"></span>' +
          '<span class="lib-chip-n">' + MC.esc(def.name) + '</span>' +
          params +
          '<button class="lib-chip-x" data-remove="' + a.uid + '" aria-label="Remove">' +
            '<i class="fa-solid fa-xmark"></i></button>' +
        '</div>';
      }).join('');
  }

  function swatch(def) {
    try {
      var spec = def.calc(MC.State.bars.slice(0, 60), MC.registry.defaults(def));
      return spec.plots[0].color;
    } catch (e) { return MC.registry.colors.grey; }
  }

  function renderLibrary() {
    var box = $('indList');
    var q = query.trim().toLowerCase();
    var all = MC.registry.all().filter(function (d) {
      return !q || d.name.toLowerCase().indexOf(q) !== -1 ||
             d.group.toLowerCase().indexOf(q) !== -1 ||
             d.desc.toLowerCase().indexOf(q) !== -1;
    });

    if (!all.length) {
      box.innerHTML = '<div class="lib-empty">Nothing matches "' + MC.esc(query) + '".</div>';
      return;
    }

    var groups = {};
    all.forEach(function (d) { (groups[d.group] = groups[d.group] || []).push(d); });

    box.innerHTML = Object.keys(groups).map(function (g) {
      return '<div class="lib-group">' + MC.esc(g) + '</div>' +
        groups[g].map(function (d) {
          var on = isOn(d.id);
          return '<div class="lib-row' + (on ? ' on' : '') + '" data-add="' + d.id + '">' +
            '<div class="lib-row-main">' +
              '<div class="lib-row-n">' + MC.esc(d.name) +
                (d.custom ? ' <span class="lib-tag">yours</span>' : '') +
                (d.pane === 'sub' ? ' <span class="lib-tag alt">own panel</span>' : '') +
              '</div>' +
              '<div class="lib-row-d">' + MC.esc(d.desc) + '</div>' +
            '</div>' +
            (d.custom ? '<button class="lib-del" data-delcustom="' + d.id + '" aria-label="Delete">' +
                        '<i class="fa-solid fa-trash"></i></button>' : '') +
            '<span class="lib-row-btn">' + (on ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-plus"></i>') + '</span>' +
          '</div>';
        }).join('');
    }).join('');
  }

  /* ======================================================================
     LIBRARY EVENTS
     ====================================================================== */
  UI.init = function () {
    $('indSearch').addEventListener('input', function (e) {
      query = e.target.value;
      renderLibrary();
    });

    MC.on($('indList'), 'click', '[data-add]', function (e, row) {
      if (e.target.closest('[data-delcustom]')) return;
      var id = row.dataset.add;
      isOn(id) ? UI.removeById(id) : UI.add(id);
    });

    MC.on($('indList'), 'click', '[data-delcustom]', function (e, btn) {
      e.stopPropagation();
      var id = btn.getAttribute('data-delcustom');
      UI.removeById(id);
      MC.builder.remove(id);
      UI.render();
      MC.ui.toast('Deleted', 'Your indicator has been removed.', 'info');
    });

    MC.on($('indActive'), 'click', '[data-remove]', function (e, btn) {
      UI.removeUid(btn.getAttribute('data-remove'));
    });

    MC.on($('indActive'), 'change', 'input[data-uid]', function (e, input) {
      var v = parseFloat(input.value);
      if (isFinite(v)) UI.setParam(input.dataset.uid, input.dataset.key, v);
    });

    $('indClearAll').addEventListener('click', UI.clearAll);
    $('btnNewIndicator').addEventListener('click', function () {
      MC.ui.closeModals();
      Builder.open();
    });

    Builder.init();
  };

  /* ======================================================================
     BUILDER
     ====================================================================== */
  var Builder = {
    mode: 'guided',

    init: function () {
      // recipe dropdown
      $('bRecipe').innerHTML = MC.builder.RECIPES.map(function (r) {
        return '<option value="' + r.id + '">' + r.name + '</option>';
      }).join('');

      // source dropdown
      $('bSource').innerHTML = Object.keys(MC.ind.SOURCE_LABELS).map(function (k) {
        return '<option value="' + k + '"' + (k === 'close' ? ' selected' : '') + '>' +
               MC.ind.SOURCE_LABELS[k] + '</option>';
      }).join('');

      // quick-insert chips for formula mode
      $('bChipsSrc').innerHTML = ['close', 'open', 'high', 'low', 'volume', 'hl2', 'hlc3', 'ohlc4']
        .map(chip).join('');
      $('bChipsFn').innerHTML = ['sma(close,20)', 'ema(close,12)', 'wma(close,20)', 'hma(close,21)',
        'rsi(close,14)', 'stdev(close,20)', 'roc(close,12)', 'mom(close,10)', 'atr(14)', 'cci(20)',
        'obv()', 'vwap()', 'abs(close)', 'max(high,low)', 'min(high,low)'].map(chip).join('');
      $('bChipsEx').innerHTML = [
        'ema(close,12) - ema(close,26)',
        '(close - sma(close,20)) / sma(close,20) * 100',
        'sma(rsi(close,14),5)',
        'stdev(close,20) / close * 100'
      ].map(chip).join('');

      MC.on($('mdBuild'), 'click', '.chip-ins', function (e, el) {
        var box = $('bFormula');
        var text = el.textContent;
        var start = box.selectionStart || box.value.length;
        box.value = box.value.slice(0, start) + text + box.value.slice(box.selectionEnd || start);
        box.focus();
        box.selectionStart = box.selectionEnd = start + text.length;
        Builder.check(true);
      });

      $$('.build-tab').forEach(function (t) {
        t.addEventListener('click', function () {
          Builder.mode = t.dataset.build;
          $$('.build-tab').forEach(function (x) { x.classList.toggle('on', x === t); });
          $$('.build-pane').forEach(function (p) {
            p.classList.toggle('on', p.id === 'build-' + Builder.mode);
          });
          Builder.check(true);
        });
      });

      $('bRecipe').addEventListener('change', Builder.syncRecipe);
      ['bMaType', 'bSource', 'bPeriodA', 'bPeriodB'].forEach(function (id) {
        $(id).addEventListener('input', function () { Builder.check(true); });
      });
      $('bFormula').addEventListener('input', MC.debounce(function () { Builder.check(true); }, 400));

      $('bCheck').addEventListener('click', function () { Builder.check(false); });
      $('bSave').addEventListener('click', Builder.save);

      Builder.syncRecipe();
    },

    open: function () {
      $('bName').value = '';
      $('bFormula').value = '';
      $('bStatus').textContent = 'Fill it in and press Check.';
      $('bStatus').className = 'build-status';
      MC.ui.openModal('mdBuild');
      Builder.syncRecipe();
    },

    /** Show only the fields this recipe actually uses. */
    syncRecipe: function () {
      var r = Builder.recipe();
      if (!r) return;
      $('bRecipeHint').textContent = r.hint;
      $('wrapMaType').classList.toggle('hidden', r.fields.indexOf('maType') === -1);
      $('wrapSource').classList.toggle('hidden', r.fields.indexOf('source') === -1);
      $('wrapPeriodA').classList.toggle('hidden', r.fields.indexOf('periodA') === -1);
      $('wrapPeriodB').classList.toggle('hidden', r.fields.indexOf('periodB') === -1);
      $('bPane').value = r.pane || 'main';
      Builder.check(true);
    },

    recipe: function () {
      var id = $('bRecipe').value;
      return MC.builder.RECIPES.filter(function (r) { return r.id === id; })[0];
    },

    /** The formula this screen currently describes, whichever mode is active. */
    formula: function () {
      if (Builder.mode === 'formula') return $('bFormula').value;
      var r = Builder.recipe();
      if (!r) return '';
      return r.build({
        maType: $('bMaType').value,
        source: $('bSource').value,
        periodA: Math.max(1, parseInt($('bPeriodA').value, 10) || 12),
        periodB: Math.max(1, parseInt($('bPeriodB').value, 10) || 26)
      });
    },

    check: function (quiet) {
      var formula = Builder.formula();
      var status = $('bStatus');
      var result = MC.builder.validate(formula, MC.State.bars);

      if (!result.ok) {
        status.textContent = result.error;
        status.className = 'build-status bad';
        clearPreview();
        if (!quiet) MC.ui.toast('That formula will not run', result.error, 'err');
        return null;
      }

      status.innerHTML = '<b>' + MC.esc(formula) + '</b> — looks good. Latest value ' +
                         result.last.toFixed(4) + ' across ' + result.count + ' bars.';
      status.className = 'build-status good';
      drawPreview(MC.builder.evaluate(formula, MC.State.bars));
      if (!quiet) MC.ui.toast('Formula checks out', 'Ready to add to the chart.', 'ok');
      return formula;
    },

    save: function () {
      var formula = Builder.check(true);
      if (!formula) {
        MC.ui.toast('Fix the formula first', $('bStatus').textContent, 'err');
        return;
      }
      var name = ($('bName').value || '').trim();
      if (!name) {
        MC.ui.toast('Give it a name', 'Something you will recognise in the list.', 'err');
        $('bName').focus();
        return;
      }

      var def = MC.builder.save({
        id: MC.builder.nextId(),
        name: name,
        formula: formula,
        pane: $('bPane').value,
        plotType: $('bPlotType').value,
        color: MC.registry.colors.gold,
        zeroLine: $('bPane').value === 'sub'
      });

      MC.ui.closeModals();
      UI.add(def.id);
      MC.ui.openModal('mdInd');
      MC.ui.toast('Indicator created 🎉', '"' + name + '" is on the chart and saved to your library.', 'gold');
    }
  };

  function chip(text) {
    return '<button class="chip-ins">' + MC.esc(text) + '</button>';
  }

  /* ---- tiny sparkline preview inside the builder ---- */
  function clearPreview() {
    var c = $('bCanvas');
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
  }

  function drawPreview(data) {
    var canvas = $('bCanvas');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = 58;
    canvas.width = w * dpr; canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var pts = data.filter(function (x) { return x != null && isFinite(x); });
    if (pts.length < 2) return;

    var hi = Math.max.apply(null, pts), lo = Math.min.apply(null, pts);
    var span = (hi - lo) || 1;
    var i0 = data.length - pts.length;

    ctx.beginPath();
    pts.forEach(function (v, i) {
      var x = (i / (pts.length - 1)) * (w - 2) + 1;
      var y = h - 4 - ((v - lo) / span) * (h - 8);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = MC.registry.colors.gold;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // zero line, when the series straddles it
    if (lo < 0 && hi > 0) {
      var zy = h - 4 - ((0 - lo) / span) * (h - 8);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(138,151,168,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, zy); ctx.lineTo(w, zy); ctx.stroke();
      ctx.setLineDash([]);
    }
    void i0;
  }

  UI.builder = Builder;

})(window);
