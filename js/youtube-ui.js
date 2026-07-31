/* ==========================================================================
   youtube-ui.js — YouTube search, the player, and your shelf in the vlog pane
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var UI = MC.youtubeUI = {};
  var $ = MC.$;

  var results = [];        // last in-page search results
  var nowPlaying = null;

  UI.init = function () {
    $('ytForm').addEventListener('submit', function (e) {
      e.preventDefault();
      UI.search($('ytQuery').value.trim());
    });

    MC.on($('ytChips'), 'click', '.yt-chip', function (e, chip) {
      $('ytQuery').value = chip.textContent;
      UI.search(chip.textContent);
    });

    $('ytAddLink').addEventListener('click', function () {
      var link = window.prompt('Paste a YouTube link (or a video id):');
      if (!link) return;
      var id = MC.youtube.parseId(link);
      if (!id) {
        MC.ui.toast('That is not a YouTube link', 'Try something like youtube.com/watch?v=… or youtu.be/…', 'err');
        return;
      }
      MC.youtube.oembed(id).then(function (video) {
        MC.youtube.pin(video);
        UI.renderShelf();
        MC.ui.toast('On your shelf 📌', '“' + video.title.slice(0, 50) + '” by ' + video.author, 'gold');
      }).catch(function (err) {
        MC.ui.toast('Could not add it', err.message, 'err');
      });
    });

    /* key management */
    $('ytKeyBtn').addEventListener('click', function () {
      $('ytKeyInput').value = MC.youtube.config().apiKey || '';
      MC.ui.openModal('mdYtKey');
    });
    $('ytKeySave').addEventListener('click', function () {
      MC.youtube.saveConfig({ apiKey: $('ytKeyInput').value.trim() });
      MC.ui.closeModals();
      syncKeyState();
      MC.ui.toast(
        MC.youtube.hasKey() ? 'Search is live' : 'Key removed',
        MC.youtube.hasKey() ? 'YouTube results now appear right here in the shelf.'
                            : 'Searching will open YouTube in a new tab instead.',
        MC.youtube.hasKey() ? 'ok' : 'info'
      );
    });
    $('ytKeyClear').addEventListener('click', function () {
      MC.youtube.saveConfig({ apiKey: '' });
      $('ytKeyInput').value = '';
      MC.ui.closeModals();
      syncKeyState();
    });

    /* player */
    $('playerPin').addEventListener('click', function () {
      if (!nowPlaying) return;
      if (MC.youtube.pin(nowPlaying)) {
        UI.renderShelf();
        MC.ui.toast('Saved 📌', 'It is on your shelf now.', 'gold');
      } else {
        MC.ui.toast('Already there', 'That one is on your shelf.', 'info');
      }
    });

    // theatre modal: closing it stops ITS iframe only
    document.addEventListener('click', function (e) {
      if (e.target.classList.contains('backdrop') || e.target.closest('[data-close]')) {
        stopPlayback();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') stopPlayback();
    });

    initMini();

    syncKeyState();
    renderChips();
    renderPlatformLinks();
    UI.renderShelf();
  };

  /** One-tap jumps into the visitor's own signed-in feeds. */
  function renderPlatformLinks() {
    var LINKS = [
      { n: 'My YouTube',    i: 'fa-brands fa-youtube',  c: '#f00',
        u: 'https://www.youtube.com/feed/history',
        d: 'Your real watch history, in your signed-in tab' },
      { n: 'Subscriptions', i: 'fa-solid fa-rss',       c: '#f00',
        u: 'https://www.youtube.com/feed/subscriptions',
        d: 'Latest uploads from channels you follow' },
      { n: 'TradingView',   i: 'fa-solid fa-chart-line', c: '#4f8cff',
        u: 'https://www.tradingview.com/',
        d: 'Your charts, layouts and alerts on your own plan' },
      { n: 'X markets',     i: 'fa-brands fa-x-twitter', c: '#e9eef5',
        u: 'https://x.com/search?q=%23stockmarket&f=live',
        d: 'Live market chatter, your account' },
      { n: 'r/stocks',      i: 'fa-brands fa-reddit-alien', c: '#ff4500',
        u: 'https://www.reddit.com/r/stocks/',
        d: 'The retail floor, signed in as you' }
    ];
    $('ytLinks').innerHTML = LINKS.map(function (l) {
      return '<a class="yt-link" href="' + l.u + '" target="_blank" rel="noopener noreferrer" ' +
             'data-tip="' + MC.esc(l.n) + '" data-tip-desc="' + MC.esc(l.d) + '">' +
             '<i class="' + l.i + '" style="color:' + l.c + '"></i>' + MC.esc(l.n) + '</a>';
    }).join('');
  }

  function syncKeyState() {
    $('ytKeyState').textContent = MC.youtube.hasKey() ? 'Search: on' : 'Set up search';
    $('ytKeyBtn').classList.toggle('on', MC.youtube.hasKey());
  }

  function renderChips() {
    $('ytChips').innerHTML = MC.youtube.suggestedQueries().map(function (q) {
      return '<button class="yt-chip"><i class="fa-brands fa-youtube"></i>' + MC.esc(q) + '</button>';
    }).join('');
  }

  /** Called when the symbol changes, so the suggestions follow the market. */
  UI.refreshChips = renderChips;

  /* ----------------------------------------------------------------------
     SEARCH
     ---------------------------------------------------------------------- */
  UI.search = function (query) {
    if (!query) return;

    if (!MC.youtube.hasKey()) {
      // Keyless path: hand the search to YouTube itself. Still lands the
      // viewer on YouTube with intent, which their algorithm notices.
      window.open(MC.youtube.searchUrl(query), '_blank', 'noopener,noreferrer');
      MC.ui.toast('Opened on YouTube',
        'Results are in the new tab. Paste a free key via “Set up search” to get them in here instead.', 'info');
      return;
    }

    MC.ui.toast('Searching…', '“' + query + '”', 'info');
    MC.youtube.search(query).then(function (list) {
      results = list;
      UI.renderShelf();
      if (!list.length) MC.ui.toast('Nothing found', 'YouTube returned no embeddable videos for that.', 'err');
    }).catch(function (err) {
      if (err.message === 'no-key') return;
      MC.ui.toast('Search failed', err.message, 'err');
    });
  };

  /* ----------------------------------------------------------------------
     PLAYER — a floating mini-player by default, so the chart stays usable
     while the video runs. Theatre mode swaps to the big modal.
     ---------------------------------------------------------------------- */
  function embedHtml(video) {
    // youtube.com/embed (not the nocookie domain) deliberately: it carries the
    // viewer's own YouTube session, so the watch counts toward THEIR history
    // and recommendations. autoplay=1 works because opening follows a click.
    return '<iframe src="https://www.youtube.com/embed/' + video.id + '?autoplay=1&rel=1" ' +
      'title="' + MC.esc(video.title) + '" allow="autoplay; encrypted-media; picture-in-picture" ' +
      'allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
  }

  UI.play = function (video) {
    nowPlaying = video;
    $('miniTitle').textContent = video.title;
    $('miniOpenYt').href = MC.youtube.watchUrl(video.id);
    $('miniFrame').innerHTML = embedHtml(video);
    $('miniPlayer').hidden = false;
    MC.youtube.noteWatched(video);
    MC.ui.toast('Rolling 🎬', 'Park it anywhere — the chart still works while it plays.', 'gold');
  };

  /** Theatre mode: move the SAME video into the big modal. */
  UI.theater = function () {
    if (!nowPlaying) return;
    $('miniFrame').innerHTML = '';
    $('miniPlayer').hidden = true;
    $('playerTitle').textContent = nowPlaying.title.slice(0, 70);
    $('playerOpenYt').href = MC.youtube.watchUrl(nowPlaying.id);
    $('playerFrame').innerHTML = embedHtml(nowPlaying);
    MC.ui.openModal('mdPlayer');
  };

  function stopPlayback() {
    $('playerFrame').innerHTML = '';     // removing the iframe stops the audio
    // NB: deliberately does not touch the mini player — closing an unrelated
    // modal must not kill a video someone parked in the corner.
  }

  function stopMini() {
    $('miniFrame').innerHTML = '';
    $('miniPlayer').hidden = true;
    nowPlaying = null;
  }

  /* ---- drag to move, grip to resize, persisted ---- */
  function initMini() {
    var player = $('miniPlayer');

    // restore last position/size
    try {
      var saved = JSON.parse(MC.store.get('mc_mini') || 'null');
      if (saved) {
        if (saved.w) player.style.width = saved.w + 'px';
        if (isFinite(saved.x) && isFinite(saved.y)) {
          player.style.left = saved.x + 'px';
          player.style.top = saved.y + 'px';
          player.style.right = 'auto';
          player.style.bottom = 'auto';
        }
      }
    } catch (e) {}

    function saveMini() {
      var r = player.getBoundingClientRect();
      MC.store.set('mc_mini', JSON.stringify({
        x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width)
      }));
    }

    function keepOnScreen() {
      var r = player.getBoundingClientRect();
      var x = MC.clamp(r.left, 4, Math.max(4, innerWidth - r.width - 4));
      var y = MC.clamp(r.top, 4, Math.max(4, innerHeight - 60));
      player.style.left = x + 'px';
      player.style.top = y + 'px';
      player.style.right = 'auto';
      player.style.bottom = 'auto';
    }

    // move — drag the header (buttons excluded)
    var drag = null;
    $('miniHead').addEventListener('pointerdown', function (e) {
      if (e.target.closest('.mini-btn')) return;
      e.preventDefault();
      var r = player.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      $('miniHead').setPointerCapture(e.pointerId);
    });
    $('miniHead').addEventListener('pointermove', function (e) {
      if (!drag) return;
      player.style.left = (e.clientX - drag.dx) + 'px';
      player.style.top = (e.clientY - drag.dy) + 'px';
      player.style.right = 'auto';
      player.style.bottom = 'auto';
    });
    $('miniHead').addEventListener('pointerup', function (e) {
      if (!drag) return;
      drag = null;
      try { $('miniHead').releasePointerCapture(e.pointerId); } catch (err) {}
      keepOnScreen();
      saveMini();
    });

    // resize — drag the corner grip; height follows 16:9 via CSS
    var rs = null;
    $('miniGrip').addEventListener('pointerdown', function (e) {
      e.preventDefault();
      rs = { x: e.clientX, w: player.getBoundingClientRect().width };
      $('miniGrip').setPointerCapture(e.pointerId);
    });
    $('miniGrip').addEventListener('pointermove', function (e) {
      if (!rs) return;
      player.style.width = MC.clamp(rs.w + (e.clientX - rs.x), 240, Math.min(720, innerWidth - 20)) + 'px';
    });
    $('miniGrip').addEventListener('pointerup', function (e) {
      if (!rs) return;
      rs = null;
      try { $('miniGrip').releasePointerCapture(e.pointerId); } catch (err) {}
      keepOnScreen();
      saveMini();
    });

    $('miniClose').addEventListener('click', stopMini);
    $('miniTheater').addEventListener('click', UI.theater);
    $('miniPin').addEventListener('click', function () {
      if (!nowPlaying) return;
      if (MC.youtube.pin(nowPlaying)) {
        UI.renderShelf();
        MC.ui.toast('Saved 📌', 'On your shelf.', 'gold');
      } else {
        MC.ui.toast('Already there', 'That one is on your shelf.', 'info');
      }
    });

    window.addEventListener('resize', MC.debounce(function () {
      if (!player.hidden) keepOnScreen();
    }, 150));
  }

  /* ----------------------------------------------------------------------
     RENDER — search results, then your shelf, then the sample vlogs
     ---------------------------------------------------------------------- */
  /** In-app watch history, shaped like videos, freshest first. */
  function continueWatching() {
    return MC.youtube.watched().slice(0, 6).map(function (w) {
      return { id: w.id, title: w.title, author: 'watched here', thumb: MC.youtube.thumb(w.id) };
    });
  }

  UI.renderShelf = function () {
    var host = $('vlogBody');
    var html = '';

    if (results.length) {
      html += section('Search results', 'fa-solid fa-magnifying-glass');
      html += results.map(function (v) { return ytCard(v, false); }).join('');
    }

    // your actual history, not an invented feed — resume in one tap
    var recent = continueWatching();
    if (recent.length) {
      html += section('Continue watching', 'fa-solid fa-clock-rotate-left');
      html += recent.map(function (v) { return ytCard(v, MC.youtube.isPinned(v.id)); }).join('');
    }

    var shelf = MC.youtube.shelf();
    if (shelf.length) {
      html += section('Your shelf', 'fa-solid fa-thumbtack');
      html += shelf.map(function (v) { return ytCard(v, true); }).join('');
    }

    html += section('Grind Tapes', 'fa-solid fa-fire');
    html += MC.vlogs.cardsHtml();

    host.innerHTML = html;
  };

  function section(title, icon) {
    return '<div class="yt-sect"><i class="' + icon + '"></i>' + MC.esc(title) + '</div>';
  }

  function ytCard(v, pinned) {
    return '<article class="vid yt-vid" data-ytid="' + v.id + '">' +
      '<div class="thumb">' +
        '<img loading="lazy" alt="" src="' + MC.esc(v.thumb || MC.youtube.thumb(v.id)) + '" ' +
             'onerror="this.style.display=\'none\'">' +
        '<span class="badge-tag" style="background:#f00">YouTube</span>' +
        '<span class="play"><i class="fa-solid fa-play"></i></span>' +
      '</div>' +
      '<div class="vinfo">' +
        '<div class="vtitle">' + MC.esc(v.title) + '</div>' +
        '<div class="vmeta"><i class="fa-brands fa-youtube"></i>' + MC.esc(v.author || 'YouTube') + '</div>' +
        '<div class="shares">' +
          '<button class="sbtn yt" data-ytplay="' + v.id + '" data-tip="Play it here"><i class="fa-solid fa-play"></i></button>' +
          '<a class="sbtn tw" href="' + MC.youtube.watchUrl(v.id) + '" target="_blank" rel="noopener noreferrer" ' +
             'data-tip="Watch on YouTube" style="display:grid;place-items:center">' +
             '<i class="fa-solid fa-arrow-up-right-from-square"></i></a>' +
          (pinned
            ? '<button class="sbtn more" data-ytunpin="' + v.id + '" data-tip="Take it off the shelf"><i class="fa-solid fa-xmark"></i></button>'
            : '<button class="sbtn more" data-ytpin="' + v.id + '" data-tip="Save to your shelf"><i class="fa-solid fa-thumbtack"></i></button>') +
        '</div>' +
      '</div>' +
    '</article>';
  }

  /** Delegated clicks for every yt card, wired once from app.js. */
  UI.handleCardClick = function (e, card) {
    var id = card.dataset.ytid;
    var video = findVideo(id);
    if (!video) return true;                         // fall through to sample vlogs

    var pin = e.target.closest('[data-ytpin]');
    var unpin = e.target.closest('[data-ytunpin]');
    var playBtn = e.target.closest('[data-ytplay]');
    var external = e.target.closest('a');

    if (external) return false;                      // the <a> handles itself
    if (pin) {
      MC.youtube.pin(video);
      UI.renderShelf();
      MC.ui.toast('Saved 📌', 'On your shelf.', 'gold');
      return false;
    }
    if (unpin) {
      MC.youtube.unpin(id);
      UI.renderShelf();
      MC.ui.toast('Removed', 'Off the shelf.', 'info');
      return false;
    }
    if (playBtn || e.target.closest('.thumb') || e.target.closest('.vtitle')) {
      UI.play(video);
      return false;
    }
    return false;
  };

  function findVideo(id) {
    var pools = [results, MC.youtube.shelf(), continueWatching()];
    for (var i = 0; i < pools.length; i++) {
      for (var j = 0; j < pools[i].length; j++) {
        if (pools[i][j].id === id) return pools[i][j];
      }
    }
    return null;
  }

})(window);
