/* ==========================================================================
   alerts.js — price and indicator alerts, with copy-trade forwarding

   An alert watches one condition on one market. When it fires you get a
   toast, an optional desktop notification and an optional sound — and, if
   you have set one up, the signal is forwarded to Telegram, Discord or any
   webhook you like. That last part is the copy-trade hook: point it at the
   channel your followers watch and every trigger lands there automatically.

   Delivery notes (both verified against the platforms' own docs):
     · Telegram accepts browser requests, so a normal POST to
       api.telegram.org/bot<token>/sendMessage works directly.
     · Discord webhooks do NOT allow a cross-origin JSON body. Sending the
       payload as a `payload_json` form field sidesteps the preflight, which
       is the documented browser-side workaround.

   Your bot token / webhook URL is kept in this browser's local storage and
   is only ever sent to the service you chose. Nothing passes through us.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var A = MC.alerts = {};

  var STORE = 'mc_alerts';
  var STORE_CFG = 'mc_alert_delivery';
  var STORE_LOG = 'mc_alert_log';

  /* ----------------------------------------------------------------------
     CONDITIONS
     ---------------------------------------------------------------------- */
  A.CONDITIONS = [
    { id: 'above',     label: 'Price rises above',        needs: 'price' },
    { id: 'below',     label: 'Price falls below',        needs: 'price' },
    { id: 'pctUp',     label: 'Daily change rises above', needs: 'percent' },
    { id: 'pctDown',   label: 'Daily change falls below', needs: 'percent' },
    { id: 'rsiAbove',  label: 'RSI rises above',          needs: 'level', def: 70 },
    { id: 'rsiBelow',  label: 'RSI falls below',          needs: 'level', def: 30 },
    { id: 'crossUp',   label: 'Price crosses above its average', needs: 'bars', def: 50 },
    { id: 'crossDown', label: 'Price crosses below its average', needs: 'bars', def: 50 }
  ];

  A.conditionLabel = function (id) {
    for (var i = 0; i < A.CONDITIONS.length; i++) if (A.CONDITIONS[i].id === id) return A.CONDITIONS[i].label;
    return id;
  };

  /* ----------------------------------------------------------------------
     STORAGE
     ---------------------------------------------------------------------- */
  function readJSON(key, fallback) {
    try {
      var v = JSON.parse(MC.store.get(key) || 'null');
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }

  A.list = function () { return readJSON(STORE, []); };
  A.log = function () { return readJSON(STORE_LOG, []); };
  A.config = function () {
    return readJSON(STORE_CFG, {
      channel: 'none', telegramToken: '', telegramChat: '',
      webhookUrl: '', sound: true, desktop: false,
      emailOn: false, email: '',
      smsOn: false, smsNumber: '', smsKey: ''
    });
  };

  function saveList(list) { MC.store.set(STORE, JSON.stringify(list)); }
  A.saveConfig = function (cfg) { MC.store.set(STORE_CFG, JSON.stringify(cfg)); };

  function pushLog(entry) {
    var log = A.log();
    log.unshift(entry);
    MC.store.set(STORE_LOG, JSON.stringify(log.slice(0, 50)));
  }
  A.clearLog = function () { MC.store.set(STORE_LOG, '[]'); };

  /* ----------------------------------------------------------------------
     CRUD
     ---------------------------------------------------------------------- */
  A.add = function (alert) {
    alert.id = 'A' + Math.random().toString(36).slice(2, 7).toUpperCase();
    alert.on = true;
    alert.created = Date.now();
    alert.armed = null;          // set on first evaluation, so it only fires on a real crossing
    var list = A.list();
    list.unshift(alert);
    saveList(list);
    return alert;
  };

  A.remove = function (id) {
    saveList(A.list().filter(function (a) { return a.id !== id; }));
  };

  A.toggle = function (id) {
    var list = A.list();
    list.forEach(function (a) { if (a.id === id) a.on = !a.on; });
    saveList(list);
  };

  /* ----------------------------------------------------------------------
     EVALUATION
     Called on every simulated tick. An alert only fires on a genuine
     transition, so a condition that is already true when you create it will
     not fire immediately — it waits to cross.
     ---------------------------------------------------------------------- */
  A.check = function () {
    var list = A.list();
    if (!list.length) return;

    var changed = false;

    list.forEach(function (al) {
      if (!al.on || al.fired) return;
      var asset = MC.MAP[al.sym];
      if (!asset) return;

      var value = readMetric(al, asset);
      if (value == null) return;

      var isTrue = compare(al, value);

      // first look just records the starting side
      if (al.armed === null || al.armed === undefined) {
        al.armed = isTrue ? 'inside' : 'outside';
        changed = true;
        return;
      }

      if (al.armed === 'outside' && isTrue) {
        al.fired = Date.now();
        al.firedAt = value;
        al.armed = 'inside';
        changed = true;
        fire(al, asset, value);
      } else if (al.armed === 'inside' && !isTrue) {
        al.armed = 'outside';
        changed = true;
      }
    });

    if (changed) saveList(list);
  };

  /** Pull whichever number this alert cares about. */
  function readMetric(al, asset) {
    switch (al.cond) {
      case 'above':
      case 'below':
        return asset.p;
      case 'pctUp':
      case 'pctDown':
        return asset.chg;
      case 'rsiAbove':
      case 'rsiBelow': {
        var bars = seriesFor(al.sym);
        var r = MC.ind.rsi(MC.ind.src.close(bars), 14);
        return r[r.length - 1];
      }
      case 'crossUp':
      case 'crossDown': {
        var b2 = seriesFor(al.sym);
        var ma = MC.ind.sma(MC.ind.src.close(b2), al.value || 50);
        var last = ma[ma.length - 1];
        return last == null ? null : asset.p - last;   // sign tells us which side
      }
      default:
        return null;
    }
  }

  /** Reuse the on-screen bars when possible; otherwise generate them. */
  function seriesFor(sym) {
    if (MC.State.symbol === sym && MC.State.bars.length) return MC.State.bars;
    return MC.genBars(sym, '1h', 200);
  }

  function compare(al, value) {
    switch (al.cond) {
      case 'above':     return value > al.value;
      case 'below':     return value < al.value;
      case 'pctUp':     return value > al.value;
      case 'pctDown':   return value < al.value;
      case 'rsiAbove':  return value > al.value;
      case 'rsiBelow':  return value < al.value;
      case 'crossUp':   return value > 0;
      case 'crossDown': return value < 0;
      default:          return false;
    }
  }

  /* ----------------------------------------------------------------------
     FIRING
     ---------------------------------------------------------------------- */
  function fire(al, asset, value) {
    var text = buildMessage(al, asset, value);

    MC.ui.toast('Alert triggered 🔔', text, 'gold');
    pushLog({ id: al.id, sym: al.sym, text: text, at: Date.now() });

    var cfg = A.config();
    if (cfg.sound) beep();
    if (cfg.desktop) desktopNotify(al.sym + ' alert', text);

    A.deliverAll(text, cfg).then(function (results) {
      results.forEach(function (result) {
        if (result.sent) MC.ui.toast('Signal forwarded', 'Sent to ' + result.where + '.', 'ok');
        else if (result.error) MC.ui.toast('Could not forward the signal', result.error, 'err');
      });
    });

    if (MC.onAlertFired) MC.onAlertFired();
  }

  function buildMessage(al, asset, value) {
    var d = asset.d;
    var head = al.sym + ' — ' + A.conditionLabel(al.cond).toLowerCase();

    switch (al.cond) {
      case 'above':
      case 'below':
        return head + ' ' + MC.fmtPx(al.value, d) + ' (now ' + MC.fmtPx(asset.p, d) + ')';
      case 'pctUp':
      case 'pctDown':
        return head + ' ' + al.value + '% (now ' + MC.fmtPct(asset.chg) + ')';
      case 'rsiAbove':
      case 'rsiBelow':
        return head + ' ' + al.value + ' (now ' + (value == null ? '–' : value.toFixed(1)) +
               ', price ' + MC.fmtPx(asset.p, d) + ')';
      default:
        return head + ' (' + al.value + " bars, price " + MC.fmtPx(asset.p, d) + ')';
    }
  }

  /* ----------------------------------------------------------------------
     DELIVERY — Telegram / Discord / plain webhook
     ---------------------------------------------------------------------- */
  A.deliver = function (text, cfg) {
    cfg = cfg || A.config();
    var stamped = '📈 100MillClub signal\n' + text + '\n' + new Date().toLocaleString();

    if (cfg.channel === 'telegram') {
      if (!cfg.telegramToken || !cfg.telegramChat) {
        return Promise.resolve({ error: 'Add your Telegram bot token and chat ID first.' });
      }
      return fetch('https://api.telegram.org/bot' + encodeURIComponent(cfg.telegramToken) + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: cfg.telegramChat, text: stamped })
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          return j && j.ok
            ? { sent: true, where: 'Telegram' }
            : { error: (j && j.description) || 'Telegram rejected the message.' };
        })
        .catch(function (e) { return { error: e.message }; });
    }

    if (cfg.channel === 'discord') {
      if (!cfg.webhookUrl) return Promise.resolve({ error: 'Paste your Discord webhook URL first.' });
      // Discord blocks a cross-origin JSON body; a form field avoids the preflight.
      var form = new FormData();
      form.append('payload_json', JSON.stringify({ content: stamped }));
      return fetch(cfg.webhookUrl, { method: 'POST', body: form })
        .then(function (r) {
          return r.ok ? { sent: true, where: 'Discord' } : { error: 'Discord returned ' + r.status };
        })
        .catch(function (e) { return { error: e.message }; });
    }

    if (cfg.channel === 'webhook') {
      if (!cfg.webhookUrl) return Promise.resolve({ error: 'Paste a webhook URL first.' });
      return fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: '100MillClub', text: text, at: new Date().toISOString() })
      })
        .then(function (r) {
          return r.ok ? { sent: true, where: 'your webhook' } : { error: 'The webhook returned ' + r.status };
        })
        .catch(function (e) {
          return { error: e.message + ' — the endpoint may not allow browser requests.' };
        });
    }

    return Promise.resolve(null);      // channel 'none'
  };

  /**
   * Email, via ntfy.sh's mail bridge — publish with an X-Email header and
   * ntfy forwards the message to that address. CORS-open by design; the
   * free tier allows a small number of emails per day, so this is for the
   * alerts that matter, not a firehose.
   */
  function deliverEmail(text, cfg) {
    if (!cfg.emailOn || !cfg.email) return Promise.resolve(null);
    return fetch('https://ntfy.sh/mc-' + hashTopic(cfg.email), {
      method: 'POST',
      headers: {
        'Title': '100MillClub alert',
        'X-Email': cfg.email,
        'Tags': 'chart_with_upwards_trend'
      },
      body: text
    }).then(function (r) {
      return r.ok ? { sent: true, where: 'email' }
                  : { error: 'ntfy returned ' + r.status + ' — the free email quota may be used up for today.' };
    }).catch(function (e) { return { error: 'email: ' + e.message }; });
  }

  /**
   * SMS via Textbelt, which allows browser calls on purpose. The shared
   * free key sends ONE text per day per IP; a paid key from textbelt.com
   * removes the limit. Honest, but real.
   */
  function deliverSms(text, cfg) {
    if (!cfg.smsOn || !cfg.smsNumber) return Promise.resolve(null);
    return fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: cfg.smsNumber,
        message: '100MillClub: ' + text.slice(0, 140),
        key: cfg.smsKey || 'textbelt'
      })
    }).then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.success) return { sent: true, where: 'SMS', quota: j.quotaRemaining };
        return { error: 'SMS: ' + (j.error || 'refused') +
                 (j.quotaRemaining === 0 ? ' — the free text for today is used; add a Textbelt key for more.' : '') };
      })
      .catch(function (e) { return { error: 'SMS: ' + e.message }; });
  }

  function hashTopic(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  /** Fan out to every enabled channel; returns the array of outcomes. */
  A.deliverAll = function (text, cfg) {
    cfg = cfg || A.config();
    return Promise.all([
      A.deliver(text, cfg),
      deliverEmail(text, cfg),
      deliverSms(text, cfg)
    ]).then(function (results) {
      return results.filter(Boolean);
    });
  };

  /** Fire a test message so people can prove the plumbing before relying on it. */
  A.test = function (cfg) {
    return A.deliver('Test signal — if you can read this, forwarding works.', cfg);
  };

  /**
   * Shared exit for anything that is not a price alert — economic events and
   * news matches — so they get the same chime, desktop popup, forwarding and
   * history as a price trigger.
   */
  A.notifyExternal = function (title, text) {
    var cfg = A.config();
    if (cfg.sound) beep();
    if (cfg.desktop) desktopNotify(title, text);
    pushLog({ id: 'ext', sym: title, text: text, at: Date.now() });

    A.deliverAll(text, cfg).then(function (results) {
      results.forEach(function (r) {
        if (r.error) MC.ui.toast('Could not forward it', r.error, 'err');
      });
    });

    if (MC.onAlertFired) MC.onAlertFired();
  };

  /* ----------------------------------------------------------------------
     LOCAL NOTIFICATION
     ---------------------------------------------------------------------- */
  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1180, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.34);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 700);
    } catch (e) { /* audio is a nicety, never a failure */ }
  }

  function desktopNotify(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try { new Notification(title, { body: body }); } catch (e) {}
    }
  }

  /** Ask for desktop-notification permission (must follow a real click). */
  A.requestDesktop = function () {
    if (!('Notification' in window)) {
      MC.ui.toast('Not supported', 'This browser has no desktop notifications.', 'err');
      return Promise.resolve(false);
    }
    return Notification.requestPermission().then(function (p) {
      var ok = p === 'granted';
      MC.ui.toast(
        ok ? 'Desktop alerts on' : 'Desktop alerts blocked',
        ok ? 'Alerts will pop up even when this tab is in the background.'
           : 'Your browser refused. Allow notifications for this site in its settings.',
        ok ? 'ok' : 'err'
      );
      return ok;
    });
  };

})(window);
