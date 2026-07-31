/* ==========================================================================
   ui.js — toasts, custom tooltips, modals and mobile drawers
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var UI = MC.ui = {};

  /* ----------------------------------------------------------------------
     TOASTS
     ---------------------------------------------------------------------- */
  var TOAST_ICON = {
    ok: 'fa-circle-check',
    err: 'fa-triangle-exclamation',
    info: 'fa-circle-info',
    gold: 'fa-crown'
  };

  /**
   * Show a transient notification.
   * @param {string} title  short headline
   * @param {string} message supporting line
   * @param {'ok'|'err'|'info'|'gold'} kind
   */
  UI.toast = function (title, message, kind) {
    kind = kind || 'info';
    var host = MC.$('toasts');
    if (!host) return;

    var el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<i class="fa-solid ' + (TOAST_ICON[kind] || TOAST_ICON.info) + ' ti"></i>' +
      '<div><div class="toast-t"></div><div class="toast-m"></div></div>';

    // textContent, never innerHTML — titles can contain user-supplied symbols
    el.querySelector('.toast-t').textContent = title;
    el.querySelector('.toast-m').textContent = message || '';
    host.appendChild(el);

    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 250);
    }, 4200);

    while (host.children.length > 4) host.firstElementChild.remove();
  };

  /* ----------------------------------------------------------------------
     TOOLTIPS
     Any element can carry:
       data-tip       headline (required)
       data-tip-desc  plain-English explanation (optional)
       data-tip-key   keyboard shortcut (optional)
     ---------------------------------------------------------------------- */
  UI.initTooltips = function () {
    var tip = MC.$('tip');
    if (!tip) return;

    var titleEl = tip.querySelector('.tip-title');
    var descEl = tip.querySelector('.tip-desc');
    var keyEl = tip.querySelector('.tip-key');
    var timer;

    function hide() { clearTimeout(timer); tip.classList.remove('on'); }

    document.addEventListener('mouseover', function (e) {
      var target = e.target.closest('[data-tip]');
      if (!target) return;
      clearTimeout(timer);

      // Longer explanations get a touch more dwell time before appearing.
      var hasDesc = !!target.getAttribute('data-tip-desc');
      timer = setTimeout(function () {
        titleEl.textContent = target.getAttribute('data-tip') || '';
        descEl.textContent = target.getAttribute('data-tip-desc') || '';
        keyEl.textContent = target.getAttribute('data-tip-key') || '';
        tip.classList.add('on');

        var r = target.getBoundingClientRect();
        var t = tip.getBoundingClientRect();
        var x = r.left + r.width / 2 - t.width / 2;
        var y = r.bottom + 10;
        var place = 'below';

        if (y + t.height > window.innerHeight - 8) {
          y = r.top - t.height - 10;
          place = 'above';
        }
        tip.setAttribute('data-place', place);
        tip.style.left = MC.clamp(x, 8, window.innerWidth - t.width - 8) + 'px';
        tip.style.top = Math.max(8, y) + 'px';
      }, hasDesc ? 380 : 300);
    });

    document.addEventListener('mouseout', function (e) {
      if (e.target.closest('[data-tip]')) hide();
    });
    document.addEventListener('mousedown', hide);
    window.addEventListener('scroll', hide, true);
    // never leave a tooltip stranded over the tour overlay
    window.addEventListener('blur', hide);
  };

  /* ----------------------------------------------------------------------
     MODALS
     ---------------------------------------------------------------------- */
  UI.openModal = function (id) {
    var el = MC.$(id);
    if (el) el.classList.add('on');
  };

  UI.closeModals = function () {
    MC.$$('.backdrop').forEach(function (b) { b.classList.remove('on'); });
  };

  UI.initModals = function () {
    // Click the dimmed backdrop, an X, or any [data-close] control to dismiss.
    document.addEventListener('click', function (e) {
      if (e.target.classList.contains('backdrop') || e.target.closest('[data-close]')) {
        UI.closeModals();
      }
    });
  };

  /* ----------------------------------------------------------------------
     MOBILE DRAWERS
     ---------------------------------------------------------------------- */
  UI.closeDrawers = function () {
    var left = MC.$('leftPanel'), right = MC.$('rightPanel'), scrim = MC.$('scrim');
    if (left) left.classList.remove('open');
    if (right) right.classList.remove('open');
    if (scrim) scrim.classList.remove('on');
  };

  UI.toggleDrawer = function (which) {
    var panel = MC.$(which === 'left' ? 'leftPanel' : 'rightPanel');
    var other = MC.$(which === 'left' ? 'rightPanel' : 'leftPanel');
    if (!panel) return;
    other.classList.remove('open');
    var open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    MC.$('scrim').classList.toggle('on', open);
  };

  /** True when the right sidebar is a slide-over rather than a fixed column. */
  UI.rightIsDrawer = function () { return window.innerWidth <= 1180; };

})(window);
