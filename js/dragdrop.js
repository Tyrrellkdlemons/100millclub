/* ==========================================================================
   dragdrop.js — every drag-and-drop mechanism in the dashboard

   1. Drop an image file anywhere on the page  → becomes your logo
   2. Drag a watchlist row onto the chart      → loads that market
   3. Drag a watchlist row onto the trade panel→ loads it into the order ticket
   4. Drag watchlist rows up and down          → reorders your list (remembered)

   Every drop target lights up while you drag, so you never have to guess
   where something can go.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var DD = MC.dragdrop = {};

  var MIME = 'application/x-mc-symbol';
  var dragSymbol = null;      // symbol currently being dragged
  var fileDepth = 0;          // dragenter/dragleave fire per child — count them

  /* ----------------------------------------------------------------------
     1 · IMAGE FILE → LOGO
     ---------------------------------------------------------------------- */

  /** True when the drag carries actual files (not an internal row drag). */
  function isFileDrag(e) {
    if (!e.dataTransfer) return false;
    var types = e.dataTransfer.types;
    if (!types) return false;
    return Array.prototype.indexOf.call(types, 'Files') !== -1;
  }

  function initFileDrop(onImage) {
    var veil = MC.$('fileVeil');

    // The whole window is a drop zone for images — no hunting for a button.
    window.addEventListener('dragenter', function (e) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      fileDepth++;
      veil.classList.add('on');
    });

    window.addEventListener('dragover', function (e) {
      if (!isFileDrag(e)) return;
      e.preventDefault();                       // required or the drop never fires
      e.dataTransfer.dropEffect = 'copy';
    });

    window.addEventListener('dragleave', function (e) {
      if (!isFileDrag(e)) return;
      fileDepth = Math.max(0, fileDepth - 1);
      if (fileDepth === 0) veil.classList.remove('on');
    });

    window.addEventListener('drop', function (e) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      fileDepth = 0;
      veil.classList.remove('on');

      var file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;

      if (file.type.indexOf('image/') !== 0) {
        MC.ui.toast('That is not an image', 'Drop a PNG, JPG, SVG or WebP to use it as your logo.', 'err');
        return;
      }
      onImage(file);
    });

    // Dropping straight onto the logo button highlights it specifically.
    var logo = MC.$('logoBtn');
    logo.addEventListener('dragenter', function (e) {
      if (isFileDrag(e)) logo.classList.add('drop-target');
    });
    logo.addEventListener('dragleave', function () { logo.classList.remove('drop-target'); });
    logo.addEventListener('drop', function () { logo.classList.remove('drop-target'); });
  }

  /* ----------------------------------------------------------------------
     2-4 · WATCHLIST ROW DRAGGING
     ---------------------------------------------------------------------- */

  /** Custom row order, persisted so the list stays how the user arranged it. */
  DD.loadOrder = function () {
    try {
      var saved = JSON.parse(MC.store.get('mc_order') || 'null');
      return Array.isArray(saved) ? saved : null;
    } catch (e) { return null; }
  };

  DD.saveOrder = function () {
    var order = MC.ASSETS.map(function (a) { return a.s; });
    MC.store.set('mc_order', JSON.stringify(order));
  };

  /** Apply a saved order to MC.ASSETS in place, ignoring unknown symbols. */
  DD.applySavedOrder = function () {
    var saved = DD.loadOrder();
    if (!saved) return;
    var rank = {};
    saved.forEach(function (sym, i) { rank[sym] = i; });
    MC.ASSETS.sort(function (a, b) {
      var ra = rank[a.s] === undefined ? 9999 : rank[a.s];
      var rb = rank[b.s] === undefined ? 9999 : rank[b.s];
      return ra - rb;
    });
  };

  /** Move `from` to sit before/after `to` inside MC.ASSETS. */
  function reorder(fromSym, toSym, placeAfter) {
    var list = MC.ASSETS;
    var fromIdx = -1, i;
    for (i = 0; i < list.length; i++) if (list[i].s === fromSym) { fromIdx = i; break; }
    if (fromIdx === -1) return false;

    var moved = list.splice(fromIdx, 1)[0];

    var toIdx = -1;
    for (i = 0; i < list.length; i++) if (list[i].s === toSym) { toIdx = i; break; }
    if (toIdx === -1) { list.splice(fromIdx, 0, moved); return false; }

    list.splice(placeAfter ? toIdx + 1 : toIdx, 0, moved);
    DD.saveOrder();
    return true;
  }

  function clearRowMarkers() {
    MC.$$('.wl-row').forEach(function (r) {
      r.classList.remove('drop-above', 'drop-below', 'dragging');
    });
  }

  function initRowDrag(onSymbolDropped) {
    var list = MC.$('watchlist');

    list.addEventListener('dragstart', function (e) {
      var row = e.target.closest('.wl-row');
      if (!row) return;
      dragSymbol = row.dataset.sym;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData(MIME, dragSymbol);
      e.dataTransfer.setData('text/plain', dragSymbol);   // so it also works outside
    });

    list.addEventListener('dragend', function () {
      dragSymbol = null;
      clearRowMarkers();
      MC.$$('.drop-target').forEach(function (el) { el.classList.remove('drop-target'); });
    });

    list.addEventListener('dragover', function (e) {
      if (!dragSymbol) return;
      var row = e.target.closest('.wl-row');
      if (!row || row.dataset.sym === dragSymbol) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      // Above or below, decided by which half of the row the pointer is in.
      var box = e.target.closest('.wl-row').getBoundingClientRect();
      var below = (e.clientY - box.top) > box.height / 2;
      MC.$$('.wl-row').forEach(function (r) { r.classList.remove('drop-above', 'drop-below'); });
      row.classList.add(below ? 'drop-below' : 'drop-above');
    });

    list.addEventListener('drop', function (e) {
      if (!dragSymbol) return;
      var row = e.target.closest('.wl-row');
      if (!row || row.dataset.sym === dragSymbol) return;
      e.preventDefault();

      var below = row.classList.contains('drop-below');
      var from = dragSymbol, to = row.dataset.sym;
      clearRowMarkers();

      if (reorder(from, to, below)) {
        MC.watchlist.render();
        MC.ui.toast('Watchlist reordered', from + ' moved. Your order is saved on this device.', 'ok');
      }
    });
  }

  /** Turn an element into a target that accepts a dragged watchlist symbol. */
  function acceptSymbol(el, onDrop) {
    if (!el) return;

    el.addEventListener('dragover', function (e) {
      if (!dragSymbol) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      el.classList.add('drop-target');
    });

    el.addEventListener('dragleave', function (e) {
      // ignore moves between children
      if (el.contains(e.relatedTarget)) return;
      el.classList.remove('drop-target');
    });

    el.addEventListener('drop', function (e) {
      if (!dragSymbol) return;
      e.preventDefault();
      el.classList.remove('drop-target');
      var sym = e.dataTransfer.getData(MIME) || dragSymbol;
      if (sym) onDrop(sym);
    });
  }

  /* ----------------------------------------------------------------------
     BOOT
     ---------------------------------------------------------------------- */
  DD.init = function (opts) {
    initFileDrop(opts.onImageFile);
    initRowDrag();

    acceptSymbol(document.querySelector('.chart-stack'), function (sym) {
      opts.onSymbol(sym);
      MC.ui.toast('Chart loaded', sym + ' is now on the chart.', 'ok');
    });

    acceptSymbol(document.querySelector('.rbody'), function (sym) {
      opts.onSymbol(sym);
      MC.ui.toast('Order ticket updated', sym + ' loaded into the trade form.', 'ok');
    });
  };

})(window);
