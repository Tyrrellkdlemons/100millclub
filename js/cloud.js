/* ==========================================================================
   cloud.js — sign in and keep the grind

   Local-first, always: everything works signed out and stays in this
   browser. Signing in (Google, Apple, or an emailed magic link — via
   Supabase Auth) copies progress to a private row in the cloud and loads
   it back on any device. Row Level Security means each user can read and
   write exactly one row: their own.

   The library loads lazily from jsDelivr only when sign-in is actually in
   play, so visitors who never touch the account button pay nothing for it.
   The anon key below is public by design — it only grants what RLS allows.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var Cloud = MC.cloud = {};

  /* Filled in at deploy time. If left as placeholders the whole feature
     hides itself rather than half-working. */
  var URL_ = 'https://waugpjyrkkkavrnqmmyk.supabase.co';
  var ANON = 'sb_publishable_6iX8pKKF-qhjkncs60_lWA__oCLRrte';

  var LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  var SEED_KEY = 'mc_cloud_seeded';

  /* Everything worth carrying between devices. Keys absent locally are
     simply not pushed; keys absent in the cloud are left alone locally.
     DELIBERATELY MISSING: mc_ai_cfg, mc_alert_delivery, mc_yt_cfg and
     mc_quotes_cfg — those hold the visitor's own API keys and delivery
     secrets, and the UI promises they stay in this browser. They do. */
  var SYNC_KEYS = [
    'mc_trade_history', 'mc_positions', 'mc_pending_orders', 'mc_acct_cfg', 'mc_equity_snaps',
    'mc_realized_carry',
    'mc_portfolio_tx', 'mc_portfolio_snaps',
    'mc_alerts',
    'mc_indicators', 'mc_custom_indicators',
    'mc_symbol', 'mc_order', 'mc_layout', 'mc_chart_preset', 'mc_volume',
    'mc_market', 'mc_recent_syms', 'mc_fav_syms', 'mc_seen_syms', 'mc_custom_assets',
    'mc_yt_shelf', 'mc_yt_watched',
    'mc_cal_watch', 'mc_cal_custom', 'mc_news_cfg',
    'mc_tour_done', 'mc_tv_follow', 'mc_default_micros', 'mc_first_order'
  ];

  var client = null;
  var user = null;
  var pushTimer = null;
  var applying = false;

  Cloud.configured = function () { return URL_.indexOf('http') === 0; };
  Cloud.user = function () { return user; };

  /* ---------------------------------------------------------------------- */

  function loadLib() {
    if (window.supabase) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = LIB;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load the sign-in library — offline?')); };
      document.head.appendChild(s);
    });
  }

  function ensureClient() {
    return loadLib().then(function () {
      if (!client) client = window.supabase.createClient(URL_, ANON);
      return client;
    });
  }

  /** True when a previous session left a token in this browser. */
  function hasStoredSession() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('sb-') === 0 && k.indexOf('-auth-token') > 0) return true;
      }
    } catch (e) { /* private mode */ }
    return false;
  }

  /* ----------------------------------------------------------------------
     BOOT
     ---------------------------------------------------------------------- */
  Cloud.init = function () {
    var btn = MC.$('authBtn');
    if (!Cloud.configured()) {
      if (btn) btn.style.display = 'none';
      return;
    }
    if (btn) btn.addEventListener('click', function () {
      MC.ui.openModal('mdAccount');
      Cloud.renderModal();
    });

    // only spend the network on the library when it can matter:
    // a stored session, or an OAuth redirect landing back here
    var returning = hasStoredSession() || /access_token|code=/.test(location.hash + location.search);
    if (returning) {
      ensureClient().then(wireAuth).catch(function () { /* stay local */ });
    }
  };

  var announcedFor = null;   // the auth events and getSession can both fire —
                             // the seed/push handshake must run once per sign-in
  function maybeSignedIn() {
    if (!user || announcedFor === user.id) return;
    announcedFor = user.id;
    onSignedIn();
  }

  function wireAuth() {
    client.auth.onAuthStateChange(function (event, session) {
      user = session && session.user ? session.user : null;
      if (!user) announcedFor = null;
      renderButton();
      maybeSignedIn();
    });
    return client.auth.getSession().then(function (r) {
      user = r.data.session && r.data.session.user ? r.data.session.user : null;
      renderButton();
      maybeSignedIn();
    });
  }

  function renderButton() {
    var lbl = MC.$('authLbl');
    var btn = MC.$('authBtn');
    if (!lbl || !btn) return;
    if (user) {
      var name = (user.email || 'account').split('@')[0];
      lbl.textContent = name.length > 10 ? name.slice(0, 9) + '…' : name;
      btn.classList.add('on');
    } else {
      lbl.textContent = 'Save';
      btn.classList.remove('on');
    }
  }

  /* ----------------------------------------------------------------------
     SIGN-IN FLOWS
     ---------------------------------------------------------------------- */
  /** Where OAuth and magic links land: this origin when it is a real one,
      the live site when running from file://. */
  function redirectTarget() {
    return /^https?:$/.test(location.protocol) ? location.origin : 'https://100millclub.netlify.app';
  }

  var settingsCache = null;
  function authSettings() {
    if (settingsCache) return Promise.resolve(settingsCache);
    return fetch(URL_ + '/auth/v1/settings', { headers: { apikey: ANON } })
      .then(function (r) { return r.json(); })
      .then(function (j) { settingsCache = j; return j; })
      .catch(function () { return null; });
  }

  Cloud.oauth = function (provider) {
    var name = provider === 'google' ? 'Google' : 'Apple';
    authSettings().then(function (s) {
      // redirecting into a disabled provider dumps the visitor on a raw
      // error page off-site — ask the server first and keep them here
      if (s && s.external && !s.external[provider]) {
        MC.ui.toast('Not switched on yet',
          name + ' sign-in is not configured for this site yet — the email link below works right now.', 'err');
        return;
      }
      return ensureClient().then(function () {
        return client.auth.signInWithOAuth({
          provider: provider,
          options: { redirectTo: redirectTarget() }
        });
      }).then(function (r) {
        if (r && r.error) throw r.error;
      });
    }).catch(function (e) {
      MC.ui.toast('Sign-in unavailable',
        name + ' sign-in failed: ' + (e && e.message ? e.message : 'provider disabled') +
        ' — use the email link below instead.', 'err');
    });
  };

  Cloud.magicLink = function (email) {
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      MC.ui.toast('Check the email', 'That does not look like an email address.', 'err');
      return;
    }
    var target = redirectTarget();
    var local = target === location.origin;
    ensureClient().then(function () {
      return client.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: target }
      });
    }).then(function (r) {
      if (r.error) throw r.error;
      MC.ui.toast('Link sent 📧',
        'Check ' + email + ' and tap the link — ' +
        (local ? 'it signs this browser in. '
               : 'it opens the live site, signed in — this file:// copy stays local. ') +
        'The free email service allows only a few per hour, so no button-mashing.', 'ok');
      var st = MC.$('accStatus');
      if (st) st.textContent = 'Magic link sent to ' + email + '. Check the inbox (and spam).';
    }).catch(function (e) {
      MC.ui.toast('Could not send the link', e && e.message ? e.message : 'Try again in a minute.', 'err');
    });
  };

  Cloud.signOut = function () {
    if (!client) return;
    client.auth.signOut().then(function () {
      user = null;
      renderButton();
      Cloud.renderModal();
      MC.ui.toast('Signed out', 'Everything stays saved on this device — and your cloud copy keeps waiting for you.', 'info');
    });
  };

  /* ----------------------------------------------------------------------
     SYNC — local-first, cloud as the carry-it-with-you copy
     ---------------------------------------------------------------------- */
  function gatherLocal() {
    var data = {};
    SYNC_KEYS.forEach(function (k) {
      var v = MC.store.get(k);
      if (v !== null && v !== undefined) data[k] = v;
    });
    return data;
  }

  /** Write the cloud copy into local storage. Reloads only when every write
      landed — a full localStorage must not become an infinite reload loop. */
  function applyCloud(data, cloudTs) {
    applying = true;
    var allOk = true;
    Object.keys(data).forEach(function (k) {
      if (SYNC_KEYS.indexOf(k) >= 0 && !rawSet(k, data[k])) allOk = false;
    });
    applying = false;
    if (!allOk) {
      MC.ui.toast('Could not apply the cloud copy',
        'This browser\u2019s storage is full. Your cloud copy is safe and untouched — free some space ' +
        '(a smaller logo helps) and sign in again.', 'err');
      return;
    }
    rawSet(SEED_KEY, user.id);
    rawSet('mc_local_ts', String(cloudTs || Date.now()));
    MC.ui.toast('Progress loaded ☁️', 'Your saved account, trades and settings are in. Reloading to apply…', 'gold');
    setTimeout(function () { location.reload(); }, 1200);
  }

  function onSignedIn() {
    Cloud.renderModal();
    client.from('user_state').select('data, updated_at').eq('user_id', user.id).maybeSingle()
      .then(function (r) {
        if (r.error) {
          MC.ui.toast('Cloud hiccup', 'Signed in, but loading saved progress failed: ' + r.error.message, 'err');
          return;
        }
        var seeded = MC.store.get(SEED_KEY) === user.id;
        var hasCloud = r.data && r.data.data && Object.keys(r.data.data).length > 0;
        var cloudTs = hasCloud && r.data.updated_at ? (Date.parse(r.data.updated_at) || 0) : 0;
        var localTs = parseInt(MC.store.get('mc_local_ts') || '0', 10) || 0;

        if (hasCloud && !seeded) {
          // this device has not seen this account yet: the cloud copy wins
          applyCloud(r.data.data, cloudTs);
        } else if (hasCloud && seeded && cloudTs > localTs) {
          // another device wrote more recently than anything done here —
          // pushing this stale copy up would erase real progress
          applyCloud(r.data.data, cloudTs);
        } else {
          // cloud is absent, or this device is the freshest: push local up
          MC.store.set(SEED_KEY, user.id);
          Cloud.pushNow();
          if (!hasCloud) MC.ui.toast('Cloud save on ☁️', 'From here on, your grind follows you to any device you sign into.', 'gold');
        }
      });
  }

  /** Debounced push — every local change while signed in schedules one. */
  Cloud.queuePush = function () {
    if (!user || applying) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(Cloud.pushNow, 3000);
  };

  Cloud.pushNow = function () {
    if (!user || !client) return;
    client.from('user_state').upsert({
      user_id: user.id,
      data: gatherLocal(),
      updated_at: new Date().toISOString()
    }).then(function (r) {
      if (r.error) MC.ui.toast('Cloud save failed', r.error.message + ' — your progress is still safe on this device.', 'err');
      var st = MC.$('accStatus');
      if (st && !r.error) st.textContent = 'Cloud copy updated ' + new Date().toLocaleTimeString() + '.';
    });
  };

  /* every store write of a synced key stamps the freshness clock (used to
     decide which device is newest) and, while signed in, schedules a push */
  var rawSet = MC.store.set;
  MC.store.set = function (key, value) {
    var ok = rawSet(key, value);
    if (SYNC_KEYS.indexOf(key) >= 0 && !applying) {
      rawSet('mc_local_ts', String(Date.now()));
      if (user) Cloud.queuePush();
    }
    return ok;
  };

  /* ----------------------------------------------------------------------
     THE ACCOUNT MODAL
     ---------------------------------------------------------------------- */
  Cloud.renderModal = function () {
    var inBox = MC.$('accSignedIn');
    var outBox = MC.$('accSignedOut');
    if (!inBox || !outBox) return;
    inBox.classList.toggle('hidden', !user);
    outBox.classList.toggle('hidden', !!user);
    if (user) {
      var who = MC.$('accWho');
      if (who) who.textContent = user.email || 'Signed in';
    }
  };

})(window);
