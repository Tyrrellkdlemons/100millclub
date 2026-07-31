/* ==========================================================================
   resize.js — drag the panels to whatever size you like

   Three grips:
     · right edge of the watchlist   → drag the left column wider/narrower
     · left edge of the trade panel  → drag the right column
     · top edge of the dock          → drag the dock taller/shorter

   The chart is the hero, so it is protected: every clamp below is written
   so the chart column and the chart's height always stay the largest thing
   on screen. You can make the side panels bigger — you cannot make the
   chart small.

   Double-click any grip to reset that one dimension. Settings has a full
   "Reset layout" too. Everything persists per device.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var R = MC.resize = {};

  var STORE = 'mc_layout';

  /** Hard floors and ceilings. The chart guarantees come from these. */
  var LIMITS = {
    left:  { min: 170, max: 340 },
    right: { min: 270, max: 430 },
    dock:  { min: 96,  max: 560 },
    chart: { min: 280, max: 1400 },   // the plot itself, dragged directly
    chartMinW: 420      // the centre column may never drop below this
  };

  var DEFAULTS = { left: 262, right: 330, dock: 322 };

  function readSaved() {
    try {
      var v = JSON.parse(MC.store.get(STORE) || 'null');
      return v && typeof v === 'object' ? v : {};
    } catch (e) { return {}; }
  }

  function persist(sizes) {
    MC.store.set(STORE, JSON.stringify(sizes));
  }

  var sizes = {};

  /* ----------------------------------------------------------------------
     APPLY
     ---------------------------------------------------------------------- */
  function setVar(name, px) {
    document.documentElement.style.setProperty(name, Math.round(px) + 'px');
  }

  function clearVar(name) {
    document.documentElement.style.removeProperty(name);
  }

  /** Available width for the three columns (app padding + gaps ≈ 40). */
  function appWidth() { return window.innerWidth - 40; }

  /** Clamp a proposed size so the chart column stays the widest thing. */
  function clampLeft(px) {
    var maxByChart = appWidth() - (sizes.right || DEFAULTS.right) - LIMITS.chartMinW;
    return MC.clamp(px, LIMITS.left.min, Math.min(LIMITS.left.max, maxByChart));
  }
  function clampRight(px) {
    var maxByChart = appWidth() - (sizes.left || DEFAULTS.left) - LIMITS.chartMinW;
    return MC.clamp(px, LIMITS.right.min, Math.min(LIMITS.right.max, maxByChart));
  }
  function clampDock(px) {
    // the centre scrolls now, so the dock no longer competes with the chart
    return MC.clamp(px, LIMITS.dock.min, LIMITS.dock.max);
  }
  function clampChart(px) {
    return MC.clamp(px, LIMITS.chart.min, LIMITS.chart.max);
  }

  R.apply = function () {
    if (sizes.left) setVar('--left-w', clampLeft(sizes.left));
    if (sizes.right) setVar('--right-w', clampRight(sizes.right));
    if (sizes.dock) setVar('--dock-h', clampDock(sizes.dock));
    if (sizes.chart) setVar('--chart-h', clampChart(sizes.chart));
  };

  R.reset = function (which) {
    if (!which) {
      sizes = {};
      clearVar('--left-w'); clearVar('--right-w'); clearVar('--dock-h'); clearVar('--chart-h');
    } else {
      delete sizes[which];
      clearVar({ left: '--left-w', right: '--right-w', dock: '--dock-h', chart: '--chart-h' }[which]);
    }
    persist(sizes);
    settle();
  };

  function settle() {
    setTimeout(function () {
      if (MC.State.chart) MC.State.chart.fit();
      if (MC.panes) MC.panes.resize();
    }, 60);
  }

  /* ----------------------------------------------------------------------
     GRIPS
     ---------------------------------------------------------------------- */
  function makeGrip(host, cls, axis, onDrag, onReset) {
    var grip = document.createElement('div');
    grip.className = 'panel-grip ' + cls;
    grip.setAttribute('data-tip', axis === 'x' ? 'Drag to resize · double-click to reset'
                                               : 'Drag to resize the dock · double-click to reset');
    host.appendChild(grip);

    var start = null;

    grip.addEventListener('pointerdown', function (e) {
      // Resizing is a desktop affordance; drawers own the small screens.
      if (window.innerWidth <= 860) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      grip.classList.add('dragging');
      document.body.classList.add('resizing-' + axis);
      start = { x: e.clientX, y: e.clientY };
    });

    grip.addEventListener('pointermove', function (e) {
      if (!start) return;
      onDrag(axis === 'x' ? e.clientX - start.x : e.clientY - start.y);
      start = { x: e.clientX, y: e.clientY };
    });

    function finish(e) {
      if (!start) return;
      start = null;
      try { grip.releasePointerCapture(e.pointerId); } catch (err) {}
      grip.classList.remove('dragging');
      document.body.classList.remove('resizing-' + axis);
      persist(sizes);
      settle();
    }
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', finish);

    grip.addEventListener('dblclick', function () {
      onReset();
      MC.ui.toast('Back to normal', 'That panel is at its standard size again.', 'info');
    });
  }

  function currentVar(name, fallback) {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return isFinite(v) ? v : fallback;
  }

  /* ----------------------------------------------------------------------
     INIT
     ---------------------------------------------------------------------- */
  R.init = function () {
    sizes = readSaved();
    R.apply();

    // watchlist: drag its right edge
    makeGrip(MC.$('leftPanel'), 'grip-right', 'x', function (dx) {
      sizes.left = clampLeft((sizes.left || currentVar('--left-w', DEFAULTS.left)) + dx);
      setVar('--left-w', sizes.left);
    }, function () { R.reset('left'); });

    // trade panel: drag its left edge (moving left = wider, so subtract)
    makeGrip(MC.$('rightPanel'), 'grip-left', 'x', function (dx) {
      sizes.right = clampRight((sizes.right || currentVar('--right-w', DEFAULTS.right)) - dx);
      setVar('--right-w', sizes.right);
    }, function () { R.reset('right'); });

    // dock: drag its top edge (moving up = taller, so subtract)
    makeGrip(MC.$('dock'), 'grip-top', 'y', function (dy) {
      sizes.dock = clampDock((sizes.dock || currentVar('--dock-h', DEFAULTS.dock)) - dy);
      setVar('--dock-h', sizes.dock);
    }, function () { R.reset('dock'); });

    // the chart itself: drag the bottom edge of its card (down = taller)
    makeGrip(MC.$('chartCard'), 'grip-bottom', 'y', function (dy) {
      var current = sizes.chart ||
        document.querySelector('.chart-stack').getBoundingClientRect().height;
      sizes.chart = clampChart(current + dy);
      setVar('--chart-h', sizes.chart);
    }, function () { R.reset('chart'); });

    // window resizes re-run the clamps so the chart guarantee holds
    window.addEventListener('resize', MC.debounce(function () {
      R.apply();
    }, 150));
  };

})(window);
