/* ==========================================================================
   radar-ui.js — the Radar dock panel: economic events + headlines
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var UI = MC.radarUI = {};
  var $ = MC.$;

  var LEADS = [5, 15, 30, 60];

  UI.init = function () {
    /* ---- news source controls ---- */
    $('newsSource').innerHTML = MC.news.SOURCES.map(function (s) {
      return '<option value="' + s.id + '">' + s.name + '</option>';
    }).join('');

    var cfg = MC.news.config();
    $('newsSource').value = cfg.source;
    $('newsKey').value = cfg.apiKey || '';
    $('newsUrl').value = cfg.customUrl || '';
    $('newsKeywords').value = cfg.keywords || '';
    syncSourceFields();

    $('newsSource').addEventListener('change', function () {
      syncSourceFields();
      saveNews();
      MC.news.refresh();
    });
    ['newsKey', 'newsUrl'].forEach(function (id) {
      $(id).addEventListener('change', function () { saveNews(); MC.news.refresh(); });
    });
    $('newsKeywords').addEventListener('change', saveNews);
    $('newsRefresh').addEventListener('click', function () { MC.news.refresh(); });

    MC.news.onUpdate = renderNews;

    /* ---- calendar ---- */
    MC.on($('calList'), 'click', '[data-watch]', function (e, btn) {
      var id = btn.getAttribute('data-watch');
      if (MC.calendar.isWatched(id)) {
        MC.calendar.unwatch(id);
        MC.ui.toast('Alert off', 'You will not be warned about that one.', 'info');
      } else {
        var lead = parseInt(btn.getAttribute('data-lead'), 10) || 15;
        MC.calendar.watch(id, lead);
        var ev = MC.calendar.get(id);
        MC.ui.toast('Event alert set 📅',
          ev.title + ' — you will hear about it ' + lead + ' minutes beforehand.', 'ok');
      }
      renderCalendar();
    });

    MC.on($('calList'), 'change', 'select[data-lead-for]', function (e, sel) {
      var id = sel.getAttribute('data-lead-for');
      var lead = parseInt(sel.value, 10);
      if (MC.calendar.isWatched(id)) {
        MC.calendar.unwatch(id);
        MC.calendar.watch(id, lead);
      }
      renderCalendar();
    });

    MC.on($('calList'), 'click', '[data-delown]', function (e, btn) {
      e.stopPropagation();
      var id = btn.getAttribute('data-delown');
      MC.calendar.unwatch(id);
      MC.calendar.removeCustom(id);
      renderCalendar();
      MC.ui.toast('Removed', 'Your event is gone.', 'info');
    });

    $('calAddOwn').addEventListener('click', addOwnEvent);

    MC.calendar.prune();
    renderCalendar();
    renderNews();

    // countdowns tick once a minute
    setInterval(renderCalendar, 60000);
  };

  function syncSourceFields() {
    var id = $('newsSource').value;
    var src = MC.news.SOURCES.filter(function (s) { return s.id === id; })[0];
    $('newsKey').classList.toggle('hidden', !src.needsKey);
    $('newsUrl').classList.toggle('hidden', id !== 'custom');
    $('newsSourceNote').textContent = src.note;
  }

  function saveNews() {
    var cfg = MC.news.config();
    cfg.source = $('newsSource').value;
    cfg.apiKey = $('newsKey').value.trim();
    cfg.customUrl = $('newsUrl').value.trim();
    cfg.keywords = $('newsKeywords').value.trim();
    MC.news.saveConfig(cfg);
  }

  /* ======================================================================
     CALENDAR
     ====================================================================== */
  function renderCalendar() {
    var box = $('calList');
    if (!box) return;

    var events = MC.calendar.upcoming(14);
    if (!events.length) {
      box.innerHTML = '<div class="empty"><i class="fa-solid fa-calendar"></i>Nothing scheduled.</div>';
      return;
    }

    box.innerHTML = events.map(function (ev) {
      var watched = MC.calendar.isWatched(ev.id);
      var w = MC.calendar.watching().filter(function (x) { return x.eventId === ev.id; })[0];
      var soon = ev.at - Date.now() < 24 * 60 * 60 * 1000;

      return '<div class="cal-row' + (watched ? ' on' : '') + (soon ? ' soon' : '') + '">' +
        '<div class="cal-when">' +
          '<b>' + MC.calendar.countdown(ev.at) + '</b>' +
          '<span>' + new Date(ev.at).toLocaleString([], {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          }) + '</span>' +
        '</div>' +
        '<div class="cal-main">' +
          '<div class="cal-title">' + MC.esc(ev.title) +
            '<span class="cal-src ' + ev.source + '">' + ev.source + '</span>' +
            (ev.impact === 'high' ? '<span class="cal-imp">high impact</span>' : '') +
          '</div>' +
          '<div class="cal-detail">' + MC.esc(ev.detail) + '</div>' +
        '</div>' +
        '<div class="cal-acts">' +
          '<select data-lead-for="' + ev.id + '" title="How far ahead to warn you">' +
            LEADS.map(function (m) {
              return '<option value="' + m + '"' + (w && w.lead === m ? ' selected' : '') + '>' + m + 'm</option>';
            }).join('') +
          '</select>' +
          '<button data-watch="' + ev.id + '" data-lead="15" class="' + (watched ? 'on' : '') + '">' +
            '<i class="fa-solid fa-bell"></i>' + (watched ? 'On' : 'Alert') +
          '</button>' +
          (ev.source === 'yours'
            ? '<button data-delown="' + ev.id + '" title="Delete"><i class="fa-solid fa-trash"></i></button>'
            : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function addOwnEvent() {
    var title = window.prompt('What is the event called?');
    if (!title) return;
    var when = window.prompt(
      'When is it? Use your own local time, in this format:\n\n2026-08-14 08:30'
    );
    if (!when) return;

    var ev = MC.calendar.addCustom(title.trim(), when.trim().replace(' ', 'T'), 'high');
    if (!ev) {
      MC.ui.toast('I could not read that date', 'Try the format 2026-08-14 08:30.', 'err');
      return;
    }
    MC.calendar.watch(ev.id, 15);
    renderCalendar();
    MC.ui.toast('Event added', title + ' is on your radar, with a 15 minute warning.', 'ok');
  }

  /* ======================================================================
     NEWS
     ====================================================================== */
  function renderNews() {
    var box = $('newsList');
    if (!box) return;

    if (MC.news.isLoading()) {
      $('newsStatus').textContent = 'loading…';
      if (!MC.news.items().length) {
        box.innerHTML = '<div class="empty"><i class="fa-solid fa-circle-notch fa-spin"></i>Fetching headlines…</div>';
        return;
      }
    } else {
      $('newsStatus').textContent = MC.news.items().length
        ? MC.news.items().length + ' headlines'
        : '';
    }

    var err = MC.news.error();
    if (err && !MC.news.items().length) {
      box.innerHTML = '<div class="empty" style="text-align:left;padding:16px">' +
        '<i class="fa-solid fa-plug-circle-xmark"></i>' + MC.esc(err) +
        '<br><br><span style="color:var(--dim)">Hacker News works with no key if you want a source that always loads.</span></div>';
      return;
    }

    box.innerHTML = MC.news.items().slice(0, 40).map(function (n) {
      var age = timeAgo(n.at);
      return '<a class="news-row" href="' + MC.esc(n.url) + '" target="_blank" rel="noopener noreferrer">' +
        '<div class="news-t">' + MC.esc(n.title) + '</div>' +
        '<div class="news-m">' + MC.esc(n.source) + (age ? ' · ' + age : '') + '</div>' +
      '</a>';
    }).join('');
  }

  function timeAgo(ms) {
    if (!ms) return '';
    var mins = Math.floor((Date.now() - ms) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    return Math.floor(hours / 24) + 'd ago';
  }

  UI.renderCalendar = renderCalendar;
  UI.renderNews = renderNews;

})(window);
