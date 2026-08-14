/* ==========================================================================
   commod.js — commodities intelligence: positioning, curve, macro, weather

   The commodities signal hub, from primary sources, keyless:

     CFTC  /api/cot    who is positioned where (Managed Money, weekly)
     Yahoo /api/term   the futures curve — contango / backwardation and the
                       annualised cost (or pay) of rolling the front
     FRED  /api/macro  the macro drivers: rates, dollar, inflation
                       expectations (+ EIA crude stocks when a key is set)
     open-meteo        7-day ag-belt weather, straight from the browser

   Every card carries its provenance and freshness, every term of art has a
   plain-English line, and each section fails alone — one dead source never
   takes the board down. Shown in the Futures and All-markets modes.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var CO = MC.commod = {};

  var CACHE_KEY = 'mc_commod_cache';
  var TTL = { cot: 6 * 3600e3, macro: 3600e3, term: 15 * 60e3, wx: 3 * 3600e3 };
  var TERM_ROOTS = ['CL', 'NG', 'GC', 'ZC'];

  var BELTS = [
    { id: 'corn',  name: 'Corn Belt',      spot: 'Des Moines, IA', lat: 41.59, lon: -93.62, crop: 'CORN' },
    { id: 'wheat', name: 'Winter Wheat',   spot: 'Wichita, KS',    lat: 37.69, lon: -97.34, crop: 'WHEAT' },
    { id: 'soy',   name: 'Soybean country',spot: 'Peoria, IL',     lat: 40.69, lon: -89.59, crop: 'SOYBEANS' }
  ];

  /* ----------------------------------------------------------------------
     CACHE — the data is slow-moving; the board should not be
     ---------------------------------------------------------------------- */
  function cache() {
    try { return JSON.parse(MC.store.get(CACHE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function put(kind, data) {
    var c = cache();
    c[kind] = { at: Date.now(), data: data };
    MC.store.set(CACHE_KEY, JSON.stringify(c));
  }
  function fresh(kind) {
    var hit = cache()[kind];
    return hit && Date.now() - hit.at < TTL[kind] ? hit.data : null;
  }

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  var proxied = /^https?:$/.test(location.protocol);

  /* ----------------------------------------------------------------------
     FETCHERS — each resolves to data or null, never throws outward
     ---------------------------------------------------------------------- */
  function getCot() {
    var hit = fresh('cot');
    if (hit) return Promise.resolve(hit);
    if (!proxied) return Promise.resolve(null);
    return getJSON('/api/cot').then(function (d) {
      if (!d.ok || !d.markets || !d.markets.length) return null;
      put('cot', d);
      return d;
    }).catch(function () { return null; });
  }

  function getMacro() {
    var hit = fresh('macro');
    if (hit) return Promise.resolve(hit);
    if (!proxied) return Promise.resolve(null);
    return getJSON('/api/macro').then(function (d) {
      if (!d.ok || !d.tiles || !d.tiles.length) return null;
      put('macro', d);
      return d;
    }).catch(function () { return null; });
  }

  function getTerm() {
    var hit = fresh('term');
    if (hit) return Promise.resolve(hit);
    if (!proxied) return Promise.resolve(null);
    return Promise.all(TERM_ROOTS.map(function (root) {
      return getJSON('/api/term?root=' + root).catch(function () { return { ok: false }; });
    })).then(function (rows) {
      var good = rows.filter(function (r) { return r && r.ok; });
      if (!good.length) return null;
      put('term', good);
      return good;
    }).catch(function () { return null; });
  }

  function getWeather() {
    var hit = fresh('wx');
    if (hit) return Promise.resolve(hit);
    return Promise.all(BELTS.map(function (b) {
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + b.lat + '&longitude=' + b.lon +
        '&daily=temperature_2m_max,precipitation_sum&forecast_days=7&timezone=auto';
      return fetch(url).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          var daily = d && d.daily;
          if (!daily || !daily.temperature_2m_max) return null;
          var temps = daily.temperature_2m_max.filter(isFinite);
          var precip = (daily.precipitation_sum || []).filter(isFinite);
          var avgMax = temps.reduce(function (s, v) { return s + v; }, 0) / (temps.length || 1);
          var totalPrecip = precip.reduce(function (s, v) { return s + v; }, 0);
          return {
            belt: b,
            avgMaxC: Math.round(avgMax * 10) / 10,
            totalPrecipMm: Math.round(totalPrecip),
            heat: avgMax >= 33,
            dry: totalPrecip < 8
          };
        }).catch(function () { return null; });
    })).then(function (rows) {
      var good = rows.filter(Boolean);
      if (!good.length) return null;
      put('wx', good);
      return good;
    });
  }

  /** Next WASDE: USDA publishes it monthly around the 12th, noon ET. The
      exact day shifts a little — this is a reminder, not a countdown clock. */
  CO.nextWasde = function (nowMs) {
    var now = nowMs ? new Date(nowMs) : new Date();
    var d = new Date(now.getFullYear(), now.getMonth(), 12);
    if (now.getDate() >= 12) d = new Date(now.getFullYear(), now.getMonth() + 1, 12);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  /* ----------------------------------------------------------------------
     RENDER PIECES
     ---------------------------------------------------------------------- */
  function fmtK(v) {
    if (v == null || !isFinite(v)) return '–';
    var abs = Math.abs(v);
    var body = abs >= 1000 ? (abs / 1000).toFixed(abs >= 100000 ? 0 : 1) + 'k' : String(Math.round(abs));
    return (v < 0 ? '-' : '') + body;
  }

  function cotHtml(d) {
    if (!d) return sectionNote('Positioning', 'fa-users', 'CFTC data unreachable right now — it returns on the next refresh.');
    var cards = d.markets.map(function (m) {
      var netCls = m.mmNet > 0 ? 'up' : m.mmNet < 0 ? 'down' : '';
      var chg = m.weeklyChange;
      var chgTxt = chg == null ? '' :
        '<span class="co-chg ' + (chg > 0 ? 'up' : chg < 0 ? 'down' : '') + '">' +
        (chg > 0 ? '▲' : chg < 0 ? '▼' : '·') + ' ' + fmtK(Math.abs(chg)) + ' wk</span>';
      var pct = m.netPctOfOI;
      var barW = pct == null ? 0 : Math.min(100, Math.abs(pct) * 2.2);
      return '<div class="co-card" data-tip="' + MC.esc(m.name) + '" data-tip-desc="Managed Money (the big speculators) holds ' +
          fmtK(m.mmLong) + ' contracts long vs ' + fmtK(m.mmShort) + ' short. Net as % of open interest shows how crowded the bet is — crowded trades unwind hard.">' +
        '<div class="co-card-top"><b>' + MC.esc(m.sym) + '</b>' + chgTxt + '</div>' +
        '<div class="co-net ' + netCls + '">' + (m.mmNet > 0 ? '+' : '') + fmtK(m.mmNet) + '<small>net contracts</small></div>' +
        '<div class="co-bar"><i class="' + netCls + '" style="width:' + barW + '%"></i></div>' +
        '<div class="co-meta">' + (pct == null ? '' : (pct > 0 ? '+' : '') + pct + '% of OI · ') + m.reportDate + '</div>' +
      '</div>';
    }).join('');
    return sectionHead('Who is positioned where', 'fa-users',
        'CFTC Commitments of Traders · Managed Money · weekly (Tue positions, Fri release)') +
      '<div class="co-grid">' + cards + '</div>';
  }

  function termHtml(list) {
    if (!list) return sectionNote('The curve', 'fa-chart-gantt', 'Contract months unresolved right now — the curve returns on the next refresh.');
    var cards = list.map(function (t) {
      var stCls = t.state === 'contango' ? 'ct' : t.state === 'backwardation' ? 'bw' : '';
      var dots = t.curve.slice(0, 5).map(function (c, i) {
        return '<span class="co-dot" style="--i:' + i + '" data-tip="' + c.contract + ' · ' + c.price + '"></span>';
      }).join('');
      return '<div class="co-card" data-tip="' + MC.esc(t.name) + ' futures curve" data-tip-desc="' +
          (t.state === 'contango'
            ? 'Later months cost MORE than the front (contango) — normal storage-cost shape; rolling a long position pays ~' + Math.abs(t.annualisedPct) + '%/yr.'
            : t.state === 'backwardation'
              ? 'Later months cost LESS than the front (backwardation) — the market pays for barrels NOW; rolling a long earns ~' + Math.abs(t.annualisedPct) + '%/yr. Usually a tight-supply signal.'
              : 'The curve is flat — no strong storage or scarcity signal.') + '">' +
        '<div class="co-card-top"><b>' + MC.esc(t.root) + '</b><span class="co-state ' + stCls + '">' + t.state + '</span></div>' +
        '<div class="co-curve">' + dots + '</div>' +
        '<div class="co-meta">front ' + t.curve[0].contract + ' ' + t.curve[0].price +
          ' · roll ' + (t.annualisedPct > 0 ? '−' : '+') + Math.abs(t.annualisedPct) + '%/yr</div>' +
      '</div>';
    }).join('');
    return sectionHead('The curve — contango and backwardation', 'fa-chart-gantt',
        'real exchange contract months, Yahoo-quoted · refreshes ~15m') +
      '<div class="co-grid">' + cards + '</div>';
  }

  function macroHtml(d) {
    if (!d) return sectionNote('Macro drivers', 'fa-landmark', 'FRED unreachable right now — the macro strip returns on the next refresh.');
    var tiles = d.tiles.map(function (t) {
      var dir = t.change > 0 ? 'up' : t.change < 0 ? 'down' : '';
      var spark = sparkline(t.series);
      return '<div class="co-macro" data-tip="' + MC.esc(t.label) + '" data-tip-desc="Latest reading ' + t.latest + t.unit +
          ' (' + t.latestDate + '). Rates and the dollar are gravity for every commodity: dearer money and a stronger dollar usually press prices down.">' +
        '<b>' + MC.esc(t.label) + '</b>' +
        '<span class="mono">' + t.latest + t.unit + '</span>' +
        '<span class="co-macro-chg ' + dir + '">' + (t.change > 0 ? '+' : '') + t.change + '</span>' +
        spark +
      '</div>';
    }).join('');
    return sectionHead('Macro drivers', 'fa-landmark', MC.esc(d.source) + ' · primary sources') +
      '<div class="co-macro-row">' + tiles + '</div>';
  }

  function sparkline(series) {
    if (!series || series.length < 2) return '';
    var w = 72, h = 20;
    var hi = Math.max.apply(null, series), lo = Math.min.apply(null, series);
    var span = (hi - lo) || 1;
    var pts = series.map(function (v, i) {
      return (i / (series.length - 1) * w).toFixed(1) + ',' + (h - 2 - (v - lo) / span * (h - 4)).toFixed(1);
    }).join(' ');
    return '<svg class="co-spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
  }

  function weatherHtml(rows) {
    if (!rows) return '';
    var cards = rows.map(function (r) {
      var flags = [];
      if (r.heat) flags.push('<span class="co-flag hot" data-tip="Average highs ≥33°C — heat stress territory for the crop">heat</span>');
      if (r.dry) flags.push('<span class="co-flag dry" data-tip="Under 8mm of rain forecast this week — dry spell">dry</span>');
      if (!flags.length) flags.push('<span class="co-flag ok">benign</span>');
      return '<div class="co-card wx" data-tip="' + MC.esc(r.belt.name) + ' · ' + MC.esc(r.belt.spot) + '" ' +
          'data-tip-desc="7-day forecast for the growing region. Weather moves ' + r.belt.crop.toLowerCase() + ' more than any indicator does.">' +
        '<div class="co-card-top"><b>' + MC.esc(r.belt.name) + '</b>' + flags.join('') + '</div>' +
        '<div class="co-wx-row"><span><i class="fa-solid fa-temperature-half"></i> ' + r.avgMaxC + '°C avg high</span>' +
        '<span><i class="fa-solid fa-droplet"></i> ' + r.totalPrecipMm + 'mm / 7d</span></div>' +
        '<div class="co-meta">drives ' + r.belt.crop + '</div>' +
      '</div>';
    }).join('');
    return sectionHead('Ag-belt weather', 'fa-cloud-sun-rain',
        'open-meteo forecasts, fetched by your browser · next WASDE ≈ ' + CO.nextWasde()) +
      '<div class="co-grid">' + cards + '</div>';
  }

  function sectionHead(title, icon, provenance) {
    return '<div class="co-sec"><i class="fa-solid ' + icon + '"></i><b>' + title + '</b>' +
      '<span class="co-prov">' + provenance + '</span></div>';
  }
  function sectionNote(title, icon, note) {
    return sectionHead(title, icon, '') + '<div class="co-note">' + MC.esc(note) + '</div>';
  }

  function plainEnglishHtml() {
    return '<details class="co-plain"><summary><i class="fa-solid fa-book-open"></i> Plain English — what these words mean</summary>' +
      '<p><b>Managed Money</b> — hedge funds and CTAs, the big speculators the CFTC makes report every week. When they crowd one side, the exit gets narrow.</p>' +
      '<p><b>Contango</b> — later delivery costs more than now. Normal for storable things (someone pays the warehouse). Holding a long and rolling it bleeds a little every month.</p>' +
      '<p><b>Backwardation</b> — later delivery costs LESS than now: the market pays a premium for barrels today. Usually scarcity talking, and rolling a long actually earns.</p>' +
      '<p><b>Roll</b> — futures expire; positions migrate to the next month. In roll week volume moves, spreads widen, and levels from the old contract stop meaning much.</p>' +
      '<p><b>WASDE</b> — USDA’s monthly world supply/demand estimate. Grain markets treat release day the way stocks treat Fed day.</p>' +
    '</details>';
  }

  /* ----------------------------------------------------------------------
     PUBLIC
     ---------------------------------------------------------------------- */
  CO.render = function () {
    var host = MC.$('sigCommod');
    if (!host) return;
    var mode = MC.State.market;
    var show = mode === 'futures' || mode === 'all';
    host.classList.toggle('hidden', !show);
    if (!show) return;

    host.innerHTML =
      '<div class="co-head"><i class="fa-solid fa-wheat-awn"></i> Commodities intelligence' +
      '<span>positioning · curve · macro · weather — primary sources, provenance on every card</span></div>' +
      '<div id="coCot"><div class="sm-skel"></div></div>' +
      '<div id="coTerm"></div>' +
      '<div id="coMacro"></div>' +
      '<div id="coWx"></div>' +
      plainEnglishHtml();

    getCot().then(function (d) { var el = MC.$('coCot'); if (el) el.innerHTML = cotHtml(d); });
    getTerm().then(function (d) { var el = MC.$('coTerm'); if (el) el.innerHTML = termHtml(d); });
    getMacro().then(function (d) { var el = MC.$('coMacro'); if (el) el.innerHTML = macroHtml(d); });
    getWeather().then(function (d) { var el = MC.$('coWx'); if (el) el.innerHTML = weatherHtml(d); });
  };

})(window);
