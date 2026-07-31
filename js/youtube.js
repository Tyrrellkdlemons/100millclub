/* ==========================================================================
   youtube.js — real YouTube inside the vlog shelf

   What is genuinely possible from a browser, tested rather than assumed:

     Playback   youtube.com/embed/<id> — keyless. Played inside the page it
                carries the viewer's own YouTube cookies, so watch time counts
                toward THEIR history and recommendations. That is the
                "catches the algorithm" part, and it is real: watching and
                clicking through to YouTube are the signals the algorithm
                actually uses.
     Metadata   youtube.com/oembed — keyless, CORS open. Title, author and
                thumbnail for any pasted link. Powers "add by link".
     Search     the Data API v3 sends CORS and works the moment a free key
                is pasted (10,000 units/day free — roughly 100 searches).
                Without a key, search falls back to opening YouTube's own
                results page, which still lands the viewer on YouTube with
                intent — also good for the algorithm, just not in-page.

     Dead ends, so nobody re-tries them: the keyless listType=search embed
     is deprecated (renders "unavailable"), Piped/Invidious mirrors are
     blocked or disabled, and the Data API refuses unregistered callers.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var YT = MC.youtube = {};

  var CFG_KEY = 'mc_yt_cfg';
  var SHELF_KEY = 'mc_yt_shelf';
  var WATCHED_KEY = 'mc_yt_watched';

  /* ----------------------------------------------------------------------
     CONFIG
     ---------------------------------------------------------------------- */
  YT.config = function () {
    try {
      var v = JSON.parse(MC.store.get(CFG_KEY) || 'null');
      return v || { apiKey: '' };
    } catch (e) { return { apiKey: '' }; }
  };
  YT.saveConfig = function (cfg) { MC.store.set(CFG_KEY, JSON.stringify(cfg)); };
  YT.hasKey = function () { return !!YT.config().apiKey; };

  /* ----------------------------------------------------------------------
     URL PARSING
     ---------------------------------------------------------------------- */

  /** Pull a video id out of any of YouTube's URL shapes. */
  YT.parseId = function (input) {
    var s = (input || '').trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    var m = s.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : null;
  };

  YT.thumb = function (id) { return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'; };
  YT.watchUrl = function (id) { return 'https://www.youtube.com/watch?v=' + id; };
  YT.searchUrl = function (q) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q); };

  /* ----------------------------------------------------------------------
     LOOKUPS
     ---------------------------------------------------------------------- */

  /** Keyless metadata for one video. */
  YT.oembed = function (id) {
    return fetch('https://www.youtube.com/oembed?url=' +
                 encodeURIComponent(YT.watchUrl(id)) + '&format=json')
      .then(function (r) {
        if (!r.ok) throw new Error('YouTube does not recognise that video (' + r.status + ').');
        return r.json();
      })
      .then(function (d) {
        return { id: id, title: d.title, author: d.author_name, thumb: YT.thumb(id) };
      });
  };

  /** Real search — needs the visitor's free Data API key. */
  YT.search = function (query) {
    var key = YT.config().apiKey;
    if (!key) return Promise.reject(new Error('no-key'));

    var url = 'https://www.googleapis.com/youtube/v3/search' +
              '?part=snippet&type=video&maxResults=12&videoEmbeddable=true' +
              '&q=' + encodeURIComponent(query) +
              '&key=' + encodeURIComponent(key);

    return fetch(url)
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          var msg = (res.d.error && res.d.error.message) || 'YouTube said no.';
          if (/quota/i.test(msg)) msg = 'That key has used its free quota for today. It resets at midnight Pacific.';
          if (/API key not valid/i.test(msg)) msg = 'That key is not valid. Check it in Google Cloud → Credentials.';
          throw new Error(msg);
        }
        return (res.d.items || []).map(function (it) {
          var sn = it.snippet || {};
          return {
            id: it.id.videoId,
            title: decodeEntities(sn.title || ''),
            author: sn.channelTitle || '',
            thumb: (sn.thumbnails && (sn.thumbnails.medium || sn.thumbnails.default) || {}).url || YT.thumb(it.id.videoId),
            published: sn.publishedAt || ''
          };
        }).filter(function (v) { return v.id; });
      });
  };

  function decodeEntities(s) {
    var el = document.createElement('textarea');
    el.innerHTML = s;
    return el.value;
  }

  /* ----------------------------------------------------------------------
     THE SHELF — videos the user has saved
     ---------------------------------------------------------------------- */
  function readShelf() {
    try {
      var v = JSON.parse(MC.store.get(SHELF_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  YT.shelf = readShelf;

  YT.pin = function (video) {
    var list = readShelf();
    if (list.some(function (v) { return v.id === video.id; })) return false;
    list.unshift({ id: video.id, title: video.title, author: video.author, thumb: video.thumb, at: Date.now() });
    MC.store.set(SHELF_KEY, JSON.stringify(list.slice(0, 40)));
    return true;
  };

  YT.unpin = function (id) {
    MC.store.set(SHELF_KEY, JSON.stringify(readShelf().filter(function (v) { return v.id !== id; })));
  };

  YT.isPinned = function (id) {
    return readShelf().some(function (v) { return v.id === id; });
  };

  /* ----------------------------------------------------------------------
     WATCH HISTORY — local, feeds the suggestion chips
     ---------------------------------------------------------------------- */
  YT.noteWatched = function (video) {
    try {
      var v = JSON.parse(MC.store.get(WATCHED_KEY) || '[]');
      if (!Array.isArray(v)) v = [];
      v = v.filter(function (x) { return x.id !== video.id; });
      v.unshift({ id: video.id, title: video.title, at: Date.now() });
      MC.store.set(WATCHED_KEY, JSON.stringify(v.slice(0, 30)));
    } catch (e) {}
  };

  YT.watched = function () {
    try {
      var v = JSON.parse(MC.store.get(WATCHED_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  };

  /** Search ideas: the selected market first, then trading staples. */
  YT.suggestedQueries = function () {
    var a = MC.State.asset;
    var out = [];
    if (a) {
      out.push(a.n.split('·')[0].trim() + ' analysis');
      out.push(a.s + ' price prediction');
    }
    out.push('day trading strategy', 'candlestick patterns explained',
             'risk management trading', 'how to backtest a strategy');
    return out.slice(0, 6);
  };

})(window);
