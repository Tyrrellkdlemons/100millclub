/* ==========================================================================
   alerts-ui.js — wiring for the Alerts tab
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var UI = MC.alertsUI = {};
  var $ = MC.$;
  var A;

  UI.init = function () {
    A = MC.alerts;

    // markets + conditions
    $('alSym').innerHTML = MC.ASSETS.map(function (a) {
      return '<option value="' + a.s + '">' + a.s + ' — ' + MC.esc(a.n) + '</option>';
    }).join('');
    $('alCond').innerHTML = A.CONDITIONS.map(function (c) {
      return '<option value="' + c.id + '">' + c.label + '</option>';
    }).join('');

    $('alSym').value = MC.State.symbol;
    $('alCond').addEventListener('change', syncValueField);
    $('alSym').addEventListener('change', syncValueField);
    syncValueField();

    $('alUseLast').addEventListener('click', function () {
      var a = MC.MAP[$('alSym').value];
      $('alValue').value = a.p.toFixed(a.d);
    });
    MC.$$('[data-alpct]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = MC.MAP[$('alSym').value];
        var pct = parseFloat(b.dataset.alpct);
        $('alValue').value = (a.p * (1 + pct / 100)).toFixed(a.d);
        $('alCond').value = pct > 0 ? 'above' : 'below';
        syncValueField();
      });
    });

    $('alAdd').addEventListener('click', create);

    /* ---- delivery ---- */
    var cfg = A.config();
    $('alChannel').value = cfg.channel;
    $('alTgToken').value = cfg.telegramToken || '';
    $('alTgChat').value = cfg.telegramChat || '';
    $('alHookUrl').value = cfg.webhookUrl || '';
    $('alEmailOn').classList.toggle('on', !!cfg.emailOn);
    $('alEmail').value = cfg.email || '';
    $('alSmsOn').classList.toggle('on', !!cfg.smsOn);
    $('alSmsNumber').value = cfg.smsNumber || '';
    $('alSmsKey').value = cfg.smsKey || '';
    $('alEmailWrap').classList.toggle('hidden', !cfg.emailOn);
    $('alSmsWrap').classList.toggle('hidden', !cfg.smsOn);
    $('alEmailOn').addEventListener('click', function () {
      var on = $('alEmailOn').classList.toggle('on');
      $('alEmailWrap').classList.toggle('hidden', !on);
      saveConfig();
    });
    $('alSmsOn').addEventListener('click', function () {
      var on = $('alSmsOn').classList.toggle('on');
      $('alSmsWrap').classList.toggle('hidden', !on);
      saveConfig();
    });
    ['alEmail', 'alSmsNumber', 'alSmsKey'].forEach(function (id) {
      $(id).addEventListener('change', saveConfig);
    });
    $('alSound').classList.toggle('on', cfg.sound !== false);
    $('alDesktop').classList.toggle('on', !!cfg.desktop);
    syncChannel();

    $('alChannel').addEventListener('change', function () { syncChannel(); saveConfig(); });
    ['alTgToken', 'alTgChat', 'alHookUrl'].forEach(function (id) {
      $(id).addEventListener('change', saveConfig);
    });

    $('alSound').addEventListener('click', function () {
      $('alSound').classList.toggle('on');
      saveConfig();
    });
    $('alDesktop').addEventListener('click', function () {
      var turningOn = !$('alDesktop').classList.contains('on');
      if (turningOn) {
        A.requestDesktop().then(function (ok) {
          $('alDesktop').classList.toggle('on', ok);
          saveConfig();
        });
      } else {
        $('alDesktop').classList.remove('on');
        saveConfig();
      }
    });

    $('alTest').addEventListener('click', function () {
      saveConfig();
      var c = A.config();
      var anything = c.channel !== 'none' || c.emailOn || c.smsOn;
      if (!anything) {
        MC.ui.toast('Pick a destination', 'Turn on Telegram/Discord/webhook, email, or SMS first.', 'err');
        return;
      }
      MC.ui.toast('Sending…', 'Testing every channel you have on.', 'info');
      A.deliverAll('Test signal — if you can read this, forwarding works.', c).then(function (results) {
        if (!results.length) { MC.ui.toast('Nothing enabled', 'Turn a channel on first.', 'err'); return; }
        results.forEach(function (r) {
          if (r.sent) MC.ui.toast('It works ✓', 'Delivered to ' + r.where +
            (r.quota !== undefined ? ' (' + r.quota + ' free left today)' : '') + '.', 'ok');
          else if (r.error) MC.ui.toast('Channel failed', r.error, 'err');
        });
      });
    });

    MC.on($('alList'), 'click', '[data-al-del]', function (e, b) {
      A.remove(b.getAttribute('data-al-del'));
      UI.render();
    });
    MC.on($('alList'), 'click', '[data-al-tog]', function (e, b) {
      A.toggle(b.getAttribute('data-al-tog'));
      UI.render();
    });
    $('alClearLog').addEventListener('click', function () {
      A.clearLog();
      UI.render();
      MC.ui.toast('History cleared', 'Triggered alerts wiped.', 'info');
    });

    MC.onAlertFired = UI.render;
    UI.render();
  };

  /** The value box changes meaning with the condition, so relabel it. */
  function syncValueField() {
    var cond = A.CONDITIONS.filter(function (c) { return c.id === $('alCond').value; })[0];
    if (!cond) return;
    var asset = MC.MAP[$('alSym').value];

    var labels = {
      price: 'Price', percent: 'Daily change', level: 'Level', bars: 'Average length'
    };
    var suffix = { price: asset.m === 'forex' ? '' : 'USD', percent: '%', level: '', bars: 'bars' };

    $('alValueLabel').textContent = labels[cond.needs] || 'Value';
    $('alValueSuffix').textContent = suffix[cond.needs] || '';

    if (!$('alValue').value || $('alValue').dataset.auto === '1') {
      $('alValue').value = cond.needs === 'price' ? asset.p.toFixed(asset.d) : (cond.def || 0);
      $('alValue').dataset.auto = '1';
    }
    $('alValue').addEventListener('input', function () { this.dataset.auto = '0'; }, { once: true });
  }

  function syncChannel() {
    var c = $('alChannel').value;
    $('alTelegram').classList.toggle('hidden', c !== 'telegram');
    $('alWebhook').classList.toggle('hidden', c !== 'discord' && c !== 'webhook');
  }

  function saveConfig() {
    A.saveConfig({
      channel: $('alChannel').value,
      telegramToken: $('alTgToken').value.trim(),
      telegramChat: $('alTgChat').value.trim(),
      webhookUrl: $('alHookUrl').value.trim(),
      sound: $('alSound').classList.contains('on'),
      desktop: $('alDesktop').classList.contains('on'),
      emailOn: $('alEmailOn').classList.contains('on'),
      email: $('alEmail').value.trim(),
      smsOn: $('alSmsOn').classList.contains('on'),
      smsNumber: $('alSmsNumber').value.trim(),
      smsKey: $('alSmsKey').value.trim()
    });
  }

  function create() {
    var value = parseFloat($('alValue').value);
    if (!isFinite(value)) {
      MC.ui.toast('Enter a value', 'Tell the alert what number to watch for.', 'err');
      $('alValue').focus();
      return;
    }
    var alert = A.add({ sym: $('alSym').value, cond: $('alCond').value, value: value });
    UI.render();
    MC.ui.toast('Alert set 🔔',
      alert.sym + ' — ' + A.conditionLabel(alert.cond).toLowerCase() + ' ' + value +
      '. It fires when the condition actually crosses.', 'ok');
  }

  /* ======================================================================
     RENDER
     ====================================================================== */
  UI.render = function () {
    var list = A.list();
    var liveCount = list.filter(function (a) { return a.on && !a.fired; }).length;
    $('alertCount').textContent = liveCount;

    $('alList').innerHTML = list.length
      ? list.map(function (a) {
          var asset = MC.MAP[a.sym];
          var done = !!a.fired;
          return '<div class="al-row' + (done ? ' done' : (a.on ? '' : ' off')) + '">' +
            '<div class="al-top">' +
              '<span class="al-sym">' + a.sym + '</span>' +
              '<span class="al-state">' +
                (done ? '<i class="fa-solid fa-circle-check"></i> triggered'
                      : (a.on ? '<i class="fa-solid fa-satellite-dish"></i> watching'
                              : '<i class="fa-solid fa-pause"></i> paused')) +
              '</span>' +
            '</div>' +
            '<div class="al-cond">' + MC.esc(A.conditionLabel(a.cond)) + ' <b>' +
              (a.cond === 'pctUp' || a.cond === 'pctDown' ? a.value + '%' : MC.fmtPx(a.value, asset ? asset.d : 2)) +
            '</b></div>' +
            '<div class="al-acts">' +
              (done ? '' : '<button data-al-tog="' + a.id + '">' + (a.on ? 'Pause' : 'Resume') + '</button>') +
              '<button data-al-del="' + a.id + '">Delete</button>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="empty"><i class="fa-solid fa-bell-slash"></i>No alerts yet.<br>' +
        'Set one above and it will watch the market for you.</div>';

    var log = A.log();
    $('alLog').innerHTML = log.length
      ? log.slice(0, 12).map(function (e) {
          return '<div class="al-log"><b>' +
            new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
            '</b> ' + MC.esc(e.text) + '</div>';
        }).join('')
      : '<div class="empty" style="padding:14px"><i class="fa-solid fa-clock-rotate-left"></i>Nothing has triggered yet.</div>';
  };

})(window);
