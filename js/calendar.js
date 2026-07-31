/* ==========================================================================
   calendar.js — economic events and the alerts that fire before them

   The embedded TradingView calendar is a sandboxed iframe, so its contents
   cannot be read from this page. To alert on events we therefore need our
   own schedule. It comes from three places, and the UI always says which:

     confirmed  published dates, taken from the source that issues them
     estimated  worked out from the normal release rule
     yours      events you added by hand

   Sources for the confirmed entries:
     FOMC  federalreserve.gov/monetarypolicy/fomccalendars.htm
     CPI   BLS schedule (cross-checked against two published listings)
     Jobs  BLS schedule — note 2026's early releases were shifted off the
           usual first-Friday pattern, which is exactly why the rest are
           labelled estimated rather than presented as fact.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var Cal = MC.calendar = {};

  /* ----------------------------------------------------------------------
     TIME
     Every date below is US Eastern wall-clock, the way the agencies publish
     it. This converts to a real UTC instant using the US DST rule
     (second Sunday in March → first Sunday in November).
     ---------------------------------------------------------------------- */
  function nthSundayUTC(year, month, n) {
    var d = new Date(Date.UTC(year, month, 1));
    var offset = (7 - d.getUTCDay()) % 7;      // days until the first Sunday
    return Date.UTC(year, month, 1 + offset + (n - 1) * 7);
  }

  /** True if this ET calendar day falls inside US daylight saving time. */
  function isDST(year, month, day) {
    var t = Date.UTC(year, month, day);
    var start = nthSundayUTC(year, 2, 2);      // March
    var end = nthSundayUTC(year, 10, 1);       // November
    return t >= start && t < end;
  }

  /** "2026-03-11", "08:30" (Eastern) → epoch milliseconds. */
  function etToUtc(dateStr, timeStr) {
    var d = dateStr.split('-').map(Number);
    var t = timeStr.split(':').map(Number);
    var offsetHours = isDST(d[0], d[1] - 1, d[2]) ? 4 : 5;   // EDT = UTC-4, EST = UTC-5
    return Date.UTC(d[0], d[1] - 1, d[2], t[0] + offsetHours, t[1]);
  }
  Cal.etToUtc = etToUtc;

  /* ----------------------------------------------------------------------
     CONFIRMED SCHEDULES
     ---------------------------------------------------------------------- */

  /** FOMC decision day (the second day of each meeting), statement at 14:00 ET. */
  var FOMC = [
    { date: '2026-01-28', sep: false }, { date: '2026-03-18', sep: true },
    { date: '2026-04-29', sep: false }, { date: '2026-06-17', sep: true },
    { date: '2026-07-29', sep: false }, { date: '2026-09-16', sep: true },
    { date: '2026-10-28', sep: false }, { date: '2026-12-09', sep: true },
    { date: '2027-01-27', sep: false }, { date: '2027-03-17', sep: true },
    { date: '2027-04-28', sep: false }, { date: '2027-06-09', sep: true },
    { date: '2027-07-28', sep: false }, { date: '2027-09-15', sep: true },
    { date: '2027-10-27', sep: false }, { date: '2027-12-08', sep: true }
  ];

  /** CPI releases, 08:30 ET. Reference month in brackets. */
  var CPI_2026 = [
    ['2026-01-13', 'December 2025'], ['2026-02-13', 'January 2026'],
    ['2026-03-11', 'February 2026'], ['2026-04-10', 'March 2026'],
    ['2026-05-12', 'April 2026'],    ['2026-06-10', 'May 2026'],
    ['2026-07-14', 'June 2026'],     ['2026-08-12', 'July 2026'],
    ['2026-09-11', 'August 2026'],   ['2026-10-14', 'September 2026'],
    ['2026-11-10', 'October 2026'],  ['2026-12-10', 'November 2026']
  ];

  /** Jobs reports whose dates are published rather than inferred. */
  var NFP_CONFIRMED = ['2026-01-09', '2026-02-11', '2026-05-08', '2026-08-07'];

  /* ----------------------------------------------------------------------
     BUILD THE EVENT LIST
     ---------------------------------------------------------------------- */
  function firstFriday(year, month) {
    var d = new Date(Date.UTC(year, month, 1));
    var offset = (5 - d.getUTCDay() + 7) % 7;     // days until Friday
    var day = 1 + offset;
    return year + '-' + pad(month + 1) + '-' + pad(day);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function buildBuiltIns() {
    var out = [];

    FOMC.forEach(function (m) {
      out.push({
        id: 'fomc-' + m.date,
        title: 'Fed interest rate decision',
        detail: 'FOMC statement' + (m.sep ? ', projections and press conference' : ' and press conference'),
        impact: 'high', source: 'confirmed', country: 'US',
        at: etToUtc(m.date, '14:00')
      });
    });

    CPI_2026.forEach(function (c) {
      out.push({
        id: 'cpi-' + c[0],
        title: 'US inflation (CPI)',
        detail: 'Consumer Price Index for ' + c[1],
        impact: 'high', source: 'confirmed', country: 'US',
        at: etToUtc(c[0], '08:30')
      });
    });

    // Jobs reports: published dates where we have them, first-Friday
    // estimates elsewhere — 2026's early releases moved, so the estimates
    // are flagged rather than presented as fact.
    var year = new Date().getUTCFullYear();
    for (var y = year; y <= year + 1; y++) {
      for (var m = 0; m < 12; m++) {
        var guess = firstFriday(y, m);
        var confirmed = NFP_CONFIRMED.filter(function (d) {
          return d.slice(0, 7) === y + '-' + pad(m + 1);
        })[0];
        var date = confirmed || guess;
        out.push({
          id: 'nfp-' + date,
          title: 'US jobs report',
          detail: 'Nonfarm payrolls, unemployment rate and average hourly earnings',
          impact: 'high',
          source: confirmed ? 'confirmed' : 'estimated',
          country: 'US',
          at: etToUtc(date, '08:30')
        });
      }
    }

    // Weekly jobless claims — every Thursday, 08:30 ET. A stable rule.
    var cursor = new Date();
    cursor.setUTCHours(0, 0, 0, 0);
    for (var i = 0; i < 90; i++) {
      var day = new Date(cursor.getTime() + i * 86400000);
      if (day.getUTCDay() !== 4) continue;
      var ds = day.getUTCFullYear() + '-' + pad(day.getUTCMonth() + 1) + '-' + pad(day.getUTCDate());
      out.push({
        id: 'claims-' + ds,
        title: 'US jobless claims',
        detail: 'Weekly initial unemployment claims',
        impact: 'medium', source: 'estimated', country: 'US',
        at: etToUtc(ds, '08:30')
      });
    }

    return out;
  }

  var builtIns = null;

  /* ----------------------------------------------------------------------
     CUSTOM EVENTS
     ---------------------------------------------------------------------- */
  function readCustom() {
    try {
      var v = JSON.parse(MC.store.get('mc_cal_custom') || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function writeCustom(list) { MC.store.set('mc_cal_custom', JSON.stringify(list)); }

  Cal.addCustom = function (title, localDateTime, impact) {
    var at = new Date(localDateTime).getTime();
    if (!isFinite(at)) return null;
    var list = readCustom();
    var ev = {
      id: 'own-' + Math.random().toString(36).slice(2, 7),
      title: title, detail: 'Your own event',
      impact: impact || 'high', source: 'yours', country: '', at: at
    };
    list.push(ev);
    writeCustom(list);
    return ev;
  };

  Cal.removeCustom = function (id) {
    writeCustom(readCustom().filter(function (e) { return e.id !== id; }));
  };

  /* ----------------------------------------------------------------------
     QUERIES
     ---------------------------------------------------------------------- */
  Cal.all = function () {
    if (!builtIns) builtIns = buildBuiltIns();
    return builtIns.concat(readCustom()).sort(function (a, b) { return a.at - b.at; });
  };

  /** The next `limit` events that have not happened yet. */
  Cal.upcoming = function (limit) {
    var now = Date.now();
    return Cal.all()
      .filter(function (e) { return e.at > now - 60 * 60 * 1000; })   // keep the last hour visible
      .slice(0, limit || 12);
  };

  Cal.get = function (id) {
    return Cal.all().filter(function (e) { return e.id === id; })[0] || null;
  };

  /** "in 3d 4h" / "in 12m" / "live now" */
  Cal.countdown = function (at) {
    var ms = at - Date.now();
    if (ms <= 0 && ms > -60 * 60 * 1000) return 'happening now';
    if (ms <= 0) return 'done';
    var mins = Math.floor(ms / 60000);
    if (mins < 60) return 'in ' + mins + 'm';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return 'in ' + hours + 'h ' + (mins % 60) + 'm';
    var days = Math.floor(hours / 24);
    return 'in ' + days + 'd ' + (hours % 24) + 'h';
  };

  /* ----------------------------------------------------------------------
     EVENT ALERTS
     One alert per event, firing a chosen number of minutes beforehand.
     ---------------------------------------------------------------------- */
  function readWatch() {
    try {
      var v = JSON.parse(MC.store.get('mc_cal_watch') || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function writeWatch(list) { MC.store.set('mc_cal_watch', JSON.stringify(list)); }

  Cal.watching = readWatch;

  Cal.isWatched = function (eventId) {
    return readWatch().some(function (w) { return w.eventId === eventId; });
  };

  Cal.watch = function (eventId, minutesBefore) {
    var list = readWatch();
    if (Cal.isWatched(eventId)) return null;
    var w = { eventId: eventId, lead: minutesBefore || 15, fired: false };
    list.push(w);
    writeWatch(list);
    return w;
  };

  Cal.unwatch = function (eventId) {
    writeWatch(readWatch().filter(function (w) { return w.eventId !== eventId; }));
  };

  /** Called on the same timer as the price alerts. */
  Cal.check = function () {
    var list = readWatch();
    if (!list.length) return;

    var now = Date.now();
    var changed = false;

    list.forEach(function (w) {
      if (w.fired) return;
      var ev = Cal.get(w.eventId);
      if (!ev) return;

      var due = ev.at - w.lead * 60000;
      if (now >= due && now < ev.at + 60 * 60 * 1000) {
        w.fired = true;
        changed = true;

        var when = now >= ev.at ? 'starting now' : 'in about ' + Math.max(1, Math.round((ev.at - now) / 60000)) + ' minutes';
        var text = ev.title + ' — ' + when +
                   (ev.source === 'estimated' ? ' (estimated date)' : '') +
                   '. ' + ev.detail;

        MC.ui.toast('Economic event 📅', text, 'gold');
        MC.alerts.notifyExternal('Economic event', text);
      }
    });

    if (changed) writeWatch(list);
  };

  /** Drop watches whose events are long gone, so the list stays tidy. */
  Cal.prune = function () {
    var cutoff = Date.now() - 24 * 60 * 60 * 1000;
    writeWatch(readWatch().filter(function (w) {
      var ev = Cal.get(w.eventId);
      return ev && ev.at > cutoff;
    }));
  };

})(window);
